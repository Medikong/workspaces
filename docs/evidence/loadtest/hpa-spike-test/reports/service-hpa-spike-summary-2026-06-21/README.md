# Service HPA Spike Summary 2026-06-21

## Summary

서비스별 `service-hpa-spike-load-test`를 한 번에 하나의 preset만 실행했다. 기준은 모든 서비스 `1000m`, HPA target `70%`, min/max replicas `1/4`다.

| service | preset | k6 | HPA | decision after spike s | ready after decision s | cooldown | 판단 | first limit |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- |
| auth-service | auth-30rps | FAIL | 1 -> 2 | 28.4 | 11.4 | 회복/안정 | HPA 유효 | auth_spike_rps_25 p99 810.8ms |
| concert-service | concert-140rps | FAIL | 2 -> 4 | 125.8 | 12.1 | 부분 회복 | HPA 유효 / SLO FAIL | concert_detail_baseline_rps_80 p95 182.4ms |
| reservation-service | reservation-140rps | PASS | 1 -> 2 | 127.7 | 12.1 | 회복/안정 | HPA 유효 | none |
| payment-service | payment-150rps | PASS | 1 -> 1 | - | - | 회복/안정 | RPS 부족 | none |
| ticket-service | ticket-75rps | PASS | - | - | - | 회복/안정 | RPS 부족 | none |
| notification-service | notification-400rps | FAIL | 1 -> 2 | 58.6 | 11.9 | 회복/안정 | HPA 유효 | notification_spike_rps_320 p99 341.7ms |

## Conclusion

- `auth-service`, `concert-service`, `reservation-service`, `notification-service`는 이번 RPS에서 HPA가 상승했다. CPU 기반 HPA 반응은 유효하다.
- `payment-service`, `ticket-service`는 post-run CPU가 각각 42%, 54% 수준이라 `1000m` 기준 CPU 70%를 넘기지 못했다. 현재 RPS는 scale-out 유발 부하가 아니다.
- `concert-service`는 재실험에서 baseline `2` replicas에서 max desired `4`까지 상승했다. 다만 baseline 80 RPS부터 `concert.detail`, `concert.calendar`, `concert.seat_map`이 SLO를 넘었고 cooldown도 부분 회복에 그쳤으므로 성능 결과는 FAIL이다. 추가 trace 확인 결과 직접 원인은 `concert-db` connection exhaustion, 즉 `FATAL: sorry, too many clients already`다.
- k6 FAIL은 `auth-30rps`, `concert-140rps`, `notification-400rps`에서 threshold 후보가 발생했기 때문이다. concert는 overload 140 RPS에서 `concert.calendar` error/checks 기준까지 넘었다.

## Next Experiments

| service | 판단 | 다음 조정 |
| --- | --- | --- |
| auth-service | HPA 유효 | 같은 조건에서 duration을 늘려 decision/ready와 p99 회복을 재검증한다. |
| concert-service | HPA 유효 / DB connection exhaustion | `UVICORN_WORKERS`, SQLAlchemy pool, HPA max replica, `concert-db max_connections`를 하나의 connection budget으로 다시 산정한다. |
| reservation-service | HPA 유효 | 같은 조건에서 duration을 늘려 decision/ready와 p99 회복을 재검증한다. |
| payment-service | RPS 부족 | overload RPS 또는 overload duration을 올려 CPU 70% 유지 구간을 만든다. |
| ticket-service | RPS 부족 | overload RPS 또는 overload duration을 올려 CPU 70% 유지 구간을 만든다. |
| notification-service | HPA 유효 | 같은 조건에서 duration을 늘려 decision/ready와 p99 회복을 재검증한다. |

## Raw Result Paths

- `auth-30rps`: `reports/service-hpa-spike-auth-30rps/loadtest-run-report.json`, `reports/service-hpa-spike-auth-30rps/README.md`
- `concert-140rps`: `reports/service-hpa-spike-concert-140rps/loadtest-run-report.json`, `reports/service-hpa-spike-concert-140rps/README.md`
- `reservation-140rps`: `reports/service-hpa-spike-reservation-140rps/loadtest-run-report.json`, `reports/service-hpa-spike-reservation-140rps/README.md`
- `payment-150rps`: `reports/service-hpa-spike-payment-150rps/loadtest-run-report.json`, `reports/service-hpa-spike-payment-150rps/README.md`
- `ticket-75rps`: `reports/service-hpa-spike-ticket-75rps/loadtest-run-report.json`, `reports/service-hpa-spike-ticket-75rps/README.md`
- `notification-400rps`: `reports/service-hpa-spike-notification-400rps/loadtest-run-report.json`, `reports/service-hpa-spike-notification-400rps/README.md`

## 특이사항

- `auth`, `concert`, `reservation`, `notification`은 HPA 유효로 판단했다.
- `payment`, `ticket`은 RPS 부족으로 판단했고 retry preset을 각각 `payment-250rps`, `ticket-110rps`로 추가했다.
- `concert`는 baseline이 이미 2 replicas였지만 이번 재실험에서 `2 -> 4` scale-out과 Ready 도달을 확인했다.
- `concert` 실패 trace 16개 모두 `concert-db` 접속에서 `too many clients already`를 포함했다. 상세 자료는 `reports/service-hpa-spike-concert-140rps/root-cause-analysis.md`에 둔다.


# 그다음 수행할 실험

```
SCENARIO=service-hpa-spike-load-test PRESET=payment-250rps task --dir /Users/danghamo/Documents/gituhb/medikong/gitops dev:loadtest
SCENARIO=service-hpa-spike-load-test PRESET=ticket-110rps task --dir /Users/danghamo/Documents/gituhb/medikong/gitops dev:loadtest
```

# 실험별 시간 구간

| preset | start | end |
| --- | --- | --- |
| `auth-30rps` | `2026-06-21T09:24:03.619Z` | `2026-06-21T09:28:33Z` |
| `concert-140rps` | `2026-06-21T12:19:15.412Z` | `2026-06-21T12:42:45.646Z` |
| `reservation-140rps` | `2026-06-21T10:13:01.542Z` | `2026-06-21T10:17:41.136Z` |
| `payment-250rps` | `2026-06-21T10:20:41.313Z` | `2026-06-21T10:25:20.941Z` |
| `ticket-110rps` | `2026-06-21T10:28:15.069Z` | `2026-06-21T10:32:54.792Z` |
| `notification-400rps` | `2026-06-21T10:35:55.885Z` | `2026-06-21T10:40:36Z` |
