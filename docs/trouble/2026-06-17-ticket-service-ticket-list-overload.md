---
id: TROUBLE-011
title: "부하테스트 중 ticket-service /tickets/me 전체 목록 조회 과부하"
status: triaged
priority: p1
severity: high
area: service
repos:
  - service
  - gitops
  - workspace
owner: unassigned
created: 2026-06-17
updated: 2026-06-17
resolved: null
tags:
  - loadtest
  - ticket-service
  - pagination
  - dataset
  - liveness
  - connection-pool
  - reservation-journey
related:
  - TROUBLE-010
  - gitops/platform/loadtest/scenarios/reservation-journey-load-test.js
  - gitops/platform/loadtest/flows/reservation-journey.js
  - service/services/ticket-service/app/services/ticket_service.py
links: []
---

# 부하테스트 중 ticket-service /tickets/me 전체 목록 조회 과부하

## Context

`reservation-journey-load-test`를 로그인된 사용자 기준 예매 부하테스트로 바꾼 뒤 로컬 Kubernetes에서 실행했다.

실행 run id는 `read-api-loadtest-reservation-journey-lo-manual-20260617026xp6s`다. 시나리오는 `ramping-arrival-rate`로 6분 동안 `5 -> 10 -> 20 iterations/s`까지 증가했고, customer pool은 10명으로 설정되어 있었다.

결과 리포트는 `status: FAIL`이었다. 전체 `http_req_failed_rate`는 `5.10%`, 전체 p95는 `5011ms`, p99는 `10001ms`였다. API별로는 `reservation.create`와 `payment.approve`가 안정적이었지만 `reservation_journey.ticket.list`가 p95 약 `9998ms`, 실패율 `15.84%`를 기록했다.

동시에 `ticket-service` Pod 3개가 liveness probe 실패로 재시작됐다.

## Symptoms

- 관찰된 현상:
  - `ticket-service` Pod 3개가 재시작됐다.
  - Kubernetes event에는 `Liveness probe failed: Get "/health": context deadline exceeded`가 반복됐다.
  - `ticket-service` 컨테이너의 last state는 `Completed`, exit code `0`이었다.
  - 직전 로그에서 `/tickets/me` 요청 duration이 `10s~14s`까지 증가했다.
  - `/health`는 단순 응답인데도 duration이 `3s~4.5s`까지 밀렸다.
  - shutdown 중 Kafka consumer가 DB connection pool checkout에 실패했다.
- 재현 조건:
  - `reservation-journey-load-test`를 customer pool 10명으로 실행한다.
  - `ticket.wait` 단계가 `/tickets/me`를 2초 간격으로 최대 45초 동안 polling한다.
  - 기존 테스트 데이터가 남아 있어 사용자별 티켓 수가 계속 증가한다.
- 기대 동작:
  - `ticket.wait`는 방금 생성한 reservation의 ticket 발급 여부만 확인한다.
  - `/tickets/me`는 기본 20건, 최대 100건의 페이지 단위로 응답하고 다음 조회용 `nextCursor`를 제공한다.
  - ticket-service의 health endpoint는 부하 중에도 liveness timeout 안에 응답한다.
- 실제 동작:
  - `ticket.wait`가 `/tickets/me` 전체 목록을 받아 클라이언트에서 `reservationId`를 찾는다.
  - 같은 customer pool 계정을 반복 사용하면서 사용자별 ticket 목록이 1000건 이상으로 커졌다.
  - 전체 목록 조회와 JSON 직렬화가 누적되어 health 요청까지 지연됐다.

## Impact

- 영향 범위:
  - `reservation-journey-load-test` 결과 해석.
  - ticket-service의 실제 처리 한계 판단.
  - Loki/Tempo/Grafana 기반 부하테스트 관측.
  - ticket-service liveness 안정성.
- 우선 처리 이유:
  - 사용자별 티켓 1000건 이상은 현실적인 예매 테스트 데이터가 아니다.
  - 비현실적인 데이터 분포 때문에 `/tickets/me`가 실제보다 훨씬 무거운 API처럼 측정됐다.
  - ticket-service Pod 재시작으로 k6의 `http_status: 0` 실패가 발생했고, 전체 실험 결과가 오염됐다.
  - 페이지네이션 없는 목록 API는 실제 운영에서도 누적 데이터가 늘면 같은 문제가 반복될 수 있다.
- 우회 방법:
  - 재실행 전 ticket DB 또는 reservation journey dataset을 초기화한다.
  - customer pool 크기를 늘리거나 계정당 생성 ticket 수를 제한한다.
  - 임시로 `poll_seconds`와 `poll_interval_seconds`를 보수적으로 조정한다.
  - service/backend 한계 측정 전 observability 로그 조회 범위를 좁혀 Loki 추가 부하를 줄인다.

## Investigation

| 시간 | 확인 내용 | 결과 |
| --- | --- | --- |
| 2026-06-17 11:42 KST | 부하테스트 run report 확인 | `status: FAIL`, 전체 p95 `5011ms`, p99 `10001ms`, 실패율 `5.10%` |
| 2026-06-17 11:42 KST | API step summary 확인 | `ticket.list` p95 `9997.57ms`, p99 `10028.98ms`, 실패율 `15.84%`, 요청 수 `6333` |
| 2026-06-17 KST | `ticket-service` Pod 상태 확인 | 3개 Pod 모두 Running이지만 restart `2~3회` |
| 2026-06-17 KST | Kubernetes event 확인 | `/health` liveness/readiness probe가 context deadline exceeded로 실패 |
| 2026-06-17 KST | `ticket-service` previous log 확인 | `/tickets/me`가 `10s~14s`까지 지연, `/health`도 `3s~4.5s`까지 지연 |
| 2026-06-17 KST | shutdown stack trace 확인 | `QueuePool limit of size 15 overflow 5 reached, connection timed out, timeout 10.00` |
| 2026-06-17 KST | `ticket-db` 상태 확인 | DB Pod는 재시작 없음. 현재 connection은 idle 중심 |
| 2026-06-17 KST | ticket 데이터 분포 확인 | `tickets` 총 `15068건`, distinct user `10명` |
| 2026-06-17 KST | 사용자별 ticket 수 확인 | 사용자별 `1258~1659건` |
| 2026-06-17 KST | service 코드 확인 | `/tickets/me`는 `Ticket.user_id == user.user_id` 전체 결과를 `order_by(Ticket.id).all()`로 반환 |
| 2026-06-17 KST | loadtest 코드 확인 | `waitForTicket()`가 `/tickets/me` 전체 목록을 반복 조회한 뒤 `reservationId`를 클라이언트에서 검색 |

## Root Cause

이번 재시작은 ticket-service 컨테이너가 OOM이나 프로세스 예외로 직접 크래시난 현상이 아니다.

직접 원인은 `liveness probe` 실패다. ticket-service가 부하 중 `/health` 요청에 1초 안에 응답하지 못했고, kubelet이 컨테이너를 재시작했다.

근본 원인은 테스트 데이터셋과 API 형태가 맞물려 `/tickets/me`가 비현실적으로 무거워진 것이다.

현재 `reservation-journey-load-test`는 customer pool 10명을 반복 사용한다. 테스트가 여러 번 실행되면서 ticket DB에는 10명에게 `15068`개의 ticket이 쌓였고, 사용자별 ticket 수는 1000건을 넘었다.

그런데 `ticket.wait`는 방금 만든 reservation의 ticket 1건만 확인하면 되지만, 실제 구현은 다음 순서로 동작한다.

```text
GET /tickets/me
-> 해당 사용자의 전체 ticket 목록 반환
-> k6가 응답 배열에서 reservationId 일치 항목 검색
-> 없으면 2초 후 재시도
```

이 구조에서는 사용자별 ticket 수가 늘어날수록 매 polling 요청의 DB 조회, JSON 직렬화, network payload, k6 parsing 비용이 계속 증가한다. 부하테스트 후반에는 ticket-service가 `/tickets/me` 요청을 처리하느라 `/health`까지 지연했고, liveness probe가 실패했다.

shutdown 중 보인 `QueuePool limit of size 15 overflow 5 reached`는 별도 1차 원인이라기보다, 같은 시점에 HTTP 요청과 Kafka consumer가 DB connection pool을 함께 사용하면서 발생한 압박 증거로 본다.

## Decision

- 이번 결과는 ticket-service의 순수 처리 한계로 바로 해석하지 않는다.
- 사용자별 ticket이 1000건 이상 쌓인 데이터셋은 현실적인 reservation journey loadtest 조건이 아니다.
- `/tickets/me`는 페이지네이션 없이 전체 목록을 반환하므로 제품 API 관점에서도 개선이 필요하다.
- `ticket.wait`는 전체 목록 polling이 아니라 cursor pagination을 사용해 제한된 범위만 확인한다. reservation id 기준 ticket 확인 API는 필요하면 후속 작업으로 분리한다.
- 테스트 데이터셋은 실행마다 run id 기반 신규 customer pool을 만들고, 실제 부하에 참여하는 고객 수를 별도 설정으로 둔다. 1차 기준은 기본 pool 100명, 계정당 최대 100건 안쪽이다.
- 부하테스트 결과를 비교할 때는 customer pool size, 계정당 ticket 수, DB 초기화 여부를 실행 조건에 반드시 남긴다.

## Updated Test Method

초기 실패 이후 `reservation-journey-load-test`는 같은 시나리오 안에서도 실험 조건을 preset으로 분리해 실행한다.

핵심 변경은 다음과 같다.

- `PRESET` 이름으로 실험 조건을 선택한다. 예: `local-ticket-open-5m`, `mau10k-normal-peak`, `mau10k-ticket-open`, `stress-find-limit`.
- setup 단계에서 `loadtest_run_id` 기반 revision을 만들어 신규 customer pool과 신규 공연/회차/좌석 데이터셋을 준비한다.
- customer pool 전체 크기와 실제 부하에 참여하는 고객 수를 분리한다. 기본 customer pool은 100명 이상으로 두고, `activeCustomerCount`로 측정 구간의 고객 분산을 조절한다.
- `ticket.wait`는 `/tickets/me`를 무제한 전체 목록으로 보지 않고 `ticketListLimit`/`ticketListMaxPages` 범위 안에서 cursor pagination으로 확인한다.
- `loadtest_experiment_conditions`와 `loadtest_run_report`에 traffic model, customer pool, active customer count, dataset shape, ticket pagination 조건을 함께 남긴다.

`local-ticket-open-5m` 검증 조건은 다음과 같다.

| 항목 | 값 |
| --- | --- |
| scenario | `reservation-journey-load-test` |
| preset | `local-ticket-open-5m` |
| executor | `constant-arrival-rate` |
| rate / duration | `2 iterations/s`, `5m` |
| expected journeys | `600` |
| customer pool / active customer | `100 / 100` |
| dataset | `10` concerts, `20` performances, `6000` seats |
| `/tickets/me` 조회 범위 | `limit=20`, 최대 `5` pages |

이 조건은 운영 한계를 확정하기 위한 스트레스 테스트가 아니라, 오염된 데이터셋을 제거했을 때 ticket 목록 병목이 재현되는지 확인하는 로컬 검증용 preset이다.

## Follow-up Result

수정된 방식으로 `local-ticket-open-5m`를 실행한 결과 run id `read-api-loadtest-reservation-journey-lo-manual-2026061705rcvtw`는 `PASS`였다.

전체 결과:

| 지표 | 값 |
| --- | --- |
| status | `PASS` |
| iterations | `600` |
| overall p95 | `74.13ms` |
| overall p99 | `246.99ms` |
| error rate | `0%` |
| RPS | `13.32 req/s` |

API별 주요 결과:

| step | p95 | p99 | error rate | RPS | requests |
| --- | ---: | ---: | ---: | ---: | ---: |
| `reservation_journey.concerts` | `112.45ms` | `250.51ms` | `0%` | `1.81` | `600` |
| `reservation_journey.performances` | `32.95ms` | `137.87ms` | `0%` | `1.81` | `600` |
| `reservation_journey.seats` | `90.38ms` | `233.64ms` | `0%` | `1.81` | `600` |
| `reservation_journey.reservation.create` | `54.34ms` | `186.47ms` | `0%` | `1.81` | `600` |
| `reservation_journey.payment.approve` | `38.21ms` | `150.13ms` | `0%` | `1.81` | `600` |
| `reservation_journey.ticket.list` | `32.30ms` | `117.31ms` | `0%` | `3.61` | `1197` |

초기 실패 조건과 비교하면 `ticket.list`는 p95 약 `9998ms`, 실패율 `15.84%`에서 p95 `32.30ms`, 실패율 `0%`로 내려왔다. 이 차이는 ticket-service의 기본 처리 성능이 10초대였다는 뜻이 아니라, 초기 실험의 customer pool 재사용과 전체 목록 조회가 결과를 크게 왜곡했다는 근거다.

다만 이 결과만으로 `mau10k-ticket-open` 전체 조건이 통과한다고 볼 수는 없다. 로컬 5분 preset은 측정 조건을 정리한 뒤 병목이 사라지는지 확인하는 smoke에 가깝고, MAU 1만 가정의 티켓 오픈 검증은 observability 리소스와 report 수집 안정성을 확보한 뒤 별도 실행해야 한다.

## Additional Finding

후속 Tempo trace `aa8d8073907127c1dff17f6ea51b7ce2`에서는 `/tickets/me` 전체 duration이 `135.33ms`였지만 DB `SELECT ticket_db` span은 `645.21us`였다.

이 trace는 쿼리 자체보다 쿼리 이후의 애플리케이션 처리 구간이 튈 수 있음을 시사한다. 의심 구간은 SQLAlchemy 객체를 Pydantic/FastAPI 응답 모델로 변환하는 과정, JSON 직렬화, worker CPU 경합이다.

따라서 후속 관측에서는 `/tickets/me` 내부를 최소한 다음 두 단계로 나눠 본다.

- `ticket.list.query`: user id, cursor 조건, `limit + 1` 조회 구간.
- `ticket.list.response`: 조회 결과를 `TicketListResponse`로 조립하는 구간.

두 span이 모두 짧은데 root span만 길면 FastAPI 최종 response validation/serialization 또는 middleware/runtime 지연을 다음 후보로 본다.

이번 조사에서는 `ticket.list.route` span도 함께 본다.

- `ticket.list.query`: SQLAlchemy query와 `limit + 1` 조회 구간.
- `ticket.list.response`: SQLAlchemy 객체를 `TicketListResponse` item으로 조립하는 구간.
- `ticket.list.route`: FastAPI route 함수 안에서 service 호출을 감싸는 구간.

해석 기준은 다음과 같다.

| 관찰 | 우선 후보 |
| --- | --- |
| `ticket.list.query`가 길다 | DB index, cursor 조건, connection checkout, query 실행 |
| `ticket.list.response`가 길다 | Pydantic 모델 조립, 객체 attribute 접근, Python CPU 경합 |
| `ticket.list.route`는 짧고 HTTP root span만 길다 | FastAPI response validation/serialization, middleware/runtime, worker scheduling |
| 세 span이 모두 짧고 k6 step만 길다 | network/Kong/sidecar, client parsing, load generator saturation |

## Ticket-Service Read Scenario

`ticket-service-read-load-test`는 reservation journey의 축소판이 아니다.
목적은 ticket-service `/tickets/me` read path의 tail latency 원인을 분리하는 것이다.

setup 단계는 run id 기반 customer pool을 만들고 `/tickets/issue`로 customer별 ticket 목록을 준비한다.
측정 단계는 다음 세 step만 순차 실행한다.

| step | 동작 | 확인 포인트 |
| --- | --- | --- |
| `ticket-list` | `/tickets/me` 첫 페이지 조회 | 첫 페이지 p95/p99, error rate, RPS |
| `ticket-list-pagination` | `nextCursor`로 설정된 page depth만큼 조회 | cursor pagination 누적 비용 |
| `ticket-wait-by-list` | 설정된 `reservationId`의 ticket을 pagination으로 찾기 | reservation journey의 ticket wait와 같은 read pattern |

RPS, duration, VU, local/cluster 조건은 scenario 코드가 아니라 `gitops/platform/loadtest/values/scenarios/ticket-service-read-load-test.yaml` 또는 `values/presets/ticket-service-read/*.yaml`에서 관리한다.
`limit`, pagination page depth, wait target ticket position, customer별 ticket 수, active customer 수 역시 values로 둔다.

리포트에서는 `loadtest_api_summary.step`과 `loadtest_run_report.api_step_results[].step`에서 `ticket-list`, `ticket-list-pagination`, `ticket-wait-by-list`를 따로 본다.
처리량은 기존 `http_reqs_rate`와 사람이 읽기 쉬운 `rps`가 함께 남는다.

## Pyroscope Check

repo 기준으로 Pyroscope 경로는 존재한다.

- service 코드: 각 서비스의 `configure_app_observability()`가 `configure_process_profiling(config)`와 `configure_process_tracing(config)`를 호출한다.
- observability package: `PYROSCOPE_ENABLED=true`이고 `PYROSCOPE_SERVER_ADDRESS`가 있을 때 process-level profiler가 켜진다.
- span/profile correlation: `PYROSCOPE_ENABLED=true`와 `PYROSCOPE_SPAN_PROFILES_ENABLED=true`가 동시에 필요하다.
- backend: `gitops/argo/applications/aws-dev/platform/pyroscope.yaml`가 Pyroscope Helm release를 `observability` namespace에 배포한다.
- aws-dev env: `gitops/values/env/aws-dev.yaml`은 profiling enabled, server address, sample rate 25를 설정하지만 spanProfilesEnabled는 false다.

따라서 aws-dev에서 process-level profile 자체가 안 보이면 우선 배포/env 문제를 본다.
`ticket-aws-dev` Application은 `values/base.yaml`, `values/env/aws-dev.yaml`, `values/services/ticket.yaml`, `values/overrides/aws-dev-smoke-stable.yaml` 순서로 병합된다.
현재 `values/services/ticket.yaml`과 `aws-dev-smoke-stable` override는 profiling을 끄지 않으므로, values 기준으로는 ticket-service Pod에 `PYROSCOPE_ENABLED=true`와 `PYROSCOPE_SERVER_ADDRESS=http://pyroscope.observability.svc.cluster.local:4040`가 들어가야 한다.

반대로 Tempo span에서 Pyroscope profile 링크가 기대처럼 보이지 않는 것은 현재 설정만으로는 정상이다.
aws-dev의 `observability.profiling.spanProfilesEnabled`가 false라 `pyroscope-otel` span processor가 붙지 않는다.
API별 trace에서 profile로 바로 넘어가려면 부하 구간에만 `spanProfilesEnabled=true`와 낮은 cardinality tag(`scenario`, `run_id`)를 override해야 한다.

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | ticket-service Pod 재시작 원인 확인 | workspace | 이 문서 |
| done | `/tickets/me` latency와 liveness probe 실패 연결 | workspace | 이 문서 |
| done | ticket DB의 사용자별 ticket 수 분포 확인 | workspace | 이 문서 |
| done | loadtest `ticket.wait`가 `/tickets/me` 전체 목록을 polling하는 구조 확인 | workspace | `gitops/platform/loadtest/flows/reservation-journey.js` |
| done | `/tickets/me`에 페이지네이션 추가 | service | `service/services/ticket-service/app/routers/tickets.py` |
| done | ticket 목록 response schema와 OpenAPI 문서 갱신 | service/workspace | `workspace/docs/project_docs/02-service-architecture/openapi/services/ticket-service/paths/tickets_me.yaml` |
| todo | reservation id 기준 ticket 조회 또는 ticket wait 전용 확인 API 검토 | service/gitops | `ticket.wait` |
| done | reservation journey 테스트 데이터셋에 계정당 ticket 상한 추가 | gitops | `gitops/platform/loadtest` |
| done | 실행마다 run id 기반 신규 customer pool 생성 | gitops | `reservation-journey-load-test` |
| done | `loadtest_experiment_conditions`에 customer pool size와 active customer count 기록 | gitops | `loadtest_run_report` |
| done | 신규 방식 `local-ticket-open-5m`로 오염 제거 후 ticket 목록 병목 재검증 | gitops/workspace | `read-api-loadtest-reservation-journey-lo-manual-2026061705rcvtw` |
| todo | `mau10k-ticket-open` 조건을 observability 리소스 안정화 후 재실행 | gitops/workspace | `reservation-journey-load-test` |
| done | `/tickets/me` 응답 조립/직렬화 구간 trace 보강 | service/workspace | `ticket.list.query`, `ticket.list.response`, `ticket.list.route` |
| done | ticket-service read path 독립 부하테스트 시나리오 추가 | gitops/workspace | `ticket-service-read-load-test` |
| todo | `ticket-service-read-load-test`를 local smoke와 aws-dev 조건에서 실행해 step별 p95/p99/RPS를 비교 | gitops/workspace | `ticket-list`, `ticket-list-pagination`, `ticket-wait-by-list` |

## Resolution

부분 해결. 초기 장애의 1차 원인은 데이터셋 오염과 페이지네이션 없는 ticket 목록 API가 결합된 것으로 본다.

후속 조치는 세 갈래다.

1. 제품 API: `/tickets/me`는 `limit`/`cursor`를 받고 `items`/`nextCursor`로 응답한다.
2. 부하테스트: 실행마다 run id 기반 신규 customer pool을 만들고, `customerPool.size`와 `activeCustomerCount`를 분리해 현실적인 사용자 분포를 보장한다.
3. 관측: `/tickets/me`에서 DB query와 response 조립 구간을 분리해, 쿼리가 아닌 코드 레벨 지연 여부를 확인한다.

`local-ticket-open-5m`에서는 `reservation_journey.ticket.list`가 p95 `32.30ms`, p99 `117.31ms`, 실패율 `0%`로 안정화됐다. 해결 완료 판단은 `mau10k-ticket-open` 또는 그에 준하는 ticket-open preset을 다시 실행해 ticket-service Pod 재시작이 사라지고, API별 p95/p99와 실패율이 기준 안에 들어오는지 확인한 뒤 내린다.
