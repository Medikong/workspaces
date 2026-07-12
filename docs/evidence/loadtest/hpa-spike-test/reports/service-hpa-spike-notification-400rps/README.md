# Service HPA Spike notification 400RPS

## Summary

| 항목 | 값 |
| --- | --- |
| service | `notification-service` |
| scenario | `service-hpa-spike-load-test` |
| preset | `notification-400rps` |
| run id | `read-api-loadtest-read-manual-20260621103553-7s2j9` |
| k6 status | `FAIL` |
| CPU request | `1000m` |
| HPA target | `70%` |
| min / max replicas | `1 / 4` |
| overload target | `400 RPS` |
| report type | `service_hpa_spike` |
| 판단 | `HPA 유효` |

## Conclusion

notification-service는 `1000m`, HPA target `70%`, `400 RPS` 조건에서 HPA가 `1 -> 2`로 상승했다. HPA decision은 spike 시작 후 58.6초, 새 Pod Ready는 decision 후 11.9초였다. scale-out 전 spike(320 RPS)에서 p99 341.7ms로 한계 후보가 먼저 나타났고, cooldown에서는 error/checks가 정상으로 유지됐다. 따라서 notification은 현재 RPS 기준에서 CPU 기반 HPA가 유효하다.

## 특이사항

- k6 status는 FAIL이지만 원인은 notification spike 구간 p99 SLO 초과다.
- HPA는 `1 -> 2`로 상승했고 decision은 spike 시작 후 `58.6s`, Ready는 decision 후 `11.9s`였다.
- post-run snapshot에서 notification background pod `CrashLoopBackOff`가 관찰됐으므로 다음 run 전 노이즈를 정리하는 편이 좋다.

## HPA Result

| 항목 | 값 |
| --- | ---: |
| baseline replicas | `1` |
| max desired replicas | `2` |
| HPA decision seconds from test start | `148.6` |
| HPA decision seconds from spike start | `58.6` |
| scale-out ready seconds from test start | `160.5` |
| ready after decision | `11.9` |

Post-run HPA snapshot: `horizontalpodautoscaler.autoscaling/notification-service Deployment/notification-service cpu: 48%/70% 1 4 2 85m`

## Stage Summary

| stage role | target RPS | max p95 ms | max p99 ms | max error | min checks | 해석 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | 40 | 6.2 | 20 | 0.00% | 100.00% | 판단 제외 / excluded |
| baseline | 240 | 6.7 | 30.6 | 0.00% | 100.00% | 안정 기준 / ok |
| spike | 320 | 22.5 | 341.7 | 0.00% | 100.00% | HPA decision 관찰 / limit_candidate |
| overload | 400 | 17.7 | 47.2 | 0.00% | 100.00% | 한계 후보 확인 / ok |
| cooldown | 240 | 13.8 | 42.3 | 0.00% | 100.00% | recovery 관찰 / ok |

## Stage Result

| stage role | step | target RPS | p95 ms | p99 ms | error | checks | status / reasons |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | notification.list | 40 | 6.2 | 20 | 0.00% | 100.00% | excluded |
| baseline | notification.list | 240 | 6.7 | 30.6 | 0.00% | 100.00% | ok |
| spike | notification.list | 320 | 22.5 | 341.7 | 0.00% | 100.00% | slo_p99_ms |
| overload | notification.list | 400 | 17.7 | 47.2 | 0.00% | 100.00% | ok |
| cooldown | notification.list | 240 | 13.8 | 42.3 | 0.00% | 100.00% | ok |

Warmup은 판단에서 제외한다. 원본 보고서의 observed RPS 필드는 현재 `null`이라 이 문서에서는 preset target RPS로 비교했다.

## Limit And Recovery

| 항목 | 값 |
| --- | --- |
| first limit candidate | `notification_spike_rps_320` / `notification.list` / p95 `22.5ms`, p99 `341.7ms`, reasons `slo_p99_ms` |
| recovery observations | `notification.list notification_cooldown_rps_240: p95 13.8ms, p99 42.3ms, error 0.00%, checks 100.00%, recovered=true` |
| cooldown quality | `recovered_or_stable` |

## Raw Result

- 원본 JSON: `loadtest-run-report.json`
- 서비스 JSON: `loadtest-run-report-service.json`
- k6 로그: `k6.log`
- HPA/Pod snapshot: `kubectl-get-hpa-A.txt`, `kubectl-get-hpa-pods.txt`
