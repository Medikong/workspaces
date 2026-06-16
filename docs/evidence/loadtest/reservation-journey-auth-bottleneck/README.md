# Reservation Journey Loadtest: Auth Bottleneck

## Summary

2026-06-16 로컬 Kubernetes 환경에서 `reservation-journey-load-test`를 실행했다.

결론은 예매 생성, 결제 승인, 티켓 조회보다 `auth-service`의 `/auth/login`이 먼저 포화됐다는 것이다. k6 기준 전체 RPS는 약 59였지만 실패율이 34%까지 올라갔고, 실패 대부분은 login 단계의 503이었다. Kong metric과 로그에서는 `ticketing-auth/auth-service` upstream target을 찾지 못한 503이 확인됐고, 같은 시간 auth Pod에는 readiness/liveness probe timeout이 기록됐다.

이 결과는 현재 시나리오가 "예매 서비스 자체의 최대 처리량"보다 "매 iteration login을 포함한 전체 사용자 여정에서 auth-service가 먼저 포화되는 지점"을 측정했음을 의미한다.

## Follow-up: Resource Scale-up Did Not Remove The Bottleneck

초기 결과만 보면 답은 단순해 보였다. auth-service CPU limit이 `500m`에 거의 붙었고, Pod는 1개였다. 그래서 먼저 가장 평범한 처방부터 시도했다.

- auth-service CPU limit을 `500m`에서 더 큰 값으로 올린다.
- auth-service replica를 1개에서 여러 개로 늘린다.
- 같은 `reservation-journey-load-test`를 다시 실행한다.

기대는 명확했다. 병목이 단순히 CPU limit이나 Pod 수 부족 때문이라면, login latency가 내려가고 Kong의 auth upstream 5xx도 줄어야 한다.

하지만 리소스를 올린 뒤에도 병목은 사라지지 않았다. CPU와 Pod 개수를 늘렸는데도 `/auth/login`이 여전히 전체 예매 여정의 앞단을 막았다. 이 결과는 "CPU limit 500m라서 느렸다"는 1차 설명만으로는 부족하다는 뜻이다.

이제 질문은 조금 바뀐다.

```text
auth-service가 바빴다
=> 그래서 CPU와 replica를 늘렸다
=> 그런데도 login 병목이 남았다
=> 그러면 login 내부에서 실제로 시간을 쓰는 함수는 어디인가?
```

현재 가장 의심스러운 후보는 여전히 password verification이다. 다만 trace와 metric만으로는 `verify_password()`, `_hashlib.pbkdf2_hmac`, DB connection 대기, token 발급, audit insert 중 어느 구간이 실제 CPU 시간을 가져가는지 확정할 수 없다.

그래서 다음 단계는 Pyroscope를 붙여 Python profile을 수집하는 것이다. 부하테스트와 같은 조건에서 profile을 보면, `/auth/login`의 시간 증가가 PBKDF2 계산에 몰린 것인지, SQLAlchemy/DB 대기인지, 아니면 token/audit 처리나 worker scheduling 문제인지 훨씬 분명해진다. 여기서부터는 추정이 아니라 flamegraph로 확인한다.

## Run Conditions

| 항목 | 값 |
| --- | --- |
| 실행 시각 | 2026-06-16 12:37:17 KST |
| Kubernetes Job | `read-api-loadtest-reservation-journey-lo-manual-20260616033717` |
| Pod | `read-api-loadtest-reservation-journey-lo-manual-2026061603n6lqb` |
| target | `local` |
| base URL | `http://kong-kong-proxy.kong.svc.cluster.local` |
| scenario | `reservation-journey-load-test` |
| dataset profile | `reservation-journey` |
| dataset revision | `reservation-v1` |
| customer pool revision | `reservation-v1` |
| duration | `6m` |
| max VU | `50` |
| stages | `1m -> 10`, `2m -> 25`, `3m -> 50` |
| think time | `0s` |
| k6 runner image | `localhost:5001/read-api-loadtest:dev` |
| auth-service image | `localhost:5001/auth-service:dev` |
| auth-service resource | request `50m/128Mi`, limit `500m/512Mi` |
| Job result | `Failed`, reason `BackoffLimitExceeded` |

Kong rate limit 상태는 실행 후 다음 값으로 원복된 것을 확인했다.

| plugin | minute | policy |
| --- | ---: | --- |
| `ticketing-rate-limit-concerts` | 120 | `local` |
| `ticketing-rate-limit-reservations` | 120 | `local` |
| `ticketing-rate-limit-payments` | 120 | `local` |
| `ticketing-rate-limit-tickets` | 120 | `local` |
| `ticketing-rate-limit-notifications` | 120 | `local` |

## k6 Summary

`loadtest_summary` 로그:

| metric | value |
| --- | ---: |
| `http_reqs_rate` | 59.081946553174774 |
| `http_req_failed_rate` | 0.3402543352601156 |
| `http_req_duration_p95_ms` | 1561.9097171999992 |
| `http_req_duration_p99_ms` | 4619.955594599998 |
| `checks_rate` | 0.8225362982972361 |
| `iterations` | 9137 |
| `vus_max` | 50 |

넘은 threshold:

| metric | 기준 |
| --- | --- |
| `http_req_failed` | `< 0.01` |
| `http_req_duration p95` | `< 1000ms` |
| `http_req_duration p99` | `< 2000ms` |
| `checks` | `>= 0.99` |
| `loadtest_reservation_journey_success` | `>= 0.99` |
| `loadtest_ticket_issued_rate` | `>= 0.99` |

## Step Result

k6 runner log의 `loadtest_step` 집계:

| step | status | count |
| --- | ---: | ---: |
| `reservation_journey.auth.login` | 503 | 3395 |
| `reservation_journey.ticket.list` | 200 | 335 |
| `reservation_journey.seats` | 200 | 166 |
| `reservation_journey.reservation.create` | 201 | 165 |
| `reservation_journey.payment.approve` | 201 | 165 |
| `reservation_journey.performances` | 200 | 162 |
| `reservation_journey.concerts` | 200 | 155 |
| `reservation_journey.auth.login` | 200 | 148 |
| `reservation_journey.reservation.create` | 409 | 1 |

k6 runner log의 `loadtest_journey_step` 집계:

| step | outcome | count |
| --- | --- | ---: |
| `reservation_journey.auth.login` | `failed` | 3395 |
| `reservation_journey.ticket.list` | `success` | 170 |
| `reservation_journey.reservation.create` | `success` | 165 |
| `reservation_journey.payment.approve` | `success` | 165 |
| `reservation_journey.catalog.select_seat` | `success` | 165 |
| `reservation_journey.auth.login` | `success` | 148 |
| `reservation_journey.reservation.create` | `conflict` | 1 |

해석:

- 실패는 예매 생성 이후 단계가 아니라 login 진입 단계에 집중됐다.
- `reservation.create`의 409는 1건뿐이며, 좌석 충돌이 전체 실패율을 만든 원인은 아니다.
- payment/ticket 구간은 login을 통과한 요청에 대해서는 대부분 성공했다.

## Gateway Evidence

Prometheus에서 종료 시각 `2026-06-16T03:43:24Z` 기준 6분 window로 조회한 Kong request 증가량:

| exported_service | code | increase |
| --- | ---: | ---: |
| `ticketing-concert.concert-service.8082` | 200 | 5425.123788629022 |
| `ticketing-auth.auth-service.8080` | 503 | 4315.662519166783 |
| `ticketing-ticket.ticket-service.8085` | 200 | 3582.5671670737397 |
| `ticketing-auth.auth-service.8080` | 200 | 1809.8291504796998 |
| `ticketing-payment.payment-service.8080` | 201 | 1792.3744992393893 |
| `ticketing-reservation.reservation-service.8083` | 201 | 1792.3744992393893 |
| `ticketing-reservation.reservation-service.8083` | 409 | 9.818241322674682 |
| `ticketing-auth.auth-service.8080` | 502 | 7.636409917635865 |
| `ticketing-concert.concert-service.8082` | 429 | 0 |

Kong log에서 같은 시간대에 다음 메시지가 반복됐다.

```text
No targets could be found for kubernetes service {"namespace": "ticketing-auth", "name": "auth-service", "kong_service": "ticketing-auth.auth-service.8080"}
```

기록된 시각:

| timestamp UTC |
| --- |
| `2026-06-16T03:40:50Z` |
| `2026-06-16T03:42:38Z` |
| `2026-06-16T03:42:41Z` |
| `2026-06-16T03:43:05Z` |
| `2026-06-16T03:43:14Z` |
| `2026-06-16T03:43:17Z` |

해석:

- 503은 auth-service 애플리케이션이 정상 HTTP 503을 반환한 것이 아니라, Kong이 auth upstream target을 찾지 못한 상황에 가깝다.
- 같은 시간 auth-service Pod의 readiness가 흔들렸으므로 Kong 입장에서 target이 사라진 것으로 판단된다.

## Service Evidence

Prometheus에서 종료 시각 기준 6분 window로 조회한 service HTTP 증가량:

| service_name | status | increase |
| --- | ---: | ---: |
| `concert-service` | 200 | 5836.487440642681 |
| `ticket-service` | 200 | 3895.8488644835174 |
| `auth-service` | 200 | 2100.1018231186968 |
| `reservation-service` | 201 | 1877.3521444284854 |
| `payment-service` | 201 | 1874.1477427683133 |
| `notification-service` | 200 | 209.4513719489099 |
| `payment-service` | 200 | 208.35984800276358 |
| `reservation-service` | 200 | 208.3522716942712 |
| `reservation-service` | 409 | 9.81764631020126 |

중요한 차이:

- Kong metric에는 `auth-service` 503이 대량으로 있다.
- auth-service 애플리케이션 metric에는 5xx가 거의 없다.
- 따라서 실패는 애플리케이션 내부에서 503 response를 만든 것보다, readiness 탈락 또는 upstream target 없음 때문에 Kong이 503을 만든 것으로 보는 편이 맞다.

## Pod And Resource Evidence

Prometheus에서 종료 시각 기준 6분 window로 조회한 Pod CPU max:

| namespace | pod | container | max core |
| --- | --- | --- | ---: |
| `ticketing-auth` | `auth-service-899cf6cf8-cxvrc` | `auth-service` | 0.4989240766760317 |
| `loadtest` | `read-api-loadtest-reservation-journey-lo-manual-2026061603n6lqb` | `runner` | 0.41445816650559164 |
| `ticketing-ticket` | `ticket-service-755b6d5577-grsj2` | `ticket-service` | 0.2891969232548729 |
| `ticketing-concert` | `concert-service-b5cccf855-vfbdz` | `concert-service` | 0.27732261188704277 |
| `ticketing-reservation` | `reservation-service-574f9c4c94-fg7qc` | `reservation-service` | 0.14629858667113596 |
| `ticketing-payment` | `payment-service-64b4d65ddb-5q48j` | `payment-service` | 0.12282777191129877 |

auth-service의 CPU limit은 `500m`이다. 실행 중 max CPU가 `0.4989 core`였으므로 limit에 거의 붙었다.

Pod restart는 관측 window에서 0이었다. 따라서 컨테이너 재시작보다는 readiness 탈락과 응답 지연이 핵심 증상이다.

auth Pod event:

```text
Liveness probe failed: Get "http://10.244.1.14:8080/health": context deadline exceeded
Readiness probe failed: Get "http://10.244.1.14:8080/health": context deadline exceeded
```

auth-service access log 집계:

| 항목 | 값 |
| --- | ---: |
| `/auth/login` count | 1791 |
| `/auth/login` average duration | 2014.9ms |
| `/auth/login` max duration | 8488ms |
| `/health` count | 996 |
| `/health` average duration | 68.6747ms |
| `/health` max duration | 3682ms |

실행 구간의 `/auth/login` log에는 3초에서 6초 이상 걸린 200 응답이 다수 있었다.

## Root Cause Hypothesis

현재 가장 유력한 원인은 login 경로의 CPU-bound password verification이다.

auth-service 구현은 `PBKDF2-SHA256` password hash를 사용하며 기본 반복 횟수는 `210000`이다. `uvicorn` 단일 프로세스에서 login 요청이 몰리면 비밀번호 검증이 CPU를 많이 사용하고, 이벤트 루프 또는 worker가 health probe 응답까지 늦게 처리할 수 있다.

이때 벌어진 일은 다음 순서로 설명된다.

1. k6가 50 VU까지 증가하면서 매 iteration마다 `/auth/login`을 호출한다.
2. auth-service가 password verification 때문에 CPU limit `500m` 근처까지 사용한다.
3. `/auth/login` latency가 초 단위로 증가한다.
4. `/health` probe도 timeout된다.
5. Pod readiness가 흔들리고 Kong이 `auth-service` target을 찾지 못하는 구간이 생긴다.
6. Kong이 `/auth/login` 요청에 503을 반환한다.
7. k6는 login 단계에서 journey를 종료하고 전체 실패율이 34%까지 증가한다.

## What This Run Proves

- 로컬 환경에서 `reservation-journey-load-test`는 50 VU, think time 0 조건에서 auth-service login 병목을 재현했다.
- Kong rate limit 429는 이번 run의 핵심 원인이 아니다.
- k6 runner resource는 아직 한계에 도달하지 않았다.
- reservation/payment/ticket 서비스보다 auth-service가 먼저 한계에 도달했다.
- 이후 auth-service CPU limit과 replica를 늘린 실험에서도 login 병목이 남았으므로, 단순 리소스 부족만으로 설명하기 어렵다.
- 현재 결과만으로 reservation-service의 최대 처리량을 결론내리면 안 된다. login이 앞에서 요청을 차단했기 때문이다.

## Next Experiments

| 우선순위 | 실험 | 목적 | 기대 관측 |
| --- | --- | --- | --- |
| 1 | Pyroscope 연동 후 동일 부하 재실행 | login 내부 CPU hotspot 확인 | `verify_password()`, `_hashlib.pbkdf2_hmac`, SQLAlchemy, token/audit 처리 중 실제 hotspot 확인 |
| 2 | login 포함 시나리오와 token pre-warm 예매 시나리오 분리 | auth 병목과 reservation 병목 분리 | reservation/payment/ticket 구간의 실제 한계 관측 |
| 3 | auth password verification worker/process 구조 검토 | CPU-bound 작업이 health/readiness를 막는지 확인 | probe timeout 감소 |
| done | auth-service CPU limit `500m -> 1~2 core` | CPU limit 영향 확인 | 리소스를 올려도 login 병목이 남아 profile 기반 원인 확인 필요 |
| done | auth-service replica `1 -> 2~3` | login 부하 분산 효과 확인 | Pod 수를 늘려도 login 병목이 남아 profile 기반 원인 확인 필요 |

readiness timeout만 늘리는 것은 진단용으로만 사용한다. timeout을 늘리면 503은 줄 수 있지만, login CPU 포화 자체를 해결하지는 않는다.

리소스 증설 실험을 이미 거친 뒤라 다음 실험은 더 좁게 들어간다. 같은 부하 조건에서 Pyroscope profile을 수집하고, auth-service가 실제로 CPU 시간을 쓰는 함수를 확인한다. 그 결과에 따라 PBKDF2 비용 조정, worker/process 구조 변경, token pre-warm 시나리오 분리 중 어느 쪽이 맞는지 결정한다.

## Reproduction And Query Notes

실행:

```bash
SCENARIO=reservation-journey-load-test task --dir gitops dev:loadtest
```

k6 summary 확인:

```bash
kubectl -n loadtest logs read-api-loadtest-reservation-journey-lo-manual-2026061603n6lqb --tail=-1 \
  | jq -R 'fromjson? | select(.event=="loadtest_summary")'
```

step/status 집계:

```bash
kubectl -n loadtest logs read-api-loadtest-reservation-journey-lo-manual-2026061603n6lqb --tail=-1 \
  | jq -R -r 'fromjson? | select(.event=="loadtest_step") | [.step, (.http_status|tostring)] | @tsv' \
  | sort \
  | uniq -c \
  | sort -nr
```

Kong target error 확인:

```bash
kubectl -n kong logs -l app.kubernetes.io/name=kong --since=30m --all-containers=true --tail=8000 \
  | rg 'No targets could be found.*ticketing-auth|auth-service'
```

auth Pod event 확인:

```bash
kubectl -n ticketing-auth describe pod -l app.kubernetes.io/name=auth-service
```
