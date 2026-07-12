# Local HPA Spike Scaleout 6m Concert Pool 35 Analysis

## Summary

| 항목 | 결과 |
| --- | --- |
| run id | `read-api-loadtest-read-manual-20260620082308-ms2vc` |
| timestamp | `2026-06-20T08:29:44.187Z` |
| scenario | `reservation-journey-load-test` |
| preset | `local-hpa-spike-scaleout-6m` |
| changed condition | `concert-service` SQLAlchemy pool `35/10/15` |
| status | `FAIL` |

이번 실행은 journey/s 조건을 그대로 유지하고, `concert-service` DB pool만 `poolSize=35`, `maxOverflow=10`, `poolTimeoutSeconds=15`로 올린 재실험이다.

결론적으로 pool 증설 효과는 있었다. 이전 `20/20/10` 전체 DB pool 실험에서는 `40 journey/s`부터 한계 후보가 나타났지만, 이번 실행은 `40 journey/s`까지 `OK`로 통과했다. 다만 `50 journey/s`에서는 여전히 `concert-service` 조회 경로가 timeout을 보이며 전체 여정이 실패했다.

## Experiment Conditions

| service | CPU request | memory request | CPU limit | memory limit | DB pool |
| --- | ---: | ---: | ---: | ---: | --- |
| auth-service | `2400m` | `256Mi` | `null` | `null` | `20/20/10` |
| concert-service | `781m` | `256Mi` | `null` | `null` | `35/10/15` |
| notification-service | `427m` | `256Mi` | `null` | `null` | `20/20/10` |
| payment-service | `340m` | `256Mi` | `null` | `null` | `20/20/10` |
| reservation-service | `250m` | `256Mi` | `null` | `null` | `20/20/10` |
| ticket-service | `380m` | `256Mi` | `null` | `null` | `20/20/10` |

부하 조건은 이전 실행과 동일하게 `1m@10`, `1m@20`, `1m@40`, `3m@50 journey/s`를 유지했다.

## HPA Result

| service | baseline | max desired | decision | ready |
| --- | ---: | ---: | ---: | ---: |
| auth-service | `1` | `1` | `null` | `null` |
| concert-service | `1` | `3` | `179.836s` | `179.836s` |
| notification-service | `1` | `1` | `null` | `null` |
| payment-service | `1` | `2` | `179.836s` | `179.836s` |
| reservation-service | `1` | `3` | `179.836s` | `179.836s` |
| ticket-service | `1` | `3` | `179.836s` | `179.836s` |

HPA는 `concert-service`, `payment-service`, `reservation-service`, `ticket-service`에서 scale-out 했다.

## Stage Result

| stage | p95 | p99 | failed | status |
| --- | ---: | ---: | ---: | --- |
| `10 journey/s` | `51.74ms` | `170.52ms` | `0` | `OK` |
| `20 journey/s` | `108.53ms` | `219.15ms` | `0` | `OK` |
| `40 journey/s` | `1304.10ms` | `4316.46ms` | `0.0014` | `OK` |
| `50 journey/s` | `10001.62ms` | `10006.45ms` | `0.3368` | `LIMIT_CANDIDATE` |

이번 실행의 첫 한계 후보는 `50 journey/s`다. `40 journey/s`까지는 threshold 기준을 통과했다.

## API Step Result

| step | service | p95 | failed |
| --- | --- | ---: | ---: |
| setup.pre_login | auth-service | `62.27ms` | `0` |
| concerts | concert-service | `10001.45ms` | `0.3928` |
| performances | concert-service | `10001.64ms` | `0.2174` |
| seats | concert-service | `10001.10ms` | `0.1453` |
| reservation.create | reservation-service | `61.46ms` | `0` |
| payment.approve | payment-service | `68.18ms` | `0` |
| ticket.list | ticket-service | `106.05ms` | `0` |

`reservation-service`, `payment-service`, `ticket-service`는 안정적이다. 실패는 다시 `concert-service` 조회 경로에 집중됐다.

## Effective RPS

유효 RPS는 `rps * (1 - failed_rate)`로 계산했다.

| service | requested RPS | effective RPS |
| --- | ---: | ---: |
| auth-service | `0.51` | `0.51` |
| concert-service | `55.47` | `39.65` |
| payment-service | `10.79` | `10.79` |
| reservation-service | `10.82` | `10.82` |
| ticket-service | `22.85` | `22.85` |

`concert-service`는 요청 RPS `55.47` 중 유효 RPS `39.65`까지만 처리했다. 이 값이 현재 동일 조건에서의 실질 처리 한계에 가깝다.

## Failure Signal

| 항목 | 관측 |
| --- | --- |
| main failed service | `concert-service` |
| main failed route | `GET /concerts` |
| secondary failed route | `GET /concerts/{id}/performances`, `GET /performances/{id}/seats` |
| observed status | status `0` timeout |
| crossed stage | `50 journey/s` |
| concert DB pool config | `poolSize=35`, `maxOverflow=10`, `poolTimeoutSeconds=15` |

이번 결과는 DB pool을 더 키우면 한계가 뒤로 밀린다는 것을 보여준다. 다만 `50 journey/s`에서는 여전히 concert 조회가 10초 timeout에 걸리므로, pool 크기만으로 완전히 해결됐다고 보기는 어렵다.

## Bottleneck Investigation

실행 이후 `concert-service`의 병목 후보를 추가로 확인했다.

| 확인 항목 | 결과 |
| --- | --- |
| Pod restart | `concert-service` container restart `2`, latest exit code `137` |
| Kubelet event | liveness/readiness probe `context deadline exceeded` 이후 container restart |
| HPA event | targeted pod가 unready 상태라 CPU metric 수집 실패 이벤트 발생 |
| DB pool error | `QueuePool limit of size 35 overflow 10 reached, connection timed out, timeout 15.00` |
| slow server response | 일부 `/concerts` 요청이 17s~61s 후 200/500으로 완료됨 |
| probe starvation | `/metrics` probe 요청도 약 `42.9s` 후 응답 |
| DB query plan | 현재 데이터셋 기준 주요 조회 쿼리는 단독 실행 시 `0.3ms`~`2.4ms` 수준 |
| DB size | `concerts=242`, `showtimes=702`, `seats=232440` |
| DB max connections | local `concert-db max_connections=200` |

현재 증거상 1차 병목은 개별 SQL 쿼리의 실행 시간이 아니라, `concert-service` 프로세스 안에서 동기 FastAPI 요청 처리 슬롯과 SQLAlchemy connection pool이 함께 포화되는 현상이다.

특히 k6 client timeout 이후에도 서버 쪽 요청은 즉시 중단되지 않고 뒤늦게 완료되는 로그가 보였다. 이 요청들이 worker thread와 DB connection 대기열을 계속 점유하면서 신규 요청과 probe 요청이 같이 밀린다. 그 결과 liveness/readiness probe가 1초 안에 응답하지 못하고, Kubelet이 Pod를 재시작한다.

코드상으로 public 조회 API는 모두 sync endpoint이며, FastAPI가 threadpool에서 실행한다. `/concerts`는 `concerts` 목록과 연결된 `showtimes`, `venues`를 `selectinload`로 함께 읽고, `/concerts/{id}/performances`와 `/performances/{id}/seats`도 요청마다 DB session을 열어 조회한다. 현재 쿼리 자체는 빠르지만, `50 journey/s`에서는 동시 요청 수가 pool과 worker 처리량을 초과하면서 대기 시간이 누적된다.

따라서 다음 실험 전 확인 우선순위는 다음과 같다.

| 우선순위 | 확인 대상 | 목적 |
| ---: | --- | --- |
| 1 | SQLAlchemy pool checkout wait 계측 | 실제 DB 실행 시간과 connection checkout 대기 시간을 분리 |
| 2 | `/health`를 async 또는 별도 경량 readiness로 분리 | business request 포화가 probe 실패로 이어지는지 확인 |
| 3 | `concert-service` threadpool/uvicorn concurrency 설정 확인 | Pod당 처리 가능한 동기 요청 수 산정 |
| 4 | `/concerts` 응답 캐시 또는 조회 전용 경량 DTO 검토 | 목록 조회가 매 journey마다 DB를 직접 치는 구조 완화 |
| 5 | pool 상향 실험 | 위 계측을 켠 뒤 `50/20/20` 상향 효과를 분리 측정 |

## Decision

| 판단 | 내용 |
| --- | --- |
| concert pool 증설 효과 | PASS |
| HPA scale-out 검증 | PASS |
| 예매 여정 안정성 | FAIL |
| 안정 처리량 | `40 journey/s` |
| 한계 후보 | `50 journey/s` |
| 우선 확인 대상 | concert-service DB pool 추가 상향, `/concerts` query latency, concert pod restart/probe |

## Next Experiment

다음 실험도 journey/s 조건은 유지하고, `concert-service` pool과 DB connection budget을 함께 조정한다. 현재 local concert-db `max_connections=200`이므로 Pod당 pool을 더 키우려면 DB max connection도 함께 올려야 한다.

| 항목 | 값 |
| --- | --- |
| 유지 조건 | 다른 서비스 DB pool `20/20/10`, memory limit 제거, `local-hpa-spike-scaleout-6m` preset |
| 변경 대상 | `concert-service`, `concert-db` |
| 후보 concert pool | `50/20/20` |
| HPA max replicas | `4` |
| 필요 concert connections | `4 * (50 + 20) = 280` |
| 후보 concert-db max_connections | `350` |
| 확인 기준 | `50 journey/s`에서 `GET /concerts` timeout과 failed rate 감소 여부 |

## Raw Result

원본 실행 결과는 같은 폴더의 [loadtest-run-report.json](loadtest-run-report.json)에 저장했다.
