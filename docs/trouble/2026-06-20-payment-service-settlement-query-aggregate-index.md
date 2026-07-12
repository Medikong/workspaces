---
id: TROUBLE-017
title: "payment-service 정산 기준 API의 중복 집계 쿼리와 인덱스 미스매치"
status: closed
priority: p2
severity: medium
area: service
repos:
  - service
  - workspace
owner: unassigned
created: 2026-06-20
updated: 2026-06-20
resolved: 2026-06-20
tags:
  - api-benchmark
  - payment-service
  - settlement
  - postgres
  - index
  - query-plan
related:
  - service/services/payment-service/app/models.py
  - service/services/payment-service/app/services/payments.py
  - service/services/payment-service/tests/integration/test_api_benchmark.py
  - workspace/docs/evidence/services/api-integration-test-benchmark/half-year-early-growth/payment-service.md
links: []
---

# payment-service 정산 기준 API의 중복 집계 쿼리와 인덱스 미스매치

## Context

`half-year-early-growth` API 통합 벤치마크에서 payment-service의 정산 기준 조회 API가 다른 단건 조회보다 높게 측정됐다.

대상 API는 다음 두 개다.

```text
GET /provider/concerts/{concertId}/settlement-basis
GET /admin/concerts/{concertId}/settlement-basis
```

두 API는 권한만 다르고, 실제 계산은 같은 `PaymentService.settlement_for_concert()`를 호출한다. 역할은 특정 공연의 승인 결제를 모아 정산 기준값을 계산하는 것이다.

```text
approved payments
-> grossAmount = sum(amount)
-> ticketCount = count(*)
-> refundAmount = 0
-> platformFeeAmount = grossAmount * 10%
-> providerSettlementAmount = grossAmount - platformFeeAmount
```

## Symptoms

- 관찰된 현상:
  - 최초 large benchmark에서 `provider-settlement-basis`는 p95 `40.938ms`, p99 `45.354ms`였다.
  - 같은 실행에서 `admin-settlement-basis`는 p95 `56.291ms`, p99 `219.647ms`, max `249.509ms`까지 튀었다.
  - 두 endpoint는 같은 서비스 메서드를 쓰는데도 tail latency가 다르게 보였다.
- 재현 조건:
  - `task benchmark-api-large-service SERVICE=payment-service PRESET=half-year-early-growth SAMPLES=100`
  - seed 규모는 `payments=184,000`, `payment_events=184,000`이다.
  - benchmark의 정산 대상 공연은 승인 결제 row 약 `48,000`건을 집계한다.
- 기대 동작:
  - 정산 API는 같은 조건의 row set을 한 번만 읽고 `sum`과 `count`를 같이 계산한다.
  - PostgreSQL planner가 `concert_id`와 `status='approved'` 조건에 맞는 인덱스를 선택한다.
- 실제 동작:
  - 기존 구현은 같은 predicate로 `sum(amount)`와 `count(id)`를 별도 query로 실행했다.
  - 기존 인덱스는 `concert_id` 단일 인덱스 중심이라 정산 predicate인 `(concert_id, status)`와 정확히 맞지 않았다.

## Impact

- 영향 범위:
  - provider/admin 정산 기준 조회 API의 응답 시간.
  - API 통합 벤치마크의 p95/p99 해석.
  - payment-service 정산 API의 데이터 증가 대응력.
- 우선 처리 이유:
  - 정산 API는 응답 row가 하나여도 내부에서는 공연별 승인 결제 전체를 집계한다.
  - 같은 row set을 두 번 읽으면 데이터가 늘수록 불필요한 DB 작업이 같이 늘어난다.
  - p95/p99 표만 보면 원인이 DB scan인지, 응답 직렬화인지, TestClient outlier인지 구분하기 어렵다.
- 우회 방법:
  - 단기적으로는 정산 대상 공연의 결제 분포가 큰 경우를 benchmark에서 따로 본다.
  - 근본적으로는 query shape에 맞는 인덱스와 단일 aggregate query를 적용한다.

## Investigation

| 시간 | 확인 내용 | 결과 |
| --- | --- | --- |
| 2026-06-20 KST | route 확인 | provider/admin endpoint는 권한 검사 후 같은 `settlement_for_concert()`를 호출 |
| 2026-06-20 KST | 기존 service query 확인 | `sum(amount)`와 `count(id)`가 같은 `concert_id/status` predicate로 따로 실행됨 |
| 2026-06-20 KST | 기존 model index 확인 | `concert_id` 단일 index와 `status` 단일 index는 있지만 정산 predicate용 복합 index는 없음 |
| 2026-06-20 KST | 최초 벤치 결과 확인 | provider p95 `40.938ms`, p99 `45.354ms`; admin p95 `56.291ms`, p99 `219.647ms` |
| 2026-06-20 KST | query shape 조정 | `SELECT coalesce(sum(amount), 0), count(*) FROM payments WHERE concert_id = :concert_id AND status = 'approved'`로 통합 |
| 2026-06-20 KST | index 조정 | `ix_payments_concert_status(concert_id, status)` 추가, 단일 `concert_id` index 제거 |
| 2026-06-20 KST | large benchmark 재실행 | provider p95 `13.340ms`, p99 `15.280ms`; admin p95 `15.140ms`, p99 `19.153ms` |
| 2026-06-20 KST | query plan 확인 | `ix_payments_concert_status` 사용, actual rows `48,776`, estimated rows `48,758`, execution `12.209ms` |

## Current Reading

이번 문제는 API 응답 payload가 커서 느린 문제가 아니다. 응답은 정산 기준 숫자 몇 개뿐이다.

느려진 핵심은 내부 DB 작업이었다.

- 정산 대상 공연에는 승인 결제 row가 약 `48,776`건 있었다.
- 기존 구현은 같은 조건의 row set을 `sum`용으로 한 번, `count`용으로 한 번 읽었다.
- 인덱스도 `concert_id` 단일 조건에는 맞지만, 실제 정산 query의 핵심 조건인 `concert_id + approved status`를 한 번에 표현하지 못했다.
- 그래서 API가 반환하는 데이터는 작아도, DB 안에서는 꽤 큰 집계 작업이 반복됐다.

개선 후에는 같은 row set을 한 번만 읽고 `sum`과 `count`를 같이 계산한다.

```sql
SELECT coalesce(sum(amount), 0), count(*)
FROM payments
WHERE concert_id = :concert_id
  AND status = 'approved';
```

그리고 이 query shape에 맞춰 다음 인덱스를 사용한다.

```text
ix_payments_concert_status(concert_id, status)
```

최신 API 통합 벤치마크의 query plan은 이 복합 인덱스를 사용했다. 따라서 이번 개선은 단순히 측정값이 좋아진 것이 아니라, 코드의 query shape와 DB access path가 서로 맞게 정리된 것으로 본다.

## Decision

- provider/admin 정산 기준 API는 같은 서비스 메서드를 유지한다.
- 권한 차이만 route에서 처리하고, 정산 계산 방식은 하나로 둔다.
- 정산 집계 query는 `sum`과 `count`를 한 번에 가져온다.
- payment table에는 정산 predicate에 맞는 `(concert_id, status)` 복합 인덱스를 둔다.
- API 통합 벤치마크 보고서에는 p95/p99 수치와 함께 query plan, index decision, actual/estimated rows를 남긴다.

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | `Payment` model에 `ix_payments_concert_status(concert_id, status)` 추가 | service | `service/services/payment-service/app/models.py` |
| done | `settlement_for_concert()`의 `sum`/`count`를 단일 aggregate query로 통합 | service | `service/services/payment-service/app/services/payments.py` |
| done | 정산 query analysis를 단일 `SUM/COUNT` query 기준으로 갱신 | service | `service/services/payment-service/tests/integration/test_api_benchmark.py` |
| done | payment-service large API 통합 벤치마크를 `SAMPLES=100`으로 재실행 | service | `tests/tmp/reports/api-integration/payment-service/half-year-early-growth/latest.json` |
| done | payment-service benchmark 보고서를 최신 결과로 갱신 | workspace | `workspace/docs/evidence/services/api-integration-test-benchmark/half-year-early-growth/payment-service.md` |
| done | unit test와 diff check 실행 | service/workspace | `uv run --group test pytest -q tests/test_payments.py`, `git diff --check` |
| todo | 기존 운영 DB가 재생성되지 않는 환경이면 별도 migration 또는 index 생성 절차 확인 | service | `ix_payments_concert_status` |

## Result

| endpoint | before p95 | before p99 | after p95 | after p99 | 읽는 기준 |
| --- | ---: | ---: | ---: | ---: | --- |
| `provider-settlement-basis` | 40.938ms | 45.354ms | 13.340ms | 15.280ms | 같은 row set을 한 번만 집계하고 복합 인덱스를 사용 |
| `admin-settlement-basis` | 56.291ms | 219.647ms | 15.140ms | 19.153ms | 같은 service method라 provider와 비슷한 범위로 안정화 |

최신 측정값은 `2026-06-20T14:14:50.136293+00:00`에 생성된 `half-year-early-growth` artifact 기준이다.

```text
samples=100
warmup=2
payments=184,000
approved payments=170,000
settlement target actual rows=48,776
query execution=12.209ms
index=ix_payments_concert_status
```

## Resolution

해결됨.

정산 API의 높은 tail latency는 단일 원인이라기보다, 같은 row set을 두 번 읽는 구현과 query predicate에 정확히 맞지 않는 인덱스가 겹친 결과로 판단한다.

`sum`과 `count`를 한 번의 aggregate query로 합치고 `(concert_id, status)` 복합 인덱스를 추가한 뒤, `SAMPLES=100` 기준 large benchmark에서 provider/admin 정산 API의 p95/p99가 안정적으로 내려갔다.

남은 확인점은 기존 운영 DB에 이미 생성된 payment table이 있을 때 이 인덱스를 어떻게 반영할지다. fresh DB 또는 testcontainers benchmark에서는 SQLAlchemy metadata 생성으로 인덱스가 만들어지지만, 운영 DB에는 migration 또는 별도 index 생성 절차가 필요할 수 있다.
