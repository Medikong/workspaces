# Capacity Baseline Local Smoke Result

## 요약

이 문서는 `capacity-baseline-load-test`의 첫 local smoke 실행 결과를 보관한다. 목적은 SLO 기준을 바꾸는 것이 아니라, CPU request 500m와 CPU limit 제거 조건에서 서비스별 유효 RPS와 CPU request 후보가 `loadtest_run_report`에 남는지 확인하는 것이다.

- 실행 결과: `FAIL`
- 실패 의미: Job 또는 리포트 생성 실패가 아니라 실험 판정 실패
- 주요 원인: auth-service는 `2 RPS`에서 p95 기준 초과, reservation-service는 `POST /reservations` error rate 기준 초과
- 보관 원문: [loadtest-run-report.json](loadtest-run-report.json)
- 파드 조건 스냅샷: [pod-resource-conditions.json](pod-resource-conditions.json)

## Experiment Identity

| 항목 | 값 |
| --- | --- |
| experiment_id | `capacity-baseline-local-smoke-2026-06-19` |
| loadtest_run_id | `read-api-loadtest-read-manual-20260619142558-5fj8t` |
| 실행 일시 | `2026-06-19 23:29:26 KST` |
| 환경 | `local` |
| scenario | `capacity-baseline-load-test` |
| preset | `local-smoke` |
| dataset_revision | `capacity-baseline-v1` |
| seed_method | `deterministic_bulk_insert` |
| seed_job | `read-api-loadtest-dataset-manual-20260619142532` |
| loadtest Job | `read-api-loadtest-read-manual-20260619142558` |
| runner image | `localhost:5001/read-api-loadtest:dev` |
| result event | `loadtest_run_report` |

## Fixed Conditions

| 항목 | 값 |
| --- | --- |
| replica | `1` |
| HPA | `disabled` |
| CPU request | `500m` |
| CPU limit | `none` |
| Istio proxy CPU limit | `none` |
| nodeSelector | `none` |
| rollingUpdate | `maxSurge=0`, `maxUnavailable=1` |
| target utilization | `0.70` |
| 임시 p95 기준 | `100ms` |
| 임시 p99 기준 | `300ms` |
| error rate 기준 | `< 0.01` |
| checks rate 기준 | `> 0.99` |
| RPS steps | `1`, `2` |
| step duration | `15s` |
| timeout | `10s` |
| resource observation | `metrics-api` |

현재 배포 상태 조회 결과도 실험 조건과 일치했다.

| 서비스 | namespace | replica | CPU request | CPU limit | HPA |
| --- | --- | ---: | ---: | --- | --- |
| auth-service | `ticketing-auth` | 1 | `500m` | none | none |
| concert-service | `ticketing-concert` | 1 | `500m` | none | none |
| reservation-service | `ticketing-reservation` | 1 | `500m` | none | none |
| payment-service | `ticketing-payment` | 1 | `500m` | none | none |
| ticket-service | `ticketing-ticket` | 1 | `500m` | none | none |
| notification-service | `ticketing-notification` | 1 | `500m` | none | none |

## Dataset Conditions

| 항목 | 값 |
| --- | ---: |
| customer_count | 60 |
| provider_count | 1 |
| admin_count | 1 |
| concert_count | 4 |
| performance_count | 8 |
| seat_count | 1200 |
| payment_pool_count | 1200 |
| ticket_count | 1200 |
| notification_count | 1200 |

## Schema Revisions

| 서비스 | schema_revision |
| --- | --- |
| auth-service | `model-v1` |
| concert-service | `model-v1` |
| reservation-service | `model-v1` |
| payment-service | `model-v1` |
| ticket-service | `model-v1` |
| notification-service | `model-v1` |

## Service Results

| 서비스 | 최대 유효 RPS | 기준 CPU usage | CPU request 후보 | 판정 | 기준 step |
| --- | ---: | ---: | ---: | --- | --- |
| auth-service | 1 | 54.28m | 78m | `candidate_ready` | `auth_rps_1` |
| concert-service | 2 | 16.04m | 23m | `candidate_ready` | `concert_rps_2` |
| reservation-service | - | - | - | `needs_review` | - |
| payment-service | 2 | 12.10m | 18m | `candidate_ready` | `payment_rps_2` |
| ticket-service | 2 | 12.88m | 19m | `candidate_ready` | `ticket_rps_2` |
| notification-service | 2 | 37.73m | 54m | `candidate_ready` | `notification_rps_2` |

`reservation-service`는 모든 step에서 error rate 기준을 넘어서 최대 유효 RPS가 산출되지 않았다. 다만 실패 step에서도 CPU usage와 request 후보는 기록됐다.

## Step Results

### auth-service

| RPS step | p95 | p99 | error rate | CPU usage | throttling | CPU request 후보 | 판정 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `auth_rps_1` | 79.84ms | 85.75ms | 0 | 54.28m | 0 | 78m | `valid` |
| `auth_rps_2` | 129.87ms | 458.06ms | 0 | 67.01m | 0 | 96m | `limit_candidate`, `p95_threshold` |

### concert-service

| RPS step | API | p95 | p99 | error rate | CPU usage | throttling | CPU request 후보 | 판정 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `concert_rps_1` | `GET /concerts` | 52.81ms | 65.37ms | 0 | 7.14m | 0 | 11m | `valid` |
| `concert_rps_1` | `GET /concerts/{concertId}/performances` | 8.88ms | 9.18ms | 0 | 7.14m | 0 | 11m | `valid` |
| `concert_rps_1` | `GET /performances/{performanceId}/seats` | 13.68ms | 14.79ms | 0 | 7.14m | 0 | 11m | `valid` |
| `concert_rps_2` | `GET /concerts` | 11.93ms | 97.36ms | 0 | 16.04m | 0 | 23m | `valid` |
| `concert_rps_2` | `GET /concerts/{concertId}/performances` | 11.12ms | 64.82ms | 0 | 16.04m | 0 | 23m | `valid` |
| `concert_rps_2` | `GET /performances/{performanceId}/seats` | 13.07ms | 15.87ms | 0 | 16.04m | 0 | 23m | `valid` |

### reservation-service

| RPS step | p95 | p99 | error rate | CPU usage | throttling | CPU request 후보 | 판정 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `reservation_rps_1` | 42.25ms | 51.35ms | 1.00 | 6.75m | 0 | 10m | `limit_candidate`, `error_rate_threshold` |
| `reservation_rps_2` | 24.21ms | 36.42ms | 1.00 | 7.68m | 0 | 11m | `limit_candidate`, `error_rate_threshold` |

### payment-service

| RPS step | p95 | p99 | error rate | CPU usage | throttling | CPU request 후보 | 판정 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `payment_rps_1` | 17.35ms | 20.33ms | 0 | 9.45m | 0 | 14m | `valid` |
| `payment_rps_2` | 55.41ms | 207.92ms | 0 | 12.10m | 0 | 18m | `valid` |

### ticket-service

| RPS step | p95 | p99 | error rate | CPU usage | throttling | CPU request 후보 | 판정 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `ticket_rps_1` | 32.33ms | 36.80ms | 0 | 5.96m | 0 | 9m | `valid` |
| `ticket_rps_2` | 11.74ms | 30.51ms | 0 | 12.88m | 0 | 19m | `valid` |

### notification-service

| RPS step | p95 | p99 | error rate | CPU usage | throttling | CPU request 후보 | 판정 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `notification_rps_1` | 23.21ms | 28.39ms | 0 | 17.00m | 0 | 25m | `valid` |
| `notification_rps_2` | 10.67ms | 81.36ms | 0 | 37.73m | 0 | 54m | `valid` |

## Request Candidate Calculation

계산식은 `ceil(cpu_usage_m_at_max_valid_rps / target_utilization)`이다. target utilization은 `0.70`으로 고정했다.

| 서비스 | 기준 RPS | 기준 CPU usage | target utilization | 계산식 | CPU request 후보 |
| --- | ---: | ---: | ---: | --- | ---: |
| auth-service | 1 | 54.28m | 0.70 | `ceil(54.28 / 0.70)` | 78m |
| concert-service | 2 | 16.04m | 0.70 | `ceil(16.04 / 0.70)` | 23m |
| reservation-service | - | - | 0.70 | error 기준 실패로 제외 | - |
| payment-service | 2 | 12.10m | 0.70 | `ceil(12.10 / 0.70)` | 18m |
| ticket-service | 2 | 12.88m | 0.70 | `ceil(12.88 / 0.70)` | 19m |
| notification-service | 2 | 37.73m | 0.70 | `ceil(37.73 / 0.70)` | 54m |

## Decision

| 서비스 | 적용 후보 | 보류 여부 | 메모 |
| --- | ---: | --- | --- |
| auth-service | 78m | 보류 | `2 RPS`에서 p95/p99가 기준을 넘어 smoke 기준 최대 유효 RPS는 1 |
| concert-service | 23m | 보류 | 3개 조회 API가 `2 RPS`까지 통과 |
| reservation-service | - | 보류 | error rate 100%로 dataset/API 계약 확인 필요 |
| payment-service | 18m | 보류 | `2 RPS`까지 통과 |
| ticket-service | 19m | 보류 | `2 RPS`까지 통과 |
| notification-service | 54m | 보류 | `2 RPS`까지 통과 |

이번 값은 local smoke 결과이므로 서비스 values에 자동 반영하지 않는다. 현재 실험 조건은 CPU request 후보 산출 기능과 로그 계약을 확인하기 위한 짧은 smoke이며, 실제 조정 전에는 reservation 실패 원인 확인과 더 긴 duration/RPS step 재실행이 필요하다.

## 확인한 로그 계약

동일한 `loadtest_run_id`로 다음 이벤트가 생성됐다.

| event | loadtest_run_id | status |
| --- | --- | --- |
| `loadtest_experiment_conditions` | `read-api-loadtest-read-manual-20260619142558-5fj8t` | - |
| `loadtest_run_report` | `read-api-loadtest-read-manual-20260619142558-5fj8t` | `FAIL` |

이번 run에서는 `loadtest_api_summary`, `loadtest_summary`, `loadtest_threshold_exit`를 결과 이벤트로 사용하지 않았다.
