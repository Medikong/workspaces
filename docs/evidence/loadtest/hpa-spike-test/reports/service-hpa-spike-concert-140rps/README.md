# Service HPA Spike concert 140RPS

## Summary

| 항목 | 값 |
| --- | --- |
| service | `concert-service` |
| scenario | `service-hpa-spike-load-test` |
| preset | `concert-140rps` |
| job | `read-api-loadtest-read-manual-20260621121910` |
| run id | `read-api-loadtest-read-manual-20260621121910-8crjb` |
| job status | `Complete` |
| k6 status | `FAIL threshold exit 99` |
| CPU request | `1000m` |
| HPA target | `70%` |
| min / max replicas | `1 / 4` |
| overload target | `140 RPS` |
| report type | `service_hpa_spike` |
| 판단 | `HPA 정상 반응, 성능 기준은 FAIL` |

## Conclusion

concert-service HPA는 이번 `concert-140rps` 재실험에서 정상적으로 반응했다. report JSON 기준 baseline replicas는 `2`, max desired replicas는 `4`였고, 테스트 시작 후 `215.764s`에 HPA decision이 기록됐으며 `227.820s`에 Ready replica가 따라왔다. decision 이후 Ready까지는 약 `12.056s`다.

다만 이 실행은 `1 -> 4` 검증이 아니라 `2 -> 4` scale-out 검증이다. 시작 baseline이 이미 `2`였으므로 minReplicas 1에서 최초 증설되는 시간은 별도로 판정하지 않는다. 그리고 k6는 threshold exit `99`로 끝났다. 첫 limit candidate가 baseline 80 RPS의 `concert.detail`에서 이미 발생했고, overload 140 RPS에서는 `concert.calendar`가 p95/p99와 error/check 기준을 함께 넘었다.

추가 trace 확인 결과, 실패의 직접 원인은 `concert-db` PostgreSQL connection 한계 초과다. 대표 실패 trace에서 `GET /concerts/{id}/calendar`가 500으로 끝났고, 내부 `connect` span이 `FATAL: sorry, too many clients already`를 기록했다. 자세한 원인 자료는 `root-cause-analysis.md`에 정리했다.

## HPA Result

| 항목 | 값 |
| --- | ---: |
| baseline replicas | `2` |
| max desired replicas | `4` |
| HPA decision seconds from test start | `215.764` |
| scale-out ready seconds from test start | `227.820` |
| ready after decision | `12.056` |

Post-run HPA snapshot은 scale-down 이후 상태라 `1 / 1 desired`로 보인다. 대신 `kubectl-describe-hpa-concert-service.txt` 이벤트에는 `New size: 4; reason: cpu resource utilization (percentage of request) above target`가 남아 있고, report JSON의 `service_hpa_results`가 run 중 scale-out 타이밍을 보존한다.

## Stage Summary

| stage role | target RPS | max p95 ms | max p99 ms | max error | min checks | 해석 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | 20 | 109.5 | 427.0 | 0.00% | 100.00% | 판단 제외 |
| baseline | 80 | 458.2 | 1092.6 | 0.00% | 100.00% | 80 RPS부터 일부 SLO 초과 |
| spike | 120 | 677.4 | 1552.4 | 0.00% | 100.00% | HPA 결정 전 지연 확대 |
| overload | 140 | 2731.6 | 5001.3 | 2.26% | 98.87% | SLO/에러/체크 기준 초과 |
| cooldown | 80 | 795.3 | 1311.9 | 1.00% | 99.00% | 부분 회복, 완전 회복 아님 |

Warmup은 판단에서 제외한다. 원본 보고서의 observed RPS 필드는 현재 `null`이라 이 문서에서는 preset target RPS로 비교했다.

## Stage Result

| stage role | step | target RPS | p95 ms | p99 ms | error | checks | status / reasons |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| warmup | concert.recommended | 20 | 23.9 | 100.5 | 0.00% | 100.00% | excluded |
| warmup | concert.detail | 20 | 101.0 | 427.0 | 0.00% | 100.00% | excluded |
| warmup | concert.calendar | 20 | 20.6 | 61.5 | 0.00% | 100.00% | excluded |
| warmup | concert.date_performances | 20 | 16.2 | 47.1 | 0.00% | 100.00% | excluded |
| warmup | concert.seat_map | 20 | 109.5 | 189.0 | 0.00% | 100.00% | excluded |
| baseline | concert.recommended | 80 | 51.6 | 214.3 | 0.00% | 100.00% | ok |
| baseline | concert.detail | 80 | 182.4 | 716.3 | 0.00% | 100.00% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| baseline | concert.calendar | 80 | 106.7 | 289.3 | 0.00% | 100.00% | limit_candidate (slo_p95_ms) |
| baseline | concert.date_performances | 80 | 37.0 | 153.6 | 0.00% | 100.00% | ok |
| baseline | concert.seat_map | 80 | 458.2 | 1092.6 | 0.00% | 100.00% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| spike | concert.recommended | 120 | 224.0 | 626.2 | 0.00% | 100.00% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| spike | concert.detail | 120 | 677.4 | 1552.4 | 0.00% | 100.00% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| spike | concert.calendar | 120 | 146.9 | 535.1 | 0.00% | 100.00% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| spike | concert.date_performances | 120 | 94.4 | 245.7 | 0.00% | 100.00% | limit_candidate (slo_p95_ms) |
| spike | concert.seat_map | 120 | 364.6 | 725.0 | 0.00% | 100.00% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| overload | concert.recommended | 140 | 2593.6 | 3890.2 | 0.00% | 100.00% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| overload | concert.detail | 140 | 527.9 | 1579.8 | 0.40% | 99.80% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| overload | concert.calendar | 140 | 2731.6 | 5001.3 | 2.26% | 98.87% | limit_candidate (slo_p95_ms, slo_p99_ms, error_rate_threshold, checks_rate_threshold) |
| overload | concert.date_performances | 140 | 122.8 | 710.8 | 0.01% | 99.99% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| overload | concert.seat_map | 140 | 436.1 | 1268.7 | 0.00% | 100.00% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| cooldown | concert.recommended | 80 | 451.4 | 888.7 | 0.00% | 100.00% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| cooldown | concert.detail | 80 | 795.3 | 1311.9 | 0.03% | 99.98% | limit_candidate (slo_p95_ms, slo_p99_ms) |
| cooldown | concert.calendar | 80 | 42.7 | 133.5 | 0.00% | 100.00% | ok |
| cooldown | concert.date_performances | 80 | 27.6 | 320.3 | 1.00% | 99.00% | limit_candidate (slo_p99_ms) |
| cooldown | concert.seat_map | 80 | 98.2 | 425.1 | 0.00% | 100.00% | limit_candidate (slo_p99_ms) |

## Limit And Recovery

| 항목 | 값 |
| --- | --- |
| first limit candidate | `concert.detail / concert_detail_baseline_rps_80 / p95 182.4ms / p99 716.3ms` |
| recovery observations | `concert.recommended concert_recommended_cooldown_rps_80: p95 451.4ms, p99 888.7ms, error 0.00%, checks 100.00%, recovered=false`<br>`concert.detail concert_detail_cooldown_rps_80: p95 795.3ms, p99 1311.9ms, error 0.03%, checks 99.98%, recovered=false`<br>`concert.calendar concert_calendar_cooldown_rps_80: p95 42.7ms, p99 133.5ms, error 0.00%, checks 100.00%, recovered=true`<br>`concert.date_performances concert_date_performances_cooldown_rps_80: p95 27.6ms, p99 320.3ms, error 1.00%, checks 99.00%, recovered=false`<br>`concert.seat_map concert_seat_map_cooldown_rps_80: p95 98.2ms, p99 425.1ms, error 0.00%, checks 100.00%, recovered=false` |
| cooldown quality | `partial_recovery_only` |

## Raw Result

- 원본 JSON: `loadtest-run-report.json`
- 서비스 JSON: `loadtest-run-report-service.json`
- 요약 JSON: `summary.json`
- k6 로그: `k6.log`
- Job manifest/status: `read-job.yaml`, `task-status.txt`
- HPA/Pod snapshot: `kubectl-get-hpa-A.txt`, `kubectl-get-hpa-pods.txt`
- HPA/Deployment describe: `kubectl-describe-hpa-concert-service.txt`, `kubectl-describe-deploy-concert-service.txt`
- 원인 분석: `root-cause-analysis.md`
- Trace/Loki/Prometheus 자료: `root-cause-evidence/`
