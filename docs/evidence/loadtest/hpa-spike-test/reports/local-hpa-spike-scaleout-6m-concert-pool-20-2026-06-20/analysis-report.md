# Local HPA Spike Scaleout 6m Concert Pool 20 Analysis

## Summary

| 항목 | 결과 |
| --- | --- |
| run id | `read-api-loadtest-read-manual-20260620074237-npbmp` |
| timestamp | `2026-06-20T07:49:13.575Z` |
| scenario | `reservation-journey-load-test` |
| preset | `local-hpa-spike-scaleout-6m` |
| changed condition | `concert-service` SQLAlchemy pool `20/20/10` |
| status | `FAIL` |

이번 실행은 journey/s 조건을 그대로 유지하고 `concert-service` DB pool만 올린 재실험이다.

결론적으로 `concert-service`의 QueuePool 병목은 완화됐다. `concerts`, `performances`, `seats` step의 실패율은 모두 `0`이었고, `concert-service` HPA는 max desired `4`까지 상승했다.

다만 전체 예매 여정은 여전히 실패했다. 실패 지점은 `concert-service`에서 `reservation-service`로 이동했고, `reservation.create`가 `20 journey/s`부터 timeout 한계 후보로 나타났다.

## Experiment Conditions

| service | CPU request | memory request | CPU limit | memory limit | DB pool |
| --- | ---: | ---: | ---: | ---: | --- |
| auth-service | `2400m` | `256Mi` | `null` | `null` | chart default |
| concert-service | `781m` | `256Mi` | `null` | `null` | `poolSize=20`, `maxOverflow=20`, `poolTimeoutSeconds=10` |
| notification-service | `427m` | `256Mi` | `null` | `null` | chart default |
| payment-service | `340m` | `256Mi` | `null` | `null` | chart default |
| reservation-service | `250m` | `256Mi` | `null` | `null` | `poolSize=5`, `maxOverflow=0`, `poolTimeoutSeconds=5` |
| ticket-service | `380m` | `256Mi` | `null` | `null` | chart default |

부하 조건은 이전 실행과 동일하게 `1m@10`, `1m@20`, `1m@40`, `3m@50 journey/s`를 유지했다. 따라서 이번 실행은 `concert-service` DB pool 변경 효과만 비교하기 위한 실험이다.

## HPA Result

| service | max desired | decision | ready |
| --- | ---: | ---: | ---: |
| auth-service | `1` | `null` | `null` |
| concert-service | `4` | `110.228s` | `111.092s` |
| notification-service | `1` | `null` | `null` |
| payment-service | `1` | `null` | `null` |
| reservation-service | `2` | `117.957s` | `142.255s` |
| ticket-service | `2` | `159.342s` | `183.468s` |

`concert-service`는 이전보다 더 적극적으로 scale-out 했다. max desired가 `2`에서 `4`로 증가했고, decision 직후 ready까지도 빠르게 도달했다.

## Stage Result

| stage | p95 | p99 | failed | status |
| --- | ---: | ---: | ---: | --- |
| `10 journey/s` | `26.17ms` | `50.50ms` | `0` | `OK` |
| `20 journey/s` | `10000.25ms` | `10001.92ms` | `0.0655` | `LIMIT_CANDIDATE` |
| `40 journey/s` | `10001.13ms` | `10002.57ms` | `0.1430` | `LIMIT_CANDIDATE` |
| `50 journey/s` | `10001.88ms` | `10006.61ms` | `0.2335` | `LIMIT_CANDIDATE` |

이전 실행에서는 `40 journey/s`부터 한계가 뚜렷했지만, 이번 실행은 `20 journey/s`부터 `reservation_create_timeout`이 나타났다. 원인은 concert 조회 실패가 아니라 reservation create 경로의 timeout이다.

## API Step Result

| step | service | p95 | failed |
| --- | --- | ---: | ---: |
| setup.pre_login | auth-service | `62.92ms` | `0` |
| concerts | concert-service | `4072.92ms` | `0` |
| performances | concert-service | `3962.36ms` | `0` |
| seats | concert-service | `3956.30ms` | `0` |
| reservation.create | reservation-service | `10003.73ms` | `0.7419` |
| payment.approve | payment-service | `10001.88ms` | `0.3671` |
| ticket.list | ticket-service | `9297.09ms` | `0.0662` |

`concert-service` 조회 API는 느려졌지만 실패하지 않았다. 반대로 `reservation.create`는 p95가 10초에 붙고 실패율이 `0.7419`까지 올라가 전체 여정을 막았다.

## Failure Signal

| 항목 | 관측 |
| --- | --- |
| main failed route | `POST /reservations` |
| main failed service | `reservation-service` |
| observed HTTP status | `503`, `0` |
| reservation DB pool signal | `QueuePool limit of size 5 overflow 0 reached`, timeout `5.00s` |
| reservation DB pool config | `poolSize=5`, `maxOverflow=0`, `poolTimeoutSeconds=5` |
| reservation pod restart | 실행 직후 Pod별 restart 관측 |
| concert DB pool config | `poolSize=20`, `maxOverflow=20`, `poolTimeoutSeconds=10` |

이번 결과는 `concert-service` pool 조정이 효과가 있었음을 보여준다. 다만 같은 부하를 유지하자 다음 병목이 `reservation-service` DB pool로 이동했다.

## Decision

| 판단 | 내용 |
| --- | --- |
| concert pool 조정 효과 | PASS |
| HPA scale-out 검증 | PASS |
| 예매 여정 안정성 | FAIL |
| 안정 처리량 | `10 journey/s` |
| 한계 후보 | `20 journey/s` |
| 우선 확인 대상 | reservation-service SQLAlchemy pool size/max overflow, reservation create latency, Kafka ticket-issued consumer DB connection 사용 |

## Next Experiment

다음 실험도 journey/s 조건은 유지하고, `reservation-service` DB pool만 올린다. 현재 failure log는 `ticket-issued` Kafka consumer의 reservation confirm 처리에서도 DB connection timeout이 발생했음을 보여준다.

| 항목 | 값 |
| --- | --- |
| 변경 대상 | `reservation-service` |
| 변경 조건 | SQLAlchemy DB pool |
| poolSize | `20` |
| maxOverflow | `20` |
| poolTimeoutSeconds | `10` |
| 유지 조건 | `concert-service` pool `20/20/10`, memory limit 제거, `local-hpa-spike-scaleout-6m` preset |
| 확인 기준 | `20 journey/s` 이상에서 `POST /reservations` timeout과 QueuePool error 감소 여부 |

## Raw Result

원본 실행 결과는 같은 폴더의 [loadtest-run-report.json](loadtest-run-report.json)에 저장했다.
