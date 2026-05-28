# 02. 서비스 아키텍처

## 서비스 구성

최종 구현은 service HTML의 구성을 기준으로 한다. infra-gitops 문서에는 `user-service`, `performance-service`, `venue-service`, `booking-service`, `seat-service`처럼 더 세분화된 구성이 있지만, 1차 구현에서는 발표 집중도와 구현 속도를 고려해 다음처럼 묶는다.

| 서비스 | 책임 | 저장소 | 주요 API |
| --- | --- | --- | --- |
| `auth-service` | 로그인, JWT 발급, role claim | PostgreSQL | `POST /auth/login`, `POST /auth/refresh` |
| `concert-service` | 공연, 공연장, 회차, 좌석 배치 조회 | PostgreSQL | `GET /concerts`, `GET /concerts/{id}`, `GET /concerts/{id}/performances`, `GET /performances/{id}/seats` |
| `reservation-service` | 좌석 lock, 예약 생성, 예약 조회/취소, 만료 처리 | PostgreSQL, Redis 후보 | `POST /reservations`, `GET /reservations/{id}`, `GET /reservations/me`, `POST /reservations/{id}/cancel`, `POST /reservations/{id}/expire` |
| `payment-service` | 결제 mock, 승인/실패/지연 시뮬레이션, 결제 이벤트 발행 | PostgreSQL | `POST /payments`, `GET /payments/{id}` |
| `ticket-service` | 티켓 발행, QR/PDF 생성, S3 저장, 티켓 조회 | PostgreSQL, S3 | `POST /tickets/issue`, `GET /tickets/{id}`, `GET /tickets/me` |
| `notification-service` | 예약/결제/티켓 이벤트 기반 알림 저장과 발송 mock | MongoDB | `GET /notifications`, `GET /notifications/{id}` |
| `dashboard` | 사용자 예매 화면과 운영 데모 화면 | 정적 asset | 정적 HTML/JS |

## 핵심 예매 흐름

```text
1. Login
   -> auth-service가 JWT 발급

2. Concert
   -> concert-service가 공연, 회차, 좌석 상태 조회

3. Reserve
   -> reservation-service가 좌석 lock과 예약 생성

4. Payment
   -> payment-service가 결제 mock 승인/실패/지연 처리

5. Kafka
   -> payment-approved 또는 payment-failed 이벤트 발행

6. Ticket
   -> ticket-service가 결제 승인 이벤트를 받아 티켓 발행, QR/PDF 생성, S3 저장

7. Notify
   -> notification-service가 예약/결제/티켓 이벤트를 받아 알림 저장
```

예약 API는 좌석 선점과 예약 생성까지만 동기 처리한다. 결제 이후 티켓 발행과 알림 저장은 Kafka 이벤트로 분리한다.

### 서비스 간 의존 관계

사용자 요청 경로의 동기 REST 호출과 Kafka 이벤트 기반 후속 처리를 예매 순서대로 나눈다.

```mermaid
sequenceDiagram
    participant Dashboard as dashboard
    participant Auth as auth-service
    participant Concert as concert-service
    participant Reservation as reservation-service
    participant Payment as payment-service
    participant Kafka as Kafka topics
    participant Ticket as ticket-service
    participant Notification as notification-service
    participant S3 as S3

    Dashboard->>Auth: login / refresh
    Auth-->>Dashboard: JWT
    Dashboard->>Concert: concert / performance / seat query
    Concert-->>Dashboard: concert and seat state
    Dashboard->>Reservation: reserve seat
    Reservation-->>Kafka: reservation-created
    Reservation-->>Dashboard: reservation id
    Dashboard->>Payment: pay reservation
    Payment-->>Kafka: payment-approved or payment-failed
    Kafka-->>Ticket: payment-approved
    Ticket->>S3: store QR/PDF
    Ticket-->>Kafka: ticket-issued
    Kafka-->>Reservation: payment-failed
    Kafka-->>Notification: reservation / payment / ticket events
```

## API 초안

OpenAPI 작성 규약과 서비스별 분리 구조는 아직 확정 전이다. 팀 논의를 위해 [OpenAPI 규약 샘플](./02-service-architecture/openapi/README.md)에 공통 규약, 공통 컴포넌트, `reservation-service` 예시를 둔다.

### auth-service

| Method | Path | 목적 |
| --- | --- | --- |
| `POST` | `/auth/login` | 사용자 로그인과 access token 발급 |
| `POST` | `/auth/refresh` | refresh token 기반 access token 재발급 |

### concert-service

| Method | Path | 목적 |
| --- | --- | --- |
| `GET` | `/concerts` | 공연 목록 조회 |
| `GET` | `/concerts/{id}` | 공연 상세 조회 |
| `GET` | `/concerts/{id}/performances` | 공연별 회차 목록 조회 |
| `GET` | `/performances/{id}/seats` | 회차별 좌석 상태 조회 |

### reservation-service

| Method | Path | 목적 |
| --- | --- | --- |
| `POST` | `/reservations` | 좌석 lock과 예약 생성 |
| `GET` | `/reservations/{id}` | 예약 상태 조회 |
| `GET` | `/reservations/me` | 내 예약 목록 조회 |
| `POST` | `/reservations/{id}/cancel` | 예약 취소와 좌석 해제 |
| `POST` | `/reservations/{id}/expire` | 예약 만료 처리와 좌석 해제 |

### payment-service

| Method | Path | 목적 |
| --- | --- | --- |
| `POST` | `/payments` | 결제 mock 승인/실패/지연 처리 |
| `GET` | `/payments/{paymentId}` | 결제 상태 조회 |

### ticket-service

| Method | Path | 목적 |
| --- | --- | --- |
| `POST` | `/tickets/issue` | 내부 또는 이벤트 기반 티켓 발행 |
| `GET` | `/tickets/{ticketId}` | 티켓 상세 조회 |
| `GET` | `/tickets/me` | 내 티켓 목록 조회 |

## Kafka 이벤트 계약

모든 이벤트는 `eventId`, `eventType`, `occurredAt`, `producer`, `correlationId`, `payload`를 가진다.

| Topic | Producer | Consumer | 목적 |
| --- | --- | --- | --- |
| `reservation-created` | `reservation-service` | `notification-service`, analytics 후보 | 예약 생성 알림과 운영 통계 |
| `reservation-expired` | `reservation-service` | `notification-service` | 결제 제한 시간 만료 알림 |
| `payment-approved` | `payment-service` | `ticket-service`, `notification-service` | 티켓 발행 트리거 |
| `payment-failed` | `payment-service` | `reservation-service`, `notification-service` | 예약 실패 처리와 결제 실패 알림 |
| `ticket-issued` | `ticket-service` | `notification-service` | 티켓 발행 완료 알림 |

Consumer는 `eventId` 기반 idempotency를 갖는다. `notification-service`는 `processed_events`에 처리 완료 이벤트를 기록한다.

## 데이터 모델 초안

| 서비스 | 테이블/컬렉션 | 핵심 필드 |
| --- | --- | --- |
| `concert-service` | `concerts`, `venues`, `seats`, `showtimes` | `concertId`, `venueId`, `seatId`, `section`, `row`, `number`, `showtimeId` |
| `reservation-service` | `reservations`, `seat_locks` | `reservationId`, `userId`, `concertId`, `showtimeId`, `seatId`, `status`, `expiresAt` |
| `payment-service` | `payments` | `paymentId`, `reservationId`, `amount`, `status`, `approvedAt` |
| `ticket-service` | `tickets` | `ticketId`, `reservationId`, `seatId`, `s3Key`, `qrCode`, `status` |
| `notification-service` | `notifications`, `processed_events` | `notificationId`, `userId`, `type`, `message`, `eventId`, `createdAt` |

## 좌석 중복 방지 전략

1차 구현은 DB transaction과 unique constraint를 기본으로 한다.

- `reservation-service`만 좌석 점유 상태를 변경한다.
- `seat_locks` 또는 `reservations`에 `concert_id + showtime_id + seat_id` 기준 active unique constraint를 둔다.
- 동일 좌석 동시 요청 중 하나만 성공하고 나머지는 `409 Conflict`를 반환한다.
- 결제 제한 시간이 지나면 예약을 `expired`로 전환하고 좌석을 다시 열 수 있다.
- 중복 요청 방지를 위해 `Idempotency-Key` 또는 `user_id + concert_id + showtime_id + seat_id` 정책을 검토한다.

심화 후보는 Redis distributed lock, 예약 만료 scheduler, Kafka compacted topic 기반 좌석 상태 projection이다.

## 서비스 구현 원칙

- 서비스 간 즉시 조회는 REST로 처리하고, 후속 처리는 Kafka event로 분리한다.
- 결제 승인 이후 티켓 발행과 알림 저장은 API 응답 경로에서 분리한다.
- 결제 지연/실패가 예약 상태를 모호하게 만들지 않도록 `pending`, `failed`, `paid` 상태를 명확히 둔다.
- 티켓 QR/PDF artifact는 pod local에 저장하지 않고 S3에 저장하며 DB에는 key만 남긴다.
- 모든 요청과 이벤트에는 `correlationId`를 포함한다.
