# Local HPA Spike Scaleout 6m DB Pool 20 Analysis

## Summary

| 항목 | 결과 |
| --- | --- |
| run id | `read-api-loadtest-read-manual-20260620075515-4tjs4` |
| timestamp | `2026-06-20T08:01:45.168Z` |
| scenario | `reservation-journey-load-test` |
| preset | `local-hpa-spike-scaleout-6m` |
| changed condition | all service SQLAlchemy pool `20/20/10` |
| status | `FAIL` |

이번 실행은 journey/s 조건을 그대로 유지하고, local HPA spike 서비스들의 SQLAlchemy DB pool을 모두 `poolSize=20`, `maxOverflow=20`, `poolTimeoutSeconds=10`으로 맞춘 재실험이다.

결론적으로 reservation/payment 쪽 DB connection pool 병목은 완화됐다. 이전 실험에서 실패하던 `reservation.create`와 `payment.approve`는 낮은 latency와 거의 0에 가까운 실패율을 보였다.

다만 전체 예매 여정은 여전히 실패했다. `40 journey/s`부터 latency 한계가 나타났고, `50 journey/s`에서는 `concert-service` 조회 경로가 높은 실패율과 timeout을 보였다. 추가 로그에서 `concert-service`가 `QueuePool limit of size 20 overflow 20 reached, connection timed out, timeout 10.00`을 기록했으므로, 다음 한계는 여전히 `concert-service`의 DB connection pool/read query 처리량이다.

## Experiment Conditions

| service | CPU request | memory request | CPU limit | memory limit | DB pool |
| --- | ---: | ---: | ---: | ---: | --- |
| auth-service | `2400m` | `256Mi` | `null` | `null` | `20/20/10` |
| concert-service | `781m` | `256Mi` | `null` | `null` | `20/20/10` |
| notification-service | `427m` | `256Mi` | `null` | `null` | `20/20/10` |
| payment-service | `340m` | `256Mi` | `null` | `null` | `20/20/10` |
| reservation-service | `250m` | `256Mi` | `null` | `null` | `20/20/10` |
| ticket-service | `380m` | `256Mi` | `null` | `null` | `20/20/10` |

부하 조건은 이전 실행과 동일하게 `1m@10`, `1m@20`, `1m@40`, `3m@50 journey/s`를 유지했다.

주의할 점은 이 실행이 직전 HPA scale-out 상태를 완전히 1 replica로 되돌린 뒤 시작한 실험은 아니라는 점이다. report의 baseline replica도 `concert=3`, `reservation=2`로 기록됐다. 따라서 DB pool 개선 여부와 처리 한계 위치는 해석 가능하지만, HPA decision/ready 시간은 순수한 cold scale-out 시간으로 보지 않는다.

## HPA Result

| service | baseline | max desired | decision | ready |
| --- | ---: | ---: | ---: | ---: |
| auth-service | `1` | `1` | `null` | `null` |
| concert-service | `3` | `4` | `278.469s` | `308.261s` |
| notification-service | `1` | `1` | `null` | `null` |
| payment-service | `1` | `2` | `151.773s` | `177.299s` |
| reservation-service | `2` | `3` | `169.167s` | `185.431s` |
| ticket-service | `1` | `4` | `151.773s` | `151.773s` |

HPA는 `concert-service`, `payment-service`, `reservation-service`, `ticket-service`에서 scale-out 했다. 특히 `ticket-service`는 max desired `4`까지 상승했다.

## Stage Result

| stage | p95 | p99 | failed | status |
| --- | ---: | ---: | ---: | --- |
| `10 journey/s` | `48.11ms` | `111.40ms` | `0` | `OK` |
| `20 journey/s` | `69.68ms` | `177.17ms` | `0` | `OK` |
| `40 journey/s` | `8545.09ms` | `10001.53ms` | `0.0476` | `LIMIT_CANDIDATE` |
| `50 journey/s` | `10147.19ms` | `16738.33ms` | `0.5625` | `LIMIT_CANDIDATE` |

DB pool을 올린 뒤 `20 journey/s`까지는 안정화됐다. 첫 한계 후보는 `40 journey/s`로 이동했다.

## API Step Result

| step | service | p95 | failed |
| --- | --- | ---: | ---: |
| setup.pre_login | auth-service | `63.36ms` | `0` |
| concerts | concert-service | `10186.64ms` | `0.5437` |
| performances | concert-service | `10011.83ms` | `0.1789` |
| seats | concert-service | `10002.22ms` | `0.1275` |
| reservation.create | reservation-service | `202.35ms` | `0` |
| payment.approve | payment-service | `536.90ms` | `0.0003` |
| ticket.list | ticket-service | `9983.94ms` | `0.0608` |

이전 실행에서 병목이었던 `reservation.create`는 안정화됐다. 반대로 `concert-service` 조회 step은 다시 전체 실패율을 끌어올렸다.

## Failure Signal

| 항목 | 관측 |
| --- | --- |
| QueuePool-like error | `concert-service`에서 재발 |
| main failed service | `concert-service` |
| main failed route | `GET /concerts` |
| secondary failed route | `GET /concerts/{id}/performances`, `GET /performances/{id}/seats`, `GET /tickets/me` |
| observed status | 주로 status `0` timeout |
| concert DB pool signal | `QueuePool limit of size 20 overflow 20 reached`, timeout `10.00s` |
| concert DB pool config | `poolSize=20`, `maxOverflow=20`, `poolTimeoutSeconds=10` |
| concert pod restart | 실행 후 `concert-service` Pod restart 관측 |

이번 실패는 reservation/payment의 DB pool 문제가 아니라, 40~50 journey/s에서 `concert-service` read API가 다시 DB pool 한계에 걸리고 일부 Pod가 재시작되는 현상으로 해석한다.

## Decision

| 판단 | 내용 |
| --- | --- |
| DB pool 안정화 효과 | PARTIAL: reservation/payment 안정화, concert 재포화 |
| HPA scale-out 검증 | PASS |
| 예매 여정 안정성 | FAIL |
| 안정 처리량 | `20 journey/s` |
| 한계 후보 | `40 journey/s` |
| 우선 확인 대상 | concert-service DB pool budget, `/concerts` query latency, response size, pod restart 원인 |

## Next Experiment

다음 실험도 journey/s 조건은 유지하되, `concert-service`의 DB pool budget을 먼저 재설정한다. MongoDB pool 기본값 `100`과 비교하면 `20 + 20 overflow`는 조회 부하가 집중되는 concert-service에는 작을 수 있다. 다만 PostgreSQL은 connection당 비용이 크기 때문에, Pod당 `100`으로 바로 올리면 HPA max replica `4` 기준 최대 `400` connection이 되어 현재 concert-db `max_connections=200`을 초과한다.

따라서 다음 실험은 `concert-service`만 PostgreSQL connection budget 안에서 pool을 한 단계 올린다.

| 항목 | 값 |
| --- | --- |
| 유지 조건 | 다른 서비스 DB pool `20/20/10`, memory limit 제거, `local-hpa-spike-scaleout-6m` preset |
| 변경 대상 | `concert-service` |
| concert-db max_connections | `200` |
| HPA max replicas | `4` |
| 권장 poolSize | `35` |
| 권장 maxOverflow | `10` |
| 권장 poolTimeoutSeconds | `15` |
| 최대 concert connections | `4 * (35 + 10) = 180` |
| 남는 DB connection budget | `20` |
| 확인 기준 | `40 journey/s` 이상에서 `GET /concerts` QueuePool timeout과 status `0` 감소 여부 |

## Raw Result

원본 실행 결과는 같은 폴더의 [loadtest-run-report.json](loadtest-run-report.json)에 저장했다.
