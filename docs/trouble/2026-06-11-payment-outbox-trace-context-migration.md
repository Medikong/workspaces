---
id: TROUBLE-005
title: "payment outbox trace context 컬럼 마이그레이션 누락"
status: in_progress
priority: p1
severity: high
area: observability
repos:
  - workspace
  - service
  - gitops
owner: unassigned
created: 2026-06-11
updated: 2026-06-11
resolved: null
tags:
  - payment-service
  - outbox
  - tracing
  - trace-context
  - database-migration
  - postgresql
  - canary-deployment
related:
  - docs/architecture/observability/tracing/README.md
  - docs/project_docs/04-scenarios/S7-observability-tracing.md
  - docs/project_docs/04-scenarios/S9-canary-deployment.md
links: []
---

# payment outbox trace context 컬럼 마이그레이션 누락

## Context

payment-service의 outbox 기반 Kafka 이벤트에 OpenTelemetry trace context를 보존하도록 변경했다. 의도한 흐름은 다음과 같다.

1. `/payments` HTTP 요청에서 현재 `traceparent`, `tracestate`를 캡처한다.
2. `payment_events` outbox row에 payload와 분리된 `trace_context` JSON을 저장한다.
3. outbox dispatcher가 Kafka 발행 시 저장된 trace context를 Kafka header로 복원한다.
4. ticket-service consumer가 Kafka header에서 trace context를 추출해 같은 trace 흐름으로 consumer span을 남긴다.

구현 후 synthetic 결제를 실행했지만 Tempo에서 payment-service trace만 보이고 ticket-service trace가 이어지지 않았다. 조사 중 `payment_events` 테이블에 `trace_context` 컬럼이 없다는 사실이 확인됐다.

## Symptoms

- 관찰된 현상:
  - 결제 요청에서 ticket-service까지 trace가 이어지지 않는다.
  - payment-service 로그에 `payment_events.trace_context` 컬럼이 없다는 DB 오류가 남는다.
  - outbox row에 trace context가 저장되지 못하므로 Kafka header로 `traceparent`를 복원할 수 없다.
- 재현 조건:
  - 기존 로컬 PostgreSQL PVC 또는 기존 `payment_db`가 남아 있는 상태에서 trace context 저장 코드가 반영된 payment-service를 실행한다.
  - `/payments` 승인 흐름이 `payment_events` row를 INSERT한다.
- 기대 동작:
  - `payment_events.trace_context` JSON 컬럼에 요청 시점 trace context가 payload와 분리되어 저장된다.
  - dispatcher가 이 값을 Kafka `traceparent`, `tracestate` header로 발행한다.
  - ticket-service consumer span이 같은 trace id 아래에 기록된다.
- 실제 동작:
  - DB 테이블에는 `trace_context` 컬럼이 없다.
  - payment-service 코드는 `trace_context`를 INSERT하려고 하면서 `UndefinedColumn` 오류가 발생한다.
  - outbox 이벤트가 정상 생성되지 않아 payment -> Kafka -> ticket trace 연결이 끊긴다.

## Impact

- 영향 범위:
  - 결제 승인 후 티켓 발급까지 이어지는 분산 trace 검증.
  - payment-service outbox insert 경로.
  - synthetic E2E 결제 흐름과 Tempo trace 확인.
- 우선 처리 이유:
  - 서비스 코드와 DB 스키마가 어긋나면 trace 누락을 넘어 결제 outbox 생성 자체가 실패한다.
  - "이미지가 최신인데 trace가 이어지지 않는다"는 증상이 실제로는 스키마 불일치에서 시작될 수 있다.
  - 무중단/카나리 배포에서는 새 코드와 기존 DB 스키마가 잠깐 공존하므로 같은 문제가 반복될 수 있다.
- 우회 방법:
  - 로컬 DB에는 임시로 다음 DDL을 직접 실행할 수 있다.

```sql
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS trace_context JSON;
```

## Investigation

| 시간 | 확인 내용 | 결과 |
| --- | --- | --- |
| 2026-06-11 | Tempo에서 특정 trace id 조회 | payment-service span만 확인되고 ticket-service consumer span이 이어지지 않음 |
| 2026-06-11 | payment-service 코드 확인 | `PaymentEvent` 모델에는 `trace_context: JSON` 컬럼 정의가 있음 |
| 2026-06-11 | outbox 생성 코드 확인 | `PaymentEvent(trace_context=event_draft.trace_context)`로 저장하려고 함 |
| 2026-06-11 | dispatcher 코드 확인 | `event.trace_context`에서 carrier를 꺼내 Kafka headers로 전달하도록 구현돼 있음 |
| 2026-06-11 | ticket-service consumer 코드 확인 | 기존 `start_consumer_span(message)` 경계에서 Kafka header를 추출하는 구조라 payment 쪽 header 전달이 핵심임 |
| 2026-06-11 | 실행 중 payment-service 로그 확인 | `psycopg.errors.UndefinedColumn: column "trace_context" of relation "payment_events" does not exist` 확인 |
| 2026-06-11 | `payment_db` information_schema 확인 | `payment_events` 컬럼 목록에 `trace_context`가 없음 |
| 2026-06-11 | 실행 중 payment-service 이미지/모델 확인 | 실행 중 코드는 이미 `trace_context` 컬럼을 가진 모델을 사용하고 있음 |
| 2026-06-11 | payment-service startup 코드 확인 | `Base.metadata.create_all(bind=engine)`만 있고 Alembic 같은 migration 디렉터리는 없음 |
| 2026-06-11 | SQLAlchemy `create_all()` 동작 판단 | 새 테이블은 만들지만 기존 테이블에 새 컬럼을 추가하지 않으므로 기존 PVC/DB에는 컬럼이 생기지 않음 |
| 2026-06-11 | 로컬 DB 임시 조치 | `ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS trace_context JSON` 실행 후 컬럼 존재 확인 |
| 2026-06-11 | 코드 레벨 임시 보강 | `services/payment-service/app/schema_migrations.py`에 임시 additive migration 추가 |

핵심 로그는 다음 형태였다.

```text
psycopg.errors.UndefinedColumn: column "trace_context" of relation "payment_events" does not exist
LINE 1: ... payment_events (..., payload, trace_context, publish_status, ...)
```

이 로그는 이미지가 구버전이라서 생긴 문제가 아니라, 오히려 새 코드가 `trace_context`를 쓰고 있는데 DB 스키마가 따라오지 못했다는 증거다.

## Decision

단기적으로는 payment-service 시작 시점에 안전한 additive migration을 한 번 수행하는 임시 코드를 둔다.

- `payment_events` 테이블이 없으면 아무것도 하지 않는다.
- 테이블이 있고 `trace_context` 컬럼이 없으면 nullable JSON 컬럼을 추가한다.
- 컬럼이 이미 있으면 아무것도 하지 않는다.
- 이 코드는 장기 migration framework가 아니며, 파일 주석에 임시 성격을 명확히 남긴다.

운영/카나리 관점의 장기 방향은 아직 확정하지 않았다. 현재 직면한 문제는 다음과 같다.

- 중앙화된 migration step을 사람이 매번 기억하고 실행하는 방식은 누락 위험이 크다.
- 반대로 앱 startup에서 DDL을 실행하면 여러 파드 동시 시작, DDL lock, 카나리 배포 순서 문제가 생길 수 있다.
- PostgreSQL advisory lock, migration 이력 테이블, Kubernetes Job, Argo CD sync wave 중 어떤 방식을 기본 원칙으로 삼을지 정해야 한다.
- 모든 migration을 앱 레벨에서 처리하지 않고, nullable column 추가 같은 안전한 변경과 backfill/drop/rename/NOT NULL 같은 위험한 변경을 구분해야 한다.

해결 방향은 두 축으로 남긴다.

1. 코드/스키마 호환성 중심의 실용 해법
   - 단순 필드 추가는 nullable, optional, additive 변경으로 제한한다.
   - 신규 버전과 과거 버전이 같은 DB를 동시에 사용해도 깨지지 않게 한다.
   - 새 코드는 컬럼이 있으면 쓰고, 기존 코드는 새 컬럼을 몰라도 정상 동작해야 한다.
   - 이벤트 payload 계약에는 trace context를 섞지 않고, outbox metadata처럼 별도 영역에 둔다.
   - 이 방식은 현재 `payment_events.trace_context` 같은 작은 확장에는 적합하지만, rename/drop/backfill/NOT NULL 전환에는 부족하다.

2. 아키텍처 패턴으로 해결하는 구조적 해법
   - 이벤트 소싱과 어그리게이트를 사용하면 상태 변경 자체를 append-only domain event로 남기고, 현재 상태는 이벤트를 재생하거나 projection으로 만든다.
   - trace context 같은 기술 metadata는 domain payload가 아니라 event envelope 또는 metadata에 둔다.
   - aggregate는 비즈니스 불변식을 지키고 domain event를 생성하며, outbox는 이 domain event를 발행 대상으로 삼는다.
   - 이벤트는 버전 필드와 upcaster를 통해 진화시킬 수 있어, 테이블 컬럼 변경보다 이벤트 계약 진화에 초점을 둘 수 있다.
   - 단, event store/projection/outbox 테이블 자체의 스키마는 여전히 관리해야 하므로 DB migration 문제가 사라지는 것은 아니고 빈도와 성격이 달라진다.

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | payment-service 로그에서 `trace_context` UndefinedColumn 확인 | service |  |
| done | 실제 `payment_db.payment_events` 스키마에 `trace_context` 컬럼이 없는 것 확인 | service |  |
| done | 실행 중 payment-service 모델에는 `trace_context`가 있는 것 확인 | service |  |
| done | 로컬 DB에 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS trace_context JSON` 임시 적용 | service |  |
| done | payment-service에 임시 `schema_migrations.py` 추가 | service | `services/payment-service/app/schema_migrations.py` |
| done | 임시 migration 코드에 "잠깐 쓰는 bridge이며 정식 migration flow가 생기면 제거" 주석 추가 | service | `services/payment-service/app/schema_migrations.py` |
| todo | synthetic 결제를 다시 실행해 outbox row의 `trace_context` 저장 여부 확인 | service |  |
| todo | Kafka header에 `traceparent`, `tracestate`가 발행되는지 확인 | service |  |
| todo | Tempo에서 payment-service와 ticket-service consumer span이 같은 trace id로 이어지는지 확인 | observability |  |
| todo | 운영형 DB migration 원칙 조사 및 결정 | workspace/service/gitops | 앱 레벨 migration vs migration Job vs advisory lock |
| todo | 이벤트 소싱/어그리게이트 기반 outbox 구조가 trace metadata와 이벤트 계약 진화 문제를 줄일 수 있는지 검토 | workspace/service | architecture follow-up |
| todo | 임시 `schema_migrations.py` 제거 조건을 별도 이슈나 ADR로 정리 | workspace/service |  |

## Resolution

미해결. 로컬 DB와 코드에는 임시 대응을 넣었지만, 트러블의 근본 주제는 아직 남아 있다.

현재까지 확인된 직접 원인은 다음과 같다.

- payment-service는 trace context를 저장하도록 코드가 변경됐다.
- 기존 PostgreSQL `payment_events` 테이블에는 `trace_context` 컬럼이 없었다.
- 서비스 시작 시 `Base.metadata.create_all()`만 호출하는 구조라 기존 테이블의 새 컬럼은 자동 추가되지 않았다.
- 그 결과 outbox insert가 실패했고 Kafka header 복원 전에 trace 흐름이 끊겼다.

닫기 위한 조건은 다음과 같다.

- synthetic 결제 후 `payment_events.trace_context`가 저장된다.
- dispatcher가 Kafka header로 trace context를 복원한다.
- ticket-service consumer span이 같은 trace id로 Tempo에서 확인된다.
- 임시 startup migration을 언제까지 허용할지, 운영/카나리 환경에서는 어떤 migration 원칙을 적용할지 결정한다.
