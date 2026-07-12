# Local HPA Spike 3m Analysis

## Summary

| 항목 | 결과 |
| --- | --- |
| run id | `read-api-loadtest-read-manual-20260620055847-9tmqz` |
| timestamp | `2026-06-20T06:02:03.028Z` |
| scenario | `reservation-journey-load-test` |
| preset | `local-hpa-spike-3m` |
| environment | `local` |
| status | `PASS` |
| dataset revision | `reservation-local-hpa-spike-v1` |

이번 실행은 k6 관점에서는 PASS다. 전체 HTTP 실패율은 0이고, p95/p99 latency도 threshold보다 매우 낮다.

다만 HPA spike 검증 관점에서는 scale-out이 발생하지 않았다. 6개 서비스 모두 `baseline_replicas=1`, `max_desired_replicas=1`로 남았고, `hpa_decision_seconds`와 `scale_out_ready_seconds`도 모두 `null`이다.

## Traffic Conditions

| 항목 | 값 |
| --- | ---: |
| duration | `3m` |
| stages | `30s@1`, `30s@5`, `1m@10`, `1m@10 journey/s` |
| preAllocatedVUs / maxVUs | `60 / 160` |
| active customers | `80` |
| expected journeys | `1260` |
| completed iterations | `1155` |
| iteration rate | `5.94/s` |
| HTTP request rate | `50.48/s` |

`expected_journeys=1260` 대비 `iterations_count=1155`로 약 91.7% 수준까지 실행됐다. dropped iteration 정보가 이 report에는 직접 포함되어 있지 않아 원인은 단정하지 않는다.

## Latency And Error

| 항목 | 결과 | 기준 |
| --- | ---: | ---: |
| HTTP failed rate | `0` | `< 0.05` |
| p50 | `8.08ms` | - |
| p95 | `30.62ms` | `< 2500ms` |
| p99 | `55.39ms` | `< 6000ms` |

latency와 HTTP 실패율 기준으로는 충분히 여유가 있다. 이번 run에서는 서비스 응답 지연이나 5xx가 병목으로 보이지 않는다.

## API Step Results

| step | service | route | p95 | p99 | failed | count |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| setup.pre_login | auth-service | `POST /auth/signup|login` | `51.89ms` | `62.50ms` | `0` | `80` |
| concerts | concert-service | `GET /concerts` | `47.09ms` | `76.00ms` | `0` | `1159` |
| performances | concert-service | `GET /concerts/{id}/performances` | `20.41ms` | `39.58ms` | `0` | `1159` |
| seats | concert-service | `GET /performances/{id}/seats` | `40.62ms` | `70.02ms` | `0` | `1159` |
| reservation.create | reservation-service | `POST /reservations` | `21.64ms` | `47.68ms` | `0` | `1159` |
| payment.approve | payment-service | `POST /payments` | `21.36ms` | `39.76ms` | `0` | `1155` |
| ticket.list | ticket-service | `GET /tickets/me` | `32.39ms` | `58.01ms` | `0` | `2310` |

예매 여정의 주요 API는 모두 안정적으로 응답했다. `ticket.list` count가 2배인 것은 티켓 발급 확인을 위해 polling/list 조회가 반복되기 때문이다.

## Stage Results

| stage | target | duration | p95 | p99 | failed | status |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| stage_1_journey_s | `1/s` | `30s` | `23.69ms` | `44.18ms` | `0` | `OK` |
| stage_5_journey_s | `5/s` | `30s` | `15.99ms` | `41.49ms` | `0` | `OK` |
| stage_10_journey_s | `10/s` | `1m` | `31.28ms` | `60.11ms` | `0` | `OK` |
| stage_10_journey_s | `10/s` | `1m` | `31.28ms` | `60.11ms` | `0` | `OK` |

stage별 limit candidate는 없다. 이 부하 수준에서는 latency, 5xx, timeout 기준으로 한계 구간이 관측되지 않았다.

## HPA Scale-Out Results

| service | namespace | baseline | max desired | decision | ready |
| --- | --- | ---: | ---: | ---: | ---: |
| auth-service | `ticketing-auth` | `1` | `1` | `null` | `null` |
| concert-service | `ticketing-concert` | `1` | `1` | `null` | `null` |
| notification-service | `ticketing-notification` | `1` | `1` | `null` | `null` |
| payment-service | `ticketing-payment` | `1` | `1` | `null` | `null` |
| reservation-service | `ticketing-reservation` | `1` | `1` | `null` | `null` |
| ticket-service | `ticketing-ticket` | `1` | `1` | `null` | `null` |

HPA 리소스가 만들어졌더라도 이번 run에서는 desired replica가 증가하지 않았다. 따라서 "HPA가 정상적으로 scale-out 했다"는 증거로 사용하면 안 된다.

## Why HPA Did Not Scale Out

가장 유력한 원인은 부하가 HPA target을 넘길 만큼 크지 않았다는 점이다.

HPA는 CPU 사용률이 request 대비 target utilization을 넘어야 replica를 늘린다. 이번 환경의 target은 `70%`이고, capacity baseline 결과를 반영한 CPU request가 높게 잡혀 있다.

| service | CPU request | HPA 70% 기준 | 이번 run의 실제 요청률 |
| --- | ---: | ---: | ---: |
| auth-service | `3453m` | 약 `2417m` | setup `0.41 rps` |
| concert-service | `781m` | 약 `547m` | API별 약 `5.96 rps` |
| reservation-service | `399m` | 약 `279m` | 약 `5.96 rps` |
| payment-service | `542m` | 약 `379m` | 약 `5.94 rps` |
| ticket-service | `602m` | 약 `421m` | 약 `11.88 rps` |
| notification-service | `427m` | 약 `299m` | 예매 여정에서 직접 호출 없음 |

전체 HTTP request rate는 약 `50.48 rps`였지만, 서비스별로 나누면 write 경로는 약 `6 journey/s` 수준이다. latency가 p95 `30.62ms`, HTTP 실패율 `0`으로 낮았기 때문에 Pod CPU가 HPA 기준까지 올라가지 않았을 가능성이 높다.

또한 notification-service는 이번 예매 여정에서 직접 호출되지 않으므로 scale-out 대상 트래픽이 없다. auth-service도 measured path 전에 고객 pool을 준비하는 setup 호출만 수행하므로 spike 구간에서 scale-out을 기대하기 어렵다.

단, 이 report에는 서비스별 CPU utilization 시계열이 포함되어 있지 않다. 따라서 확정 원인은 `scale-out 미발생`이고, 원인 해석은 `부하 부족 또는 request 대비 CPU 사용률 부족`으로 남긴다.

## Interpretation

이번 결과는 "로컬 3분 spike preset에서 예매 여정은 안정적으로 처리됐다"는 증거다.

하지만 HPA 검증 실험으로는 부하가 부족했다. 현재 CPU request 후보가 capacity baseline 기반으로 비교적 높게 잡혀 있고, 10 journey/s 수준에서는 HPA target CPU utilization을 넘지 못했을 가능성이 높다. 이 report에는 서비스별 CPU utilization 시계열이 포함되어 있지 않으므로 원인은 `CPU가 낮았다`로 단정하지 않고, 관측 결과는 `scale-out 미발생`으로 기록한다.

## Decision

| 판단 | 내용 |
| --- | --- |
| k6 run | PASS |
| API 안정성 | PASS |
| HPA 생성/조회 report | PASS |
| HPA scale-out 검증 | FAIL |
| 다음 실험 필요 여부 | 필요 |

## Next Experiment

| 항목 | 다음 실험값 |
| --- | --- |
| preset name | `local-hpa-spike-scaleout-6m` |
| CPU request | `auth=2400m`, `concert=781m`, `reservation=250m`, `payment=340m`, `ticket=380m`, `notification=427m` |
| HPA target CPU | `70%` |
| duration | `6m` |
| stages | `1m@10`, `1m@20`, `1m@40`, `3m@50 journey/s` |
| preAllocatedVUs / maxVUs | `200 / 500` |
| active customer count | `200` |
| expected journeys | 약 `13200` |
| scale-out 기대 서비스 | `concert-service` 우선 |
| 통과 기준 | 하나 이상의 서비스 `max_desired_replicas > 1` |
| 실패 기준 | 모든 서비스 `max_desired_replicas = 1` |

`concert-service`는 capacity baseline 기준 `40 RPS`에서 HPA 70% 기준에 가까워진다. 예매 여정에서는 `concert-service` API가 journey당 3회 호출되므로 `40-50 journey/s` 구간을 3분 유지해 scale-out 여부를 확인한다.

## Raw Result

원본 실행 결과는 같은 폴더의 [loadtest-run-report.json](loadtest-run-report.json)에 저장했다.
