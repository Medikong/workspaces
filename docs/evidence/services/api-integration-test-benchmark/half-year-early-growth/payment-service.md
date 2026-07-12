# payment-service API 통합 벤치마크

## 가정

- 이 문서는 동시접속 부하테스트가 아니라, 대량 데이터가 누적된 DB에서 API 1회 처리 비용을 측정한 결과다.
- seed 생성은 API 순차 호출이 아니라 PostgreSQL/MongoDB bulk insert로 수행한다.
- testcontainers 컨테이너는 테스트 종료 시 정리되며, seed/setup 시간은 endpoint 측정값에 포함하지 않는다.
- 민감값은 artifact와 보고서에 남기지 않고, synthetic user id와 deterministic id만 사용한다.

## 실행 기준

- YAML preset 경로: `tests/benchmarks/datasets/half-year-early-growth.yaml`
- artifact root: `tests/tmp/reports/api-integration`
- smoke 실행: `task benchmark-api-smoke-service SERVICE=payment-service PRESET=smoke`
- large 실행: `task benchmark-api-large-service SERVICE=payment-service PRESET=half-year-early-growth SAMPLES=100`
- 보고서 갱신: `task benchmark-api-report SERVICE=payment-service`

## Smoke 결과

- preset: `smoke`
- 생성 시각: `2026-06-20T13:08:10.309508+00:00`
- artifact: `tests/tmp/reports/api-integration/payment-service/smoke/latest.json`
- seed 규모: 서비스기간 7일, 활성 사용자 80명, 공연 12개, 회차 36개, 좌석 2,520석, payment_events=184, payments=184

| endpoint | method | status | samples | warmup | minMs | p50Ms | p95Ms | p99Ms | maxMs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create-payment | POST | 201 | 5 | 1 | 7.498 | 8.811 | 10.297 | 10.297 | 10.297 |
| get-payment | GET | 200 | 5 | 1 | 4.530 | 5.616 | 12.329 | 12.329 | 12.329 |
| provider-settlement-basis | GET | 200 | 5 | 1 | 7.067 | 12.154 | 26.778 | 26.778 | 26.778 |
| admin-settlement-basis | GET | 200 | 5 | 1 | 6.130 | 6.821 | 10.208 | 10.208 | 10.208 |

## Large 결과

- preset: `half-year-early-growth`
- 생성 시각: `2026-06-20T14:14:50.136293+00:00`
- artifact: `tests/tmp/reports/api-integration/payment-service/half-year-early-growth/latest.json`
- seed 규모: 서비스기간 180일, 활성 사용자 40,000명, 공연 270개, 회차 810개, 좌석 567,000석, payment_events=184,000, payments=184,000

| endpoint | method | status | samples | warmup | minMs | p50Ms | p95Ms | p99Ms | maxMs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create-payment | POST | 201 | 100 | 2 | 4.457 | 5.726 | 10.238 | 15.533 | 24.011 |
| get-payment | GET | 200 | 100 | 2 | 2.885 | 3.646 | 4.369 | 5.175 | 5.290 |
| provider-settlement-basis | GET | 200 | 100 | 2 | 9.260 | 11.021 | 13.340 | 15.280 | 17.056 |
| admin-settlement-basis | GET | 200 | 100 | 2 | 9.417 | 11.055 | 15.140 | 19.153 | 20.938 |

## 샘플 수 해석

- 이 artifact의 endpoint별 samples는 `100`이고 warmup은 `2`이다.
- samples가 100 수준이면 p95/p99와 max를 분리해서 볼 수 있어, 일시적인 TestClient/컨테이너 wall time outlier를 더 조심스럽게 해석할 수 있다.

## Query Plan / Index Analysis

| endpoint | query shape | plan summary | index used | index decision | 데이터 성능 분석 |
| --- | --- | --- | --- | --- | --- |
| `create-payment` | `SELECT payments WHERE user_id AND idempotency_key, INSERT payments/events` | index_scan, indexes=`uq_payments_user_idempotency_key`, returned=0, estimated=1, buffers=4/2, planning=0.080ms, execution=0.090ms | yes | idempotency key가 있는 운영 path에는 unique constraint를 유지한다. | payments=184,000. benchmark 요청은 새 결제 insert/outbox insert 비용이 중심이다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `get-payment` | `SELECT payments WHERE id` | index_scan, indexes=`payments_pkey`, returned=1, estimated=1, buffers=4/0, planning=0.049ms, execution=0.043ms | yes | 단건 조회는 PK 유지. | 전체 payments 규모보다 권한 확인과 응답 직렬화 비용이 크다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `provider/admin-settlement-basis` | `SUM/COUNT payments WHERE concert_id AND status='approved'` | index_scan, indexes=`ix_payments_concert_status`, returned=48776, estimated=48758, buffers=7305/0, planning=0.066ms, execution=12.209ms | yes | 정산 집계 predicate에 맞춰 (concert_id, status) 복합 index를 사용한다. | payments=184,000, approved=170,000. sum/count를 한 번의 aggregate query로 가져와 같은 row set을 두 번 훑지 않는다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |

## 해석

- p99가 가장 큰 endpoint는 `admin-settlement-basis`이며 p99=19.153ms다.
- p50 대비 p99 꼬리가 가장 긴 endpoint는 `create-payment`이며 p99/p50=2.71배다.
- smoke와 large 결과 차이는 seed 규모 변화에 따른 DB 조회/정렬/집계 비용 증가를 보는 기준으로 사용한다.
- p95/p99가 높은 endpoint는 아래 query plan, index decision, 데이터 분포를 함께 보고 DB scan 문제인지 응답 크기/직렬화 문제인지 분리한다.

## 병목 후보

- `admin-settlement-basis`: p95=15.140ms, p99=19.153ms
- `create-payment`: p95=10.238ms, p99=15.533ms
- `provider-settlement-basis`: p95=13.340ms, p99=15.280ms

## 후속 개선점

- 목록 API는 일반 사용자와 헤비 사용자 결과를 분리해서 pagination 또는 projection 개선 후보를 판단한다.
- 운영 데이터가 쌓이면 YAML preset의 분포와 상태 비율을 실제 로그/DB 통계 기준으로 보정한다.
