# Service HPA Spike reservation 140RPS

## Summary

| 항목 | 값 |
| --- | --- |
| service | `reservation-service` |
| scenario | `service-hpa-spike-load-test` |
| preset | `reservation-140rps` |
| run id | `read-api-loadtest-read-manual-20260621101259-5vcqs` |
| k6 status | `PASS` |
| CPU request | `1000m` |
| HPA target | `70%` |
| min / max replicas | `1 / 4` |
| overload target | `140 RPS` |
| report type | `service_hpa_spike` |
| 판단 | `HPA 유효` |

## Conclusion

reservation-service는 `1000m`, HPA target `70%`, `140 RPS` 조건에서 HPA가 `1 -> 2`로 상승했다. HPA decision은 spike 시작 후 127.7초, 새 Pod Ready는 decision 후 12.1초였다. scale-out 전 명확한 latency/error 한계 후보는 없었지만, cooldown에서는 error/checks가 정상으로 유지됐다. 따라서 reservation은 현재 RPS 기준에서 CPU 기반 HPA가 유효하다.

## 특이사항

- HPA는 `1 -> 2`로 상승했지만 decision이 spike 시작 후 `127.7s`로 비교적 늦게 나왔다.
- k6는 PASS이고 first limit candidate는 없어서, 이번 RPS에서는 품질 저하보다 scale-out 지연 시간 관찰이 핵심이다.
- 긴 duration 재검증에서는 decision 전후 p95/p99 차이와 Ready 이후 안정성을 더 길게 봐야 한다.

## HPA Result

| 항목 | 값 |
| --- | ---: |
| baseline replicas | `1` |
| max desired replicas | `2` |
| HPA decision seconds from test start | `217.7` |
| HPA decision seconds from spike start | `127.7` |
| scale-out ready seconds from test start | `229.9` |
| ready after decision | `12.1` |

Post-run HPA snapshot: `horizontalpodautoscaler.autoscaling/reservation-service Deployment/reservation-service cpu: 32%/70% 1 4 2 62m`

## Stage Summary

| stage role | target RPS | max p95 ms | max p99 ms | max error | min checks | 해석 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | 20 | 17.6 | 30.7 | 0.00% | 100.00% | 판단 제외 / excluded |
| baseline | 80 | 10.3 | 23.7 | 0.00% | 100.00% | 안정 기준 / ok |
| spike | 120 | 12.7 | 26 | 0.00% | 100.00% | HPA decision 관찰 / ok |
| overload | 140 | 20.3 | 33.1 | 0.00% | 100.00% | 한계 후보 확인 / ok |
| cooldown | 80 | 13.8 | 27.6 | 0.00% | 100.00% | recovery 관찰 / ok |

## Stage Result

| stage role | step | target RPS | p95 ms | p99 ms | error | checks | status / reasons |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | reservation.create | 20 | 17.6 | 30.7 | 0.00% | 100.00% | excluded |
| baseline | reservation.create | 80 | 10.3 | 23.7 | 0.00% | 100.00% | ok |
| spike | reservation.create | 120 | 12.7 | 26 | 0.00% | 100.00% | ok |
| overload | reservation.create | 140 | 20.3 | 33.1 | 0.00% | 100.00% | ok |
| cooldown | reservation.create | 80 | 13.8 | 27.6 | 0.00% | 100.00% | ok |

Warmup은 판단에서 제외한다. 원본 보고서의 observed RPS 필드는 현재 `null`이라 이 문서에서는 preset target RPS로 비교했다.

## Limit And Recovery

| 항목 | 값 |
| --- | --- |
| first limit candidate | `none` |
| recovery observations | `reservation.create reservation_cooldown_rps_80: p95 13.8ms, p99 27.6ms, error 0.00%, checks 100.00%, recovered=true` |
| cooldown quality | `recovered_or_stable` |

## Raw Result

- 원본 JSON: `loadtest-run-report.json`
- 서비스 JSON: `loadtest-run-report-service.json`
- k6 로그: `k6.log`
- HPA/Pod snapshot: `kubectl-get-hpa-A.txt`, `kubectl-get-hpa-pods.txt`
