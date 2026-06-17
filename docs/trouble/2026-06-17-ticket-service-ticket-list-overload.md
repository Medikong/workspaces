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
| todo | 데이터셋 초기화 후 같은 부하 조건으로 재실행 | gitops/workspace | `reservation-journey-load-test` |

## Resolution

부분 해결.

원인은 데이터셋 오염과 페이지네이션 없는 ticket 목록 API가 결합된 것으로 1차 분류했다. 후속 조치는 두 갈래다.

1. 제품 API: `/tickets/me`는 `limit`/`cursor`를 받고 `items`/`nextCursor`로 응답한다.
2. 부하테스트: 실행마다 run id 기반 신규 customer pool을 만들고, `customerPool.size`와 `activeCustomerCount`를 분리해 현실적인 사용자 분포를 보장한다.

해결 여부는 데이터셋을 정리한 뒤 같은 `reservation-journey-load-test` 조건에서 ticket-service Pod 재시작이 사라지고, `reservation_journey.ticket.list` p95/p99와 실패율이 기준 안으로 들어오는지 확인한 뒤 판단한다.
