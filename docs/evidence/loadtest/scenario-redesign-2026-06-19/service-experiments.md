# Service Experiments

## 원칙

개별 서비스 실험은 모든 서비스를 같은 깊이로 테스트하지 않는다. 전체 E2E 실험에서 병목 후보로 드러난 서비스, 또는 이미 병목 근거가 있는 서비스만 우선순위에 올린다.

개별 서비스의 기본 테스트 세트는 다음과 같다.

| 테스트 | 목적 | HPA |
| --- | --- | --- |
| smoke | API 계약, secret, dataset, runner 경로 확인 | ON/OFF 무관 |
| baseline | 현재 조건에서 정상 latency, RPS, error rate 측정 | 가능하면 replica 고정 |
| stress | 한계 처리량과 병목 후보 탐색 | ON 또는 고정 replica 중 실험 목적에 맞춰 선택 |
| spike | 기본 제외 | 전체 E2E에서 수행 |

## 서비스별 우선순위

| 우선순위 | 서비스 | 이유 | 현재 시나리오 |
| ---: | --- | --- | --- |
| 1 | auth-service | 과거 예매 여정에서 `/auth/login` 병목과 readiness 흔들림이 확인됨 | `auth-login-load-test` |
| 1 | reservation-service | 예매 생성 write path의 핵심 병목 후보 | `reservation-create-load-test` |
| 2 | ticket-service | 티켓 조회와 발급 후 확인 경로가 전체 여정에 포함됨 | `ticket-service-read-load-test` |
| 2 | concert-service | 공연/회차/좌석 조회가 예매 전 단계에 포함됨 | 전용 시나리오 필요 시 추가 |
| 3 | payment-service | 결제 승인 경로는 전체 E2E에서 먼저 관측 | 전용 시나리오 필요 시 추가 |
| 3 | notification-service | 핵심 성공 경로보다 비동기 후속 처리 성격이 강함 | Kafka lag 중심으로 관측 |

## 서비스별 측정값

서비스별 실험은 다음 값을 최소 단위로 남긴다.

| 영역 | 지표 |
| --- | --- |
| k6 | step별 p50/p95/p99, RPS, error rate, status code |
| Kubernetes | CPU, memory, pod count, restart, readiness event |
| HPA | desired replica, current replica, CPU target 도달 여부 |
| DB | connection 수, query latency, pool exhaustion, lock wait |
| Kafka | topic lag, produce/consume error, 처리 지연 |
| Gateway | upstream별 request count, 5xx, timeout |

## Auth Service

목적은 `/auth/login` 단독 병목을 전체 예매 여정과 분리해서 보는 것이다.

| 테스트 | 설계 |
| --- | --- |
| smoke | 소수 계정으로 login 성공, report 생성, threshold wiring 확인 |
| baseline | 예상 로그인 유입량에서 p95/p99와 error rate 측정 |
| stress | error rate 1% 또는 p99 SLA 초과 직전의 login 처리량 탐색 |

주의할 점:

- signup/setup 비용은 측정 구간에서 제외한다.
- password verify, DB connection, token 발급, audit insert를 별도 span/profile로 볼 수 있어야 한다.
- 동적 user id, token, email은 metric label에 넣지 않는다.

## Reservation Service

목적은 예매 생성 write path의 기준 처리량과 실패 양상을 확인하는 것이다.

| 테스트 | 설계 |
| --- | --- |
| smoke | dataset, customer token, 좌석 후보, `POST /reservations` 경로 확인 |
| baseline | 한계보다 낮고 반복 가능한 arrival rate로 p95/p99/error rate 측정 |
| stress | stage별로 arrival rate를 올려 첫 한계 후보 확인 |

주의할 점:

- `409 reservation.conflict`는 전체 E2E에서는 자연스러운 경합일 수 있지만, reservation-create 기준선에서는 좌석 분산 부족 신호로 분리한다.
- HPA가 반응하지 않으면 먼저 CPU가 70%에 도달했는지 확인한다.
- DB pool exhaustion, lock wait, slow query가 있으면 서비스 latency와 함께 기록한다.

## Ticket Service

목적은 티켓 조회 경로가 데이터 증가에 따라 느려지는지 확인하는 것이다.

| 테스트 | 설계 |
| --- | --- |
| smoke | `/tickets/me` 또는 현재 조회 경로가 정상 응답하는지 확인 |
| baseline | 고객별 티켓 수가 통제된 상태에서 latency 기준선 측정 |
| stress | 고객별 티켓 수와 요청량을 올려 pagination 또는 query 병목 확인 |

주의할 점:

- 같은 고객에게 티켓이 계속 쌓이면 조회 latency가 run마다 달라질 수 있다.
- dataset revision과 customer pool revision을 리포트에 남긴다.

## 전용 시나리오 추가 조건

새 서비스 전용 시나리오는 다음 조건 중 하나를 만족할 때 추가한다.

- 전체 E2E에서 특정 서비스 p99 또는 error rate가 먼저 흔들린다.
- Gateway upstream 또는 service metric에서 특정 서비스 5xx/timeout이 반복된다.
- DB query latency, Kafka lag, external call latency가 특정 서비스에 집중된다.
- 튜닝 전후 비교를 위해 해당 서비스만 고립해 재현해야 한다.

