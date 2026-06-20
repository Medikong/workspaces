# Local HPA Spike Scaleout 6m Analysis

## Summary

| 항목 | 결과 |
| --- | --- |
| run id | `read-api-loadtest-read-manual-20260620070803-l2fp4` |
| timestamp | `2026-06-20T07:14:39.452Z` |
| scenario | `reservation-journey-load-test` |
| preset | `local-hpa-spike-scaleout-6m` |
| status | `FAIL` |
| dataset revision | `reservation-local-hpa-spike-scaleout-v1` |

이번 실행은 HPA scale-out 관측에는 성공했다. `concert-service`, `reservation-service`, `payment-service`, `ticket-service`가 baseline replica 1에서 증가했다.

다만 k6 결과는 FAIL이다. `40 journey/s`부터 HTTP 실패율과 p99 latency가 기준을 넘었고, `50 journey/s`에서는 concert-service 503과 Pod 재시작이 발생했다.

## HPA Result

| service | max desired | decision | ready |
| --- | ---: | ---: | ---: |
| auth-service | `1` | `null` | `null` |
| concert-service | `3` | `137.758s` | `152.720s` |
| notification-service | `1` | `null` | `null` |
| payment-service | `2` | `175.827s` | `188.255s` |
| reservation-service | `2` | `152.720s` | `159.130s` |
| ticket-service | `2` | `137.758s` | `152.720s` |

`max desired`는 실행 중 HPA가 요청한 최대 replica 수다. `decision`은 테스트 시작 후 HPA가 baseline보다 큰 desired replica를 처음 결정하기까지 걸린 시간이고, `ready`는 scale-out된 Pod가 Ready 상태까지 도달하기까지 걸린 시간이다. 예를 들어 `concert-service`는 약 138초에 `1 -> 3` scale-out을 결정했고, 약 153초에 새 replica가 Ready 상태까지 도달했다.

scale-out 자체는 정상적으로 발생했다. 가장 먼저 `concert-service`와 `ticket-service`가 약 138초에 scale-out 판단을 받았고, 이후 `reservation-service`, `payment-service`가 뒤따랐다.

## Stage Result

| stage | p95 | p99 | failed | status |
| --- | ---: | ---: | ---: | --- |
| `10 journey/s` | `27.90ms` | `51.90ms` | `0` | `OK` |
| `20 journey/s` | `48.82ms` | `95.73ms` | `0` | `OK` |
| `40 journey/s` | `10000.90ms` | `10004.64ms` | `0.1188` | `LIMIT_CANDIDATE` |
| `50 journey/s` | `10002.07ms` | `10008.64ms` | `0.5519` | `LIMIT_CANDIDATE` |

`p95`와 `p99`는 해당 stage에서 발생한 전체 HTTP 요청 latency의 백분위 값이다. 예매 여정의 `GET /concerts`, `GET /concerts/{id}/performances`, `GET /performances/{id}/seats`, `POST /reservations`, `POST /payments`, `GET /tickets/me` 요청을 모두 포함한다. 특정 서비스만 보려면 아래 `API Step Result`의 step별 p95와 failed 값을 본다.

현재 설정에서 안정 구간은 `20 journey/s`까지다. HPA scale-out은 `40 journey/s` 구간에서 발생했지만, scale-out이 안정화되기 전에 concert-service가 먼저 불안정해졌다.

## API Step Result

| step | service | p95 | failed |
| --- | --- | ---: | ---: |
| setup.pre_login | auth-service | `57.01ms` | `0` |
| concerts | concert-service | `10001.74ms` | `0.4846` |
| performances | concert-service | `10002.00ms` | `0.2930` |
| seats | concert-service | `10001.06ms` | `0.1153` |
| reservation.create | reservation-service | `38.84ms` | `0` |
| payment.approve | payment-service | `51.31ms` | `0` |
| ticket.list | ticket-service | `10001.77ms` | `0.2979` |

실패는 concert 조회 경로에서 시작됐다. `reservation.create`와 `payment.approve` 자체는 낮은 latency와 실패율 0을 유지했다.

## Failure Signal

| 항목 | 관측 |
| --- | --- |
| first limit candidate | `40 journey/s` |
| main failed route | `GET /concerts` |
| observed HTTP status | `503` |
| concert-service desired replicas | `3` |
| concert-service pod state | 재시작 발생, 일부 Pod Ready false |
| container exit code | `137` |
| probe signal | liveness/readiness timeout |

concert-service Pod에서 liveness probe timeout과 restart가 발생했다. exit code `137`이므로 메모리 압박 또는 강제 종료 가능성이 높다. 현재 concert-service memory limit은 `768Mi`다.

## Decision

| 판단 | 내용 |
| --- | --- |
| HPA scale-out 검증 | PASS |
| 예매 여정 안정성 | FAIL |
| 안정 처리량 | `20 journey/s` |
| 한계 후보 | `40 journey/s` |
| 우선 확인 대상 | concert-service memory/probe/DB query |

## Raw Result

원본 실행 결과는 같은 폴더의 [loadtest-run-report.json](loadtest-run-report.json)에 저장했다.
