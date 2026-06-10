# 서비스 메트릭 구현 기준

관련 문서:

- `README.md`: 지표 정의와 수집 기준
- `../tracing/README.md`: Trace 수집 경로와 repo 책임
- `../implementation/README.md`: 관측성 구현 진입점

이 문서는 `service` repo에서 실제로 노출할 애플리케이션 메트릭을 정한다. Kubernetes, Pod, Node, Prometheus, Loki, Tempo 같은 플랫폼 지표는 `gitops`와 관측성 스택이 수집한다. 서비스 코드는 사용자 요청, 도메인 결과, 내부 처리, 이벤트 발행/소비처럼 애플리케이션만 알 수 있는 지표를 책임진다.

## 적용 원칙

메트릭은 장애 조사와 운영 판단에 쓰이는 값만 남긴다. 요청마다 달라지는 ID는 trace와 log에서 찾고, metric label에는 올리지 않는다.

- 서비스 메트릭 구현은 `prometheus-client`를 기본으로 한다. 지금은 수집 파이프라인 통일보다는 분석 가능한 지표를 빠르게 확보하는 것이 우선이다.
- 비즈니스 로직은 `prometheus-client`를 직접 호출하지 않는다. 앱 내부 telemetry event는 `Blinker` signal로 발행하고, metrics adapter가 이를 받아 Counter/Histogram으로 변환한다.
- 공통 label과 공통 result 값은 shared package에 강타입으로 정의한다. 서비스별 action, error code, domain-specific label은 각 서비스의 metric label schema 파일에서 관리한다.
- 메트릭 스키마 정의는 수집 구현과 분리한다. label 이름, 허용값, event dataclass는 schema 계층에 두고, `prometheus-client` 등록과 record/observe 호출은 adapter 계층에 둔다.
- `domain`은 공통 메트릭에서 업무 영역을 묶기 위한 낮은 cardinality label로만 쓴다. 예시는 `auth`, `concert`, `reservation`, `payment`, `ticket`, `notification`이다.
- `error_code`는 metric label이므로 반드시 고정된 허용 목록으로 관리한다. 원본 예외 메시지, 외부 제공자 원문 코드, request/user/domain object ID가 섞인 값은 log와 trace에만 남긴다.
- 공통 HTTP 지표는 모든 FastAPI 서비스에 같은 이름과 label로 붙인다.
- 서비스별 지표는 도메인 결과와 외부 의존성 경계에만 붙인다.
- 비즈니스 거절과 장애성 실패를 같은 에러율로 섞지 않는다.
- `request_id`, `trace_id`, `span_id`, `correlation_id`, `user_id`, `order_id`, `payment_id`, `reservation_id`, `ticket_id`, raw path는 metric label로 쓰지 않는다.
- Prometheus label 이름은 `service_name`, `http_route`처럼 snake_case를 쓴다. OTel 문서의 `service.name`, `http.route`와 의미를 맞추되 Prometheus에 맞는 이름으로 노출한다.
- 구현은 `packages/server`의 공통 `/metrics` 경로를 먼저 정렬하고, 서비스별 계측은 각 서비스의 composition root 또는 use case 경계에서 붙인다.
- `/metrics`는 운영 endpoint이므로 OpenAPI 계약 반영 여부와 무관하게 모든 서비스에 추가한다.

## 공통 Label

| Label | 필수 | 의미 | 예시 |
|---|---|---|---|
| `service_name` | 예 | 서비스 이름 | `payment-service` |
| `service_version` | 권장 | 배포 버전 | `2026.06.09.1`, git SHA |
| `service_environment` | 권장 | 실행 환경 | `local`, `dev`, `aws-dev`, `prod` |
| `http_route` | HTTP 지표 필수 | route template | `/payments/{paymentId}` |
| `http_request_method` | HTTP 지표 필수 | HTTP method | `GET`, `POST` |
| `http_response_status_code` | HTTP 지표 필수 | HTTP status code | `200`, `404`, `500` |
| `error_code` | 실패/거절 지표 권장 | 고정된 에러 코드 | `auth.forbidden`, `payment.failed` |
| `domain` | 도메인 지표 권장 | 업무 영역 | `auth`, `reservation`, `payment` |
| `failure_kind` | 실패 지표 권장 | 실패 분류 | `business_rejection`, `internal_error`, `dependency_error` |
| `expected` | 비즈니스 결과 권장 | 의도된 거절인지 여부 | `true`, `false` |
| `retryable` | 의존성 실패 권장 | 재시도 의미 여부 | `true`, `false` |

## 공통 메트릭

현재 서비스는 이미 `/metrics`를 노출하고 `http_requests_total`, `http_request_duration_seconds`, `service_ready`를 기록한다. 아직 개발 단계이므로 기존 이름과의 호환성보다 문서 기준에 맞는 공통 이름과 label로 정렬하는 것을 우선한다.

| Metric | Type | Label | 설명 |
|---|---|---|---|
| `http_server_request_duration_seconds` | histogram | `service_name`, `service_version`, `service_environment`, `http_route`, `http_request_method`, `http_response_status_code` | 모든 HTTP 요청의 처리 시간. `_count`로 request rate와 5xx rate를 계산하고 `_bucket`으로 p95/p99를 계산한다. |
| `http_server_active_requests` | gauge | `service_name`, `service_version`, `service_environment`, `http_route`, `http_request_method` | 현재 처리 중인 요청 수. 느린 요청이나 downstream 대기 증가를 볼 때 쓴다. |
| `service_ready` | gauge | `service_name`, `service_version`, `service_environment` | readiness 상태. ready면 1, not ready면 0이다. |
| `service_dependency_up` | gauge | `service_name`, `service_environment`, `dependency`, `dependency_type` | 서비스가 직접 의존하는 DB, Kafka, MongoDB, S3 같은 의존성 상태. readiness check와 같은 기준을 쓴다. |
| `service_errors_total` | counter | `service_name`, `service_environment`, `domain`, `error_code`, `failure_kind`, `expected`, `retryable` | HTTP status만으로 부족한 내부 예외, 도메인 거절, 의존성 실패를 분리해 기록한다. |
| `db_query_duration_seconds` | histogram | `service_name`, `service_environment`, `db_system`, `operation`, `result` | DB query 또는 transaction 지연. SQL 원문, table별 동적 값, row ID는 label로 넣지 않는다. |
| `events_published_total` | counter | `service_name`, `service_environment`, `topic`, `event_type`, `result` | Kafka 이벤트 발행 수. 발행 성공/실패를 분리한다. |
| `events_consumed_total` | counter | `service_name`, `service_environment`, `topic`, `event_type`, `result` | Kafka 이벤트 소비 수. 중복 이벤트는 `result="duplicate"`로 분리한다. |
| `events_failed_total` | counter | `service_name`, `service_environment`, `topic`, `event_type`, `error_code`, `failure_kind`, `retryable` | 이벤트 처리 실패 수. 실패 원인 분류에 쓴다. |

Kafka consumer lag는 애플리케이션 코드보다 Kafka exporter 또는 Prometheus 쪽에서 수집하는 것이 우선이다. 서비스 코드는 lag 자체보다 consume 성공/실패, 중복 처리, DLQ 이동 같은 처리 결과를 기록한다.

## 서비스별 핵심 지표

### auth-service

인증 서비스는 로그인 성공 여부와 토큰 경계를 우선 본다. 이메일, 사용자 ID, 토큰 ID는 label로 쓰지 않는다.

| Metric | Type | Label | 설명 |
|---|---|---|---|
| `auth_attempts_total` | counter | `service_name`, `service_environment`, `action`, `result`, `error_code` | `login`, `refresh`, `logout`, `me` 같은 인증 경계의 성공/거절 수. |
| `auth_tokens_issued_total` | counter | `service_name`, `service_environment`, `token_type` | access token, refresh token 발급 수. |
| `auth_token_revocations_total` | counter | `service_name`, `service_environment`, `token_type`, `reason` | logout, refresh rotation, admin revoke 같은 토큰 무효화 수. |
| `audit_events_total` | counter | `service_name`, `service_environment`, `event_type`, `outcome` | 감사 로그 생성 수. 감사 로그 본문은 별도 감사 로그 저장소에 남긴다. |

### concert-service

공연 서비스는 조회 트래픽과 좌석/공연 관리 변경을 분리해서 본다. `concert_id`, `showtime_id`, `seat_id`는 label로 쓰지 않는다.

| Metric | Type | Label | 설명 |
|---|---|---|---|
| `catalog_queries_total` | counter | `service_name`, `service_environment`, `resource`, `result` | 공연, 회차, 좌석 조회 요청 결과. |
| `catalog_query_duration_seconds` | histogram | `service_name`, `service_environment`, `resource`, `result` | 공개 조회 API 지연. 대기열 또는 예매 시작 시 조회 병목 확인에 쓴다. |
| `concert_admin_commands_total` | counter | `service_name`, `service_environment`, `command`, `result` | 공연, 장소, 정책, 리뷰 승인 같은 관리자/공급자 변경 명령 결과. |
| `seat_inventory_commands_total` | counter | `service_name`, `service_environment`, `command`, `result` | 좌석 맵 업로드, 좌석 재고 변경, 좌석 등급 생성, 좌석 hold 요청 결과. |

### reservation-service

예약 서비스는 트래픽 폭증 시 가장 먼저 보는 도메인 지표를 가진다. 예약 ID, 좌석 ID, 사용자 ID는 label로 쓰지 않는다.

| Metric | Type | Label | 설명 |
|---|---|---|---|
| `reservations_total` | counter | `service_name`, `service_environment`, `result`, `error_code`, `failure_kind`, `expected` | 예약 생성, 취소, 만료, 거절, 실패 결과. |
| `reservation_command_duration_seconds` | histogram | `service_name`, `service_environment`, `command`, `result` | 예약 생성/취소/만료 처리 시간. |
| `reservation_conflicts_total` | counter | `service_name`, `service_environment`, `conflict_type`, `result` | 좌석 충돌, 중복 요청, DB unique constraint 충돌 같은 경쟁 상태. |
| `sales_state_changes_total` | counter | `service_name`, `service_environment`, `action`, `result` | 판매 시작, 일시정지, 재개 명령 결과. |
| `reservation_events_published_total` | counter | `service_name`, `service_environment`, `event_type`, `result` | `reservation-created`, `reservation-expired` 이벤트 발행 결과. 공통 `events_published_total`로 합쳐도 된다. |

### payment-service

결제 서비스는 결제 성공률, 지연, 이벤트 발행을 우선 본다. 실제 PG 원문 메시지, 결제 ID, 예약 ID는 label로 쓰지 않는다.

| Metric | Type | Label | 설명 |
|---|---|---|---|
| `payments_total` | counter | `service_name`, `service_environment`, `method`, `result`, `error_code`, `failure_kind`, `retryable` | 결제 시도, 승인, 실패, 지연 결과. |
| `payment_request_duration_seconds` | histogram | `service_name`, `service_environment`, `method`, `result` | 결제 API 전체 처리 시간. |
| `payment_provider_duration_seconds` | histogram | `service_name`, `service_environment`, `provider`, `method`, `result` | 외부 PG 호출 시간. 현재는 시뮬레이션이라도 provider label은 낮은 cardinality 값으로 고정한다. |
| `payment_idempotency_total` | counter | `service_name`, `service_environment`, `result` | idempotency key로 기존 결제를 반환했는지, 충돌이 났는지 확인한다. |
| `payment_events_published_total` | counter | `service_name`, `service_environment`, `event_type`, `result` | `payment-approved`, `payment-failed` 이벤트 발행 결과. 공통 `events_published_total`로 합쳐도 된다. |

### ticket-service

티켓 서비스는 결제 승인 이벤트 처리, 중복 발급 방지, QR/PDF 업로드를 본다. ticket ID, reservation ID는 label로 쓰지 않는다.

| Metric | Type | Label | 설명 |
|---|---|---|---|
| `tickets_issued_total` | counter | `service_name`, `service_environment`, `source`, `result` | API 또는 `payment-approved` 이벤트로 티켓이 발급된 수. 중복 요청은 `result="duplicate"`로 분리한다. |
| `ticket_issue_duration_seconds` | histogram | `service_name`, `service_environment`, `source`, `result` | 티켓 발급 전체 처리 시간. |
| `ticket_artifact_upload_duration_seconds` | histogram | `service_name`, `service_environment`, `artifact`, `result` | QR, PDF 업로드 시간과 실패 여부. |
| `ticket_events_consumed_total` | counter | `service_name`, `service_environment`, `topic`, `event_type`, `result` | `payment-approved` 소비 결과. 공통 `events_consumed_total`로 합쳐도 된다. |
| `ticket_events_published_total` | counter | `service_name`, `service_environment`, `event_type`, `result` | `ticket-issued` 이벤트 발행 결과. 공통 `events_published_total`로 합쳐도 된다. |

### notification-service

알림 서비스는 이벤트 소비와 알림 생성 결과가 핵심이다. notification ID, source ID, user ID는 label로 쓰지 않는다.

| Metric | Type | Label | 설명 |
|---|---|---|---|
| `notification_events_consumed_total` | counter | `service_name`, `service_environment`, `topic`, `event_type`, `result` | 예약, 결제, 티켓 이벤트 소비 결과. 공통 `events_consumed_total`로 합쳐도 된다. |
| `notifications_created_total` | counter | `service_name`, `service_environment`, `event_type`, `result` | 비즈니스 이벤트에서 알림 문서가 생성된 수. 중복 이벤트는 `result="duplicate"`로 분리한다. |
| `notification_create_duration_seconds` | histogram | `service_name`, `service_environment`, `event_type`, `result` | 알림 생성 처리 시간. MongoDB 지연과 이벤트 처리 병목을 구분할 때 쓴다. |
| `notification_reads_total` | counter | `service_name`, `service_environment`, `route_kind`, `result` | 알림 목록/상세 조회 결과. |

## 구현 우선순위

| 단계 | 범위 | 완료 기준 |
|---|---|---|
| P0 | 공통 HTTP 메트릭 정렬 | 모든 서비스가 같은 이름과 label로 request rate, 5xx rate, p95 latency를 계산할 수 있다. |
| P0 | 고카디널리티 label 차단 | raw path, request/trace/user/domain object ID가 metric label에 들어가지 않는다. |
| P1 | `payment-service` | 결제 성공률, 결제 지연, 결제 이벤트 발행 성공/실패를 볼 수 있다. |
| P1 | `reservation-service` | 예약 생성/거절/실패, 좌석 충돌, 판매 상태 변경, 예약 이벤트 발행을 볼 수 있다. |
| P1 | `ticket-service` | 결제 승인 이벤트 소비, 티켓 발급, 중복 발급 방지, 티켓 이벤트 발행을 볼 수 있다. |
| P1 | `auth-service` | 로그인/토큰/감사 이벤트의 allow/deny 흐름을 볼 수 있다. |
| P1 | `concert-service` | 공개 조회 트래픽과 좌석/공연 관리 명령 결과를 볼 수 있다. |
| P1 | `notification-service` | 비즈니스 이벤트 소비, 알림 생성, 중복 이벤트 처리를 볼 수 있다. |

첫 샘플 구현은 `payment-service`로 진행한다. 결제 결과 counter, 결제 처리 histogram, 이벤트 발행 결과를 함께 다루면 공통 label schema, Blinker signal, metrics adapter, `/metrics` 노출 흐름을 한 번에 검증할 수 있다.

## 구현 위치

```text
service/packages/server
  - 공통 /metrics endpoint
  - 공통 HTTP request duration, active request, readiness
  - Prometheus label 정책

service/packages/observability
  - trace/log와 이어지는 error context, request context helper
  - OpenTelemetry 직접 import를 서비스 비즈니스 코드에 퍼뜨리지 않는 facade

service/services/*/app
  - 서비스별 도메인 counter/histogram 등록
  - use case, 이벤트 발행/소비, 외부 의존성 경계에서 telemetry event 발행
  - metrics adapter에서 label schema 적용 후 observe/inc 호출

gitops
  - ServiceMonitor
  - Grafana dashboard
  - PrometheusRule
```

서비스별 metric 등록은 `register_operational_handlers(..., configure_metrics=...)`의 확장 지점을 우선 사용한다. 계측 호출은 HTTP handler 바깥의 use case나 이벤트 handler 경계에 두어 API, Kafka, 내부 호출 경로가 같은 지표를 공유하게 한다.

## 서비스 내부 계측 레이어

비즈니스 로직은 metric 이름과 Prometheus label을 몰라야 한다. use case와 event handler는 의미 있는 telemetry event만 발행하고, metrics adapter가 label schema를 적용해 `prometheus-client`에 기록한다.

```text
HTTP Handler / Kafka Handler
        |
        v
Use Case / Domain Service
        |
        |  Blinker signal
        |  예: payment.completed, reservation.conflicted
        v
Telemetry Event
        |
        v
Metrics Adapter
        |
        |  label schema 적용
        |  result, error_code, failure_kind, expected, retryable 정리
        v
prometheus-client
        |
        |  Counter.inc()
        |  Histogram.observe()
        v
/metrics
        |
        v
Prometheus scrape
        |
        v
Grafana / PromQL
```

이 구조에서는 `Blinker`가 서비스 프로세스 내부 event dispatch만 맡는다. Kafka 같은 외부 메시지 브로커로 metric event를 보내지 않는다. metrics adapter는 단순하게 유지하고, label 누락이나 허용되지 않은 값은 개발/테스트 환경에서 먼저 드러나게 한다. 운영 중 metric 기록 문제가 발생하면 애플리케이션 로그에 기록하고 원인 분석이 가능하게 남긴다.

## 강타입 Label Schema

Metric label 값은 raw string으로 흩어두지 않는다. 공통 label 이름과 공통 result 값은 shared package에서 정의하고, 서비스별 action과 error code는 각 서비스의 schema 파일에서 `StrEnum` 같은 강타입으로 관리한다.

```text
service/packages/metrics
  - 공통 label 이름
  - 공통 result/failure_kind/expected/retryable 값
  - 공통 telemetry event base type

service/services/*/app/metric_labels.py
  - 서비스별 action
  - 서비스별 error_code
  - 서비스별 domain-specific label 값

service/services/*/app/telemetry_events.py
  - 강타입 label 값을 사용하는 telemetry event dataclass

service/services/*/app/metrics.py
  - telemetry event를 Prometheus label value로 변환
```

예시:

```python
from dataclasses import dataclass
from enum import StrEnum

from metrics.labels import MetricResult


class AuthAction(StrEnum):
    LOGIN = "login"
    REFRESH = "refresh"
    LOGOUT = "logout"
    ME = "me"


class AuthErrorCode(StrEnum):
    NONE = "none"
    INVALID_CREDENTIALS = "auth.invalid_credentials"
    INVALID_TOKEN = "auth.invalid_token"
    FORBIDDEN = "auth.forbidden"


@dataclass(frozen=True)
class AuthAttempted:
    action: AuthAction
    result: MetricResult
    error_code: AuthErrorCode = AuthErrorCode.NONE
```

metrics adapter는 enum의 `.value`만 Prometheus label로 넘긴다. 이렇게 하면 label 오타로 새로운 시계열이 생기는 일을 줄이고, 문서와 코드의 허용값을 한곳에서 대조할 수 있다.

`error_code`는 특히 신중하게 관리한다. 같은 원인은 하나의 고정 코드로 매핑하고, 원본 메시지는 label로 올리지 않는다.

```text
허용:
  payment.provider_timeout
  payment.card_declined
  reservation.conflict
  reservation.sold_out

금지:
  timeout after 3021ms
  payment_id=pay-123 failed
  user 42 has invalid token
  provider raw error: CARD_DECLINED_51
```

## 대시보드 첫 화면

서비스 메트릭을 처음 연결할 때 Grafana 첫 화면은 다음 순서로 둔다.

1. Request rate by service
2. 5xx error rate by service
3. p95 latency by service
4. Payment success rate
5. Reservation result and rejection rate
6. Ticket issue success and duplicate rate
7. Event consume/publish failure rate
8. Readiness and dependency state

이 순서면 먼저 사용자 영향과 핵심 비즈니스 흐름을 보고, 그 다음 이벤트와 의존성 문제로 원인을 좁힐 수 있다.
