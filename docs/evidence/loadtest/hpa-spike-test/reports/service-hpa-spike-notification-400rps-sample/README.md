# Service HPA Spike Notification 400 RPS Sample

## Summary

| 항목 | 값 |
| --- | --- |
| service | `notification-service` |
| scenario | `service-hpa-spike-load-test` |
| preset | `notification-400rps` |
| CPU request | `1000m` |
| HPA target | `70%` |
| min / max replicas | `1 / 4` |
| overload target | `400 RPS` |
| report type | `service_hpa_spike` |

이 보고서는 실제 실행 결과가 아니라, 서비스별 HPA spike 결과를 정리할 때 사용할 샘플이다. 실행 후 `loadtest-run-report.json`의 `scenario_report` 값을 기준으로 `N초`, `M초`, p95/p99/error/checks 값을 채운다.

## Conclusion

`notification-service`는 `1000m`, HPA target `70%`, `400 RPS` overload에서 HPA가 `1 -> 2`로 상승했다.

HPA decision은 spike 시작 후 `N초`, 새 Pod Ready는 decision 후 `M초`였다. scale-out 전 p95/p99는 악화됐고, Ready 이후 error/checks가 회복됐다.

따라서 notification은 현재 RPS 기준에서 CPU 기반 HPA가 유효하다. 운영 관점에서는 `400 RPS` 구간에서 Pod 증설이 실제 품질 회복으로 이어졌는지까지 확인한 뒤, 같은 조건을 더 긴 duration으로 재검증한다.

## Alternative Conclusion

HPA가 발생하지 않았다면 `400 RPS`는 `1000m` 기준 CPU 70%를 넘기지 못한 것이다.

이 경우 결론은 실패가 아니라 "현재 부하는 scale-out 유발 부하가 아니다"에 가깝다. 다음 실험에서는 overload target을 올리거나 duration을 늘려서 HPA decision이 나올 만큼 CPU 사용률이 유지되는지 확인한다.

## 특이사항

- 이 파일은 실제 실행 결과가 아니라 서비스별 HPA spike 보고서 작성 샘플이다.
- 실제 실행 결과는 각 서비스 디렉터리의 `README.md`와 `loadtest-run-report.json`을 기준으로 본다.

## HPA Result

| 항목 | 값 |
| --- | ---: |
| baseline replicas | `1` |
| max desired replicas | `2` |
| HPA decision seconds | `N` |
| scale-out ready seconds | `N + M` |
| ready after decision | `M` |

`HPA decision seconds`는 테스트 시작 후 HPA가 baseline보다 큰 desired replica를 처음 결정하기까지 걸린 시간이다. `ready after decision`은 HPA decision 이후 새 Pod가 Ready 상태가 되기까지 걸린 시간이다.

## Stage Result

| stage role | target | p95 | p99 | error | checks | 해석 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | `40 RPS` | `-` | `-` | `-` | `-` | 판단 제외 |
| baseline | `240 RPS` | `-` | `-` | `-` | `-` | 안정 기준 |
| spike | `320 RPS` | `-` | `-` | `-` | `-` | HPA decision 관찰 |
| overload | `400 RPS` | `-` | `-` | `-` | `-` | 한계 후보 확인 |
| cooldown | `240 RPS` | `-` | `-` | `-` | `-` | recovery 관찰 |

warmup은 판단에서 제외한다. cooldown은 scale-down 확정 구간이 아니라, scale-out 이후 품질이 회복되는지 보는 구간이다.

## Decision Guide

| 관측 | 결론 |
| --- | --- |
| HPA `1 -> 2+`, Ready 이후 latency/error 회복 | CPU 기반 HPA 유효 |
| HPA `1 -> 2+`, Ready 이후에도 latency/error 미회복 | scale-out은 됐지만 병목은 CPU 외부일 가능성 |
| HPA 미발생, CPU 70% 미만 | RPS 또는 duration 부족 |
| HPA 미발생, CPU 70% 이상 유지 | metrics-server/HPA scrape/target 설정 확인 |
| HPA 발생 전 error 급증 | DB pool, lock, downstream, runner VU 부족을 먼저 확인 |

## Raw Result

실제 실행 후 원본 결과는 같은 폴더의 `loadtest-run-report.json`에 저장한다.
