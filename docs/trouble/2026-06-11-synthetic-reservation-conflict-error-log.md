---
id: TROUBLE-004
title: "Synthetic 예약 충돌의 ERROR 로그 오분류"
status: resolved
priority: p2
severity: medium
area: observability
repos:
  - workspace
  - service
  - gitops
owner: unassigned
created: 2026-06-11
updated: 2026-06-11
resolved: 2026-06-11
tags:
  - synthetic
  - observability
  - reservation-service
  - error-logging
  - business-rejection
  - 409-conflict
related:
  - docs/architecture/synthetic-e2e/README.md
  - docs/architecture/synthetic-e2e/result-collection-decision.md
links: []
---

# Synthetic 예약 충돌의 ERROR 로그 오분류

## Context

2026-06-11 synthetic E2E 실행 중 `reservation-service`에서 다음 형태의 structured log가 확인됐다.

- `severity_text`: `ERROR`
- `event`: `exception.recorded`
- `error.type`: `ConflictError`
- `error.code`: `reservation.conflict`
- `error.public_message`: `Seat is already reserved.`
- `request_id`: `synthetic-1781146380949-1-0-reservation-create`
- `error.attr.seatId`: `seat-showtime-07a18bafa1054fde-SYN-4-11`

이 문서는 해당 로그가 의도된 비즈니스 실패인지, 실제 서비스 에러인지 구분하고 후속 관측성 수정 방향을 남긴다.

## Symptoms

- 관찰된 현상:
  - synthetic 예약 요청에서 좌석 중복으로 `409 Conflict`가 발생한다.
  - reservation-service 로그에는 `ConflictError`가 `ERROR` severity와 stacktrace를 포함한 `exception.recorded` 이벤트로 남는다.
  - Grafana/Loki에서 정상적인 도메인 rejection이 서비스 장애처럼 보일 수 있다.
- 재현 조건:
  - synthetic `external-journey`가 기존 synthetic fixture의 좌석을 선택한다.
  - 선택한 좌석이 reservation-service 기준 `pending` 또는 `paid` active reservation에 이미 잡혀 있다.
- 기대 동작:
  - `reservation.conflict`는 클라이언트 또는 비즈니스 rejection으로 기록된다.
  - synthetic이 재시도해 성공한 경우 서비스 ERROR 로그나 span error로 과대 분류하지 않는다.
- 실제 동작:
  - FastAPI 공통 에러 핸들러가 `HttpError`를 모두 exception으로 기록한다.
  - `409 Conflict`도 stacktrace가 있는 `ERROR` 로그와 span error로 기록된다.

## Impact

- 영향 범위:
  - `reservation-service` 오류 로그와 trace error 판정.
  - synthetic E2E 대시보드, Loki error 탐색, 서비스 에러율 판단.
  - 알림 기준이 ERROR 로그 수에 묶이면 정상적인 좌석 경쟁/재시도 흐름이 장애로 오인될 수 있다.
- 우선 처리 이유:
  - synthetic은 좌석 충돌을 예상 가능한 상태로 다루지만, 서비스 로그는 이를 시스템 예외처럼 표현한다.
  - 실제 장애와 비즈니스 rejection이 같은 `ERROR` 레벨로 섞이면 운영 triage 비용이 커진다.
- 우회 방법:
  - 임시로 Loki/Grafana 쿼리에서 `error.code="reservation.conflict"` 또는 `http.status_code=409`를 제외할 수 있다.
  - 다만 쿼리 우회는 근본 해결이 아니며 공통 observability package의 분류를 수정해야 한다.

## Investigation

| 시간 | 확인 내용 | 결과 |
| --- | --- | --- |
| 2026-06-11 11:53 KST | reservation-service 로그 확인 | `reservation.conflict`가 `ERROR` `exception.recorded`로 기록됨 |
| 2026-06-11 | synthetic reservation flow 확인 | `gitops/platform/synthetic/flows/reservation.js`는 `reservation.create` 기대 status에 `201`, `409`를 둔다 |
| 2026-06-11 | synthetic runner 로그 확인 | run `1781146380949-1-0`은 첫 예약이 `409`, 다음 재시도가 `201`, 이후 `synthetic_run_finished`로 종료 |
| 2026-06-11 | reservation-service 도메인 로직 확인 | active reservation이 있으면 `ConflictError("reservation.conflict")`를 발생시킨다 |
| 2026-06-11 | 좌석 선택 로직 확인 | synthetic은 concert-service의 public seat status가 `available`인 좌석을 선택한다 |
| 2026-06-11 | 좌석 상태 소스 확인 | concert-service의 `sellable -> available` 상태는 reservation-service의 active reservation과 직접 동기화되지 않는다 |
| 2026-06-11 | 공통 에러 핸들러 확인 | `observability.fastapi_errors`가 모든 `HttpError`에서 `record_exception()`을 호출한다 |
| 2026-06-11 | exception recorder 확인 | `record_exception()`은 span status를 `ERROR`로 설정하고 structured log를 `severity_text="ERROR"`로 남긴다 |

현재 확인된 판단은 다음과 같다.

- `request_id=synthetic-1781146380949-1-0-reservation-create`의 첫 `409`는 의도된 비즈니스 rejection이다.
- 같은 run은 재시도 후 `201`로 성공했으므로 해당 로그만으로는 synthetic run 실패가 아니다.
- 다만 최근 runner 로그에는 `409`가 3회 연속 발생해 `reservation.create exhausted 3 seat attempts`로 실패한 run도 있다.
- 따라서 관측성 오분류와 synthetic fixture 좌석 소진 리스크를 분리해서 다룬다.

## Decision

1차 수정 방향은 관측성 분류를 바로잡는 것이다. 단, 공통 observability package에 `409`나 `reservation.conflict` 같은 도메인 규칙을 직접 넣지 않는다.

공통 패키지는 `HttpError`가 관측성 프로필을 가질 수 있는 구조만 제공한다. 각 서비스는 공용 `ConflictError` 하나에 모든 409를 넣지 않고, 도메인 의미가 드러나는 예외 타입을 별도로 만든다.

- `5xx`, unhandled exception, Kafka publish 실패 등 시스템 실패는 기존처럼 `ERROR`, stacktrace, span status `ERROR`로 기록한다.
- `SeatAlreadyReservedError`처럼 예상 가능한 도메인 거절은 `DOMAIN_REJECTION` 프로필을 사용하고, `ERROR` exception으로 기록하지 않는다.
- `HttpError` 기본 프로필은 보수적으로 기존 동작을 유지하되, 하위 도메인 예외가 프로필을 override할 수 있게 한다.
- `DOMAIN_REJECTION`으로 분류된 `4xx HttpError`는 stacktrace 없는 structured event로 남긴다.
- domain rejection metric은 유지한다. reservation-service metric에는 이미 `result="rejection"`, `failure_kind="business_rejection"`, `expected="true"` 분류가 있다.

예상 모델은 다음 형태다.

```python
class ErrorKind(StrEnum):
    SYSTEM_FAILURE = "system_failure"
    DOMAIN_REJECTION = "domain_rejection"
    CLIENT_REJECTION = "client_rejection"
    SECURITY_REJECTION = "security_rejection"


class ExceptionCapture(StrEnum):
    NONE = "none"
    STRUCTURED_LOG = "structured_log"
    FULL_EXCEPTION = "full_exception"


class SpanTreatment(StrEnum):
    UNCHANGED = "unchanged"
    RECORD_EVENT = "record_event"
    ERROR = "error"
```

`ErrorObservation`은 bool 플래그 여러 개 대신 의미 있는 enum 조합으로 표현한다.

```python
DOMAIN_REJECTION_OBSERVATION = ErrorObservation(
    kind=ErrorKind.DOMAIN_REJECTION,
    event="domain.rejection.recorded",
    severity="INFO",
    exception_capture=ExceptionCapture.STRUCTURED_LOG,
    span_treatment=SpanTreatment.RECORD_EVENT,
)
```

reservation-service 예외는 다음처럼 분리한다.

```python
class SeatAlreadyReservedError(HttpError):
    observation = DOMAIN_REJECTION_OBSERVATION

    def __init__(self, seat_id: str | None = None) -> None:
        super().__init__(
            status.HTTP_409_CONFLICT,
            "reservation.conflict",
            "Seat is already reserved.",
            {"seatId": seat_id} if seat_id is not None else None,
            domain="reservation",
        )
```

구현에서 선택한 로그 이벤트 이름은 다음과 같다.

- `domain.rejection.recorded`

필수 필드는 다음 수준으로 둔다.

- `service.name`
- `severity_text`
- `trace_id`
- `span_id`
- `request_id`
- `http.status_code`
- `error.type`
- `error.code`
- `error.domain`
- `error.public_message`
- safe error attributes

stacktrace와 span status `ERROR`는 `SYSTEM_FAILURE` 또는 unhandled exception에만 붙인다.

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | 공통 package에 `ErrorKind`, `ExceptionCapture`, `SpanTreatment`, `ErrorObservation`과 기본 observation 프로필 추가 | service | `packages/observability/src/observability/observation.py` |
| done | `HttpError`가 기본 observation을 가지며 하위 예외가 override할 수 있게 수정 | service | `packages/observability/src/observability/fastapi_errors.py` |
| done | 공통 recorder가 `ExceptionCapture`와 `SpanTreatment`에 따라 full exception 또는 structured rejection 로그를 나누어 남기게 수정 | service | `packages/observability/src/observability/exceptions.py` |
| done | reservation-service에 좌석 중복 의미가 드러나는 `SeatAlreadyReservedError` 추가 | service | `services/reservation-service/app/exceptions.py` |
| done | 사전 조회와 DB unique constraint fallback의 좌석 중복 경로에서 `SeatAlreadyReservedError` 사용 | service | `services/reservation-service/app/services/reservations.py`, `services/reservation-service/app/services/base.py` |
| done | `409` 응답은 유지되지만 좌석 중복이 `exception.recorded` ERROR로 남지 않는 API 테스트 추가 | service | `services/reservation-service/tests/test_reservation_api.py` |
| done | 시스템 실패는 기존처럼 ERROR, stacktrace, span error가 유지되는 회귀 테스트 추가 | service | `packages/observability/tests/test_observability.py` |
| done | 도메인 예외별 observation override 사용 예시를 코드로 남김 | service | `SeatAlreadyReservedError.observation = DOMAIN_REJECTION_OBSERVATION` |
| deferred | Grafana/Loki 대시보드에서 domain rejection과 service error를 분리해 보여주는지 확인 | gitops | 대시보드 쿼리 작업으로 별도 처리 |
| deferred | synthetic fixture 좌석 소진으로 3회 재시도 실패가 나는 문제는 별도 synthetic test-data 개선 항목으로 분리 검토 | gitops/workspace | 이번 수정은 관측성 오분류만 해결 |

## Resolution

해결. 공통 observability package는 HTTP status나 `reservation.conflict` 같은 도메인 규칙을 직접 알지 않고, 예외 타입에 붙은 `ErrorObservation` 프로필만 읽어 기록 방식을 결정한다.

- 기본 `HttpError`와 미처리 예외는 `SYSTEM_FAILURE_OBSERVATION`을 사용해 기존처럼 `exception.recorded`, `ERROR`, stacktrace, span status `ERROR`로 남는다.
- `SeatAlreadyReservedError`는 `DOMAIN_REJECTION_OBSERVATION`을 사용해 `domain.rejection.recorded`, `INFO`, stacktrace 없는 structured log, span event로 남는다.
- 좌석 중복 예약의 public API 응답은 기존과 같이 HTTP `409`와 `error.code="reservation.conflict"`를 유지한다.
- DB unique constraint fallback도 같은 `SeatAlreadyReservedError`로 변환해 동시성 충돌이 시스템 실패처럼 기록되지 않게 했다.
- 검증은 `packages/observability/tests`와 `services/reservation-service/tests/test_reservation_api.py`를 함께 실행해 통과했다.

남은 후속은 별도 범위다.

- synthetic run 실패는 runner의 `synthetic_run_failed`와 별도 metric/log로 추적한다.
- domain rejection metric은 유지되어 좌석 경쟁률과 fixture 소진 신호를 분석할 수 있다.
- Grafana/Loki 대시보드의 domain rejection/service error 분리는 GitOps 대시보드 작업에서 확인한다.
