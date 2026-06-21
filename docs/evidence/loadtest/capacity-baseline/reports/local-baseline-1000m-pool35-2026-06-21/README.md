# local-baseline-1000m Capacity Baseline Result - pool35

## Source

| 항목 | 값 |
| --- | --- |
| raw final report | [loadtest-run-report-final.json](loadtest-run-report-final.json) |
| k6 summary | [k6-summary.json](k6-summary.json) |
| task log | [task-dev-loadtest.log](task-dev-loadtest.log) |
| k6 job log | [k6-job.log](k6-job.log) |
| concert pod describe | [concert-service-pod-describe.txt](concert-service-pod-describe.txt) |
| concert previous log | [concert-service-previous.log](concert-service-previous.log) |
| DB pool follow-up | [db-pool-followup-after-pool35.md](db-pool-followup-after-pool35.md) |
| loadtest_run_id | `read-api-loadtest-read-manual-20260621034910-ptc4c` |
| 실행 완료 | `2026-06-21T04:18:41Z` |
| scenario | `capacity-baseline-load-test` |
| preset | `local-baseline-1000m` |
| dataset_revision | `capacity-baseline-half-year-early-growth-v2` |
| run status | `FAIL` |

## Changed Condition

`gitops/charts/medikong-service/values.yaml`의 SQLAlchemy 기본값을 서비스 공통 기본값으로 상향했다.

```yaml
database:
  sqlalchemy:
    poolSize: 35
    maxOverflow: 20
    poolTimeoutSeconds: 15
    poolRecycleSeconds: 1800
```

배포 후 auth, concert, reservation, payment, ticket, notification Pod에서 `SQLALCHEMY_POOL_SIZE=35`, `SQLALCHEMY_MAX_OVERFLOW=20`, `SQLALCHEMY_POOL_TIMEOUT_SECONDS=15`가 적용된 것을 확인했다. CPU 조건은 기존과 같이 `request=1000m`, CPU limit 없음, HPA disabled, replica 1개다.

## Command

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
SCENARIO=capacity-baseline-load-test \
  PRESET=local-baseline-1000m \
  LOADTEST_KONG_RATE_LIMIT_DEFAULT_MINUTE=1000000 \
  task dev:loadtest
```

로컬 `task dev:loadtest` wrapper는 read Job 대기 시간이 1200초라서 중간에 timeout됐다. Kubernetes Job은 계속 실행됐고, `kubectl wait`로 complete 상태를 확인한 뒤 archive PVC의 JSON 결과를 이 폴더에 보관했다. Job 완료 후 Kong rate limit은 `minute=120`, `policy=local`로 복구했다.

## Overall Result

전체 run은 `FAIL`이다. 다만 pool 기본값 상향 전과 비교하면 reservation-service와 ticket-service의 병목은 크게 늦춰졌다.

반대로 concert-service는 여전히 `concert_rps_40`부터 실패한다. 특히 이번에는 pool capacity가 서비스당 최대 55개가 되었는데도 `QueuePool limit of size 35 overflow 20 reached` 로그가 반복됐고, concert Pod가 liveness/readiness timeout 뒤 재시작됐다. 따라서 concert 실패는 단순히 "기본 pool 5가 너무 작다"를 넘어, 단일 replica에서 request worker, DB session, health probe가 같은 자원 경쟁에 들어간 문제로 보는 편이 맞다.

## Capacity Candidates

| 서비스 | 최대 유효 RPS | 기준 step | p95 | p99 | error rate | CPU avg | CPU request 후보 | 판단 |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| auth-service | 40 | `auth_rps_40` | 58.0ms | 71.8ms | 0.00% | 1439.3m | 2057m | 안정적 |
| concert-service | 20 | `concert_rps_20` | 43.3ms max | 53.3ms max | 0.00% | 306.4m | 438m | 40 RPS부터 pool/threadpool 포화 및 Pod restart |
| reservation-service | 80 | `reservation_rps_80` | 14.5ms | 35.3ms | 0.00% | 317.4m | 454m | pool 상향 후 20 -> 80 RPS로 개선 |
| payment-service | 40 | `payment_rps_40` | 7.1ms | 44.5ms | 0.00% | 144.4m | 207m | 안정적 |
| ticket-service | 60 | `ticket_rps_60` | 25.1ms max | 92.8ms max | 0.00% | 506.9m | 725m | pool 상향 후 10 -> 60 RPS로 개선 |
| notification-service | 240 | `notification_rps_240` | 38.5ms | 97.0ms | 0.00% | 385.5m | 551m | 320 RPS는 p95 SLO만 초과 |

## Failure Points

| 서비스 | 실패 시작 | 대표 증상 | 해석 |
| --- | ---: | --- | --- |
| concert-service | 40 RPS | recommended p95 약 10s, error rate 34.53% | pool을 35/20/15s로 키워도 DB checkout 대기가 남음 |
| concert-service | 80 RPS | recommended error rate 100% | 첫 API 실패로 후속 API 호출도 의미 있게 줄어듦 |
| concert-service | 120 RPS | 모든 주요 API p95 약 10s | 서비스 전체가 timeout 상태에 가까워짐 |
| reservation-service | 120 RPS | create p95 412.1ms, error rate 0% | pool timeout은 사라졌고 SLO 기준만 초과 |
| notification-service | 320 RPS | list p95 88.1ms, error rate 0% | availability 실패가 아니라 latency threshold 초과 |

## Comparison

| 서비스 | 이전 최대 유효 RPS | pool35 최대 유효 RPS | 변화 |
| --- | ---: | ---: | --- |
| auth-service | 40 | 40 | 유지 |
| concert-service | 20 | 20 | 유지, 단 원인이 더 명확해짐 |
| reservation-service | 20 | 80 | 개선 |
| payment-service | 40 | 40 | 유지 |
| ticket-service | 10 | 60 | 개선 |
| notification-service | 320 | 240 | 320 RPS에서 p95 88ms로 SLO만 초과 |

## Decision

이번 실행으로 기본 pool `5/0/5s`가 reservation/ticket의 1차 병목이었다는 점은 확인됐다. pool을 `35/20/15s`로 키우자 두 서비스는 timeout/error 없이 더 높은 RPS까지 올라갔다.

concert-service는 다른 결론이다. pool capacity 55개에서도 같은 종류의 pool timeout이 반복되고, health probe까지 1초 안에 응답하지 못해 Pod restart가 발생했다. 따라서 concert-service의 CPU request 후보는 `concert_rps_20` 기준 `438m`만 보수적으로 사용할 수 있고, `concert_rps_40` 이상은 CPU 산출 근거에서 제외해야 한다.

## Follow-up

1. concert-service는 pool을 더 키우는 대신 API별 단독 부하를 먼저 재실행한다.
2. `GET /concerts/recommended`, calendar, date performances, seat map의 DB query count, query latency, pool checkout wait를 분리해 계측한다.
3. concert-service health endpoint가 DB pool이나 request worker 포화에 같이 밀리는지 확인한다.
4. capacity baseline의 concert iteration은 service RPS 1회가 API 5개를 호출하므로, CPU baseline용 결과와 사용자 여정 부하 결과를 분리한다.
5. `task dev:loadtest`의 read Job wait deadline을 실제 scenario duration과 맞춘다.
