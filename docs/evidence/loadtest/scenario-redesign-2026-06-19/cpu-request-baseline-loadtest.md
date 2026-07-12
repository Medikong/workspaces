# CPU Request Baseline Loadtest

## Purpose

이 문서는 고정 replica Pod에서 각 서비스의 주요 API를 계단식으로 부하 테스트해 CPU request 시작값을 찾기 위한 기준이다.

capacity baseline의 목적은 자동 확장이 아니라 단일 Pod 또는 고정 replica에서 SLO를 만족하는 최대 처리량과 CPU 사용량을 확인하는 것이다.

## Fixed Conditions

| 항목 | 고정값 |
| --- | --- |
| HPA | 끄거나 replica 고정 |
| replica | `1` |
| CPU limit | 제거하거나 충분히 높게 설정 |
| CPU throttling | 정책상 limit이 필요하면 0에 가깝게 유지 |
| 부하 방식 | target RPS를 계단식으로 증가 |
| 기록 기준 | SLO를 만족하는 최대 RPS 구간 |
| HPA target utilization | `70%` |

## Experiment Method

capacity baseline은 하나의 k6 시나리오 안에 6개 서비스 측정 구현을 모두 포함한다. 실행은 병렬이 아니라 순차로 진행하며, 한 시점에는 하나의 서비스만 측정한다.

| 원칙 | 방식 |
| --- | --- |
| 목표 | 각 서비스 주요 API의 최대 RPS 측정 |
| 시나리오 단위 | `capacity-baseline-load-test` 하나 |
| 실행 방식 | 6개 서비스 측정을 같은 run 안에서 순차 실행 |
| 측정 격리 | 한 단계에서는 하나의 서비스 API에만 계단식 부하를 준다 |
| 공통 준비 | bulk insert로 dataset을 측정 전에 준비한다 |
| 제외 | bulk insert와 사전 검증 작업은 최대 RPS 계산에 포함하지 않는다 |
| 종료 기준 | 임시 SL을 넘거나 error/throttling 신호가 반복되는 첫 구간 전까지를 유효 구간으로 본다 |

순차 실행 순서는 다음과 같이 고정한다.

| 순서 | 측정 서비스 | 목적 |
| ---: | --- | --- |
| 1 | auth-service | 로그인 처리량 기준 확인 |
| 2 | concert-service | 공연/회차/좌석 조회 처리량 기준 확인 |
| 3 | reservation-service | 예매 생성 처리량 기준 확인 |
| 4 | payment-service | 결제 승인 처리량 기준 확인 |
| 5 | ticket-service | 티켓 조회 처리량 기준 확인 |
| 6 | notification-service | 알림 조회 처리량 기준 확인 |

각 서비스 단계는 동일한 RPS 계단을 사용한다. 예를 들어 `10 -> 20 -> 40 -> 80 -> 160 RPS`처럼 올리고, 각 계단마다 p95, p99, error rate, CPU usage, CPU throttling을 기록한다. 최종 최대 RPS는 임시 SL을 만족한 마지막 계단이다.

## Temporary Service Level

아래 값은 아직 확정된 SLO가 아니라 CPU request 탐색을 시작하기 위한 임시 SL이다.

| 서비스 | 임시 p95 기준 |
| --- | ---: |
| auth-service | `< 100ms` |
| concert-service | `< 100ms` |
| reservation-service | `< 100ms` |
| payment-service | `< 100ms` |
| ticket-service | `< 100ms` |
| notification-service | `< 100ms` |

## Request Candidate Rule

| 항목 | 계산 |
| --- | --- |
| per-pod RPS | SLO를 만족하는 최대 target RPS |
| per-pod CPU usage | 해당 RPS 구간의 Pod CPU 사용량 |
| CPU request 후보 | `per-pod CPU usage at SLO / targetUtilization` |

예시:

| 항목 | 값 |
| --- | --- |
| 목표 | `p95 < 300ms`, `error rate < 1%` |
| 측정 | Pod 1개가 `80 RPS`에서 `p95 280ms`, `CPU 420m`, throttling 없음 |
| HPA target | `70%` |
| 초기 CPU request 후보 | `420m / 0.70 = 600m` |

## Result Fields

| 필드 | 의미 |
| --- | --- |
| service | 측정 대상 서비스 |
| api | 측정 API |
| target_rps | 계단식으로 올린 목표 RPS |
| per_pod_rps | replica 1개 기준 처리량 |
| p95_ms | p95 latency |
| p99_ms | p99 latency |
| error_rate | HTTP 실패율 |
| cpu_usage_m | Pod CPU 사용량 |
| cpu_throttling | CPU throttling 여부 |
| request_candidate_m | CPU request 후보 |

## Service Target APIs

| 서비스 | k6 step | Method | Path | 최대 RPS 계산 포함 |
| --- | --- | --- | --- | --- |
| auth-service | `capacity_baseline.auth.login` | POST | `/auth/login` | yes |
| concert-service | `capacity_baseline.concert.concerts` | GET | `/concerts` | yes |
| concert-service | `capacity_baseline.concert.performances` | GET | `/concerts/{concertId}/performances` | yes |
| concert-service | `capacity_baseline.concert.seats` | GET | `/performances/{performanceId}/seats` | yes |
| reservation-service | `capacity_baseline.reservation.create` | POST | `/reservations` | yes |
| payment-service | `capacity_baseline.payment.approve` | POST | `/payments` | yes |
| ticket-service | `capacity_baseline.ticket.list` | GET | `/tickets/me` | yes |
| notification-service | `capacity_baseline.notification.list` | GET | `/notifications` | yes |

concert-service는 예매 전 조회가 3개 API로 나뉘므로 같은 서비스 단계 안에서 함께 측정한다. 이때 최대 RPS는 concert-service 단계의 target RPS를 기준으로 기록하고, API별 p95/p99/error rate는 별도로 남긴다.

## Dashboard Logging

실험 결과는 기존 load 대시보드에서 같은 방식으로 조회할 수 있어야 한다. 로그 이벤트는 아래 두 개만 사용한다.

| 로그 | 포함 내용 |
| --- | --- |
| `loadtest_experiment_conditions` | run id, scenario, preset, dataset, replica, HPA off/fixed, target utilization |
| `loadtest_run_report` | 서비스/API/계단별 RPS, p95, p99, error rate, CPU usage, throttling, 최대 유효 RPS, CPU request 후보, 판단 결과 |

대시보드 조회 기준은 `loadtest_run_id` 하나를 실험 1회로 본다. 6개 서비스 단계는 같은 `loadtest_run_id` 안에서 `measured_service`와 `capacity_step` 필드로 구분한다.

## Pre-Test Data Preparation

사전 테스트 데이터는 `gitops/platform/loadtest`의 dataset setup Job에서 bulk insert로 준비한다. 이 작업은 측정 Job과 분리하며, 측정 대상 API의 latency, RPS, error rate 계산에 포함하지 않는다.

| 항목 | 기준 |
| --- | --- |
| dataset owner | `gitops/platform/loadtest` |
| execution unit | loadtest namespace의 dataset setup Job |
| seed method | deterministic bulk insert |
| dataset revision | `capacity-baseline-v1`처럼 명시적인 revision 사용 |
| ID 생성 | 서비스와 run에 관계없이 재현 가능한 deterministic ID 사용 |
| schema guard | insert 전 table, column, constraint, schema revision 확인 |
| failure policy | schema 또는 row count가 맞지 않으면 측정 Job을 실행하지 않음 |
| result logging | `loadtest_experiment_conditions`에 dataset revision, schema revision, row count 기록 |

## Schema Consistency

bulk insert Job은 DB schema를 소유하지 않는다. schema의 기준은 각 서비스 DB가 이미 적용한 migration 또는 현재 배포된 모델이며, bulk insert Job은 실행 전에 호환 여부만 검증한다.

| 검증 항목 | 기준 |
| --- | --- |
| table | 필요한 table이 모두 존재해야 함 |
| column | insert 대상 column이 모두 존재해야 함 |
| constraint | primary key, unique key, foreign key 또는 service-level unique 기준 확인 |
| index | 측정 API의 주요 조회 조건에 필요한 index 확인 |
| schema revision | 서비스별 schema revision이 seed가 지원하는 값이어야 함 |
| row count | insert 후 기대 row count와 실제 row count가 같아야 함 |

## Service Seed Data

| 서비스 | 측정 API | bulk insert 데이터 |
| --- | --- | --- |
| auth-service | `POST /auth/login` | `users`에 CUSTOMER 계정, PROVIDER 계정, ADMIN 계정, active 상태, 고정 password hash |
| concert-service | `GET /concerts` | `concerts`에 공개 가능한 공연, provider id, title prefix, status, opens_at, open_schedule_status |
| concert-service | `GET /concerts/{concertId}/performances` | `venues`, `showtimes`에 공연별 회차와 공연장 |
| concert-service | `GET /performances/{performanceId}/seats` | `seats`, 필요 시 `seat_grades`에 회차별 좌석과 가격 등급 |
| reservation-service | `POST /reservations` | `sales_states`, 필요 시 `queue_policies`, `traffic_policies`, 예약 가능한 performance/seat id 풀 |
| payment-service | `POST /payments` | 결제 측정용 pending reservation id 풀, user id, concert id, amount 기준값 |
| ticket-service | `GET /tickets/me` | `tickets`에 고객별 발급 완료 티켓, reservation id, concert id, seat id, status |
| notification-service | `GET /notifications` | MongoDB `notifications` collection에 고객별 알림 문서, type, message, status, source_id, metadata |

## Service Seed Rules

| 서비스 | 규칙 |
| --- | --- |
| auth-service | 측정용 login 계정은 모두 active여야 하며, 측정 중 signup은 수행하지 않는다. |
| concert-service | 공연, 회차, 좌석은 측정 중 변경하지 않는다. public 조회 결과가 run마다 같은 순서와 크기를 유지해야 한다. |
| reservation-service | write 측정 중 좌석이 소모되므로 RPS step 전체를 감당할 만큼 충분한 seat id 풀을 준비한다. |
| payment-service | write 측정 중 reservation이 결제 처리되므로 RPS step 전체를 감당할 만큼 충분한 pending reservation id 풀을 준비한다. |
| ticket-service | 고객별 티켓 수를 고정해 list latency가 run마다 달라지지 않게 한다. |
| notification-service | 고객별 notification 수를 고정해 list latency가 run마다 달라지지 않게 한다. |
