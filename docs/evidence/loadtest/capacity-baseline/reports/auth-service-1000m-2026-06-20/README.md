# auth-service Capacity Baseline Result

## Source

| 항목 | 값 |
| --- | --- |
| raw report | [loadtest-run-report.json](loadtest-run-report.json) |
| k6 summary extract | [k6-summary-auth-steps.json](k6-summary-auth-steps.json) |
| loadtest_run_id | `read-api-loadtest-read-manual-20260620130239-jlgdp` |
| 실행 일시 | `2026-06-20T13:04:42.180Z` |
| scenario | `capacity-baseline-load-test` |
| preset | `local-baseline-1000m` 실행값, report metadata는 `local-baseline-500m`로 남음 |
| service step | `auth-service` |
| API | `POST /auth/login` |
| dataset_revision | `capacity-baseline-v1` |
| run status | `FAIL` |
| service report status | `needs_review` |

`run status=FAIL`은 현재 k6 threshold가 `p95 < 100ms`로 남아 있어 30, 40 RPS 후보 구간 모두 threshold를 넘은 결과다. 이번 실행은 auth-service만 단독으로 실행한 capacity baseline이며, Kong rate limit은 실행 중 완화하고 종료 후 `minute=120`, `policy=local`로 복구했다.

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
| auth RPS stages | `30 -> 40` |
| step duration | `60s` |
| executor | `ramping-arrival-rate` |
| preAllocatedVUs / maxVUs | `400 / 1000` |
| active customer count | `200` |

`ramping-arrival-rate`는 각 60초 구간에서 목표치까지 올리는 방식이다. 따라서 `auth_rps_30`은 0에서 30 RPS로 올라가는 구간이고, `auth_rps_40`은 30에서 40 RPS로 올라가는 구간이다.

## Result

| target RPS | measured avg RPS | requests | p50 | p95 | p99 | error rate | CPU avg | CPU max | throttling | CPU request 후보 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 30 | 15.0 | 899 | 54.4ms | 264.1ms | 492.0ms | 0.00% | 646.1m | 1093.3m | 0 | 924m |
| 40 | 35.0 | 2100 | 53.4ms | 115.2ms | 224.4ms | 0.00% | 1736.4m | 2035.3m | 0 | 2481m |

p95, p99, CPU avg, throttling, CPU request 후보는 `loadtest_run_report.scenario_report.step_results` 기준이다. p50과 요청 수는 archive PVC의 `k6-summary.json`에서 확인한 뒤 [k6-summary-auth-steps.json](k6-summary-auth-steps.json)에 필요한 값만 보관했다. 이 run의 k6 summary에서는 `http_reqs`가 전체 aggregate로만 남아 있어, 구간별 요청 수는 같은 tag의 `http_req_failed` sample 수로 확인했다.

## SLO 해석

| 대상 | 기대 p95 | 이번 측정 | 판단 |
| --- | ---: | ---: | --- |
| 30 RPS 후보 | 100-150ms | 264.1ms | 기대 범위 초과, 재측정 필요 |
| 40 RPS 후보 | 150-250ms | 115.2ms | 기대 범위 안쪽, CPU 후보는 높음 |

30 RPS 후보 구간의 p50은 54.4ms로 낮지만 p95/p99가 크게 튀었다. 40 RPS 후보 구간은 p50, p95, p99가 모두 더 안정적이다. 구간 순서상 첫 60초에 cold cache, DB connection, Python worker warmup, metrics window 초기값이 섞였을 가능성이 있으므로 30 RPS 결과만으로 request를 낮추거나 높이는 판단은 보류한다.

## CPU Request 판단

| 기준 | 계산 | 후보 |
| --- | --- | ---: |
| 30 RPS 후보 구간 | `646.1m / 0.70` | 924m |
| 40 RPS 후보 구간 | `1736.4m / 0.70` | 2481m |

단일 Pod가 40 login RPS까지 감당해야 한다는 요구라면 `1000m` request는 낮다. limit이 없어서 실행 중 2 core 이상까지 burst했지만, request 관점에서는 `2500m` 안팎을 후보로 봐야 한다.

반대로 운영 목표가 30 login RPS 수준이라면 이번 CPU 사용량만으로는 `1000m` request가 충분한 편이다. 다만 30 RPS 구간 p95가 튀었으므로, request를 확정하기 전에는 steady-state 30 RPS와 40 RPS를 각각 독립적으로 반복 실행해야 한다.

## Decision

| 항목 | 판단 |
| --- | --- |
| 즉시 반영 | 보류 |
| 30 RPS 기준 후보 | `1000m` 유지 가능, latency 재측정 필요 |
| 40 RPS 기준 후보 | 단일 Pod 기준 `2500m` 후보 |
| 더 현실적인 운영안 | `1000m` Pod 여러 개로 로그인 피크를 나누는 방식 검토 |
| 다음 실험 | steady 30 RPS, steady 40 RPS, 반복 2회 이상 |

이번 결과는 `1000m` 단일 Pod의 auth-service가 40 RPS 후보 구간에서 에러 없이 처리했지만, CPU 사용량은 `1000m` request보다 훨씬 높게 burst했다는 점을 보여준다. CPU request를 상향할지, replica를 늘려 per-pod login RPS를 낮출지는 HPA 실험과 함께 판단한다.
