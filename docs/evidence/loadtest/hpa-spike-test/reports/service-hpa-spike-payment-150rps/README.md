# Service HPA Spike payment 250RPS

## Summary

| 항목 | 값 |
| --- | --- |
| service | `payment-service` |
| scenario | `service-hpa-spike-load-test` |
| preset | `payment-250rps` |
| job | `read-api-loadtest-read-manual-20260621133024` |
| run id | `read-api-loadtest-read-manual-20260621133024-lr7tl` |
| job status | `Complete` |
| k6 status | `FAIL threshold exit 99` |
| CPU request | `1000m` |
| HPA target | `70%` |
| min / max replicas | `1 / 4` |
| overload target | `250 RPS` |
| report type | `service_hpa_spike` |
| 판단 | `HPA 정상 반응, 성능 기준은 FAIL` |

## Conclusion

payment-service HPA는 `payment-250rps` 실행에서 정상적으로 scale-out을 결정했다. report JSON 기준 baseline replicas는 `1`, max desired replicas는 `3`이었고, 테스트 시작 후 `88.011s`에 HPA decision이 기록됐으며 `99.794s`에 Ready replica가 따라왔다. decision 이후 Ready까지는 약 `11.783s`다.

다만 이 실행은 성능 기준으로는 실패다. HPA는 spike 구간이 아니라 baseline `120 RPS` 구간에서 이미 반응했고, 같은 구간에서 `POST /payments` p95가 `1041.8ms`, p99가 `1638.2ms`까지 올라 첫 limit candidate가 됐다. overload `250 RPS`에서는 p95/p99가 약 `10s`까지 치솟고 error rate가 `27.35%`, checks pass rate가 `72.73%`로 떨어졌다. cooldown `120 RPS`에서도 error rate가 `41.79%`로 더 나빠져 회복 판정은 실패다.

이번 결과는 `150 RPS`에서 scale-out 부하가 부족했던 이전 실행과 반대로, `250 RPS`가 HPA 반응을 확인하기에는 충분하지만 payment-service 처리 한계를 크게 넘는다는 점을 보여준다. 안정 구간을 찾으려면 다음 비교는 `120 RPS` 아래 또는 baseline을 더 낮춘 preset으로 좁히는 편이 맞다.

## 특이사항

- HPA 이벤트에는 `New size: 2`, `New size: 3` rescale이 남았고, run report도 `1 -> 3` scale-out을 기록했다.
- post-run snapshot은 scale-down 이후라 `1 current / 1 desired`, `cpu: 1%/70%`로 보인다. run 중 판단은 `loadtest-run-report-service.json`의 `service_hpa_results`를 기준으로 본다.
- k6 로그에는 overload/cooldown 말미에 `capacity_baseline.payment.create failed with status 0`가 반복된다. README에서는 원인을 확정하지 않고, k6 관측상 무응답/타임아웃성 실패가 크게 늘어난 것으로만 해석한다.
- 전체 k6 요약 기준 `http_req_failed`는 `12.49%`, checks pass rate는 `80.14%`, dropped iterations는 `5757`건이다.

## HPA Result

| 항목 | 값 |
| --- | ---: |
| baseline replicas | `1` |
| max desired replicas | `3` |
| HPA decision seconds from test start | `88.011` |
| HPA decision stage | `baseline` |
| scale-out ready seconds from test start | `99.794` |
| ready after decision | `11.783` |

Post-run HPA snapshot은 scale-down 이후 상태라 `1 current / 1 desired`로 보인다. 대신 `kubectl-describe-hpa-payment-service.txt` 이벤트에는 `New size: 2`와 `New size: 3`가 남아 있고, report JSON의 `service_hpa_results`가 run 중 scale-out 타이밍을 보존한다.

## Stage Summary

| stage role | target RPS | max p95 ms | max p99 ms | max error | min checks | 해석 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | 50 | 239.2 | 708.6 | 0.00% | 100.00% | 판단 제외 |
| baseline | 120 | 1041.8 | 1638.2 | 0.04% | 99.98% | baseline부터 latency SLO 초과 |
| spike | 200 | 2166.5 | 4480.8 | 0.69% | 99.31% | latency SLO 초과, error는 기준 이내 |
| overload | 250 | 10007.7 | 10059.7 | 27.35% | 72.73% | SLO/에러/체크 기준 초과 |
| cooldown | 120 | 10002.2 | 10036.7 | 41.79% | 58.91% | 회복 실패 |

Warmup은 판단에서 제외한다. 원본 보고서의 observed RPS 필드는 현재 `null`이라 이 문서에서는 preset target RPS로 비교했다.

## Stage Result

| stage role | step | target RPS | p95 ms | p99 ms | error | checks | status / reasons |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | payment.create | 50 | 239.2 | 708.6 | 0.00% | 100.00% | excluded |
| baseline | payment.create | 120 | 1041.8 | 1638.2 | 0.04% | 99.98% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| spike | payment.create | 200 | 2166.5 | 4480.8 | 0.69% | 99.31% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| overload | payment.create | 250 | 10007.7 | 10059.7 | 27.35% | 72.73% | limit_candidate (slo_p95_ms, slo_p99_ms, error_rate_threshold, checks_rate_threshold) |
| cooldown | payment.create | 120 | 10002.2 | 10036.7 | 41.79% | 58.91% | limit_candidate (slo_p95_ms, slo_p99_ms, error_rate_threshold, checks_rate_threshold) |

## Limit And Recovery

| 항목 | 값 |
| --- | --- |
| first limit candidate | `payment.create / payment_baseline_rps_120 / p95 1041.8ms / p99 1638.2ms` |
| recovery observations | `payment.create payment_cooldown_rps_120: p95 10002.2ms, p99 10036.7ms, error 41.79%, checks 58.91%, recovered=false` |
| cooldown quality | `not_recovered` |

## Raw Result

- 원본 JSON: `loadtest-run-report.json`
- 서비스 JSON: `loadtest-run-report-service.json`
- k6 요약 JSON: `summary.json`, `k6-summary.json`
- k6 로그: `k6.log`
- Job manifest/status: `read-job.yaml`, `read-job-name.txt`, `task-status.txt`, `run.log`
- HPA/Pod snapshot: `kubectl-get-hpa-A.txt`, `kubectl-get-hpa-pods.txt`
- HPA/Deployment describe: `kubectl-describe-hpa-payment-service.txt`, `kubectl-describe-deploy-payment-service.txt`
