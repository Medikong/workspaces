# 서비스별 병목 및 개선 종합 분석

작성일: 2026-06-22

## Technical Summary

서비스별 병목은 한 가지 자원으로만 설명되지 않았다. `capacity-baseline`, `service-hpa-spike`, `reservation-journey`, API 통합 벤치마크, trouble 문서를 함께 보면 병목은 아래처럼 정리된다.

- **CPU 병목은 auth-service에서 가장 분명했다.** `/auth/login`은 PBKDF2 password verification 때문에 CPU-bound 성격이 강하고, `1000m` 기준 운영값도 Pod당 `30 RPS`로 따로 고정했다.
- **FastAPI 처리 슬롯 병목도 공통으로 있었다.** `uvicorn worker=1` 조건에서는 HTTP 요청, DB pool checkout 대기, JSON 직렬화, health probe가 한 프로세스의 처리 여유를 공유해 head-of-line blocking이 커졌다.
- **DB connection/pool 병목은 concert-service에서 가장 크게 재발했다.** HPA는 `1 -> 4`까지 동작했지만, `seat-map`과 catalog read path가 DB connection을 오래 점유하면서 SQLAlchemy `QueuePool` timeout이 다시 발생했다.
- **응답 payload와 직렬화 병목은 ticket-service와 notification-service 목록 API에서 드러났다.** 전체 목록을 materialize하거나 작은 customer pool을 반복 사용하면 DB보다 JSON 응답 구성과 network payload가 결과를 왜곡했다.
- **payment-service는 CPU보다 DB query shape와 index가 핵심이었다.** 정산 기준 API는 같은 row set을 두 번 집계하고 `(concert_id, status)` predicate에 맞는 복합 인덱스가 없어 p99가 커졌다.
- **memory 자체가 1차 병목으로 확정된 서비스는 없다.** Pod restart, exit code, health probe timeout은 있었지만 문서상 원인은 대부분 FastAPI HTTP worker starvation, DB pool checkout, 응답 지연, readiness 탈락으로 설명된다.
- **네트워크 I/O는 직접 대역폭 병목보다 실험 해석 변수였다.** Kong rate limit, 큰 JSON payload, cursor 없는 목록 응답, Ingress/LB hop이 service latency와 capacity SLO를 보수적으로 잡게 만든 요인이다.

## 분석 범위와 기준

이 문서는 `docs/trouble`의 성능 관련 trouble과 아래 evidence를 원본으로 삼는다.

| 원본 | 역할 |
| --- | --- |
| [TROUBLE-010: 로컬 부하테스트 k6 Pod IP 단위 Kong rate limit](../../trouble/2026-06-16-local-loadtest-kong-ip-rate-limit.md) | 네트워크/Ingress 계층 오판 사례 |
| [TROUBLE-011: auth login trace의 미계측 지연 구간](../../trouble/2026-06-16-auth-login-trace-latency-under-load.md) | auth CPU/DB connection 병목 |
| [TROUBLE-012: ticket-service /tickets/me 전체 목록 조회 과부하](../../trouble/2026-06-17-ticket-service-ticket-list-overload.md) | ticket 목록 payload/직렬화/health probe 병목 |
| [TROUBLE-015: concert-service catalog API overfetch](../../trouble/2026-06-20-concert-service-catalog-api-overfetch.md) | concert read path overfetch와 DB pool 병목 |
| [TROUBLE-016: notification-service 전체 materialize](../../trouble/2026-06-20-notification-list-full-materialization.md) | notification cursor pagination 개선 |
| [TROUBLE-017: payment-service 정산 query/index](../../trouble/2026-06-20-payment-service-settlement-query-aggregate-index.md) | payment DB 집계 query 개선 |
| [TROUBLE-018: FastAPI uvicorn worker 수 부족](../../trouble/2026-06-21-fastapi-worker-execution-unit-mixed-bottleneck.md) | `uvicorn worker=1` 처리 슬롯 병목과 API/worker 분리 개선 |
| [TROUBLE-019: HPA scale-out 후 DB connection budget](../../trouble/2026-06-21-hpa-scaleout-db-connection-budget.md) | HPA와 DB connection budget 재발 병목 |
| [local-baseline-1000m server/worker split 결과](../loadtest/capacity-baseline/reports/local-baseline-1000m-server-worker-2026-06-21/README.md) | `UVICORN_WORKERS` 적용 범위, server/worker entrypoint 분리, capacity baseline PASS 근거 |
| [1000m RPS Baseline Final Analysis](../loadtest/capacity-baseline/reports/final-1000m-rps-baseline-2026-06-21/README.md) | 서비스별 Pod당 운영 RPS 기준 |
| [Service HPA Spike 최종 실험 결과 보고서](../loadtest/hpa-spike-test/reports/service-hpa-spike-final-report-2026-06-22.md) | 서비스별 HPA 반응과 quality 결과 |
| [Half-year early-growth API 기준 성능 종합 보고서](service-baseline-summary.md) | API 단건 benchmark 기준 |

해석 기준은 다음과 같다.

| 축 | 판단 기준 |
| --- | --- |
| CPU | `1000m` request, CPU target `70%`, capacity baseline의 CPU avg와 request 후보 |
| FastAPI worker | `uvicorn worker` 수, HTTP 처리 슬롯, health probe starvation, blocking 구간의 head-of-line 영향 |
| memory | OOM, exit code 137, memory limit, Pod restart 원인. 현재 문서상 확정 병목은 없음 |
| DB / storage I/O | SQLAlchemy pool checkout, PostgreSQL `too many clients already`, query plan, index, aggregate row 수 |
| network I/O | Kong rate limit, large payload, JSON 직렬화, Ingress/LB hop, status `0`/timeout |
| HPA | replica 증가 여부와 scale-out 이후 SLO 회복 여부를 분리해서 판단 |

## 서비스별 한 줄 결론

| 서비스 | 주요 병목 | 주요 개선 | 현재 기준 |
| --- | --- | --- | --- |
| auth-service | password verification CPU, DB connection budget, readiness 탈락 | login 전용 관측, `1000m @ 30 RPS`, HPA scale-out 확인 | 30 RPS 초과 시 replica 증가 우선 |
| concert-service | catalog overfetch, `seat-map`, FastAPI worker=1 처리 슬롯, DB-bound read path, SQLAlchemy pool timeout | 화면 단계별 API 방향, API/worker 분리, DB connection budget 제한 | 140 RPS 기준이나 HPA 조건에서는 cache/singleflight 필요 |
| reservation-service | 초기 DB pool 부족, FastAPI worker=1 처리 슬롯 영향 | API/worker 분리, capacity 기준 재측정 | 140 RPS 운영 기준, HPA spike PASS |
| payment-service | 정산 aggregate query 중복, index mismatch, 250 RPS 과부하 | 단일 SUM/COUNT query, `(concert_id, status)` 인덱스 | 150 RPS 운영 기준, HPA는 더 낮은 구간 재탐색 |
| ticket-service | `/tickets/me` 전체 목록 조회, 작은 customer pool 재사용, JSON/payload 비용 | cursor pagination, run-scoped customer pool, API/worker 분리 | 75 RPS 운영 기준, HPA 유발 부하는 추가 필요 |
| notification-service | 전체 알림 materialize, heavy user payload | cursor pagination, `limit + 1`, Mongo index 보장 | 320 RPS 운영 기준, HPA spike p99 재확인 필요 |

## SLO와 RPS 측정 요약

API benchmark는 대량 seed가 들어간 DB에서 endpoint 1회 처리 비용을 본다. 아래 표의 환산 처리량은 `1000 / 서비스 내 최대 p95 또는 p99`로 계산한 비교 지표이며, 실제 시스템 RPS 한계가 아니다. 실제 운영 RPS는 그 다음 표의 capacity baseline과 HPA 실험으로 판단한다.

| 서비스 | 측정 API 수 | 최대 p50 | 최대 p95 | 최대 p99 | p95 환산 처리량 | p99 환산 처리량 | benchmark 에러율 | SLO 판단 |
| --- | ---: | --- | --- | --- | ---: | ---: | ---: | --- |
| auth-service | 5 | `signup-customer` 57.030ms | `signup-customer` 68.408ms | `login-customer` 102.895ms | 14.6 req/s | 9.7 req/s | 0% | PASS |
| concert-service | 5 | `seat-map` 13.924ms | `seat-map` 39.745ms | `seat-map` 57.766ms | 25.2 req/s | 17.3 req/s | 0% | PASS |
| reservation-service | 14 | `provider-concert-sales` 7.784ms | `provider-concert-sales` 15.573ms | `provider-concert-sales` 18.744ms | 64.2 req/s | 53.4 req/s | 0% | PASS |
| payment-service | 4 | `admin-settlement-basis` 11.055ms | `admin-settlement-basis` 15.140ms | `admin-settlement-basis` 19.153ms | 66.1 req/s | 52.2 req/s | 0% | PASS |
| ticket-service | 5 | `issue-ticket` 8.165ms | `issue-ticket` 15.358ms | `list-my-tickets-normal-first-page` 23.285ms | 65.1 req/s | 42.9 req/s | 0% | PASS |
| notification-service | 3 | `list-notifications-normal-first-page` 1.831ms | `list-notifications-normal-first-page` 2.941ms | `list-notifications-normal-first-page` 6.177ms | 340.0 req/s | 161.9 req/s | 0% | PASS |

capacity baseline은 API benchmark의 latency 역수가 아니라, `1000m` CPU request, HPA off, single replica 조건에서 실제 부하를 올려 SLO와 CPU 70% 기준을 함께 본 결과다.

| 서비스 | API benchmark p95 환산 처리량 | capacity 측정 최대 통과 RPS | 최대 통과 구간의 대표 latency | 1000m 운영 RPS | HPA spike 결과 | 판단 |
| --- | ---: | ---: | --- | ---: | --- | --- |
| auth-service | 14.6 req/s | 40 RPS | login p95 52.8ms / p99 64.1ms | 30 RPS | `auth-30rps` FAIL, `1 -> 2` | CPU-bound login이라 30 RPS 초과 시 scale-out 우선 |
| concert-service | 25.2 req/s | 160 RPS | seat-map p95 39.1ms / p99 94.4ms | 140 RPS | `concert-140rps` FAIL, `1 -> 4` | worker 병목은 완화됐지만 HPA 조건에서는 DB-bound read 병목 재발 |
| reservation-service | 64.2 req/s | 240 RPS | p95 63.7ms / p99 108.9ms | 140 RPS | `reservation-140rps` PASS, `1 -> 2` | 1000m CPU 70% 기준으로 140 RPS 채택 |
| payment-service | 66.1 req/s | 240 RPS | p95 96.6ms / p99 498.0ms | 150 RPS | `payment-250rps` FAIL, `1 -> 3` | p95는 통과했지만 p99 tail과 CPU 후보 때문에 150 RPS 채택 |
| ticket-service | 65.1 req/s | 100 RPS | issue p95 55.3ms / list p95 60.0ms | 75 RPS | `ticket-75rps` PASS, scale-out 없음 | 100 RPS는 통과하지만 CPU avg가 1000m 초과 |
| notification-service | 340.0 req/s | 320 RPS | list p95 34.2ms / p99 57.6ms | 320 RPS | `notification-400rps` FAIL, `1 -> 2` | 측정된 최대 유효 구간을 운영 기준으로 채택 |

## 공통 개선 방향

### FastAPI worker 수 조정과 실행 단위 분리

가장 큰 공통 개선은 FastAPI HTTP API의 `uvicorn worker` 수를 독립적으로 조정할 수 있게 만든 것이다.

| 기존 문제 | 개선 방향 |
| --- | --- |
| `uvicorn worker=1`에서 HTTP 요청, DB 대기, health probe가 같은 처리 슬롯을 공유 | API Deployment의 `UVICORN_WORKERS`를 서비스별로 조정 |
| FastAPI lifespan에서 background loop가 같이 떠서 HTTP worker 수만 독립적으로 늘리기 어려움 | API는 `python cmd/server/main.py`, worker는 `python cmd/worker/main.py`로 분리 |
| `UVICORN_WORKERS`가 worker Deployment까지 섞일 수 있음 | GitOps chart에서 API 전용 env는 `container.apiEnv`로 분리 |
| HTTP 요청, Kafka/outbox worker, health probe가 같은 처리 여유를 두고 경쟁 | worker Deployment를 별도로 렌더링하고 API Service selector와 분리 |

background worker 분리는 원인이 아니라 결과에 가깝다. worker가 1개이면 Pod 안에서 동시에 요청을 받아도 실제 Python application process는 하나의 처리 여유를 공유한다. DB pool checkout 대기, 동기 DB 호출, 큰 JSON 응답 직렬화, password verification 같은 blocking 구간이 길어지면 뒤 요청과 health/readiness probe가 같이 밀린다. API worker 수를 늘리려면 FastAPI lifespan에 묶인 background loop를 HTTP server process와 분리해야 했고, 그 결과로 `cmd/server`와 `cmd/worker`가 나뉘었다.

이 조치 후 `local-baseline-1000m`은 전체 서비스 기준 `PASS`를 기록했다. 검증 당시 concert-service는 `160 RPS`, reservation-service는 `120 RPS`, ticket-service는 `60 RPS`, notification-service는 `320 RPS`까지 통과했다.

### DB connection budget을 HPA 설계 제약으로 승격

HPA가 동작해도 DB-bound API에서는 성공 응답이 자동으로 늘지 않는다. Pod 수가 늘면 process 수와 SQLAlchemy pool 총량도 늘기 때문이다.

```text
api_connection_budget = hpa_max_replicas * uvicorn_workers * (poolSize + maxOverflow)
worker_connection_budget = worker_replicas * (poolSize + maxOverflow)
service_connection_budget = api_connection_budget + worker_connection_budget
```

적용 방향은 다음과 같다.

| 항목 | 방향 |
| --- | --- |
| `maxOverflow` | HPA 환경에서는 거의 0에 가깝게 제한 |
| pool size | 서비스별 DB `max_connections`와 HPA max replica를 함께 보고 계산 |
| scale-out 판단 | HPA replica 증가, `uvicorn worker` 수, DB server connection, app pool checkout timeout을 따로 확인 |
| 관측 보강 | SQLAlchemy checkout wait, checked_out, overflow, timeout metric 추가 필요 |

### 실험 모델을 서비스별 baseline과 journey로 분리

초기에는 전체 예매 과정을 한 번에 측정하면서 앞단 병목이 뒤 서비스의 한계 측정을 가렸다. 이후 기준은 다음처럼 나눴다.

| 실험 | 목적 |
| --- | --- |
| API 통합 benchmark | 대량 seed에서 API 1회 처리 비용, query plan, index 판단 |
| capacity baseline | HPA off, single replica, `1000m` 기준 Pod당 안정 RPS 산정 |
| service HPA spike | 서비스별 HPA 반응 시간과 SLO 회복 확인 |
| reservation journey | 실제 사용자 예매 과정에서 앞단 병목과 단계별 drop-off 확인 |

현재 `1000m` 기준 Pod당 운영 RPS는 다음 값이다.

| 서비스 | 1000m 기준 Pod당 RPS | 해석 |
| --- | ---: | --- |
| auth-service | 30 | login은 CPU-bound라 별도 기준 |
| concert-service | 140 | 160 RPS도 SLO는 통과했지만 CPU 70% 기준은 140 |
| reservation-service | 140 | 240 RPS까지 통과했지만 1000m 운영 기준은 140 |
| payment-service | 150 | 240 RPS는 SLO 통과, CPU 후보가 커서 150 채택 |
| ticket-service | 75 | 100 RPS는 통과하지만 CPU avg가 이미 1000m 초과 |
| notification-service | 320 | 측정된 최대 유효 구간을 채택 |

## 서비스별 상세 분석

### auth-service

**병목 지점은 login CPU 비용과 DB connection budget이 겹친 구간이다.** `reservation-journey-load-test` 초기 run에서는 `/auth/login`이 먼저 포화됐다. 전체 실패율은 `34%`까지 올랐고, 실패 대부분은 login 단계의 503이었다. Kong metric에는 auth upstream 503이 대량으로 있었지만 auth-service 애플리케이션 5xx는 거의 없어서, readiness 탈락 또는 upstream target 없음으로 보는 편이 맞다.

| 축 | 관찰 | 판단 |
| --- | --- | --- |
| CPU | `/auth/login`은 PBKDF2-SHA256, 기본 반복 `210000`을 수행 | password verification이 latency 하한선을 만듦 |
| DB | trace에서 `too many clients already`, SQLAlchemy/psycopg connect stack 확인 | DB connection budget도 함께 병목 |
| memory | 직접 OOM 증거 없음 | memory보다 CPU/connection/readiness 문제 |
| network | Kong 503은 upstream target 없음으로 해석 | network 대역폭보다 readiness 탈락의 결과 |

개선과 판단은 다음과 같다.

- `/auth/login`을 일반 read/write API와 분리해 `auth-login-load-test`로 따로 측정했다.
- `auth.password.verify` span을 추가해 PBKDF2 구간을 root span 안에서 분리했다.
- local trace sampling을 100%로 올려 느린 login trace를 놓치지 않게 했다.
- capacity baseline에서 `1000m @ 30 RPS`를 운영 기준으로 확정했다. 40 RPS는 SLO는 통과했지만 CPU 후보가 `2110m`라 1000m 기준으로 채택하지 않았다.
- HPA spike에서는 `auth-30rps`에서 `1 -> 2` scale-out이 확인됐지만 spike p99 SLO를 넘었다. error는 0%라 scale-out 후 회복 가능성은 남아 있다.

남은 개선 방향은 password verification 비용을 보안 기준과 비용 기준으로 함께 관리하고, login 포함 실험과 token pre-warm 실험을 분리하는 것이다.

### concert-service

**가장 복합적인 병목이다.** API 통합 benchmark에서는 `seat-map`이 p95 `39.745ms`, p99 `57.766ms`로 가장 무거운 endpoint였다. capacity baseline에서는 worker 분리 후 `160 RPS`까지 SLO를 통과했지만, HPA spike에서는 `concert-140rps`가 baseline `80 RPS`부터 실패했다.

| 축 | 관찰 | 판단 |
| --- | --- | --- |
| CPU | `160 RPS`에서 CPU avg `779.0m`, 후보 `1113m` | 1000m 운영 기준은 140 RPS가 적절 |
| DB | `too many clients already` 이후 pool budget 조정, 그 뒤 SQLAlchemy `QueuePool` timeout 재발 | DB-bound read path와 worker별 pool 고갈이 핵심 |
| memory | 초기 HPA run에서 exit code `137`과 probe timeout 관측, 직접 memory 원인 확정은 없음 | memory보다 worker starvation/DB pool/payload 문제로 해석 |
| network/payload | catalog API가 실제 화면보다 큰 limit으로 공연/회차/좌석을 반복 조회 | network payload와 JSON 처리 비용이 DB pool 점유 시간을 키움 |

개선과 판단은 다음과 같다.

- `GET /concerts`, `GET /concerts/{id}/performances`, `GET /performances/{id}/seats` 중심의 큰 discovery 호출이 실제 사용자 단계보다 무겁다는 점을 `TROUBLE-015`로 분리했다.
- capacity baseline에서는 `cmd/server`와 `cmd/worker` 분리 후 전체 run이 PASS했고, concert-service도 `160 RPS`까지 통과했다.
- HPA spike 1차에서는 `poolSize=35`, `maxOverflow=10`이 PostgreSQL `too many clients already`를 만들었다.
- HPA spike 3차에서는 `poolSize=15`, `maxOverflow=0`으로 PostgreSQL connection 초과는 막았지만 SQLAlchemy `QueuePool limit`이 `2,360`회, `TimeoutError`가 `1,180`회 발생했다.
- 결론은 "HPA가 안 됐다"가 아니라, DB-bound read API는 HPA만으로 선형 확장되지 않는다는 것이다.

다음 개선 방향은 pool을 계속 키우는 것이 아니라 DB 진입량을 줄이는 것이다. `seat-map`과 catalog API에 Redis cache, singleflight, stale-while-revalidate, read replica, API별 limit clamp, 실제 화면 단계에 맞춘 조회 API 분리를 검토한다.

### reservation-service

**초기 병목은 공통 실행 단위와 DB pool 압박의 영향을 받았지만, 분리 후 가장 안정적인 서비스로 확인됐다.** reservation-service 자체의 API 통합 benchmark는 큰 병목을 보이지 않았고, HPA spike에서도 `reservation-140rps`가 PASS했다.

| 축 | 관찰 | 판단 |
| --- | --- | --- |
| CPU | capacity baseline에서 120~160 RPS 사이 700m 기준점 | 1000m 운영 기준 140 RPS |
| DB | 초기 pool 부족은 공통 문제였으나 후속 run에서 안정 | 구조 개선 후 1차 병목 아님 |
| memory | 직접 병목 증거 없음 | 메모리보다 CPU/RPS 기준 관리 |
| network | journey에서 auth/concert 앞단 실패가 reservation 측정을 가림 | reservation 단독 측정과 journey를 분리해야 함 |

개선과 판단은 다음과 같다.

- capacity baseline에서 write-service 확장 탐색을 분리했고, reservation-service는 `240 RPS`까지 통과했다.
- `1000m` 기준 목표 CPU 700m에 맞춰 운영 기준은 `140 RPS`로 정했다.
- HPA spike `reservation-140rps`는 `1 -> 2` scale-out, overload p95 `20.3ms`, p99 `33.1ms`, error `0%`로 안정적이었다.

남은 작업은 HPA decision 시간이 길었던 점을 더 긴 duration에서 재검증하고, 실제 journey mix에서 auth/concert 앞단 병목을 제거한 뒤 reservation 처리량을 다시 확인하는 것이다.

### payment-service

**핵심 병목은 정산 기준 API의 DB aggregate query였다.** 초기 API 통합 benchmark에서 provider/admin 정산 API p99가 크게 튀었고, 원인은 같은 row set을 `sum`과 `count`로 두 번 읽는 구현과 `(concert_id, status)` 복합 인덱스 부재였다.

| 축 | 관찰 | 판단 |
| --- | --- | --- |
| CPU | capacity 기준 150 RPS가 1000m 운영값 | CPU만의 병목보다는 RPS 초과 시 latency/error 증가 |
| DB | 승인 결제 약 48,776건 집계, 기존 query는 row set을 중복 scan | query shape/index 병목 |
| memory | 직접 병목 증거 없음 | 관리 대상 아님 |
| network | HPA spike 250 RPS에서 status `0` 실패 증가 | 안정 구간 초과의 결과로 해석 |

개선과 판단은 다음과 같다.

- `settlement_for_concert()`에서 `sum`과 `count`를 단일 aggregate query로 합쳤다.
- `ix_payments_concert_status(concert_id, status)` 복합 인덱스를 추가했다.
- 개선 후 provider 정산 p95/p99는 `40.938ms / 45.354ms`에서 `13.340ms / 15.280ms`로 내려갔다.
- admin 정산 p95/p99는 `56.291ms / 219.647ms`에서 `15.140ms / 19.153ms`로 안정화됐다.
- capacity baseline의 1000m 운영 기준은 `150 RPS`다. `240 RPS`는 SLO p95를 통과했지만 CPU 후보가 `1625m`라 1000m 기준으로 채택하지 않았다.
- HPA spike `payment-250rps`는 `1 -> 3` scale-out은 확인했지만 baseline 120 RPS부터 p95 `1041.8ms`로 SLO를 넘었고, overload/cooldown에서 error/check가 크게 악화됐다.

남은 작업은 120 RPS 이하 또는 더 완만한 stage로 안정 구간을 다시 좁히는 것이다. 운영 DB에는 복합 인덱스를 migration 또는 별도 index 생성 절차로 반영해야 한다.

### ticket-service

**초기 병목은 `/tickets/me` 전체 목록 조회와 오염된 customer pool이 만든 payload/직렬화 문제였다.** 작은 customer pool 10명을 반복 사용하면서 사용자별 ticket 수가 1,000건 이상으로 커졌고, `ticket.wait`가 `/tickets/me` 전체 목록을 반복 polling했다.

| 축 | 관찰 | 판단 |
| --- | --- | --- |
| CPU | 목록 응답 조립과 JSON 직렬화 후보 | DB query보다 response 처리 비용이 커질 수 있음 |
| DB | shutdown 중 `QueuePool limit` 관측 | 1차 원인이라기보다 HTTP/Kafka worker 경합 증거 |
| memory | 직접 OOM 증거 없음, restart는 liveness 실패가 직접 원인 | memory보다 health probe starvation |
| network/payload | 1,000건 이상 티켓 목록을 반복 응답 | network payload와 k6 parsing 비용이 결과 오염 |

개선과 판단은 다음과 같다.

- `ticket.wait`는 전체 목록 polling 대신 cursor pagination 범위 안에서 확인하도록 바꿨다.
- run id 기반 신규 customer pool과 dataset을 준비해 사용자별 ticket 누적이 실험을 오염하지 않게 했다.
- `local-ticket-open-5m` 검증은 PASS였고, `ticket.list`는 p95 약 `9998ms`, 실패율 `15.84%`에서 p95 `32.30ms`, 실패율 `0%`로 내려갔다.
- capacity baseline에서는 `1000m @ 75 RPS`를 운영 기준으로 잡았다. 100 RPS는 통과했지만 CPU avg가 이미 1000m를 넘었다.
- HPA spike `ticket-75rps`는 안정적이었지만 CPU target 70%에 닿지 않아 scale-out을 검증하지 못했다.

남은 작업은 `ticket-110rps` 이상 또는 더 긴 spike duration으로 HPA scale-out을 유발하는 조건을 찾고, `/tickets/me` 내부 span을 query/response/route로 나눠 response validation/serialization 비용을 확인하는 것이다.

### notification-service

**병목은 전체 알림 목록 materialize였다.** heavy 사용자는 약 17,700건의 알림을 가지고 있었고, 기존 `GET /notifications`는 pagination 없이 전체 문서를 읽고 전체 JSON을 반환했다.

| 축 | 관찰 | 판단 |
| --- | --- | --- |
| CPU | 대량 JSON 응답 조립 비용 | cursor pagination 후 크게 완화 |
| DB | Mongo `(user_id, _id desc)` 인덱스가 있어도 limit 없이는 17,700건 조회 | 인덱스 부재가 아니라 API shape 문제 |
| memory | 전체 list materialize가 메모리 부담 후보였지만 직접 OOM 증거 없음 | page 단위 응답으로 완화 |
| network/payload | heavy 사용자 전체 알림 반환 | network payload 병목을 page size 비용으로 축소 |

개선과 판단은 다음과 같다.

- 목록 API를 cursor pagination으로 바꿨다. 기본 `limit=20`, 최대 `100`, `limit + 1` 조회로 `hasMore`를 판단한다.
- MongoDB index `notifications(user_id, _id desc)`와 `processed_events(event_id unique)`를 앱 시작 시 보장한다.
- heavy 사용자 목록 p95/p99는 `192.112ms / 209.000ms`에서 `2.340ms / 2.684ms`로 내려갔다.
- 개선 후 normal/heavy 모두 첫 page에서 `returned=21`, `docsExamined=21`, `keysExamined=21`만 확인한다.
- capacity baseline의 1000m 운영 기준은 `320 RPS`다.
- HPA spike `notification-400rps`는 `1 -> 2` scale-out이 있었지만 spike p99 SLO를 초과했다. error/check는 안정적이었고, 당시 background pod 이슈가 있어 clean cluster 재확인이 필요하다.

남은 작업은 type/sourceId 필터, projection 축소, 읽음/보관 정책을 운영 사용 패턴에 맞춰 조정하는 것이다.

## CPU, memory, network I/O 관점 정리

| 관점 | 확정 또는 강한 후보 | 서비스 | 개선 방향 |
| --- | --- | --- | --- |
| CPU | password verification, Python response serialization, 1000m 기준 CPU avg | auth, ticket, notification | auth는 30 RPS 기준, 목록 API는 page 단위 응답, response span 보강 |
| FastAPI worker | `uvicorn worker=1`에서 HTTP 요청, blocking 구간, health probe가 같은 처리 슬롯을 공유 | auth, concert, reservation, ticket 등 FastAPI 서비스 | API 전용 worker 수를 명시적으로 관리하고 worker Deployment env와 분리 |
| Memory | 직접 확정된 OOM 병목은 없음 | concert, ticket, notification은 후보 신호만 존재 | limit 제거/완화 조건에서 CPU/DB/payload를 먼저 분리, materialize 제거 |
| Network I/O | 큰 JSON payload, cursor 없는 목록, Kong rate limit 오판 | ticket, notification, concert, local loadtest | cursor pagination, limit clamp, rate limit 실험 분리, payload 축소 |
| DB I/O / pool | DB connection budget, pool checkout timeout, aggregate scan | concert, auth, payment, reservation/ticket 초기 run | pool budget 계산, maxOverflow 제한, query/index 정렬, cache/singleflight |
| HPA | replica 증가는 품질 회복과 별개 | auth, reservation, notification, payment, concert | HPA 반응과 SLO 통과를 별도 판정 |

## 향후 문서화/검증 항목

| 우선순위 | 항목 | 대상 |
| --- | --- | --- |
| 1 | SQLAlchemy pool checkout wait, checked_out, overflow, timeout metric 추가 | SQLAlchemy 기반 서비스 |
| 2 | `uvicorn worker` 수와 DB pool budget을 함께 계산하는 서비스별 운영 표 추가 | FastAPI 서비스 |
| 3 | DB connection budget 검증을 GitOps/CI 체크로 추가 | 전체 PostgreSQL 서비스 |
| 4 | concert `seat-map`과 catalog read API에 cache/singleflight/read replica 후보 실험 | concert-service |
| 5 | payment HPA spike를 120 RPS 이하 안정 구간부터 재탐색 | payment-service |
| 6 | ticket `ticket-110rps` 이상 또는 더 긴 duration으로 HPA scale-out 조건 확인 | ticket-service |
| 7 | notification clean cluster 재실행으로 p99 SLO 초과 재확인 | notification-service |
| 8 | reservation journey mix에서 auth/concert 앞단 병목을 제거한 뒤 실제 단계별 drop-off 재측정 | 전체 journey |

## 결론

이번 trouble 묶음의 핵심은 "리소스를 늘리면 해결된다"가 아니었다.

auth-service는 CPU-bound login 비용을 별도 기준으로 관리해야 하고, concert-service는 DB-bound read path라 HPA만으로 확장되지 않는다. ticket/notification은 전체 목록 응답을 page 단위로 바꿔 payload와 직렬화 비용을 줄이는 것이 효과적이었다. payment-service는 query shape와 index를 맞추는 전형적인 DB I/O 개선이었다. reservation-service는 공통 실행 단위와 pool 조건을 정리한 뒤 현재 실험에서는 가장 안정적이었다.

최종적으로 안정적인 RPS를 유지하려면 DB connection pool budget만 조정해서는 부족하다. 특히 concert `seat-map`/catalog처럼 반복 조회가 많고 DB connection을 오래 점유하는 read path는 Redis 기반 cache, singleflight, stale-while-revalidate 같은 read-side 완충을 추가해야 한다. pool은 DB를 터뜨리지 않기 위한 상한이고, Redis는 같은 요청이 DB까지 반복해서 내려가지 않게 막는 장치로 본다.

공통적으로는 서비스별 baseline을 먼저 잡고, 그 다음 HPA와 journey를 보는 순서가 맞다. HPA scale-out은 필요한 조건이지만 충분조건은 아니다. 앞으로는 CPU, memory, network I/O를 각각 따로 결론내리지 않고, endpoint shape, FastAPI worker 수, DB connection budget, worker 실행 단위, payload 크기, HPA 반응을 한 세트로 기록한다.
