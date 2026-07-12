# auth-service Capacity Baseline Result - Warmup Step

## Source

| 항목 | 값 |
| --- | --- |
| raw report | [loadtest-run-report.json](loadtest-run-report.json) |
| k6 summary extract | [k6-summary-auth-steps.json](k6-summary-auth-steps.json) |
| loadtest_run_id | `read-api-loadtest-read-manual-20260620131722-xspgm` |
| 실행 일시 | `2026-06-20T13:20:24.518Z` |
| scenario | `capacity-baseline-load-test` |
| preset | `local-baseline-1000m` |
| service step | `auth-service` |
| API | `POST /auth/login` |
| dataset_revision | `capacity-baseline-v1` |
| run status | `PASS` |
| service report status | `candidate_ready` |

이번 실행은 auth-service `30 -> 40 RPS` 재측정 전에 낮은 로그인 트래픽을 먼저 흘리는지 확인하기 위해 `10 -> 30 -> 40` stage로 실행했다. `10 RPS`는 warmup step으로 보고 CPU request 산정에서는 제외한다.

## Command

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS='["auth"]' \
  SCENARIO=capacity-baseline-load-test \
  PRESET=local-baseline-1000m \
  task dev:loadtest
```

## Conditions

| 항목 | 값 |
| --- | --- |
| CPU request | `1000m` |
| CPU limit | `none` |
| replica | `1` |
| HPA | `disabled` |
| auth token TTL | `7200s` |
| target utilization | `70%` |
| k6 p95 threshold | `< 100ms` |
| k6 p99 threshold | `< 300ms` |
| error rate threshold | `< 1%` |
| auth RPS stages | `10 -> 30 -> 40` |
| step duration | `60s` |
| executor | `ramping-arrival-rate` |
| preAllocatedVUs / maxVUs | `400 / 1000` |
| active customer count | `200` |

## Result

| target RPS | 역할 | measured avg RPS | requests | p50 | p95 | p99 | error rate | CPU avg | CPU max | throttling | CPU request 후보 |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | warmup | 5.0 | 299 | 52.7ms | 78.6ms | 228.8ms | 0.00% | 164.8m | 313.8m | 0 | 236m |
| 30 | measurement | 20.0 | 1199 | 51.5ms | 69.9ms | 117.4ms | 0.00% | 710.2m | 1097.1m | 0 | 1015m |
| 40 | measurement | 35.0 | 2100 | 50.9ms | 67.6ms | 133.3ms | 0.00% | 1597.1m | 1913.1m | 0 | 2282m |

p95, p99, CPU avg, throttling, CPU request 후보는 `loadtest_run_report.scenario_report.step_results` 기준이다. p50과 요청 수는 archive PVC의 `k6-summary.json`에서 확인한 뒤 [k6-summary-auth-steps.json](k6-summary-auth-steps.json)에 필요한 값만 보관했다.

## Comparison

| 구간 | no-warmup p95 | warmup p95 | 변화 |
| ---: | ---: | ---: | --- |
| 30 RPS | 264.1ms | 69.9ms | 초반 tail latency가 크게 안정됨 |
| 40 RPS | 115.2ms | 67.6ms | warmed 상태에서 더 안정됨 |

이전 실행의 `30 RPS` 구간은 첫 로그인 트래픽 구간이라 DB connection, Python worker, password verify 경로가 같이 데워졌고 p95/p99가 크게 튀었다. 이번 실행에서는 `10 RPS`가 그 역할을 먼저 수행했기 때문에 30/40 RPS 구간이 모두 안정적으로 나왔다.

## CPU Request 판단

| 기준 | 계산 | 후보 |
| --- | --- | ---: |
| 30 RPS 측정 구간 | `710.2m / 0.70` | 1015m |
| 40 RPS 측정 구간 | `1597.1m / 0.70` | 2282m |

운영 목표가 단일 Pod 기준 30 login RPS라면 `1000m` request는 거의 맞는 수준이다. 다만 여유가 거의 없으므로 HPA scale-out이나 replica 여유가 없으면 작은 변동에도 p95가 흔들릴 수 있다.

운영 목표가 단일 Pod 기준 40 login RPS라면 `1000m` request는 낮다. 이번 실행은 CPU limit이 없어서 1.9 core까지 burst했으므로, 40 login RPS를 한 Pod에 맡길 계획이면 `2300m` 안팎을 후보로 봐야 한다. 더 현실적인 운영안은 Pod를 여러 개 두고 per-pod login RPS를 30 이하로 낮추는 것이다.

## Decision

| 항목 | 판단 |
| --- | --- |
| warmup step | 유지 권장 |
| 산정 제외 구간 | `auth_rps_10` |
| 30 RPS 기준 | `1000m` 유지 가능, 반복 검증 필요 |
| 40 RPS 기준 | 단일 Pod는 `2300m` 후보, replica 분산 권장 |
| 다음 실험 | steady 30 RPS, steady 40 RPS를 각각 독립 실행해 ramping 평균 효과 제거 |

이번 결과는 낮은 RPS warmup step만 추가해도 첫 측정 구간의 tail latency 왜곡이 크게 줄어든다는 점을 확인했다. capacity baseline preset에는 auth-service 전용 `10 -> 30 -> 40` stage를 유지하는 편이 좋다.
