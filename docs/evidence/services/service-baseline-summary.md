# Half-year early-growth API 기준 성능 종합 보고서

작성일: 2026-06-22  
담당: 최범휘  
상태: 완료

목표: 기준 성능 baseline을 측정하고 P99, P95, P50 응답시간, 환산 처리량, 에러율을 한 보고서에서 확인한다.

## Executive Summary

- **서비스별 기준 성능 baseline 측정은 완료됐다.** `half-year-early-growth` preset으로 6개 서비스, 36개 endpoint를 측정했고, 모든 endpoint가 기대 status로 완료되어 보고서 기준 에러율은 0%다.
- **가장 느린 단일 API는 auth-service 로그인이다.** `login-customer`가 p99 102.895ms로 전체 endpoint 중 가장 높고, password verify 비용이 DB 조회보다 큰 축으로 해석된다.
- **데이터 규모 영향이 가장 선명한 조회 path는 concert-service 좌석도다.** `seat-map`은 567,000석 seed에서 p95 39.745ms, p99 57.766ms로 concert-service의 기준 처리량을 결정한다.
- **notification-service는 cursor pagination 적용 후 가장 여유가 크다.** active notification 354,000건 기준에서도 목록 첫 페이지 p95는 2.941ms, p99는 6.177ms다.

## 기준과 해석 방식

이 보고서는 동시접속 부하테스트 결과가 아니라, 대량 데이터가 누적된 DB에서 API 1회 처리 비용을 측정한 API 통합 벤치마크 결과를 종합한다. seed/setup 시간은 endpoint 측정값에 포함하지 않고, 각 endpoint는 `samples=100`, `warmup=2` 기준으로 해석한다.

처리량은 실제 HPA/Ingress/DB pool을 포함한 시스템 한계가 아니다. 여기서는 endpoint latency를 기준으로 단일 실행 단위에서 환산한 값만 쓴다.

```text
p95 환산 처리량 = 1000 / 서비스 내 최대 p95Ms
p99 환산 처리량 = 1000 / 서비스 내 최대 p99Ms
```

에러율은 원본 artifact의 endpoint별 측정이 모두 기대 status로 완료된 것을 기준으로 `0%`로 둔다. 부하 상황의 timeout, connection pool 포화, Kafka 지연, 네트워크 지연은 이 보고서의 측정 범위가 아니다.

## 서비스별 기준 성능

| 서비스 | 측정 API 수 | 최대 p50 | 최대 p95 | 최대 p99 | p95 환산 처리량 | p99 환산 처리량 | 에러율 |
| --- | ---: | --- | --- | --- | ---: | ---: | ---: |
| auth-service | 5 | `signup-customer` 57.030ms | `signup-customer` 68.408ms | `login-customer` 102.895ms | 14.6 req/s | 9.7 req/s | 0% |
| concert-service | 5 | `seat-map` 13.924ms | `seat-map` 39.745ms | `seat-map` 57.766ms | 25.2 req/s | 17.3 req/s | 0% |
| reservation-service | 14 | `provider-concert-sales` 7.784ms | `provider-concert-sales` 15.573ms | `provider-concert-sales` 18.744ms | 64.2 req/s | 53.4 req/s | 0% |
| payment-service | 4 | `admin-settlement-basis` 11.055ms | `admin-settlement-basis` 15.140ms | `admin-settlement-basis` 19.153ms | 66.1 req/s | 52.2 req/s | 0% |
| ticket-service | 5 | `issue-ticket` 8.165ms | `issue-ticket` 15.358ms | `list-my-tickets-normal-first-page` 23.285ms | 65.1 req/s | 42.9 req/s | 0% |
| notification-service | 3 | `list-notifications-normal-first-page` 1.831ms | `list-notifications-normal-first-page` 2.941ms | `list-notifications-normal-first-page` 6.177ms | 340.0 req/s | 161.9 req/s | 0% |

**기준선으로 보면 auth-service와 concert-service가 먼저 용량 계획에 영향을 준다.** auth-service는 password hash 검증이 붙는 로그인/가입 path가 50ms 이상에서 시작하고, concert-service는 좌석도 응답이 p95/p99 tail을 만든다. reservation/payment/ticket은 현재 seed 규모에서는 대부분 20ms 안팎 p99에 머물러 단건 API 비용 기준으로는 상대적으로 안정적이다.

## 전체 병목 후보

| 순위 | 서비스 | endpoint | method | p50 | p95 | p99 | max | p99/p50 |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | auth-service | `login-customer` | POST | 55.916ms | 65.077ms | 102.895ms | 264.484ms | 1.84x |
| 2 | auth-service | `signup-customer` | POST | 57.030ms | 68.408ms | 71.613ms | 107.342ms | 1.26x |
| 3 | concert-service | `seat-map` | GET | 13.924ms | 39.745ms | 57.766ms | 117.078ms | 4.15x |
| 4 | auth-service | `me-customer` | GET | 6.637ms | 13.622ms | 30.404ms | 114.305ms | 4.58x |
| 5 | ticket-service | `list-my-tickets-normal-first-page` | GET | 4.942ms | 11.140ms | 23.285ms | 35.547ms | 4.71x |
| 6 | ticket-service | `issue-ticket` | POST | 8.165ms | 15.358ms | 21.283ms | 23.371ms | 2.61x |
| 7 | payment-service | `admin-settlement-basis` | GET | 11.055ms | 15.140ms | 19.153ms | 20.938ms | 1.73x |
| 8 | reservation-service | `provider-concert-sales` | GET | 7.784ms | 15.573ms | 18.744ms | 20.596ms | 2.41x |
| 9 | reservation-service | `admin-get-sales` | GET | 7.669ms | 12.181ms | 15.905ms | 16.462ms | 2.07x |
| 10 | payment-service | `create-payment` | POST | 5.726ms | 10.238ms | 15.533ms | 24.011ms | 2.71x |

**우선순위는 auth 로그인/가입, concert 좌석도, ticket 목록 tail 순서다.** auth는 DB index보다 password verify가 핵심 비용이고, concert `seat-map`은 좌석 데이터 규모와 응답 구성 비용을 함께 본다. ticket 목록은 현재 p99가 튀는 endpoint가 있어 cursor/index 후보를 계속 관찰할 가치가 있다.

## 서비스별 해석

### auth-service

- seed: users 100,000건, audit_logs 200,000건, refresh_tokens 20,000건
- 기준 API: 로그인, 회원가입, 내 정보 조회, refresh token 교체, 관리자 감사 로그 조회
- 결론: `login-customer` p99가 102.895ms로 전체 최고치다. query plan은 email unique index를 타므로, 기준 성능 병목은 DB scan보다 password hash 검증과 테스트 실행 환경의 tail latency 쪽으로 본다.

### concert-service

- seed: concerts 270건, showtimes 810건, seats 567,000건, seat_grades 3,240건
- 기준 API: 추천 공연, 공연 상세, 월간 캘린더, 날짜별 회차, 좌석도
- 결론: `seat-map` p95 39.745ms, p99 57.766ms가 concert-service 기준치를 결정한다. 공개 조회 API 중 좌석도만 데이터 규모가 직접적으로 커지므로, capacity baseline에서 read path SLO를 잡을 때 별도 기준으로 두는 것이 맞다.

### reservation-service

- seed: reservations 261,000건, sales_states 270건, queue_policies 270건, traffic_policies 270건
- 기준 API: 예약 생성/목록/상세/취소/만료, 판매 상태, 대기열/트래픽 정책
- 결론: `provider-concert-sales` p99 18.744ms가 가장 높다. 집계 path는 현재 index를 사용하지만, 판매 집계 호출량이 늘면 `(concert_id, status)` 계열 복합 index를 계속 관찰한다.

### payment-service

- seed: payments 184,000건, payment_events 184,000건
- 기준 API: 결제 생성, 결제 상세, provider/admin 정산 기준 조회
- 결론: `admin-settlement-basis` p99 19.153ms, `provider-settlement-basis` p99 15.280ms다. 정산 집계는 `(concert_id, status)` 복합 index와 단일 aggregate query로 현재 기준에서는 안정권이다.

### ticket-service

- seed: tickets 170,000건, processed_events 170,000건
- 기준 API: 티켓 발급, 내 티켓 목록 일반/헤비/커서, 티켓 상세
- 결론: `list-my-tickets-normal-first-page` p99 23.285ms가 가장 높고 p99/p50도 4.71배다. 현재 수치는 낮지만, 사용자별 목록 tail이 커지면 `(user_id, id)` 복합 index와 projection 축소를 검토할 후보로 남긴다.

### notification-service

- seed: notifications 354,000건, processed_events 354,000건
- 기준 API: 알림 목록 일반/헤비 첫 페이지, 알림 상세
- 결론: cursor pagination 적용 후 목록 첫 페이지가 p95 2.941ms, p99 6.177ms에 머문다. heavy 사용자의 전체 보유 알림 수가 곧바로 응답 크기로 이어지지 않는다는 점이 이번 baseline의 핵심 확인 결과다.

## 권장 후속 작업

1. auth-service는 password verify 비용을 별도 CPU baseline과 함께 관리한다. API 통합 벤치마크에서는 index 문제가 아니라 인증 연산 비용으로 분리해 추적한다.
2. concert-service `seat-map`은 capacity/loadtest SLO에서 단순 read API와 분리한다. 좌석 수와 응답 payload 크기가 같이 커지는 endpoint라 별도 p95/p99 gate가 필요하다.
3. ticket-service 목록 API는 운영 데이터가 생기면 사용자별 티켓 보유량 분포를 다시 보정한다. 현재 p99 tail은 낮은 절대값이지만 목록 계열에서 가장 먼저 튈 수 있다.
4. reservation/payment 집계 API는 현재 index decision을 유지한다. 집계 대상 row 수가 늘어나는 다음 preset에서 p95가 다시 상승하면 복합 index와 materialized summary 후보를 비교한다.
5. notification-service는 cursor pagination을 기준 설계로 유지한다. page size, 읽음/보관 정책, projection 축소는 운영 사용 패턴이 생긴 뒤 조정한다.

## 원본 Evidence

| 서비스 | 원본 보고서 | artifact |
| --- | --- | --- |
| auth-service | [auth-service.md](api-integration-test-benchmark/half-year-early-growth/auth-service.md) | `service/tests/tmp/reports/api-integration/auth-service/half-year-early-growth/latest.json` |
| concert-service | [concert-service.md](api-integration-test-benchmark/half-year-early-growth/concert-service.md) | `service/tests/tmp/reports/api-integration/concert-service/half-year-early-growth/latest.json` |
| reservation-service | [reservation-service.md](api-integration-test-benchmark/half-year-early-growth/reservation-service.md) | `service/tests/tmp/reports/api-integration/reservation-service/half-year-early-growth/latest.json` |
| payment-service | [payment-service.md](api-integration-test-benchmark/half-year-early-growth/payment-service.md) | `service/tests/tmp/reports/api-integration/payment-service/half-year-early-growth/latest.json` |
| ticket-service | [ticket-service.md](api-integration-test-benchmark/half-year-early-growth/ticket-service.md) | `service/tests/tmp/reports/api-integration/ticket-service/half-year-early-growth/latest.json` |
| notification-service | [notification-service.md](api-integration-test-benchmark/half-year-early-growth/notification-service.md) | `service/tests/tmp/reports/api-integration/notification-service/half-year-early-growth/latest.json` |

## 한계와 가정

- 이 보고서는 API 1회 처리 비용을 보는 baseline이다. 실제 동시접속 처리량, HPA 반응, Ingress/LB latency, DB connection pool 포화는 별도 loadtest에서 확인해야 한다.
- `p95/p99 환산 처리량`은 latency 역수 기반의 비교 지표다. 실제 최대 RPS로 사용하려면 worker 수, connection pool, 네트워크, retry/error budget을 포함한 부하테스트가 필요하다.
- seed 분포는 `half-year-early-growth` synthetic model이다. 운영 데이터가 쌓이면 사용자군 비율, 공연 흥행 편차, 결제 실패율, 알림 보존 정책을 실제 로그/DB 통계 기준으로 보정해야 한다.
