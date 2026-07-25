---
title: 로컬 Istio 전체 서비스 Loadtest Smoke 최종 재실험
date: 2026-07-25
category: autoscale
environment: Docker Desktop Kubernetes, local Istio
run_id: local-istio-smoke-20260725-final-all
status: passed
scope: all-services-one-day-low-rps
---

# 로컬 Istio 전체 서비스 Loadtest Smoke 최종 재실험

## 결론

`docker-desktop` 로컬 Kubernetes에서 1일치 Dataset과 낮은 RPS로 9개 서비스를 차례대로 실행했다. 최종 RUN은 `pass`이며, 9개 서비스의 측정 API는 모두 실제 요청이 있었고 오류율 `0`, check 통과율 `1`이었다.

12살식 예시로 말하면, 9개 교실을 한꺼번에 시험 보게 하지 않고 한 교실씩 들어가서 모든 문제를 한 번 이상 풀어 보았다. 이번에는 어느 문제도 틀리지 않았다. 다만 아주 쉬운 작은 시험이므로, 이 결과만으로 "많은 학생이 동시에 와도 빠르다"고 말할 수는 없다.

## 실행 조건

| 항목 | 값 |
| --- | --- |
| 클러스터 | Docker Desktop Kubernetes, context `docker-desktop` |
| 사전 배포 | 기존 `task dev` 개발 클러스터 |
| 실행 | `task loadtest:run RUN=local-smoke-1day-static-replicas-1 SERVICE=all` |
| scenario / preset | `service-static-replica-capacity-load-test` / `local-smoke-1day-low-rps` |
| dataset / replica | `smoke-1day` / 측정 중 서비스별 1개, 이후 기존 dev layered values로 복원 |
| 요청 경로 | local Istio ingress gateway |
| 실행 시간 | 2026-07-25 17:03:18 ~ 17:09:50 KST |

## 결과

| 서비스 | 요청 수 | 오류율 | checks | p95 ms | 관측성 |
| --- | ---: | ---: | ---: | ---: | --- |
| Auth | 7 | 0 | 1 | 204.76 | available |
| User | 9 | 0 | 1 | 6.57 | available |
| Catalog | 9 | 0 | 1 | 11.35 | available |
| Coupon | 9 | 0 | 1 | 12.89 | available |
| Interest | 8 | 0 | 1 | 11.61 | available |
| Order | 9 | 0 | 1 | 15.86 | available |
| Payment | 9 | 0 | 1 | 15.75 | available |
| Notification | 8 | 0 | 1 | 11.83 | available |
| DropMong Web | 9 | 0 | 1 | 29.99 | available |

각 API의 요청 수, actual RPS, 오류율, checks, p50/p95/p99와 서비스 단위 CPU·메모리·restart snapshot은 [result.json](assets/run-local-istio-smoke-20260725-final-all/result.json)에 보관했다. Pod restart는 이 짧은 관측 구간에 Prometheus 표본이 없어 `null`과 `unavailable`으로 남겼다. 이는 실제 restart가 0이라는 뜻이 아니다.

## 이번에 고친 원인

| 증상 | 수정 |
| --- | --- |
| User profile 401 | Istio가 전달하는 `x-user-id`, `x-session-id`를 User 공개 API가 받도록 계약을 맞춤 |
| Coupon 404 | Coupon VirtualService 경로와 browser authorization 경로를 User/Web catch-all보다 앞에 추가 |
| Coupon 503 | k6의 긴 Idempotency-Key가 Coupon의 합성 business key 200자 제한을 넘김. 짧은 SHA-256 기반 키로 교체 |
| Coupon code 404 | Dataset의 code hash가 배포된 Coupon 서비스의 hash-key 계약을 쓰고, 그 fingerprint가 snapshot cache key에도 반영되도록 수정 |
| Interest check 실패 | 실제 응답 상태인 소문자 `active`를 검증하도록 수정 |
| Order 409 | 주문 가능한 고정 상품과 inventory를 Dataset fixture로 보장 |
| Payment 409 | warmup과 측정이 서로 다른 상태성 write fixture를 쓰도록 분리 |
| Web 503 | Catalog 내부 URL과 Web→Catalog NetworkPolicy를 추가하고 local mock 설정을 맞춤 |

Dataset cache는 bulk 생성과 COPY 시간을 줄이기 위해 유지했다. 다만 Auth 입력과 Coupon hash-key가 바뀌면 안전한 fingerprint만으로 cache key가 달라져 오래된 snapshot을 다시 쓰지 않는다. 비밀번호, token, Authorization, cookie, coupon 평문은 cache, 문서, 결과 JSON에 넣지 않았다.

## 확인한 범위와 한계

- 확인함: Dataset Job 서비스당 1회, 서비스 순차 실행, k6 Job, scenario report, read-only observability snapshot, replica 복원, 전체 9개 서비스 API smoke 결과.
- 확인함: Coupon 단독 재실행에서도 code redemption을 포함한 9건이 오류율 0, checks 1이었다.
- 확인하지 않음: 이 1~2 RPS smoke는 성능 한계, autoscaling 효과, 장시간 restart 추세를 증명하지 않는다.
- 실행하지 않음: 원격 Kubernetes, dev/production, 외부 registry는 사용하지 않았다.

## 보관 자료

- [result.json](assets/run-local-istio-smoke-20260725-final-all/result.json)
- [SHA256SUMS](SHA256SUMS)
