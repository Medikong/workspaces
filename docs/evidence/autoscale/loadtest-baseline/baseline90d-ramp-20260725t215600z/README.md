---
title: DropMong 로컬 90일 Baseline Ramp 실제 측정
date: 2026-07-25
category: autoscale
environment: Docker Desktop Kubernetes, local Istio
run_id: baseline90d-ramp-20260725t215600z
status: failed-with-measured-bottlenecks-and-one-execution-failure
scope: eight-backend-services-baseline-90days
---

# DropMong 로컬 90일 Baseline Ramp 실제 측정

## 목적과 환경

baseline-90days 데이터셋, 서비스별 1 replica 조건에서 실제 RPS를 계속 높여 처음으로 처리량 증가가 멈추거나 HTTP 오류, check 실패, dropped iteration이 두 window 연속 나타나는 지점을 찾았다. 사용자가 제외한 dropmong-web은 실행 대상에 넣지 않았고, Auth, User, Catalog, Coupon, Interest, Order, Payment, Notification 8개 backend 서비스를 순차 실행했다.

| 항목 | 값 |
| --- | --- |
| Kubernetes | Docker Desktop, context docker-desktop |
| RUN / scenario | local-baseline-90days-ramp-replicas-1 / service-bottleneck-ramp-load-test |
| preset / dataset | baseline-90days-replicas-1 / baseline-90days |
| 실행 | task loadtest:run RUN=local-baseline-90days-ramp-replicas-1 SERVICE=all RUN_ID=baseline90d-ramp-20260725t215600z |
| 시간 | 2026-07-25T12:59:19Z ~ 2026-07-25T13:09:08Z |
| 측정 경로 | local Istio ingress, 서비스별 Dataset Job 1회, k6, 종료 뒤 Tempo 및 Prometheus read-only 조회 |
| 준비 상태 | Docker Desktop 노드 4개, Tempo, Prometheus, 대상 8개 서비스 Ready 확인 |

## 서비스별 결과

| 서비스 | 결과 | peak 목표/실측 RPS | 마지막 정상 실측 RPS | 최초 저하 목표/실측 RPS | 해석 |
| --- | --- | ---: | ---: | ---: | --- |
| Auth | 병목 후보 | 52 / 35.0 | 8.8 | 32 / 12.2 | dropped iteration, HTTP 오류, check 실패가 두 window 연속 발생 |
| User | 최대 기준점 도달 | 75 / 75.4 | 75.4 | unavailable | 실행 구간에서 오류와 check 실패 없이 측정 완료 |
| Catalog | 병목 후보 | 80 / 81.2 | 45.8 | 60 / 76.2 | HTTP 오류와 check 실패가 두 window 연속 발생 |
| Coupon | 최대 기준점 도달 | 33 / 33.1 | 33.1 | unavailable | fixture 없이 runtime bulk 토큰 초기화 후 실제 ramp 완료 |
| Interest | 실행 실패 | unavailable | unavailable | unavailable | runtime address capacity 계약 오류로 k6 시작 전 중단 |
| Order | 최대 기준점 도달 | 53 / 52.6 | 52.6 | unavailable | 설정한 최대 기준점까지 측정 완료 |
| Payment | 최대 기준점 도달 | 32 / 32.9 | 32.9 | unavailable | 설정한 최대 기준점까지 측정 완료 |
| Notification | 병목 후보 | 98 / 58.4 | 58.4 | 78 / 51.1 | 실제 RPS가 직전 정상 58.4보다 낮아지고 dropped iteration, HTTP 오류, check 실패가 연속 발생 |

전체 RUN 상태는 fail이다. 이 상태의 직접 원인은 Interest의 실행 준비 실패다. Auth, Catalog, Notification의 병목 후보는 실제 k6 요청으로 측정된 성능 결과이며, 실행 실패와 섞어 해석하지 않는다.

12살식 예시: 수도꼭지를 초당 58컵까지 틀었을 때 물이 58컵 나왔다고 하자. 다음에는 78컵을 기대했는데 실제로는 51컵만 나오면, 수도꼭지를 더 열어도 물이 더 늘지 않는 곳이 병목 후보이다. 반대로 실험 장치가 시작 전에 멈춘 Interest는 물이 얼마나 나오는지 아직 측정하지 못한 것이다.

## API 성능과 Tempo 요약

각 API의 전체 수치와 route별 제한된 Tempo sample은 result.json에 보관했다. Tempo available은 주입한 traceparent, parent/child span 관계, 서비스명, route, 실행 시간 구간을 함께 확인한 결과다. trace ID만으로 연결 성공으로 판단하지 않았다.

| 서비스 / API | 요청 | 실제 RPS | 오류율 | checks | p50 / p95 / p99 ms | Tempo |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Auth POST /api/v1/auth/intents | 465 | 14.88 | 0.501 | 0.499 | 2.01 / 4488.88 / 4965.30 | unavailable, query failed |
| Auth GET /api/v1/auth/methods | 8 | 0.26 | 0 | 1 | 8166.12 / 8796.65 / 8797.75 | unavailable, query failed |
| Auth POST /api/v1/auth/signins/email | 126 | 4.03 | 0.151 | 0.849 | 2604.70 / 7498.75 / 8789.32 | unavailable, query failed |
| User GET /api/v1/users/me/profile | 1869 | 35.81 | 0 | 1 | 2.69 / 4.61 / 20.01 | available, 2 samples |
| User PATCH /api/v1/users/me/profile | 624 | 11.96 | 0 | 1 | 3.38 / 5.81 / 27.21 | available, 2 samples |
| Catalog GET /drops | 1343 | 31.53 | 0.979 | 0.021 | 0.48 / 10000.75 / 10001.64 | available, 2 samples |
| Catalog GET /drops/{dropId} | 895 | 21.01 | 0.978 | 0.022 | 0.49 / 10000.62 / 10001.57 | unavailable, no matching injected parent |
| Coupon GET /api/v1/users/me/coupons | 448 | 14.62 | 0 | 1 | 3.30 / 6.10 / 10.89 | available, 2 samples |
| Coupon GET /api/v1/users/me/coupons/{userCouponId} | 225 | 7.34 | 0 | 1 | 2.44 / 3.72 / 7.79 | available, 2 samples |
| Coupon POST /api/v1/coupon-campaigns/{campaignId}/claims | 224 | 7.31 | 0 | 1 | 6.40 / 10.57 / 14.92 | available, 2 samples |
| Order GET /orders/{orderId} | 732 | 19.45 | 0 | 1 | 7.01 / 1134.47 / 1914.13 | unavailable, no matching injected parent |
| Order POST /orders | 306 | 8.13 | 0.003 | 0.997 | 12.08 / 1268.17 / 1544.77 | available, 2 samples |
| Order POST /orders/{orderId}/cancellations | 184 | 4.89 | 0 | 1 | 11.32 / 1247.16 / 1431.97 | unavailable, no matching injected parent |
| Payment GET /payments/{paymentId} | 373 | 14.33 | 0 | 1 | 7.34 / 55.68 / 375.11 | unavailable, no matching injected parent |
| Payment POST /payments/mock-approvals | 156 | 5.99 | 0 | 1 | 10.82 / 71.40 / 398.85 | available, 2 samples |
| Payment POST /payments/mock-failures | 94 | 3.61 | 0 | 1 | 11.08 / 56.16 / 352.14 | available, 2 samples |
| Notification GET /notifications | 2122 | 37.12 | 0.198 | 0.802 | 29.06 / 9301.64 / 9773.69 | available, 2 samples |

17개 route 중 10개는 제한된 trace sample을 확인했고, 7개는 unavailable로 보관했다. Auth의 3개 route는 Tempo query 실패, Catalog detail·Order 2개·Payment read는 실행 구간 안에서 주입 parent와 맞는 span을 찾지 못한 경우다. 이 trace 부재는 k6 성공 또는 실패를 자동으로 바꾸지 않는다. Interest는 k6가 시작하지 않아 API와 trace sample이 없다.

## 문제와 제한사항

- [Interest runtime addressing 실행 실패 보고서](issues/interest-runtime-addressing.md)에 직접 원인, 영향, 재실험 전 조치 항목을 분리해 보관했다. 이 실패는 성능 병목 결과가 아니다.
- Auth, Catalog, Notification은 실제 측정된 병목 후보다. 각각의 HTTP 오류, check 실패, dropped iteration 또는 처리량 정체 근거는 scenario 분석에 보존했다.
- Dataset은 서비스별 한 번씩 준비했다. cache 상태는 mixed였고, Candidate 복원은 kubectl exit 137로 사용하지 않아 각 서비스의 생성·주입 경로가 이어졌다.
- Pod restart가 표본에 없으면 0이 아니라 unavailable로 남겼다. 이 결과는 로컬 Docker Desktop, 현재 개발 배포, 1 replica 조건의 탐색 자료이므로 운영 처리량 보장값이 아니다.

## 보관 자료

- [정제된 최종 결과 JSON](assets/run-baseline90d-ramp-20260725t215600z/result.json)
- [scenario 분석 문서](assets/run-baseline90d-ramp-20260725t215600z/analysis.md)
- [Interest 실행 실패 보고서](issues/interest-runtime-addressing.md)
- [SHA256SUMS](SHA256SUMS)

결과와 문서에는 Authorization, cookie, token, password, coupon 평문, 사용자 ID, 이메일, 요청 및 응답 body, 전체 span attribute를 넣지 않았다. result.json의 trace sample에는 성능 수치와 분리된 최소 trace 식별 정보만 있다.
