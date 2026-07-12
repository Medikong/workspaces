# CPU Request Experiment Template

## Experiment Identity

| 항목 | 값 |
| --- | --- |
| experiment_id |  |
| loadtest_run_id |  |
| 실행 일시 |  |
| 환경 |  |
| scenario | `capacity-baseline-load-test` |
| dataset_revision |  |
| seed_method | `bulk_insert` |
| seed_job |  |
| gitops_revision |  |
| service_revision |  |

## Fixed Conditions

| 항목 | 값 |
| --- | --- |
| HPA |  |
| replica |  |
| CPU limit |  |
| HPA target utilization |  |
| 임시 p95 기준 |  |
| error rate 기준 |  |
| RPS steps |  |
| step duration |  |
| timeout |  |

## Dataset Conditions

| 항목 | 값 |
| --- | --- |
| customer_count |  |
| provider_count |  |
| admin_count |  |
| concert_count |  |
| performance_count |  |
| seat_count |  |
| reservation_pool_count |  |
| payment_pool_count |  |
| ticket_count |  |
| notification_count |  |

## Schema Revisions

| 서비스 | schema_revision | row_count 확인 |
| --- | --- | --- |
| auth-service |  |  |
| concert-service |  |  |
| reservation-service |  |  |
| payment-service |  |  |
| ticket-service |  |  |
| notification-service |  |  |

## Service Results

| 서비스 | API | 최대 유효 RPS | CPU usage | p95 | p99 | error rate | throttling | CPU request 후보 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| auth-service | `POST /auth/login` |  |  |  |  |  |  |  |
| concert-service | `GET /concerts` |  |  |  |  |  |  |  |
| concert-service | `GET /concerts/{concertId}/performances` |  |  |  |  |  |  |  |
| concert-service | `GET /performances/{performanceId}/seats` |  |  |  |  |  |  |  |
| reservation-service | `POST /reservations` |  |  |  |  |  |  |  |
| payment-service | `POST /payments` |  |  |  |  |  |  |  |
| ticket-service | `GET /tickets/me` |  |  |  |  |  |  |  |
| notification-service | `GET /notifications` |  |  |  |  |  |  |  |

## Step Results

### auth-service

| RPS step | p95 | p99 | error rate | CPU usage | throttling | 판정 |
| ---: | ---: | ---: | ---: | ---: | --- | --- |
|  |  |  |  |  |  |  |

### concert-service

| RPS step | API | p95 | p99 | error rate | CPU usage | throttling | 판정 |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- |
|  |  |  |  |  |  |  |  |

### reservation-service

| RPS step | p95 | p99 | error rate | CPU usage | throttling | 판정 |
| ---: | ---: | ---: | ---: | ---: | --- | --- |
|  |  |  |  |  |  |  |

### payment-service

| RPS step | p95 | p99 | error rate | CPU usage | throttling | 판정 |
| ---: | ---: | ---: | ---: | ---: | --- | --- |
|  |  |  |  |  |  |  |

### ticket-service

| RPS step | p95 | p99 | error rate | CPU usage | throttling | 판정 |
| ---: | ---: | ---: | ---: | ---: | --- | --- |
|  |  |  |  |  |  |  |

### notification-service

| RPS step | p95 | p99 | error rate | CPU usage | throttling | 판정 |
| ---: | ---: | ---: | ---: | ---: | --- | --- |
|  |  |  |  |  |  |  |

## Request Candidate Calculation

| 서비스 | 기준 RPS | 기준 CPU usage | target utilization | 계산식 | CPU request 후보 |
| --- | ---: | ---: | ---: | --- | ---: |
| auth-service |  |  |  |  |  |
| concert-service |  |  |  |  |  |
| reservation-service |  |  |  |  |  |
| payment-service |  |  |  |  |  |
| ticket-service |  |  |  |  |  |
| notification-service |  |  |  |  |  |

## Decision

| 서비스 | 적용 후보 | 보류 여부 | 메모 |
| --- | ---: | --- | --- |
| auth-service |  |  |  |
| concert-service |  |  |  |
| reservation-service |  |  |  |
| payment-service |  |  |  |
| ticket-service |  |  |  |
| notification-service |  |  |  |
