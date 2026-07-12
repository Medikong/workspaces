# API 통합테스트 벤치마크 데이터 기준치

작성일: 2026-06-20

## 종합 보고서

- [Half-year early-growth API 기준 성능 종합 보고서](../../service-baseline-summary.md)

## 목적

서비스별 API 통합테스트 벤치마크를 smoke가 아니라 실제 운영 초기 데이터 규모에 가깝게 실행하기 위한 기준치를 정의한다.

이 기준은 동시 접속 부하를 만드는 모델이 아니다. DB에 데이터가 충분히 누적된 상태에서 API 1회 처리 비용이 어떻게 변하는지 보기 위한 seed 모델이다.

## 기준 모델

`half-year early-growth`를 기준 프리셋으로 둔다.

- 서비스 기간: 180일
- 가입 사용자: 100,000명
- 기간 내 활성 사용자: 40,000명
- 하루 평균 신규 공연: 1.5개
- 공연당 평균 회차: 3회
- 회차당 평균 좌석: 700석
- 평균 좌석 판매율: 30%
- 예약 홀드 이탈률: 35%
- 결제 실패율: 8%
- 알림 활성 보존기간: 90일

## 산식

```text
공연 수 = 서비스 기간 일수 * 하루 평균 신규 공연 수
회차 수 = 공연 수 * 공연당 평균 회차 수
좌석 공급량 = 회차 수 * 회차당 평균 좌석 수
판매 티켓 수 = 좌석 공급량 * 평균 좌석 판매율

전체 예약 이력 = 판매 티켓 수 / (1 - 예약 홀드 이탈률)
예약 홀드 이탈 = 전체 예약 이력 - 판매 티켓 수

전체 결제 이력 = 결제 승인 수 / (1 - 결제 실패율)
결제 실패 = 전체 결제 이력 - 결제 승인 수

반년 전체 알림 = 예약 생성 + 예약 만료/취소 + 결제 성공 + 결제 실패 + 티켓 발급
활성 알림 = 반년 전체 알림 * 알림 보존기간 / 서비스 기간
```

## 역산 결과

1,000 이상 수량은 seed 기준으로 쓰기 쉽게 1,000 단위 미만을 버린다. 1,000 미만인 공연/회차 같은 구성 기준은 0이 되지 않도록 원 계산값을 유지한다.

| 항목 | 산식 | 기준 수량 |
| --- | --- | ---: |
| 공연 | `180 * 1.5` | 270개 |
| 회차 | `270 * 3` | 810개 |
| 좌석 공급량 | `810 * 700` | 567,000석 |
| 판매 티켓 | `567,000 * 30%` | 170,000건 |
| 예약 홀드 이탈 | `170,000 * 35 / 65` | 91,000건 |
| 전체 예약 이력 | `170,000 + 91,000` | 261,000건 |
| 결제 실패 | `170,000 * 8 / 92` | 14,000건 |
| 전체 결제 이력 | `170,000 + 14,000` | 184,000건 |
| 티켓 발급 | 결제 승인 기준 | 170,000건 |
| 반년 전체 알림 | 예약/결제/티켓 이벤트 합산 | 708,000건 |
| 활성 알림 | `708,000 * 90 / 180` | 354,000건 |

## 서비스별 seed 목표

| 서비스 | 기준 데이터 | 목표 수량 |
| --- | --- | ---: |
| auth-service | 가입 사용자 | 100,000건 |
| concert-service | 공연/회차/좌석 카탈로그 | 공연 270건, 회차 810건, 좌석 567,000건 |
| reservation-service | 예약 이력 | 261,000건 |
| payment-service | 결제 이력 | 184,000건 |
| ticket-service | 티켓 이력 | 170,000건 |
| notification-service | 활성 알림 | 354,000건 |

## 현재 코드베이스 기준 테이블별 seed 목표

아래 표는 현재 각 서비스 모델에 실제로 존재하는 테이블과 컬렉션 기준이다. 외부 서비스 소유 데이터는 해당 서비스 DB에 실테이블로 만들지 않고 참조 ID 문자열로만 분포를 맞춘다.

### auth-service

| 테이블 | 모델 | 목표 수량 | 용도 |
| --- | --- | ---: | --- |
| `users` | `User` | 100,000건 | 로그인/내 정보/토큰 발급 API의 사용자 기준 데이터 |
| `audit_logs` | `AuditLog` | 200,000건 | 관리자 감사 로그 조회와 인증 이벤트 누적 상태 |
| `refresh_tokens` | `RefreshToken` | 20,000건 | refresh token 교체 API의 활성 토큰 데이터 |
| `revoked_tokens` | `RevokedToken` | 0건 | benchmark 시작 전에는 폐기 토큰을 누적하지 않는다 |

인증 API는 비밀번호와 토큰을 측정 프로세스 안에서만 사용하고 artifact에는 남기지 않는다. `POST /auth/signup`은 신규 사용자 생성 비용, `POST /auth/login`은 대량 사용자 테이블에서의 조회와 password verify 비용, `GET /auth/me`와 `GET /auth/audit-logs`는 토큰 검증 후 DB 조회/감사 로그 기록 비용을 본다.

### concert-service

| 테이블 | 모델 | 목표 수량 | 용도 |
| --- | --- | ---: | --- |
| `venues` | `Venue` | 270건 | 공연장 기준 데이터 |
| `concerts` | `Concert` | 270건 | 추천/상세/월간 캘린더 API의 주 데이터 |
| `showtimes` | `Showtime` | 810건 | 날짜별 회차와 공연별 performance 조회 기준 데이터 |
| `seats` | `Seat` | 567,000건 | 좌석도와 bookable 판정 기준 데이터 |
| `seat_grades` | `SeatGrade` | 3,240건 | 좌석도 section/가격 데이터 |

concert-service는 기존 public API benchmark에서 확인한 공개 조회 API를 공통 YAML preset과 Taskfile/report 구조로 옮긴다. 좌석 데이터는 API 호출로 만들지 않고 bulk insert로 준비한다.

### reservation-service

| 테이블 | 모델 | 목표 수량 | 용도 |
| --- | --- | ---: | --- |
| `reservations` | `Reservation` | 261,000건 | 예약 생성/목록/상세/취소/만료 API의 주 데이터 |
| `sales_states` | `SalesState` | 270건 | 공연별 판매 상태 조회/변경 API |
| `queue_policies` | `QueuePolicy` | 270건 | 공연별 대기열 정책 조회/갱신 기준 |
| `traffic_policies` | `TrafficPolicy` | 270건 | 공연별 트래픽 정책 조회/갱신 기준 |

예약 상태 분포는 결제 승인으로 이어진 예약 `170,000건`, 만료/취소/이탈 예약 `91,000건`을 기준으로 둔다. 목록 API 비용을 보기 위해 `user_id`, `concert_id`, `showtime_id`, `performance_id`는 일반/반복/헤비 사용자 분포에 맞춰 퍼뜨린다.

### payment-service

| 테이블 | 모델 | 목표 수량 | 용도 |
| --- | --- | ---: | --- |
| `payments` | `Payment` | 184,000건 | 결제 생성/상세/정산 조회 API의 주 데이터 |
| `payment_events` | `PaymentEvent` | 184,000건 | 결제 승인/실패 outbox 이벤트 데이터 |

결제 상태 분포는 승인 `170,000건`, 실패 `14,000건`을 기준으로 둔다. 정산 조회가 의미 있게 동작하도록 `concert_id`는 270개 공연에 분산한다.

### ticket-service

| 테이블 | 모델 | 목표 수량 | 용도 |
| --- | --- | ---: | --- |
| `tickets` | `Ticket` | 170,000건 | 티켓 발급/목록/상세 API의 주 데이터 |
| `processed_events` | `ProcessedEvent` | 170,000건 | 결제 승인 이벤트 기반 발급의 idempotency 데이터 |

`POST /tickets/issue` API 자체는 `processed_events`를 만들지 않지만, 현재 서비스에는 결제 승인 이벤트 소비 경로가 있으므로 운영 누적 상태를 재현할 때는 티켓 수와 같은 규모로 둔다.

### notification-service

| 컬렉션 | 생성 함수 | 목표 수량 | 용도 |
| --- | --- | ---: | --- |
| `notifications` | `notification_to_doc` | 354,000건 | 알림 목록/상세 조회 API의 주 데이터 |
| `processed_events` | `processed_event_to_doc` | 354,000건 | 알림 생성 이벤트 idempotency 데이터 |

알림은 90일 활성 보존 기준이므로 반년 전체 알림 `708,000건`이 아니라 조회 대상 컬렉션에는 `354,000건`만 둔다. 오래된 알림과 그 처리 이벤트는 삭제 또는 아카이브된 것으로 본다.

## 분포 기준

단순 균등 분포만 쓰면 목록 API 비용이 실제보다 작게 보일 수 있다. 대량 seed는 사용자군을 나눠 생성한다.

| 사용자군 | 비율 | 의도 |
| --- | ---: | --- |
| 일반 사용자 | 80% | 1~2회 구매 또는 조회 중심 |
| 반복 구매 사용자 | 15% | 여러 공연을 구매한 일반적 재방문 사용자 |
| 헤비 사용자 | 5% | 티켓/알림 목록이 길어지는 사용자 |

목록 API는 최소 세 가지 케이스를 분리해 측정한다.

- 일반 사용자 첫 페이지
- 헤비 사용자 첫 페이지
- cursor 기반 다음 페이지

## 서비스별 측정 관점

### reservation-service

- 생성, 목록, 상세, 취소, 만료 API를 측정한다.
- 판매/정책 API는 공연 수 기준으로 seed한다.
- 예약 생성 데이터는 API 호출로 만들지 않고 bulk insert로 준비한다.
- 중복 좌석 충돌은 별도 테스트 대상이며, 대량 데이터 baseline 측정에는 섞지 않는다.

### payment-service

- 결제 생성, 결제 상세 조회, 공급자/관리자 정산 조회를 측정한다.
- 결제 생성은 Payment와 PaymentEvent outbox insert 비용을 포함한다.
- 결제 승인/실패 비율은 기준 모델의 92:8에 맞춘다.
- Kafka dispatch loop는 API 처리 비용이 아니므로 제외한다.

### ticket-service

- 티켓 발급, 내 티켓 목록, 티켓 상세 조회를 측정한다.
- 티켓 발급은 DB insert와 로컬 artifact 생성 경로를 포함하되, 외부 S3/Kafka 연결 비용은 제외한다.
- 목록 조회는 일반 사용자와 헤비 사용자 케이스를 분리한다.

### notification-service

- 알림 목록, 알림 상세 조회를 측정한다.
- 알림은 사용자 알림함 데이터이므로 반년 전체 누적이 아니라 90일 활성 보존분만 기준으로 둔다.
- 오래된 알림은 삭제 또는 아카이브된 것으로 보고 API 조회 대상 seed에서 제외한다.

### auth-service

- 로그인, 회원가입, 내 정보 조회, refresh token 교체, 관리자 감사 로그 조회를 측정한다.
- 사용자/감사 로그/refresh token 누적 규모는 YAML preset의 table 목표를 따른다.
- 비밀번호와 access/refresh token 값은 artifact와 보고서에 남기지 않는다.

### concert-service

- 추천 공연 목록, 공연 상세, 월간 캘린더, 날짜별 회차, 좌석도 API를 측정한다.
- 기존 public API benchmark와 같은 공개 조회 경로를 사용하되 seed 규모는 YAML preset에서 결정한다.
- 공연/회차/좌석/좌석등급 데이터는 PostgreSQL bulk insert로 준비한다.

## 실행 방향

- smoke benchmark 결과와 대량 데이터 benchmark 결과를 보고서에서 분리한다.
- 대량 seed는 API 순차 호출이 아니라 bulk insert로 만든다.
- testcontainers 컨테이너와 데이터는 테스트 종료 후 자동 정리되어야 한다.
- large benchmark 기본값은 endpoint별 `samples=100`, `warmup=2`로 둔다.
- 현재 percentile 계산은 `ceil(n * percentile / 100) - 1` 방식이라 `samples=10`에서는 p95/p99가 사실상 max와 같아질 수 있다.
- `samples=100`으로 올리면 p95는 95번째 값, p99는 99번째 값으로 max와 분리되어 단일 outlier 과대표현을 줄일 수 있다.
- 결과 보고서는 서비스별 문서에 가정, seed 규모, 실행 명령, artifact 위치, p50/p95/p99, query shape, plan summary, index decision, 데이터 분포 기반 병목 해석을 남긴다.

## 현재 기준의 한계

- 실제 트래픽 부하, 동시성, connection pool 포화, Kafka 지연은 이 기준의 목적이 아니다.
- 공연 카테고리별 흥행 편차, 좌석 등급별 가격 차이, 환불/부분 취소는 아직 반영하지 않는다.
- 운영 데이터가 생기면 이 기준은 실제 로그와 DB 통계를 기반으로 다시 보정해야 한다.
