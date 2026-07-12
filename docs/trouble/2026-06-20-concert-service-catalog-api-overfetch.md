---
id: TROUBLE-015
title: "concert-service catalog API overfetch로 인한 예매 부하테스트 병목"
status: triaged
priority: p1
severity: high
area: service
repos:
  - service
  - gitops
  - workspace
owner: unassigned
created: 2026-06-20
updated: 2026-06-20
resolved: null
tags:
  - loadtest
  - concert-service
  - catalog-api
  - reservation-journey
  - hpa
  - connection-pool
  - overfetch
related:
  - TROUBLE-012
  - gitops/platform/loadtest/scenarios/reservation-journey-load-test.js
  - gitops/platform/loadtest/flows/reservation-journey.js
  - service/services/concert-service/app/repositories/concerts.py
  - service/services/concert-service/app/repositories/showtimes.py
  - service/services/concert-service/app/repositories/seats.py
links:
  - ../evidence/loadtest/hpa-spike-test/reports/local-hpa-spike-scaleout-6m-concert-pool-35-2026-06-20/analysis-report.md
---

# concert-service catalog API overfetch로 인한 예매 부하테스트 병목

## Context

`reservation-journey-load-test`로 로컬 HPA spike 실험을 진행하던 중 `concert-service`가 반복적으로 먼저 한계에 도달했다.

최신 실행은 `local-hpa-spike-scaleout-6m` preset으로 진행했으며, run id는 `read-api-loadtest-read-manual-20260620082308-ms2vc`다. 이 실행에서 `concert-service` SQLAlchemy pool을 `35/10/15`로 올렸지만 `50 journey/s` 구간에서 다시 `GET /concerts`, `GET /concerts/{id}/performances`, `GET /performances/{id}/seats`가 timeout을 보였다.

추가 분석 결과, 단순히 DB pool 크기만의 문제가 아니라 catalog API가 실제 사용자 예매 과정보다 많은 데이터를 한 번에 조회하도록 설계되어 있는 점이 드러났다.

실제 사용자 선택 과정은 보통 다음에 가깝다.

```text
공연 목록에서 일부 공연을 본다
-> 특정 공연 상세로 들어간다
-> 달력에서 예매 가능한 날짜를 본다
-> 날짜를 선택해 해당 날짜의 회차 시간을 본다
-> 특정 회차 시간을 선택해 좌석을 본다
```

현재 loadtest와 API 조합은 이 과정을 더 굵은 조회로 처리한다.

```text
GET /concerts?limit=120
-> client가 dataset prefix로 공연 후보를 필터링
-> GET /concerts/{id}/performances?limit=200
-> client가 회차 후보를 선택
-> GET /performances/{id}/seats?limit=300
-> client가 좌석 후보를 선택
```

이 구조에서는 사용자가 실제 화면에서 보지 않을 가능성이 높은 공연, 회차, 좌석 데이터를 매 journey마다 가져온다.

## Symptoms

- 관찰된 현상:
  - `concert-service`가 `reservation-service`, `payment-service`보다 훨씬 높은 요청량을 받았다.
  - 최신 HPA spike run에서 `concert-service` requested RPS는 `55.47`, effective RPS는 `39.65`였다.
  - 같은 run에서 `reservation-service`는 `10.82 RPS`, `payment-service`는 `10.79 RPS`였다.
  - `GET /concerts` p95는 약 `10001ms`, 실패율은 `39.28%`였다.
  - `GET /concerts/{id}/performances` p95는 약 `10001ms`, 실패율은 `21.74%`였다.
  - `GET /performances/{id}/seats` p95는 약 `10001ms`, 실패율은 `14.53%`였다.
  - `concert-service` Pod는 liveness/readiness probe timeout 이후 restart됐고, container exit code `137`이 관측됐다.
  - `QueuePool limit of size 35 overflow 10 reached, connection timed out, timeout 15.00` 예외가 발생했다.
- 재현 조건:
  - `reservation-journey-load-test`를 `local-hpa-spike-scaleout-6m` preset으로 실행한다.
  - `concertLimit=120`, `performanceLimit=200`, `seatLimit=300`, `thinkTimeSeconds=0` 조건을 사용한다.
  - 각 journey가 예매 전 catalog 조회 3단계를 매번 수행한다.
- 기대 동작:
  - 목록 API는 화면에 실제로 필요한 작은 범위의 공연 요약만 반환한다.
  - 회차 조회는 전체 회차가 아니라 날짜 선택 흐름에 맞춰 나뉜다.
  - 좌석 조회는 특정 회차를 고른 뒤 필요한 좌석 범위만 반환한다.
  - HPA spike 실험에서 catalog 조회가 예매 처리 단계 전체를 가리지 않는다.
- 실제 동작:
  - 한 journey가 concert-service에 최소 3번의 조회 요청을 만든다.
  - 앞단 catalog 조회가 실패하면 reservation/payment 단계까지 도달하지 못한다.
  - 통합 journey 실험 결과가 concert-service catalog 병목에 의해 먼저 결정된다.

## Impact

- 영향 범위:
  - `reservation-journey-load-test` 결과 해석.
  - HPA scale-out 실험의 서비스별 병목 판단.
  - concert-service의 실제 사용자 트래픽 대응력.
  - 공연 목록, 회차, 좌석 API의 운영 비용.
- 우선 처리 이유:
  - `concert-service`가 앞단에서 먼저 막히면 reservation/payment/ticket의 scale-out 결과를 제대로 보기 어렵다.
  - DB pool을 계속 키우는 방식은 병목을 잠시 뒤로 미룰 수 있지만 API overfetch 구조를 해결하지 못한다.
  - 실제 UI에서 한 번에 100개 이상의 공연이나 200개 회차를 보여줄 가능성은 낮다.
  - 조회 API가 화면 단위와 맞지 않으면 캐시, pagination, rate limit, HPA 기준을 잡기 어렵다.
- 우회 방법:
  - loadtest에서는 setup 단계에서 후보 `concertId`, `performanceId`, `seatId` pool을 준비하고 측정 구간의 discovery 호출을 줄인다.
  - `concertLimit`, `performanceLimit`, `seatLimit`을 실제 화면에 가까운 작은 값으로 낮춘다.
  - HPA 실험은 `전체 여정`과 `예매 처리 중심` 시나리오를 분리해 해석한다.

## Investigation

| 시간 | 확인 내용 | 결과 |
| --- | --- | --- |
| 2026-06-20 KST | HPA spike 최신 run report 확인 | `status=FAIL`, 첫 한계 후보 `50 journey/s` |
| 2026-06-20 KST | API step별 실패율 확인 | 실패는 `concert-service` 조회 3개 경로에 집중 |
| 2026-06-20 KST | 서비스별 effective RPS 계산 | `concert-service` requested `55.47 RPS`, effective `39.65 RPS`; reservation/payment는 약 `10.8 RPS` |
| 2026-06-20 KST | `concert-service` Pod event 확인 | liveness/readiness probe timeout 후 restart |
| 2026-06-20 KST | service log 확인 | SQLAlchemy QueuePool `35/10/15` timeout 발생 |
| 2026-06-20 KST | DB 단독 query plan 확인 | 현재 데이터셋 기준 주요 쿼리 실행 시간은 ms 단위로 작음 |
| 2026-06-20 KST | loadtest flow 확인 | 매 iteration마다 `/concerts`, `/concerts/{id}/performances`, `/performances/{id}/seats`를 순차 호출 |
| 2026-06-20 KST | loadtest preset 확인 | `concertLimit=120`, `performanceLimit=200`, `seatLimit=300`, `thinkTimeSeconds=0` |
| 2026-06-20 KST | service repository 확인 | `/concerts` 목록 조회가 `showtimes`, `venue`를 `selectinload`로 함께 로딩 |
| 2026-06-20 KST | 실제 예매 UI 흐름과 비교 | 날짜 선택 전 전체 회차를 가져오고, 시간 선택 전 좌석 후보를 크게 가져오는 구조는 실제 화면 단위와 다름 |

## Current Reading

이번 문제는 `concert-service`의 순수 DB query latency만으로 설명하기 어렵다. 현재 데이터셋에서 단독 실행한 조회 쿼리는 빠르지만, 부하 중에는 요청이 누적되면서 SQLAlchemy connection checkout 대기와 FastAPI sync worker/threadpool 포화가 함께 발생한다.

그 위에 API 설계상 overfetch가 더해져 있다.

- `/concerts`는 목록 API인데 `showtimes`, `venue`까지 함께 읽는다.
- loadtest는 dataset 후보를 찾기 위해 `/concerts?limit=120`을 호출한 뒤 client에서 title prefix를 필터링한다.
- `/concerts/{id}/performances?limit=200`은 날짜 선택 전에 전체 회차 후보를 크게 가져온다.
- `/performances/{id}/seats?limit=300`은 좌석 화면 진입 시 한 번에 많은 좌석 후보를 가져온다.
- API layer에서 사용자 화면 단위의 최대 limit을 강제하는 장치가 없다.

따라서 현재 병목은 다음이 결합된 결과로 본다.

```text
실제 화면 단위와 맞지 않는 catalog API
+ loadtest의 큰 discovery limit
+ 매 journey마다 반복되는 catalog 조회
+ sync endpoint/threadpool 처리
+ SQLAlchemy connection pool checkout 대기
+ probe starvation과 Pod restart
```

## Product Flow Gap

현재 API는 실제 예매 사용자의 탐색 단계를 충분히 표현하지 못한다.

필요한 API 방향은 다음에 가깝다.

| 사용자 단계 | 필요한 API 성격 | 현재 문제 |
| --- | --- | --- |
| 공연 목록 보기 | 작은 페이지의 공연 카드/요약 | `/concerts`가 큰 limit과 연관 데이터를 허용 |
| 공연 상세 보기 | 특정 공연의 상세 요약 | 목록 조회와 상세 조회의 데이터 경계가 흐림 |
| 날짜 선택 | 예매 가능한 날짜만 조회 | 전체 회차를 먼저 내려받아 client가 고르는 구조 |
| 시간 선택 | 선택 날짜의 회차 시간만 조회 | 날짜 필터 없이 많은 회차 후보를 받을 수 있음 |
| 좌석 보기 | 선택 회차의 좌석 상태를 필요한 범위로 조회 | 큰 seat limit이 가능하고 화면 단위 제한이 없음 |

이 차이 때문에 부하테스트에서 catalog 조회가 실제보다 무겁게 측정되고, 예매 처리 자체의 HPA 결과를 가린다.

## Decision

- 이 문제는 `concert-service` API 설계 이슈로 분리해 `TROUBLE-015`로 추적한다.
- DB pool 상향만으로 해결된 것으로 보지 않는다.
- `reservation-journey-load-test`는 전체 사용자 여정 smoke/spike로 유지할 수 있지만, 서비스별 HPA 한계 측정에는 부적합한 편향이 있다.
- 예매 처리 단계의 HPA를 보려면 catalog discovery를 setup으로 옮기거나, 실제 화면 단계에 맞춘 작은 API를 먼저 제공해야 한다.
- `concert-service`는 화면 단위 catalog API를 추가하고, 기존 API에는 limit 상한과 pagination/filter 기준을 명시한다.

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | HPA spike 최신 run에서 concert-service 실패 집중 확인 | workspace | `../evidence/loadtest/hpa-spike-test/reports/local-hpa-spike-scaleout-6m-concert-pool-35-2026-06-20/analysis-report.md` |
| done | 기존 catalog API와 loadtest discovery 구조 비교 | workspace | 이 문서 |
| todo | `/concerts` 목록 API를 화면 카드용 경량 응답으로 분리 | service | `service/services/concert-service` |
| todo | 공연별 예매 가능 날짜 조회 API 추가 검토 | service | `service/services/concert-service` |
| todo | 선택 날짜의 회차 시간 조회 API 추가 검토 | service | `service/services/concert-service` |
| todo | 좌석 조회 API의 화면 단위 limit/pagination 또는 section filter 검토 | service | `service/services/concert-service` |
| todo | API별 max limit clamp 적용 | service | `service/services/concert-service` |
| todo | loadtest의 catalog discovery를 setup 단계 후보 pool로 분리 | gitops | `gitops/platform/loadtest/flows/reservation-journey.js` |
| todo | API 개선 전후 같은 preset으로 HPA spike 결과 비교 | gitops/workspace | `local-hpa-spike-scaleout-6m` |

## Resolution

미해결.

현재까지는 `concert-service` catalog API가 실제 예매 화면 흐름보다 큰 데이터를 반복 조회하게 만들고, 이 overfetch가 HPA spike 실험에서 가장 먼저 병목으로 드러난 것으로 판단한다. API 경량화와 화면 단계별 조회 API를 추가한 뒤 같은 부하 조건에서 `GET /concerts`, `GET /concerts/{id}/performances`, `GET /performances/{id}/seats`의 p95/p99, 실패율, QueuePool timeout, Pod restart 여부를 다시 비교한다.
