---
title: DropMong 로컬 90일 Baseline Ramp 실제 측정
date: 2026-07-25
category: autoscale
environment: Docker Desktop Kubernetes, local Istio
run_id: baseline90d-ramp-20260725t122500z
status: failed-with-measured-bottlenecks
scope: eight-backend-services-baseline-90days
---

# DropMong 로컬 90일 Baseline Ramp 실제 측정

## 목적과 환경

`baseline-90days` 데이터셋과 서비스별 1 replica 조건에서 실제 RPS를 연속 증가시켜, 처음으로 처리량 증가가 멈추거나 HTTP 오류, check 실패, dropped iteration이 연속 두 window 나타나는 지점을 찾는다. `dropmong-web`은 제외하고 Auth, User, Catalog, Coupon, Interest, Order, Payment, Notification 8개 backend 서비스를 순차 실행했다.

| 항목 | 값 |
| --- | --- |
| Kubernetes | Docker Desktop, context `docker-desktop` |
| RUN / scenario | `local-baseline-90days-ramp-replicas-1` / `service-bottleneck-ramp-load-test` |
| preset / dataset | `baseline-90days-replicas-1` / `baseline-90days` |
| 실행 | `task loadtest:run RUN=local-baseline-90days-ramp-replicas-1 SERVICE=all RUN_ID=baseline90d-ramp-20260725t122500z` |
| 시간 | 2026-07-25T12:27:14Z ~ 2026-07-25T12:38:15Z |
| 측정 경로 | local Istio ingress, 서비스별 Dataset Job 1회, k6 Job 1회, 종료 후 Tempo/Prometheus read-only 조회 |

## 서비스별 결과

| 서비스 | 결과 | peak 목표/실측 RPS | 마지막 정상 실측 RPS | 최초 저하 목표/실측 RPS | 해석 |
| --- | --- | ---: | ---: | ---: | --- |
| Auth | 병목 후보 | 52 / 37.2 | 8.6 | 32 / 15.1 | dropped iteration, HTTP 오류, check 실패가 2개 window 연속 발생 |
| User | 실행 실패 | unavailable | unavailable | unavailable | k6 exit 100, 요청 0건 |
| Catalog | 병목 후보 | 80 / 89.3 | 32.1 | 60 / 89.3 | HTTP 오류와 check 실패가 2개 window 연속 발생 |
| Coupon | 실행 실패 | unavailable | unavailable | unavailable | k6 exit 100, 요청 0건 |
| Interest | 준비 실패 | unavailable | unavailable | unavailable | `existingInterests` runtime address range의 capacity를 확인하지 못함 |
| Order | 실행 실패 | unavailable | unavailable | unavailable | k6 exit 100, 요청 0건 |
| Payment | 실행 실패 | unavailable | unavailable | unavailable | k6 exit 100, 요청 0건 |
| Notification | 실행 실패 | unavailable | unavailable | unavailable | k6 exit 100, 요청 0건 |

Auth와 Catalog의 조기 종료는 실제 병목 탐색 결과다. 반면 User, Coupon, Order, Payment, Notification은 k6가 iteration을 시작하기 전에 종료됐으므로 `0 RPS` 성능 결과가 아니라 `unavailable` 실행 실패다. Interest도 데이터셋 준비 뒤 runtime address capacity 검증에서 멈췄으므로 성능 결과가 아니다.

12살식 예시로, 수도꼭지를 조금씩 더 열었는데 Auth는 물을 더 못 보내고 물이 새기 시작했으며, Catalog도 오류가 계속 나기 시작했다. 이것은 병목 후보다. 하지만 다른 다섯 서비스는 수도꼭지를 열기 전에 실험 장치가 멈췄으므로, 물이 얼마나 나오는지는 아직 모른다.

## API와 Trace 요약

실제 요청이 생성된 API의 최종 k6 집계는 다음과 같다. API별 전체 수치와 제한된 Tempo sample은 `result.json`에 보관했다.

| 서비스 / API | 요청 | 실제 RPS | 오류율 | checks | p50 / p95 / p99 ms | Tempo |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Auth `POST /api/v1/auth/intents` | 445 | 14.22 | 0.335 | 0.665 | 465.90 / 7307.62 / 8041.13 | unavailable |
| Auth `GET /api/v1/auth/methods` | 10 | 0.32 | 0 | 1 | 23.35 / 7627.37 / 7710.94 | unavailable |
| Auth `POST /api/v1/auth/signins/email` | 171 | 5.46 | 0.333 | 0.667 | 1192.58 / 7673.25 / 8356.90 | unavailable |
| Catalog `GET /drops` | 1322 | 31.31 | 0.986 | 0.014 | 0.58 / 10001.76 / 10002.79 | available, 2 samples |
| Catalog `GET /drops/{dropId}` | 882 | 20.89 | 0.983 | 0.017 | 0.59 / 10001.58 / 10002.79 | unavailable |

Tempo sample은 주입한 `traceparent`의 trace ID만으로 연결 성공을 판단하지 않았다. 서비스명, route, 실행 구간, 그리고 service span의 parent span ID가 주입한 parent span ID와 맞는 경우만 `available`로 남겼다. Auth와 일부 Catalog route의 `unavailable`은 k6 병목/실행 실패와 별개이며, 성능 성공 여부를 자동으로 바꾸지 않는다.

## 실행 실패와 제한사항

- 전체 RUN 상태는 `fail`이다. 원인은 실제 병목 후보가 아니라 User, Coupon, Order, Payment, Notification의 k6 exit 100과 Interest runtime address capacity 실패다.
- k6 exit 100 artifact는 요청 0건, check 0건, threshold 미통과만 남겨 구체적인 애플리케이션 원인을 확정할 수 없다. 재실험 전 k6 setup 종료 원인을 별도 진단해야 한다.
- Interest 실패는 `existingInterests` write-address allocation의 capacity 계약을 runner와 runtime addressing 사이에서 일치시켜야 한다는 구성 문제다.
- Pod restart metric은 Auth에서 실행 구간 표본이 없어 `unavailable`이다. 이는 restart가 0이라는 뜻이 아니다.
- 이 결과는 로컬 Docker Desktop, 현재 dirty Git worktree, 1 replica 조건의 탐색 자료다. 운영 환경 처리량 보장값이 아니다.

## 보관 자료

- [정제된 최종 결과 JSON](assets/run-baseline90d-ramp-20260725t122500z/result.json)
- [scenario 분석 문서](assets/run-baseline90d-ramp-20260725t122500z/analysis.md)
- [SHA256SUMS](SHA256SUMS)

결과물에는 Authorization, cookie, token, password, coupon 평문, 사용자 ID, 이메일, 요청/응답 body, 전체 span attribute를 넣지 않았다.
