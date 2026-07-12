# CPU Request Baseline Loadtest

## Documents

| 문서 | 용도 |
| --- | --- |
| [RUNBOOK.md](RUNBOOK.md) | 로컬 capacity baseline 실행, 검증, 결과 보관 명령어 |
| [EXPERIMENT_PLAN.md](EXPERIMENT_PLAN.md) | CPU request 기준점을 좁히기 위한 capacity baseline 실험 단계와 판단 기준 |
| [cost/README.md](cost/README.md) | 서비스별 RPS와 CPU request 후보를 t4g 비용으로 환산하는 산정표 |
| [.templates/cpu-request-experiment-template.md](.templates/cpu-request-experiment-template.md) | 실행 결과 README 작성 템플릿 |
| [.templates/service-step-experiment-template.md](.templates/service-step-experiment-template.md) | 서비스 step별 결과 README 작성 템플릿 |
| [API 통합테스트 벤치마크](../../services/api-integration-test-benchmark/half-year-early-growth/README.md) | `half-year-early-growth` 대량 dataset 기준 API별 p50/p95/p99 근거 |

## Reports

| 실행 | 서비스 | 조건 | 문서 |
| --- | --- | --- | --- |
| 2026-06-21 | all services | `1000m` CPU request 기준 Pod당 RPS 최종 분석 | [reports/final-1000m-rps-baseline-2026-06-21/README.md](reports/final-1000m-rps-baseline-2026-06-21/README.md) |
| 2026-06-21 | reservation/payment/ticket | `local-write-services-expand-1000m`, 각 서비스 첫 stage warmup 제외, single replica, HPA off | [reports/local-write-services-expand-1000m-2026-06-21/README.md](reports/local-write-services-expand-1000m-2026-06-21/README.md) |
| 2026-06-21 | all services | `local-baseline-1000m`, `cmd/server` API + worker Deployment 분리, single replica, HPA off | [reports/local-baseline-1000m-server-worker-2026-06-21/README.md](reports/local-baseline-1000m-server-worker-2026-06-21/README.md) |
| 2026-06-21 | all services | `local-baseline-1000m`, DB pool 35/20/15s, single replica, HPA off | [reports/local-baseline-1000m-pool35-2026-06-21/README.md](reports/local-baseline-1000m-pool35-2026-06-21/README.md) |
| 2026-06-21 | concert-service | `local-concert-workers2-short`, Uvicorn workers 2, concert-only short run | [reports/local-concert-workers2-short-2026-06-21/README.md](reports/local-concert-workers2-short-2026-06-21/README.md) |
| 2026-06-20 | auth-service | `1000m`, single replica, HPA off, auth-only warmup `10 -> 30 -> 40` | [reports/auth-service-1000m-warmup-2026-06-20/README.md](reports/auth-service-1000m-warmup-2026-06-20/README.md) |
| 2026-06-20 | auth-service | `1000m`, single replica, HPA off, auth-only `30 -> 40` | [reports/auth-service-1000m-2026-06-20/README.md](reports/auth-service-1000m-2026-06-20/README.md) |
| 2026-06-20 | concert-service | `1000m`, single replica, HPA off | [reports/concert-service-1000m-2026-06-20/loadtest-run-report.json](reports/concert-service-1000m-2026-06-20/loadtest-run-report.json) |
| 2026-06-20 | reservation-service | `1000m`, single replica, HPA off | [reports/reservation-service-1000m-2026-06-20/loadtest-run-report.json](reports/reservation-service-1000m-2026-06-20/loadtest-run-report.json) |
| 2026-06-20 | payment-service | `1000m`, single replica, HPA off | [reports/payment-service-1000m-2026-06-20/loadtest-run-report.json](reports/payment-service-1000m-2026-06-20/loadtest-run-report.json) |
| 2026-06-20 | ticket-service | `1000m`, single replica, HPA off | [reports/ticket-service-1000m-2026-06-20/loadtest-run-report.json](reports/ticket-service-1000m-2026-06-20/loadtest-run-report.json) |
| 2026-06-20 | notification-service | `1000m`, single replica, HPA off | [reports/notification-service-1000m-2026-06-20/loadtest-run-report.json](reports/notification-service-1000m-2026-06-20/loadtest-run-report.json) |
| 2026-06-19 | auth-service | `500m`, single replica, HPA off | [reports/auth-service-500m-2026-06-19/README.md](reports/auth-service-500m-2026-06-19/README.md) |

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
| DB 리소스 | CPU/memory limit 제거, capacity 실험보다 넉넉한 request와 DB 파라미터 |
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
| 종료 기준 | SLO 요구치를 넘거나 error/throttling 신호가 반복되는 첫 구간 전까지를 유효 구간으로 본다 |

순차 실행 순서는 다음과 같이 고정한다.

| 순서 | 측정 서비스 | 목적 |
| ---: | --- | --- |
| 1 | auth-service | 로그인 처리량 기준 확인 |
| 2 | concert-service | 추천 공연, 상세, 달력, 날짜별 회차, 좌석도 조회 처리량 기준 확인 |
| 3 | reservation-service | 예매 생성 처리량 기준 확인 |
| 4 | payment-service | 결제 처리량 기준 확인 |
| 5 | ticket-service | 티켓 발급 또는 예매 완료 확인 처리량 기준 확인 |
| 6 | notification-service | 예매 완료 후 알림 조회 처리량 기준 확인 |

각 서비스 단계는 기본적으로 같은 RPS 계단을 사용한다. 예를 들어 `10 -> 20 -> 40 -> 80 -> 160 RPS`처럼 올리고, 각 계단마다 p95, p99, error rate, CPU usage, CPU throttling을 기록한다. 최종 최대 RPS는 SLO 요구치를 만족한 마지막 계단이다.

auth-service는 로그인 API 특성상 별도 기준을 둔다. `POST /auth/login`은 password verify 비용이 포함된 CPU-bound 경로이고, 일반 조회 API처럼 반복 호출되는 endpoint가 아니다. 이번 기준에서는 auth-service를 `1000m`, single replica, HPA off, `30 RPS`로 확정한다.

write 계열 확장 탐색에서는 각 서비스의 첫 stage를 warmup으로 보고 CPU request 후보 산정에서 제외한다. 2026-06-21 `local-write-services-expand-1000m` 실행 기준 최대 유효 RPS는 reservation-service 240 RPS, payment-service 240 RPS, ticket-service 100 RPS다.

2026-06-21 최종 분석 기준 `1000m` Pod당 운영 RPS는 auth-service 30 RPS, concert-service 140 RPS, reservation-service 140 RPS, payment-service 150 RPS, ticket-service 75 RPS, notification-service 320 RPS로 둔다.

## SLO Requirements

아래 SLO 요구치는 [half-year early-growth API 통합테스트 벤치마크](../../services/api-integration-test-benchmark/half-year-early-growth/README.md)의 large dataset 결과를 하한 근거로 사용한다. API 통합 benchmark는 in-process 또는 testcontainer 중심의 API 1회 처리 비용이므로, capacity baseline의 k6/Kubernetes 경로에서는 Kong ingress, LB, network hop, database latency, connection pool 대기, metrics window 변동을 포함해 더 보수적인 p95 gate를 둔다.

capacity baseline에서는 target RPS를 올리면서 API별 p95가 아래 기준을 넘지 않는 마지막 구간을 유효 구간으로 본다. 공통 오류 기준은 `HTTP error rate < 1%`, `CPU throttling = 0`이다.

| 서비스 | endpoint | large p95 | large p99 | capacity SLO p95 | 기준 |
| --- | --- | ---: | ---: | ---: | --- |
| auth-service | `POST /auth/login` | `65.077ms` | `102.895ms` | `300ms @ 30 RPS` | `1000m`, `30 RPS` 확정 |
| concert-service | `GET /concerts/recommended?sort=latest&cursor={cursor}` | `7.966ms` | `9.632ms` | `80ms` | read API floor |
| concert-service | `GET /concerts/{concertId}` | `9.687ms` | `11.683ms` | `80ms` | read API floor |
| concert-service | `GET /concerts/{concertId}/calendar?yearMonth=YYYY-MM` | `5.608ms` | `6.532ms` | `80ms` | read API floor |
| concert-service | `GET /concerts/{concertId}/dates/{date}/performances` | `4.874ms` | `5.783ms` | `80ms` | read API floor |
| concert-service | `GET /performances/{performanceId}/seat-map` | `39.745ms` | `57.766ms` | `150ms` | payload-heavy read |
| reservation-service | `POST /reservations` | `7.435ms` | `11.138ms` | `120ms` | write API floor |
| payment-service | `POST /payments` | `10.238ms` | `15.533ms` | `120ms` | write API floor |
| ticket-service | `POST /tickets/issue` | `15.358ms` | `21.283ms` | `120ms` | write API floor |
| ticket-service | `GET /tickets/me` | `11.140ms` | `23.285ms` | `100ms` | user list read |
| notification-service | `GET /notifications` | `2.941ms` | `6.177ms` | `80ms` | user list read |

auth-service의 capacity SLO p95는 API 통합 benchmark p95가 아니라 실제 `1000m`, `30 RPS` 확정값을 따른다. 2026-06-20 capacity run의 30 RPS 구간은 `p95=264.1ms`, `error rate=0%`, `CPU avg=646.1m`, `CPU request 후보=924m`였으므로 운영 기준은 `1000m @ 30 RPS`로 둔다.

나머지 API의 capacity SLO는 아직 최종 사용자 SLO가 아니라 CPU request 후보를 고르기 위한 첫 gate다. 실제 k6 실행 결과가 안정적으로 더 낮으면 값을 좁히고, 특정 endpoint가 network/DB pool 대기 때문에 반복적으로 넘으면 CPU request가 아니라 connection pool, DB parameter, query/index를 먼저 분리해서 본다.

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
| slo_p95_ms | API별 capacity SLO p95 기준 |
| target_rps | 계단식으로 올린 목표 RPS |
| per_pod_rps | replica 1개 기준 처리량 |
| p95_ms | p95 latency |
| p99_ms | p99 latency |
| error_rate | HTTP 실패율 |
| cpu_usage_m | Pod CPU 사용량 |
| cpu_throttling | CPU throttling 여부 |
| request_candidate_m | CPU request 후보 |

## Service Target APIs

실제 예매 과정의 주요 API는 [concert-service API 설계](../../../architecture/concert-service/README.md)의 `모바일 홈 -> 공연 상세 -> 달력 -> 날짜별 회차 -> 좌석도 -> 예매 생성 -> 결제 -> 티켓 발급` 순서를 따른다.

| 순서 | 서비스 | k6 step | Method | Path | 최대 RPS 계산 포함 |
| ---: | --- | --- | --- | --- | --- |
| 1 | auth-service | `capacity_baseline.auth.login` | POST | `/auth/login` | yes |
| 2 | concert-service | `capacity_baseline.concert.recommended` | GET | `/concerts/recommended?sort=latest&cursor={cursor}` | yes |
| 3 | concert-service | `capacity_baseline.concert.detail` | GET | `/concerts/{concertId}` | yes |
| 4 | concert-service | `capacity_baseline.concert.calendar` | GET | `/concerts/{concertId}/calendar?yearMonth=YYYY-MM` | yes |
| 5 | concert-service | `capacity_baseline.concert.date_performances` | GET | `/concerts/{concertId}/dates/{date}/performances` | yes |
| 6 | concert-service | `capacity_baseline.concert.seat_map` | GET | `/performances/{performanceId}/seat-map` | yes |
| 7 | reservation-service | `capacity_baseline.reservation.create` | POST | `/reservations` | yes |
| 8 | payment-service | `capacity_baseline.payment.create` | POST | `/payments` | yes |
| 9 | ticket-service | `capacity_baseline.ticket.issue` | POST | `/tickets/issue` | yes |
| 10 | ticket-service | `capacity_baseline.ticket.list` | GET | `/tickets/me` | separate read gate |
| 11 | notification-service | `capacity_baseline.notification.list` | GET | `/notifications` | separate read gate |

concert-service는 예매 전 조회가 5개 API로 나뉘므로 같은 서비스 단계 안에서 순서대로 측정한다. 이때 최대 RPS는 concert-service 단계의 target RPS를 기준으로 기록하고, API별 p95/p99/error rate는 별도로 남긴다.

## Dashboard Logging

실험 결과는 기존 load 대시보드에서 같은 방식으로 조회할 수 있어야 한다. 로그 이벤트는 아래 두 개만 사용한다.

| 로그 | 포함 내용 |
| --- | --- |
| `loadtest_experiment_conditions` | run id, scenario, preset, dataset, replica, HPA off/fixed, target utilization |
| `loadtest_run_report` | 서비스/API/계단별 RPS, SLO p95, 실제 p95, p99, error rate, CPU usage, throttling, 최대 유효 RPS, CPU request 후보, 판단 결과 |

대시보드 조회 기준은 `loadtest_run_id` 하나를 실험 1회로 본다. 6개 서비스 단계는 같은 `loadtest_run_id` 안에서 `measured_service`와 `capacity_step` 필드로 구분한다.

## Pre-Test Data Preparation

사전 테스트 데이터는 `gitops/platform/loadtest`의 dataset setup Job에서 bulk insert로 준비한다. 이 작업은 측정 Job과 분리하며, 측정 대상 API의 latency, RPS, error rate 계산에 포함하지 않는다.

| 항목 | 기준 |
| --- | --- |
| dataset owner | `gitops/platform/loadtest` |
| execution unit | loadtest namespace의 dataset setup Job |
| seed method | deterministic bulk insert |
| dataset revision | `capacity-baseline-half-year-early-growth-v2`처럼 API 순서와 규모 모델을 함께 드러내는 revision 사용 |
| ID 생성 | 서비스와 run에 관계없이 재현 가능한 deterministic ID 사용 |
| schema guard | insert 전 table, column, constraint, schema revision 확인 |
| failure policy | schema 또는 row count가 맞지 않으면 측정 Job을 실행하지 않음 |
| result logging | `loadtest_experiment_conditions`에 dataset revision, schema revision, row count 기록 |

capacity baseline dataset은 API 통합 benchmark artifact를 그대로 복사하지 않고 같은 규모 모델을 deterministic seed로 재현한다. 기준 규모는 `half-year early-growth`와 맞춘다.

| 서비스 | 기준 데이터 | 목표 수량 |
| --- | --- | ---: |
| auth-service | 가입 사용자 | 100,000건 |
| concert-service | 공연/회차/좌석 카탈로그 | 공연 270건, 회차 810건, 좌석 567,000건 |
| reservation-service | 예약 이력과 예약 가능한 후보 seat pool | 예약 이력 261,000건 + step별 후보 pool |
| payment-service | 결제 이력과 결제 가능한 pending reservation pool | 결제 이력 184,000건 + step별 후보 pool |
| ticket-service | 티켓 이력과 발급 가능한 paid reservation pool | 티켓 이력 170,000건 + step별 후보 pool |
| notification-service | 활성 알림 | 354,000건 |

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
| concert-service | `GET /concerts/recommended?sort=latest&cursor={cursor}` | `concerts`에 공개 가능한 공연, provider id, title prefix, status, opens_at, open_schedule_status |
| concert-service | `GET /concerts/{concertId}` | `venues`, `showtimes`, `seat_grades`에 공연 상세, 공연장, 가격/좌석등급 요약 |
| concert-service | `GET /concerts/{concertId}/calendar?yearMonth=YYYY-MM` | `showtimes`, `seats`에 월별 예매 가능 여부를 판단할 회차와 sellable 좌석 |
| concert-service | `GET /concerts/{concertId}/dates/{date}/performances` | `showtimes`에 날짜별 회차, 판매 상태, 시작 시간 |
| concert-service | `GET /performances/{performanceId}/seat-map` | `seats`, `seat_grades`에 회차별 좌석, 구역, 등급, 가격, 좌석 상태 |
| reservation-service | `POST /reservations` | `sales_states`, 필요 시 `queue_policies`, `traffic_policies`, 예약 가능한 performance/seat id 풀 |
| payment-service | `POST /payments` | 결제 측정용 pending reservation id 풀, user id, concert id, amount 기준값 |
| ticket-service | `POST /tickets/issue` | 티켓 발급 측정용 paid reservation id 풀, user id, concert id, seat id |
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
