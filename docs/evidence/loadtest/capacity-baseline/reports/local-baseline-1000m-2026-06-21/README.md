# local-baseline-1000m Capacity Baseline Result

## Source

| 항목 | 값 |
| --- | --- |
| raw final report | [loadtest-run-report-final.json](loadtest-run-report-final.json) |
| k6 summary | [k6-summary.json](k6-summary.json) |
| task log | [task-dev-loadtest.log](task-dev-loadtest.log) |
| initial failure log | [task-dev-loadtest-initial-failure.log](task-dev-loadtest-initial-failure.log) |
| loadtest_run_id | `read-api-loadtest-read-manual-20260621022731-bqbbw` |
| 실행 일시 | `2026-06-21T02:57:00Z` |
| scenario | `capacity-baseline-load-test` |
| preset | `local-baseline-1000m` |
| dataset_revision | `capacity-baseline-half-year-early-growth-v2` |
| run status | `FAIL` |

## Command

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
SCENARIO=capacity-baseline-load-test \
  PRESET=local-baseline-1000m \
  task dev:loadtest
```

## Execution Notes

이번 실행은 `task dev:loadtest`로 시작했지만, 로컬 Taskfile의 read Job 대기 루프가 1200초로 고정되어 있어 wrapper는 중간에 timeout됐다. Kubernetes Job 자체는 `activeDeadlineSeconds=3600`으로 계속 실행됐고, 별도 `kubectl wait`로 완료까지 확인했다.

Kong rate limit은 task wrapper timeout 시 한 번 기본값으로 복구될 수 있어, Job 완료 전까지 watcher로 `minute=1000000`을 유지했다. Job 완료 후에는 `minute=120`, `policy=local`로 복구된 것을 확인했다.

첫 dataset setup은 `tickets.id` NOT NULL 제약 때문에 실패했다. `platform/loadtest/scripts/setup_capacity_baseline_dataset.py`에서 ticket seed row에 deterministic `id`를 넣도록 보정한 뒤 재실행했고, dataset setup은 완료됐다.

## Overall Result

전체 run은 `FAIL`이다. 실패 원인은 CPU request 부족 하나로 보기 어렵다. concert, reservation, ticket 구간에서 latency와 error rate threshold가 깨졌고, 특히 concert는 실행 중 `QueuePool limit of size 5 overflow 0 reached` 로그가 확인되어 DB connection pool 고갈이 우선 후보로 보인다.

## Capacity Candidates

| 서비스 | 최대 유효 RPS | 기준 step | p95 | p99 | error rate | CPU avg | CPU request 후보 | 판단 |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| auth-service | 40 | `auth_rps_40` | 71.6ms | 545.1ms | 0.00% | 1526.2m | 2181m | p95는 통과, p99 global threshold 재확인 필요 |
| concert-service | 20 | `concert_rps_20` | 55.7ms max | 85.6ms max | 0.00% | 282.1m | 404m | 40 RPS부터 pool/timeout성 실패 |
| reservation-service | 20 | `reservation_rps_20` | 13.9ms | 28.7ms | 0.00% | 108.6m | 156m | 40 RPS부터 timeout성 실패 |
| payment-service | 40 | `payment_rps_40` | 41.1ms | 90.1ms | 0.00% | 344.0m | 492m | 이번 범위에서는 안정적 |
| ticket-service | 10 | `ticket_rps_10` | 16.8ms issue / 13.2ms list | 40.9ms max | 0.00% | 104.9m | 150m | issue가 20 RPS부터 실패 |
| notification-service | 320 | `notification_rps_320` | 48.5ms | 92.3ms | 0.00% | 595.2m | 851m | 이번 범위에서는 안정적 |

## Failure Points

| 서비스 | 실패 시작 | 대표 증상 | 해석 |
| --- | ---: | --- | --- |
| concert-service | 40 RPS | recommended p95 약 10s, error rate 92.3% | CPU보다 DB connection pool 고갈 또는 session 반환 지연 후보가 큼 |
| reservation-service | 40 RPS | create p95 약 10s, error rate 76.7% | 요청 timeout/status 0이 주 증상이라 DB lock, connection, downstream 지연 확인 필요 |
| ticket-service | 20 RPS | issue p95 약 10s, error rate 25.3% | issue path 병목이 먼저 깨지고 list는 상대적으로 늦게 영향 |
| auth-service | 40 RPS | p99 545.1ms | p95/SLO는 통과했지만 global p99 threshold 300ms는 초과 |

## Decision

CPU request 후보는 실패 구간이 아니라 각 서비스의 최대 유효 구간 기준으로만 해석한다. 이 기준이면 `auth 2181m`, `concert 404m`, `reservation 156m`, `payment 492m`, `ticket 150m`, `notification 851m`가 산출된다.

다만 concert, reservation, ticket은 더 높은 RPS에서 CPU가 충분히 높아지기 전에 timeout과 error가 먼저 발생했다. 따라서 이 세 서비스는 CPU request 상향보다 connection pool, DB query, transaction/session lifecycle을 먼저 확인해야 한다.

## Follow-up

1. `task dev:loadtest`의 read Job wait deadline을 `manualRuns.read.activeDeadlineSeconds`와 맞춘다.
2. concert-service `GET /concerts/recommended`의 SQLAlchemy pool 설정과 session 반환 경로를 먼저 확인한다.
3. reservation-service 40 RPS 이상에서 status 0이 나는 원인을 service log, DB lock, Kong upstream timeout 순서로 분리한다.
4. ticket-service는 `POST /tickets/issue`를 10, 20 RPS steady 조건으로 재실행해 issue path 병목을 좁힌다.
