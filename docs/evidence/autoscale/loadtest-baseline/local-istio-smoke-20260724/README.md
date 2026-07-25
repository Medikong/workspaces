---
title: 로컬 Istio 전체 서비스 Loadtest Smoke
date: 2026-07-24
category: autoscale
environment: Docker Desktop Kubernetes, local Istio
run_id: run-20260724t123811z
status: completed-with-api-contract-failures
scope: all-services-one-day-low-rps
---

# 로컬 Istio 전체 서비스 Loadtest Smoke

## 결론

로컬 Kubernetes에서 1일치 데이터와 저 RPS로 9개 서비스를 순차 실행했다. Dataset
준비, k6 Job, 관측성 snapshot, scenario report, replica 복원은 모두 끝났고 실행기의
최종 상태는 `pass`였다. 이 `pass`는 `verification_only: true`인 구조 검증 결과다.

그러나 API 성능 합격 결과는 아니다. Catalog API 두 개는 정상 응답을 확인했지만 Auth,
User, Coupon, Interest, Order, Payment, Notification, Web에는 요청 계약 또는 ingress
경로/인증/준비 데이터가 맞지 않아 오류가 남았다. 다음 전체 성능 실험 전에는 실패한
서비스를 하나씩 고쳐 다시 실행해야 한다.

## 실행 조건

| 항목 | 값 |
| --- | --- |
| 실행 명령 | `task loadtest:run RUN=local-smoke-1day-static-replicas-1.yaml SERVICE=all` |
| RUN / scenario / preset | `local-smoke-1day-static-replicas-1` / `service-static-replica-capacity-load-test` / `local-smoke-1day-low-rps` |
| 데이터 / replica | `smoke-1day` / 측정 중 1개 |
| 대상 | Auth, User, Catalog, Coupon, Interest, Order, Payment, Notification, Dropmong Web |
| 실행 시간 | 2026-07-24 21:38:11 ~ 21:43:50 KST |
| 전송 경로 | k6 HTTP 요청은 Istio ingress gateway, 내부 준비는 Kubernetes 서비스 연결 |
| 관측성 | 서비스별 실행 시간 구간의 단발성 snapshot, 모두 `available` |

## 서비스별 결과

| 서비스 | 실행 장치 | 대표 API 결과 | 판단 |
| --- | --- | --- | --- |
| Auth | 완료 | `GET methods`, `POST intents` 정상; `POST signins/email` 오류율 1 | API 계약 실패 포함 |
| User | 완료 | profile 조회/수정에서 오류 발생 | API 계약 실패 |
| Catalog | 완료 | drops와 drop detail 오류율 0, checks 1 | 이 smoke에서 정상 |
| Coupon | 완료 | coupon API 요청이 모두 오류 | 경로 또는 fixture 계약 점검 필요 |
| Interest | 완료 | ranking 조회 정상, 사용자 상태 요청 오류 | 부분 정상 |
| Order | 완료 | 주문 API 요청이 모두 오류 | 인증/fixture 계약 점검 필요 |
| Payment | 완료 | 결제 API 요청이 모두 오류 | 인증/fixture 계약 점검 필요 |
| Notification | 완료 | notification API 요청 오류 | 인증/fixture 계약 점검 필요 |
| Dropmong Web | 완료 | BFF API 다수가 오류 | ingress/BFF 요청 계약 점검 필요 |

여기서 "완료"는 Job과 결과 파일 생성이 끝났다는 뜻이다. API 오류가 0이라는 뜻은
아니다. API별 정확한 p50/p95/p99, actual RPS, checks와 threshold는 각 서비스의
`result.json`에 보관되어 있다.

## 보관 자료

- [result.json](assets/run-20260724t123811z/result.json): 전체 9개 서비스의 API별 k6 지표, 판정, 서비스/Pod 관측성 snapshot 원본
- [SHA256SUMS](SHA256SUMS): 복사한 결과 파일의 무결성 확인값

원본은 GitOps loadtest 보고서 경로에 남겨 두고, 이 폴더에는 읽기 전용 복사본을
보관한다. 이 결과 파일에는 비밀번호, 토큰, 쿠키, Authorization 값과 coupon 평문이
포함되지 않았음을 확인했다.

Catalog ingress만 따로 확인한 실행에서도 drops와 drop detail은 오류율 0, checks 1로
응답했다. 따라서 ingress gateway 자체와 Catalog의 기본 HTTP 경로는 동작한다. 나머지
실패를 모두 ingress 문제라고 단정할 수는 없으며, 각 workload의 인증, fixture, route
계약을 분리해 확인해야 한다.

## Migration 문제 원인

이번 진단에서 "migration 실패"와 "서비스가 요청에 실패함"은 서로 다른 문제였다.

| 관찰한 현상 | 확인한 원인 | 처리 및 현재 상태 |
| --- | --- | --- |
| loadtest 중 Auth/User migration Job이 다시 실행되거나 대기함 | replica 적용이 Helm hook까지 실행해 migration 책임을 loadtest에 섞었음 | replica apply/restore에서 hook을 실행하지 않도록 분리. migration은 `task dev`의 책임 |
| 이전 Auth/User migration Pod가 Pending 또는 이미지 pull 실패 | 로컬 노드 선택 조건과 기준 이미지 설정이 loadtest 적용에 충분히 이어지지 않았음 | dev layered values를 함께 적용하고 replica override만 덧씌우도록 보강 |
| Catalog가 migration 실패처럼 보이며 준비 상태가 오래 걸림 | `alembic_version`은 기대 버전이었고, 실제 원인은 새 Catalog Pod의 DB 연결이 교차 namespace NetworkPolicy에 막힌 것 | local loadtest의 중복 교차 namespace 정책 생성을 끄고 namespace 식별을 보강 |
| Catalog DB ClusterIP 연결이 일시적으로 멈춤 | 로컬 Kubernetes 네트워크 런타임 상태도 함께 영향을 줌 | 로컬 런타임을 복구한 뒤 연결 확인. 이것은 코드만으로 증명된 영구 해결은 아님 |

즉, migration 자체가 데이터 버전을 바꾸다 실패한 사례가 이번 smoke의 직접 원인은
아니었다. Catalog DB의 `alembic_version`은 기대값과 맞았고, 문제는 서비스 Pod에서
DB로 가는 내부 연결이었다.

12살식 비유로는, migration은 책장에 책을 정리하는 일이고, API 오류는 손님이 가게
문에서 주문하는 일이다. 책 정리가 끝났어도 가게 안쪽 창고 문이 잠겨 있으면 주문을
처리하지 못한다. 이번 Catalog 문제는 그 안쪽 DB 문에 가까웠다.

## 이번에 확인한 것과 아직 확인하지 못한 것

확인한 것:

- `SERVICE=all`은 9개 서비스를 동시에 밀어 넣지 않고 순서대로 처리했다.
- 서비스당 Dataset 준비는 한 번만 실행됐고 snapshot cache 계약도 유지됐다.
- k6 결과와 서비스/Pod 관측성 snapshot은 scenario 결과에 함께 기록됐다.
- replica는 서비스마다 측정 후 기존 dev layered values 기준으로 복원됐다.
- 별도 resource collector Job이나 반복 polling 없이 관측성 snapshot을 붙였다.

아직 확인하지 못한 것:

- 실패한 API 각각이 route, 인증, fixture, 또는 데이터 상태 중 어느 조건에서 실패했는지의 최종 원인.
- 모든 API의 성능 기준 통과. 이번은 저 RPS 구조 검증이며 한계 측정이 아니다.
- 원격 Kubernetes, 실제 dev, production 환경에서의 결과. 이번 문서는 로컬 Docker Desktop Kubernetes만 다룬다.

## 다음 재실행 순서

1. 실패한 서비스의 Istio VirtualService와 workload endpoint/인증/fixture 계약을 서비스별로 맞춘다.
2. 실패한 서비스만 `SERVICE=<service>`로 재실행해 API 오류가 사라졌는지 확인한다.
3. 전체 `SERVICE=all` smoke를 다시 실행한다.
4. 그 뒤에만 RPS와 duration을 올려 용량 실험으로 진행한다.

비밀값은 이 문서와 artifact 요약에 기록하지 않았다.
