# Service HPA Spike auth 30RPS

## Summary

| 항목 | 값 |
| --- | --- |
| service | `auth-service` |
| scenario | `service-hpa-spike-load-test` |
| preset | `auth-30rps` |
| run id | `read-api-loadtest-read-manual-20260621092401-jqx9r` |
| k6 status | `FAIL` |
| CPU request | `1000m` |
| HPA target | `70%` |
| min / max replicas | `1 / 4` |
| overload target | `30 RPS` |
| report type | `service_hpa_spike` |
| 판단 | `HPA 유효` |

## Conclusion

auth-service는 `1000m`, HPA target `70%`, `30 RPS` 조건에서 HPA가 `1 -> 2`로 상승했다. HPA decision은 spike 시작 후 28.4초, 새 Pod Ready는 decision 후 11.4초였다. scale-out 전 spike(25 RPS)에서 p99 810.8ms로 한계 후보가 먼저 나타났고, cooldown에서는 error/checks가 정상으로 유지됐다. 따라서 auth은 현재 RPS 기준에서 CPU 기반 HPA가 유효하다.

## 특이사항

- k6 status는 FAIL이지만 원인은 error/checks가 아니라 spike 구간 p99 SLO 초과다.
- HPA는 `1 -> 2`로 상승했고 decision은 spike 시작 후 `28.4s`, Ready는 decision 후 `11.4s`였다.
- overload/cooldown에서는 p95/p99가 정상화되어 CPU 기반 HPA가 품질 회복에 도움이 된 것으로 본다.

## HPA Result

| 항목 | 값 |
| --- | ---: |
| baseline replicas | `1` |
| max desired replicas | `2` |
| HPA decision seconds from test start | `118.4` |
| HPA decision seconds from spike start | `28.4` |
| scale-out ready seconds from test start | `129.7` |
| ready after decision | `11.4` |

Post-run HPA snapshot: `horizontalpodautoscaler.autoscaling/auth-service Deployment/auth-service cpu: 35%/70% 1 4 2 13m`

## Stage Summary

| stage role | target RPS | max p95 ms | max p99 ms | max error | min checks | 해석 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | 5 | 66.6 | 73.4 | 0.00% | 100.00% | 판단 제외 / excluded |
| baseline | 15 | 55.9 | 79.4 | 0.00% | 100.00% | 안정 기준 / ok |
| spike | 25 | 178.1 | 810.8 | 0.00% | 100.00% | HPA decision 관찰 / limit_candidate |
| overload | 30 | 53.4 | 71 | 0.00% | 100.00% | 한계 후보 확인 / ok |
| cooldown | 15 | 52.4 | 62 | 0.00% | 100.00% | recovery 관찰 / ok |

## Stage Result

| stage role | step | target RPS | p95 ms | p99 ms | error | checks | status / reasons |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | auth.login | 5 | 66.6 | 73.4 | 0.00% | 100.00% | excluded |
| baseline | auth.login | 15 | 55.9 | 79.4 | 0.00% | 100.00% | ok |
| spike | auth.login | 25 | 178.1 | 810.8 | 0.00% | 100.00% | slo_p99_ms |
| overload | auth.login | 30 | 53.4 | 71 | 0.00% | 100.00% | ok |
| cooldown | auth.login | 15 | 52.4 | 62 | 0.00% | 100.00% | ok |

Warmup은 판단에서 제외한다. 원본 보고서의 observed RPS 필드는 현재 `null`이라 이 문서에서는 preset target RPS로 비교했다.

## Limit And Recovery

| 항목 | 값 |
| --- | --- |
| first limit candidate | `auth_spike_rps_25` / `auth.login` / p95 `178.1ms`, p99 `810.8ms`, reasons `slo_p99_ms` |
| recovery observations | `auth.login auth_cooldown_rps_15: p95 52.4ms, p99 62ms, error 0.00%, checks 100.00%, recovered=true` |
| cooldown quality | `recovered_or_stable` |

## Raw Result

- 원본 JSON: `loadtest-run-report.json`
- 서비스 JSON: `loadtest-run-report-service.json`
- k6 로그: `k6.log`
- HPA/Pod snapshot: `kubectl-get-hpa-A.txt`, `kubectl-get-hpa-pods.txt`
