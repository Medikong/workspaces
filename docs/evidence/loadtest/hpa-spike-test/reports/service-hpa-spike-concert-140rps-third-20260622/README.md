# Service HPA Spike concert 140RPS - third run

## Summary

| 항목 | 값 |
| --- | --- |
| service | `concert-service` |
| scenario | `service-hpa-spike-load-test` |
| preset | `concert-140rps` |
| command | `SCENARIO=service-hpa-spike-load-test PRESET=concert-140rps LOADTEST_READ_JOB_WAIT_SECONDS=3600 task --dir gitops dev:loadtest` |
| dataset job | `read-api-loadtest-dataset-manual-20260621160659` |
| read job | `read-api-loadtest-read-manual-20260621160921` |
| run id | `read-api-loadtest-read-manual-20260621160921-fhfxw` |
| job status | `Succeeded`, pod exit code `0` |
| k6 report status | `FAIL` |
| environment | `local-hpa-spike` |
| SQLAlchemy pool | `poolSize=15`, `maxOverflow=0`, `poolTimeoutSeconds=15`, `poolRecycleSeconds=1800` |
| Uvicorn workers | `2` |
| HPA min / max | `1 / 4` |
| observed scale-out | `1 -> 2 -> 3 -> 4` |
| run result archive | `report-archive/read-api-loadtest-read-manual-20260621160921-fhfxw/` |
| 판단 | `HPA scale-out은 성공, PostgreSQL too many clients는 미재발, SQLAlchemy QueuePool timeout은 재발` |

## Conclusion

세 번째 `concert-140rps` 실행은 클러스터와 `notification-service-background` 문제를 정리한 뒤 다시 수행한 검증이다. 이번에는 `run_result`와 archive가 확보됐다. read job은 Kubernetes Job 기준 `Succeeded`로 끝났고, `k6-summary.json`, `loadtest-run-report-final.json`, `loadtest-run-report-concert-service.json`가 PVC archive에 남았다.

HPA는 정상적으로 반응했다. report 기준 `baseline_replicas=1`, `max_desired_replicas=4`, `hpa_decision_seconds=57.818`, `scale_out_ready_seconds=71.969`로 기록됐다. live 관측과 HPA 이벤트에서도 `1 -> 2 -> 3 -> 4` scale-out을 확인했다.

다만 테스트 결과는 `FAIL`이다. 첫 번째 원인이었던 PostgreSQL `too many clients already`는 이번 로그에서 확인되지 않았다. 대신 SQLAlchemy `QueuePool limit of size 15 overflow 0 reached, connection timed out, timeout 15.00`가 재발했다. 즉 이번 실패는 DB 서버의 `max_connections` 초과가 아니라, 현재 `poolSize=15`, `maxOverflow=0` 예산에서 endpoint 처리 지연과 동시 요청이 겹치며 애플리케이션 worker별 pool checkout 대기가 터진 것으로 본다.

## HPA Result

| 항목 | 값 |
| --- | ---: |
| initial replicas | `1` |
| max desired replicas | `4` |
| HPA max replicas | `4` |
| HPA decision seconds | `57.818s` |
| scale-out ready seconds | `71.969s` |
| scale-out sequence | `1 -> 2 -> 3 -> 4` |
| post-run HPA CPU | `2%/70%` |
| post-run pod restarts | `3 total` |

증거:

- `report-key-findings.json`: `scale_out_results`
- `kubectl-describe-hpa-concert-service.txt`: `New size: 2`, `New size: 3`, `New size: 4`
- `kubectl-pods-concert-service.txt`: pod 4개 `1/1 Running`

## k6 Result

| metric | value |
| --- | ---: |
| `http_reqs` | `119,838` |
| `http_reqs rate` | `84.32/s` |
| `http_req_failed rate` | `34.64%` |
| `http_req_duration avg` | `4,176.96ms` |
| `http_req_duration p95` | `10,507.47ms` |
| `http_req_duration p99` | `14,885.30ms` |
| `http_req_duration max` | `32,516.96ms` |
| `checks rate` | `45.70%` |
| `iterations` | `75,103` |
| `vus max` | `1,000` |

첫 번째 limit candidate는 baseline 80 RPS 단계에서 이미 나왔다.

| 항목 | 값 |
| --- | --- |
| step | `capacity_baseline.concert.recommended` |
| stage | `concert_recommended_baseline_rps_80` |
| p95 | `10,113.04ms` |
| p99 | `10,305.66ms` |
| error rate | `41.95%` |
| checks pass rate | `58.05%` |

주요 k6 실패 로그:

| 실패 | 횟수 |
| --- | ---: |
| `capacity_baseline.concert.date_performances failed with status 0` | `1,048` |
| `capacity_baseline.concert.seat_map failed with status 0` | `4,778` |
| `capacity_baseline.concert.seat_map failed with status 500` | `3` |

## Connection Result

| 확인 항목 | 결과 |
| --- | ---: |
| `too many clients already` | `0` |
| `remaining connection slots` | `0` |
| SQLAlchemy `QueuePool limit` | `2,360` |
| SQLAlchemy `TimeoutError` | `1,180` |
| DB `unexpected EOF on client connection with an open transaction` | `579` |
| DB `FATAL: connection to client lost` | `16` |

`too many clients already`가 보이지 않았다는 점에서 connection budget 조정은 PostgreSQL 서버 connection 초과를 막는 데는 효과가 있었다. 그러나 `maxOverflow=0` 상태에서 pool checkout timeout이 대량으로 발생했으므로, 현재 `15/0` 예산은 `concert-140rps` workload를 성공시키기에는 부족하거나, endpoint latency가 길어 pool 점유 시간이 너무 길다.

특히 이번 결과는 pool을 단순히 다시 키우자는 결론으로 바로 가기 어렵다. 4 replicas, 2 workers, pool 15 기준 API 쪽 이론상 connection budget은 `4 * 2 * 15 = 120`이다. 이는 local `concert-db max_connections=200` 안에 있지만, worker별 pool은 독립적이기 때문에 한 pod/process에 요청이 몰리면 해당 process의 15개 pool이 먼저 고갈될 수 있다.

## Failure Analysis

이번 실패는 세 층으로 분리된다.

| 구분 | 판단 |
| --- | --- |
| HPA 반응 | 성공. `1 -> 4` scale-out과 ready timing이 report에 기록됨 |
| PostgreSQL connection 한계 | 직접 재발 없음. `too many clients already` 미관측 |
| 애플리케이션 pool/endpoint 한계 | 재발. `QueuePool limit size 15 overflow 0` 대량 발생 |

`concert-service` pod는 테스트 중 3회 restart가 있었고, HPA describe에는 일부 시점의 `FailedComputeMetricsReplicas`가 남았다. 이 경고는 unready pod 때문에 metrics-server가 CPU를 계산하지 못한 구간이 있었다는 뜻이다. 따라서 scale-out은 됐지만, endpoint 지연과 pod readiness 흔들림이 합쳐져 k6 관점에서는 status `0` timeout이 크게 늘었다.

post-run node snapshot은 CPU `2-6%`, memory `12-27%` 수준이었다. 실행 중 관측에서도 node CPU/memory 포화가 주 원인으로 보일 정도의 신호는 없었다. 이번 병목은 클러스터 전체 자원 부족보다는 `concert-service` endpoint 처리 시간, health probe 영향, SQLAlchemy pool checkout 대기로 보는 편이 맞다.

## Improvement Plan

이번 결과에서 확인된 핵심 제약은 `concert-service`가 DB-bound read API라는 점이다. HPA replicas를 늘리면 애플리케이션 동시성은 늘지만, 요청마다 DB connection을 오래 점유하면 처리량이 선형으로 늘지 않는다. 반대로 SQLAlchemy pool을 키우면 worker별 checkout timeout은 줄어들 수 있지만, HPA max replicas와 곱해져 PostgreSQL `max_connections` 한계에 다시 가까워진다.

따라서 다음 개선의 1차 방향은 pool size를 다시 키우는 것이 아니라, Redis cache와 singleflight로 DB 진입량과 pool 점유 시간을 줄이는 것이다.

| 우선순위 | 대상 | 개선 방향 | 기대 효과 |
| --- | --- | --- | --- |
| 1 | `seat_map` | 좌석 구조와 상태 데이터를 분리해 cache key/TTL을 다르게 둔다 | 가장 많은 status `0` 실패가 난 endpoint의 DB 조회량 감소 |
| 2 | `calendar` | 월 단위 calendar 응답을 짧은 TTL로 캐시한다 | 반복 조회가 많은 read path의 DB round-trip 감소 |
| 3 | `date_performances` | 날짜별 performance 목록을 짧은 TTL로 캐시한다 | spike 구간에서 동일 날짜 조회가 DB로 몰리는 현상 완화 |
| 4 | `recommended` | `sort`, `cursor`, `limit` 조합별 캐시를 둔다 | baseline 80 RPS부터 limit candidate가 된 첫 병목 완화 |

캐시만 추가하면 cache miss 순간에 같은 요청이 한꺼번에 DB로 들어갈 수 있다. 그래서 Redis cache와 함께 다음 보호 장치가 필요하다.

| 항목 | 이유 |
| --- | --- |
| singleflight | 같은 cache key의 miss 요청을 하나의 DB 조회로 합친다 |
| TTL jitter | 캐시 만료 시점이 한 번에 겹치지 않게 한다 |
| stale-while-revalidate | spike 구간에서 오래된 응답을 짧게 허용하고 뒤에서 갱신한다 |
| negative cache | 빈 결과나 not found 반복 조회가 DB를 계속 때리지 않게 한다 |
| hit/miss metric | 캐시가 실제로 DB 부하를 줄였는지 검증한다 |
| pool checkout metric | cache 적용 후 worker별 pool 대기가 줄었는지 확인한다 |

재실험은 바로 `concert-140rps`로 돌아가기보다 단계적으로 진행한다.

| 순서 | 실험 | 목적 |
| ---: | --- | --- |
| 1 | endpoint별 낮은 RPS 재측정 | 캐시 없는 현재 latency와 DB query 시간을 baseline으로 잡는다 |
| 2 | Redis cache + singleflight 적용 후 endpoint별 재측정 | cache hit이 pool checkout timeout을 줄이는지 확인한다 |
| 3 | `concert-140rps` 재실행 | HPA `1 -> 4` scale-out 상태에서 `QueuePool` timeout과 status `0`이 줄었는지 확인한다 |
| 4 | TTL 만료를 포함한 spike 재실행 | cache stampede가 없는지 확인한다 |

connection budget은 계속 고정한다. `poolSize=15`, `maxOverflow=0` 기준에서 성공률과 latency를 먼저 개선하고, 그래도 부족하면 HPA max replicas, Uvicorn workers, pool size, PostgreSQL `max_connections`를 하나의 budget으로 다시 계산한다.

## RPS Graph

질문했던 RPS 그래프가 산등성이처럼 내려갔다가 다시 올라오는 현상은 대부분 scenario 구조 때문이다.

`concert-140rps`는 하나의 endpoint에 긴 spike를 계속 넣는 방식이 아니라, `recommended`, `detail`, `calendar`, `date_performances`, `seat_map` 측정을 순차적으로 시작한다. 각 measurement는 `20 -> 80 -> 120 -> 140 -> 80 RPS` stage를 갖고, 앞 measurement가 끝난 뒤 다음 measurement가 ramp-up 한다. 그래서 service-level ingress RPS를 보면 한 산이 끝나며 내려가고, 다음 endpoint measurement가 시작되며 다시 올라오는 모양이 반복된다.

따라서 “스파이크 테스트 스텝 전환 때문이냐”는 질문에는 “맞다, 하지만 endpoint별 measurement가 순차 실행되는 구조까지 같이 봐야 한다”가 답이다. 그래프의 골은 stage 전환, graceful stop, 다음 endpoint ramp-up 사이의 간격이 겹치며 생긴다.

## Evidence Files

- `summary.json`
- `command.txt`
- `k6.log`
- `report-archive/read-api-loadtest-read-manual-20260621160921-fhfxw/k6-summary.json`
- `report-archive/read-api-loadtest-read-manual-20260621160921-fhfxw/loadtest-run-report-final.json`
- `report-archive/read-api-loadtest-read-manual-20260621160921-fhfxw/loadtest-run-report-concert-service.json`
- `report-key-findings.json`
- `stage-results.tsv`
- `error-summary.txt`
- `cluster-summary.txt`
- `read-job.yaml`
- `read-pod.yaml`
- `kubectl-describe-read-job.txt`
- `kubectl-describe-read-pod.txt`
- `kubectl-hpa-concert-service.txt`
- `kubectl-describe-hpa-concert-service.txt`
- `kubectl-pods-concert-service.txt`
- `kubectl-describe-pods-concert-service.txt`
- `kubectl-events-ticketing-concert.txt`
- `concert-service-env.txt`
- `concert-service-all-pods-logs-since-2h.log`
- `concert-service-all-pods-previous-logs-since-2h.log`
- `concert-db-logs-since-2h.log`
- `kubectl-top-nodes-after.txt`
- `kubectl-top-pods-ticketing-concert-after.txt`
- `kong-rate-limit-concerts-after.yaml`
