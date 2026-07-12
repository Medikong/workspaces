# auth-service Capacity Baseline Result

## Source

| 항목 | 값 |
| --- | --- |
| raw report | [loadtest-run-report.json](loadtest-run-report.json) |
| loadtest_run_id | `read-api-loadtest-read-manual-20260619155446-nhldp` |
| 실행 일시 | `2026-06-19T15:59:48.016Z` |
| scenario | `capacity-baseline-load-test` |
| preset | `local-baseline-500m` |
| service step | `auth-service` |
| API | `POST /auth/login` |
| dataset_revision | `capacity-baseline-v1` |
| run status | `FAIL` |
| service report status | `candidate_ready` |

`run status=FAIL`은 160 RPS 구간에서 p95와 error rate 기준이 깨진 결과다. capacity baseline에서는 이 실패 구간이 한계 후보를 찾기 위한 신호이므로, 80 RPS까지의 결과는 CPU request 후보 산출에 사용할 수 있다.

## Conditions

| 항목 | 값 |
| --- | --- |
| CPU request | `500m` |
| CPU limit | `none` |
| replica | `1` |
| HPA | `disabled` |
| auth token TTL | `7200s` |
| target utilization | `70%` |
| p95 기준 | `< 100ms` |
| p99 기준 | `< 300ms` |
| error rate 기준 | `< 1%` |
| RPS steps | `10 -> 20 -> 40 -> 80 -> 160` |
| step duration | `60s` |
| preAllocatedVUs / maxVUs | `400 / 1000` |
| active customer count | `200` |

## Dataset

| 항목 | 값 |
| --- | ---: |
| customer_count | 500 |
| provider_count | 1 |
| admin_count | 1 |
| concert_count | 8 |
| performance_count | 32 |
| seat_count | 32000 |
| payment_pool_count | 24000 |
| ticket_count | 15000 |
| notification_count | 15000 |

Schema revision은 모든 서비스가 `model-v1`이다.

## Summary

| 항목 | 값 |
| --- | ---: |
| 최대 유효 RPS | 80 |
| 첫 실패 RPS | 160 |
| 기준 CPU usage | 2408.1m |
| target utilization | 70% |
| CPU request 후보 | 3441m |

80 RPS까지는 p95, p99, error rate, throttling 기준을 모두 만족했다. 160 RPS에서는 p95가 7.8초까지 상승하고 error rate가 36.25%로 올라가므로 한계 구간으로 본다.

## Step Results

| target RPS | p95 | p99 | error rate | CPU usage | throttling | CPU request 후보 | 판정 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 10 | 63.0ms | 106.4ms | 0.00% | 193.6m | 0 | 277m | valid |
| 20 | 62.5ms | 106.8ms | 0.00% | 635.8m | 0 | 909m | valid |
| 40 | 57.6ms | 162.5ms | 0.00% | 1234.9m | 0 | 1765m | valid |
| 80 | 75.2ms | 232.7ms | 0.00% | 2408.1m | 0 | 3441m | valid |
| 160 | 7832.8ms | 8157.4ms | 36.25% | 3870.9m | 0 | 5530m | limit_candidate |

## Decision

| 항목 | 판단 |
| --- | --- |
| 적용 후보 | `3441m` |
| 보류 여부 | 바로 자동 반영하지 않음 |
| 기준 구간 | `auth_rps_80` |
| 첫 실패 신호 | `p95_threshold`, `error_rate_threshold` |
| 트래픽 특성 | 로그인은 password hashing 때문에 CPU 비용이 크지만, 일반 조회/예약 API처럼 반복 호출되는 API는 아님 |
| 재실험 권장 | `80 -> 100 -> 120 -> 140 -> 160`처럼 경계 구간을 더 촘촘히 재측정 |

현재 결과만 놓고 보면 `auth-service` 단일 replica가 임시 기준을 만족한 마지막 구간은 80 RPS다. CPU request 후보는 `2408.1m / 0.70 = 3441m`로 계산된다.

다만 이 값은 로그인 API의 암호화 비용이 반영된 피크성 후보로 해석해야 한다. 로그인은 첫 진입 병목이 될 수 있지만, 사용자가 서비스 내부에서 계속 반복 호출하는 API는 아니므로 `3441m`을 곧바로 상시 CPU request로 적용하기보다는 로그인 피크 대응, HPA 기준, replica 증설 기준을 함께 놓고 판단한다.

80 RPS와 160 RPS 사이 간격도 크기 때문에, 실제 적용값을 확정하기 전에는 100~140 RPS 구간을 추가로 측정하는 편이 좋다.
