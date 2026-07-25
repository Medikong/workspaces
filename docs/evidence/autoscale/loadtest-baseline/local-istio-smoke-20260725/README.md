---
title: 로컬 Istio 전체 서비스 Loadtest Smoke 재실험
date: 2026-07-25
category: autoscale
environment: Docker Desktop Kubernetes, local Istio
run_id: local-istio-smoke-20260725
status: completed-with-api-contract-failures
scope: all-services-one-day-low-rps
---

# 로컬 Istio 전체 서비스 Loadtest Smoke 재실험

## 결론

`docker-desktop` 로컬 Kubernetes에서 1일치 데이터와 낮은 RPS로 9개 서비스를 차례대로 다시 실행했다. `task dev`로 전체 개발 클러스터를 배포한 뒤, Auth의 요청 사용자별 토큰 발급 경로가 포함된 상태에서 `SERVICE=all`을 실행했다.

실행 장치는 끝까지 동작했다. Dataset 준비, k6 Job, 관측성 snapshot, scenario report, replica 복원이 모두 끝났고 최종 RUN 상태는 `pass`다. 단, 이 RUN은 `verification_only: true`이므로 `pass`는 장치가 끝까지 실행됐다는 뜻이다. 모든 API가 정상이라는 뜻은 아니다.

API 28개 중 15개는 요청 성공, 오류율 0, check 통과율 1을 기록했다. 11개는 API check가 실패했고, DropMong Web의 2개 checkout API는 이 짧은 저RPS 실행에서 표본이 0개였다. 따라서 전체 서비스의 API smoke가 모두 통과했다고 말할 수는 없다.

12살식 예시로 말하면, 9개 교실의 시험지를 모두 나눠 주고 회수하는 기계는 잘 돌아갔다. 하지만 몇몇 교실의 답안이 틀렸고, 두 문제는 학생에게 아예 배정되지 않았다. 기계 통과와 문제 정답은 다른 결과다.

## 실행 조건과 검증 범위

| 항목 | 값 |
| --- | --- |
| 클러스터 | Docker Desktop Kubernetes, context `docker-desktop` |
| 배포 | `task dev` 성공 후 전체 dev 서비스 rollout 완료 |
| 실행 | `task --taskfile platform/loadtest/Taskfile.yml run RUN=local-smoke-1day-static-replicas-1 SERVICE=all RUN_ID=local-istio-smoke-20260725` |
| scenario / preset | `service-static-replica-capacity-load-test` / `local-smoke-1day-low-rps` |
| dataset / replica | `smoke-1day` / 측정 중 1개, 완료 뒤 dev layered values로 원복 |
| 실행 시간 | 2026-07-25 01:46:30 ~ 01:53:43 KST, 약 7분 13초 |
| 대상 | Auth, User, Catalog, Coupon, Interest, Order, Payment, Notification, DropMong Web |

실행 중 `npm test` 83개, `npm run check`, Helm lint/template, 모든 workload의 `k6 inspect`, k6 runtime contract, monitoring render가 통과했다. 실제 RUN도 종료 코드 0으로 끝났다.

## API 결과: 15개 정상, 11개 실패, 2개 표본 없음

여기서 `정상`은 해당 API에 실제 요청이 있고 오류율 0, check 통과율 1인 경우다. `실패`는 성능 한계가 아니라 HTTP 응답이 scenario의 기대 상태와 맞지 않은 경우다.

| 서비스 | 정상 API | 실패 API | 표본 없음 | 판정 |
| --- | ---: | ---: | ---: | --- |
| Auth | 3 | 0 | 0 | 정상 |
| User | 0 | 2 | 0 | API 계약 실패 |
| Catalog | 2 | 0 | 0 | 정상 |
| Coupon | 0 | 4 | 0 | API 계약 실패 |
| Interest | 5 | 1 | 0 | 부분 정상 |
| Order | 2 | 1 | 0 | 부분 정상 |
| Payment | 2 | 1 | 0 | 부분 정상 |
| Notification | 1 | 0 | 0 | 정상 |
| DropMong Web | 0 | 2 | 2 | API 계약 실패 및 표본 부족 |

실패 또는 표본 부족 API는 다음과 같다.

| 서비스 | API |
| --- | --- |
| User | `GET /api/v1/users/me/profile`, `PATCH /api/v1/users/me/profile` |
| Coupon | wallet 조회 2개, campaign claim, code redemption |
| Interest | `PUT /v1/users/me/interests/{dropId}` |
| Order | `POST /orders` |
| Payment | `POST /payments/mock-approvals` |
| DropMong Web | `GET /api/web/home`, `GET /api/web/products/{productId}` 실패; checkout 조회/확정은 표본 0 |

Auth의 methods, intent, email signin은 모두 정상 응답했다. 이는 이번에 넣은 요청 사용자별 토큰 준비 경로가 Auth 자체에서는 작동했음을 보여 준다. Catalog와 Notification도 이 저부하 조건에서 정상 응답했다.

## 관측성 결과: CPU·메모리는 수집, restart는 표본 없음

9개 서비스 모두 k6 종료 뒤 한 번만 Prometheus read-only snapshot을 조회했고 CPU와 메모리 값은 `available`이었다. 각 서비스 replica도 모두 `restored`였다. Pod restart는 요청 시간 구간에 Prometheus 표본이 없어서 0으로 채우지 않고 `null`과 `unavailable`으로 기록됐다.

| 서비스 | CPU 사용률 % | 메모리 사용률 % | Pod restart |
| --- | ---: | ---: | --- |
| Auth | 0.44 | 2.91 | unavailable |
| User | 0.50 | 7.62 | unavailable |
| Catalog | 17.03 | 34.44 | unavailable |
| Coupon | 0.41 | 8.13 | unavailable |
| Interest | 24.55 | 24.94 | unavailable |
| Order | 21.66 | 22.90 | unavailable |
| Payment | 24.42 | 39.04 | unavailable |
| Notification | 21.31 | 41.70 | unavailable |
| DropMong Web | 8.73 | 9.14 | unavailable |

이 숫자는 수 초짜리 1 RPS smoke의 단일 snapshot이다. 서비스 용량이나 평균 자원 사용량을 뜻하지 않으며, API 합격·불합격도 바꾸지 않는다.

## 분석: 확인한 사실과 아직 모르는 사실

확인한 사실:

- 전체 서비스는 동시에 실행되지 않았고, 한 서비스가 끝난 뒤 다음 서비스가 실행됐다.
- Dataset/k6 입력 참조는 재사용됐고, 서비스별 결과 JSON과 관측성 snapshot이 생성됐다.
- Auth token 준비를 추가한 뒤 Auth API 3개는 정상 응답했다.
- Catalog, Notification도 정상 API 결과를 냈다.
- 모든 서비스는 측정 뒤 원래 dev Helm layered values로 replica가 복원됐다.

아직 원인으로 확정하지 않은 사실:

- User, Coupon, Interest write, Order create, Payment approval, Web의 실패가 route, 권한, fixture 데이터, 또는 서비스 입력 계약 중 무엇 때문인지는 이 결과 JSON만으로 확정할 수 없다. 결과에는 비밀값과 응답 본문을 의도적으로 보관하지 않고, API check 실패만 남긴다.
- Web checkout API의 표본 0은 성공이 아니다. 1 RPS와 짧은 측정 구간에서 weighted scheduling이 그 두 요청을 배정하지 못한 결과다.
- 이 smoke는 성능 한계 탐색이 아니다. actual RPS가 1보다 작거나 큰 API가 있어도 용량 결론을 내리지 않는다.

따라서 다음 수리는 실패 서비스만 하나씩 `SERVICE=<service>`로 다시 실행하면서, Istio VirtualService 경로, Authorization 전달, fixture ID/상태, workload의 기대 status를 같은 요청 단위로 비교하는 방식이 적절하다. 그때도 token, coupon 평문, Authorization 값은 로그나 artifact에 넣지 않는다.

## 실행 중 발견해 고친 공통 문제

첫 실행은 실제 k6 Job 전에 Taskfile의 `trap ... EXIT HUP INT TERM` 때문에 멈췄다. 현재 Go Task shell이 이 위치의 signal 이름을 지원하지 않아 `trap: HUP: invalid signal specification`을 냈다. 기존 `task dev`에서 이미 쓰고 있던 `EXIT` cleanup 방식으로 바꾸고, 재발 방지 테스트를 추가한 뒤 전체 RUN을 다시 실행했다. 이 수정은 서비스 API 실패를 숨기지 않으며, 실제 API 결과는 위 표와 JSON에 그대로 남아 있다.

## 보관 자료와 비밀값 검사

- [result.json](assets/run-local-istio-smoke-20260725/result.json): API별 요청 수, actual RPS, 오류율, checks, p50/p95/p99, scenario 판정, 서비스 단위 관측성 snapshot
- [SHA256SUMS](SHA256SUMS): 결과 파일 무결성 확인값

결과 JSON은 JSON 파싱과 비밀값 형태 문자열 검사를 통과했다. 비밀번호, Bearer token, Authorization 값, cookie, coupon 평문은 이 문서와 복사본에 기록하지 않았다.
