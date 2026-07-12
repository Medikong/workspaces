# Service HPA Spike ticket 75RPS

## Summary

| 항목 | 값 |
| --- | --- |
| service | `ticket-service` |
| scenario | `service-hpa-spike-load-test` |
| preset | `ticket-75rps` |
| run id | `read-api-loadtest-read-manual-20260621102813-mjt9v` |
| k6 status | `PASS` |
| CPU request | `1000m` |
| HPA target | `70%` |
| min / max replicas | `1 / 4` |
| overload target | `75 RPS` |
| report type | `service_hpa_spike` |
| 판단 | `RPS 부족` |

## Conclusion

ticket-service는 `1000m`, HPA target `70%`, `75 RPS`에서 HPA가 상승하지 않았다. post-run snapshot은 `horizontalpodautoscaler.autoscaling/ticket-service Deployment/ticket-service cpu: 54%/70% 1 4 1 77m`로 CPU 70%에 닿지 않았고, stage 결과도 latency/error/checks 한계 후보를 만들지 못했다. 따라서 실패라기보다 현재 RPS가 scale-out 유발 부하가 아니며, 다음 실험에서는 spike/overload RPS 또는 duration을 올려야 한다.

## 특이사항

- `75 RPS`에서는 post-run CPU가 `54%/70%`라 HPA target에 닿지 않았다.
- 대상 main service는 안정적이지만 post-run snapshot에서 ticket background pod `CrashLoopBackOff`가 관찰됐다.
- 재시도 preset은 `ticket-110rps`로 올렸고 baseline/spike/overload/cooldown duration도 `90s`로 늘렸다.

## HPA Result

| 항목 | 값 |
| --- | ---: |
| baseline replicas | `-` |
| max desired replicas | `-` |
| HPA decision seconds from test start | `-` |
| HPA decision seconds from spike start | `-` |
| scale-out ready seconds from test start | `-` |
| ready after decision | `-` |

Post-run HPA snapshot: `horizontalpodautoscaler.autoscaling/ticket-service Deployment/ticket-service cpu: 54%/70% 1 4 1 77m`

## Stage Summary

| stage role | target RPS | max p95 ms | max p99 ms | max error | min checks | 해석 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | 20 | 15.2 | 24 | 0.00% | 100.00% | 판단 제외 / excluded |
| baseline | 40 | 9.3 | 20.7 | 0.00% | 100.00% | 안정 기준 / ok |
| spike | 60 | 9.9 | 20 | 0.00% | 100.00% | HPA decision 관찰 / ok |
| overload | 75 | 9.3 | 20.3 | 0.00% | 100.00% | 한계 후보 확인 / ok |
| cooldown | 40 | 9.6 | 20.1 | 0.00% | 100.00% | recovery 관찰 / ok |

## Stage Result

| stage role | step | target RPS | p95 ms | p99 ms | error | checks | status / reasons |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | ticket.issue | 20 | 15.2 | 24 | 0.00% | 100.00% | excluded |
| warmup | ticket.list | 20 | 6.7 | 18.9 | 0.00% | 100.00% | excluded |
| baseline | ticket.issue | 40 | 9.3 | 20.7 | 0.00% | 100.00% | ok |
| baseline | ticket.list | 40 | 6.3 | 19.9 | 0.00% | 100.00% | ok |
| spike | ticket.issue | 60 | 9.9 | 20 | 0.00% | 100.00% | ok |
| spike | ticket.list | 60 | 6 | 18.7 | 0.00% | 100.00% | ok |
| overload | ticket.issue | 75 | 9.3 | 20.2 | 0.00% | 100.00% | ok |
| overload | ticket.list | 75 | 6.4 | 20.3 | 0.00% | 100.00% | ok |
| cooldown | ticket.issue | 40 | 9.6 | 20.1 | 0.00% | 100.00% | ok |
| cooldown | ticket.list | 40 | 6.4 | 19 | 0.00% | 100.00% | ok |

Warmup은 판단에서 제외한다. 원본 보고서의 observed RPS 필드는 현재 `null`이라 이 문서에서는 preset target RPS로 비교했다.

## Limit And Recovery

| 항목 | 값 |
| --- | --- |
| first limit candidate | `none` |
| recovery observations | `ticket.issue ticket_cooldown_rps_40: p95 9.6ms, p99 20.1ms, error 0.00%, checks 100.00%, recovered=true`<br>`ticket.list ticket_cooldown_rps_40: p95 6.4ms, p99 19ms, error 0.00%, checks 100.00%, recovered=true` |
| cooldown quality | `recovered_or_stable` |

## Raw Result

- 원본 JSON: `loadtest-run-report.json`
- 서비스 JSON: `loadtest-run-report-service.json`
- k6 로그: `k6.log`
- HPA/Pod snapshot: `kubectl-get-hpa-A.txt`, `kubectl-get-hpa-pods.txt`
