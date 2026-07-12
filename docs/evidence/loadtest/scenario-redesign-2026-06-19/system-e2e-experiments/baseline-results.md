# E2E Baseline Results

이 문서는 `system-e2e-experiments/README.md`의 Baseline 실험을 실행한 뒤 결과만 별도로 기록한다.

## 실행 기록

| 실행일 | run id | 상태 | 요약 |
| --- | --- | --- | --- |
| TBD | TBD | 대기 | baseline 실행 전 |

## 실행 조건

| 항목 | 값 |
| --- | --- |
| scenario | `reservation-journey-load-test` |
| target rate | `750 iterations/min` |
| preAllocatedVUs | 1200 |
| maxVUs | 2000 |
| HPA | 비활성화 |
| replica | 주요 서비스 고정 replica 2 기준 |
| steady hold | 10분 |
| expected iterations | 약 7,500회 |

## 결과 요약

| 항목 | 값 |
| --- | ---: |
| iteration count | TBD |
| iteration rate per minute | TBD |
| 전체 성공률 | TBD |
| E2E p50 | TBD |
| E2E p95 | TBD |
| E2E p99 | TBD |
| max RPS | TBD |
| error rate | TBD |

## API별 결과

| step | request count | RPS | p50 | p95 | p99 | error rate | status code 분포 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| auth.login | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| concerts.list | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| performances.list | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| seats.list | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| reservation.create | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| payment.approve | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| ticket.list | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

## 서비스별 결과

| 서비스 | CPU max | memory max | pod count | 주요 신호 |
| --- | ---: | ---: | ---: | --- |
| Kong Gateway | TBD | TBD | TBD | TBD |
| auth-service | TBD | TBD | TBD | TBD |
| concert-service | TBD | TBD | TBD | TBD |
| reservation-service | TBD | TBD | TBD | TBD |
| payment-service | TBD | TBD | TBD | TBD |
| ticket-service | TBD | TBD | TBD | TBD |
| notification-service | TBD | TBD | TBD | TBD |
| DB | TBD | TBD | TBD | connection/query latency |
| Kafka | TBD | TBD | TBD | lag/produce/consume |
