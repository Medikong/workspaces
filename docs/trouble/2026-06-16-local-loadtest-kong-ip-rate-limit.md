---
id: TROUBLE-009
title: "로컬 부하테스트 k6 Pod IP 단위 Kong rate limit"
status: triaged
priority: p2
severity: medium
area: observability
repos:
  - gitops
  - workspace
owner: unassigned
created: 2026-06-16
updated: 2026-06-16
resolved: null
tags:
  - loadtest
  - kong
  - rate-limit
  - k6
  - local
  - grafana
related:
  - gitops/platform/loadtest
  - gitops/platform/kong/plugins/rate-limiting.yaml
  - gitops/platform/monitoring/dashboards/load/load-50-service-resource-and-traffic.json
links: []
---

# 로컬 부하테스트 k6 Pod IP 단위 Kong rate limit

## Context

`reservation-journey-load-test`를 로컬 Kubernetes에서 실행한 뒤 `Load 50 - Service Resource and Traffic`의 `Ingress RPS by Service` 패널을 확인했다.

서비스 레이턴시는 낮게 보였지만 RPS가 기대보다 낮았고, k6 로그에서는 `/concerts` 호출이 HTTP `429`로 실패했다. 이 때문에 처음에는 concert-service 자체 처리량이 낮은 것처럼 보일 수 있었다.

## Symptoms

- 관찰된 현상:
  - `reservation-journey-load-test`가 약 6분 실행 후 threshold 실패로 종료됐다.
  - k6 summary의 `http_reqs_rate`는 약 `5.64 req/s`였다.
  - 실패 로그에는 `reservation_journey.concerts failed with status 429`가 반복됐다.
  - `Load 50`의 `Ingress RPS by Service`에서 service별 RPS가 서비스 레이턴시에 비해 낮게 보였다.
- 재현 조건:
  - 로컬 Kubernetes에서 k6 Job Pod 하나가 여러 VU를 실행한다.
  - `/concerts` public ingress에 `ticketing-rate-limit-concerts` Kong plugin이 붙어 있다.
  - Kong rate limit plugin의 설정이 `minute: 120`, `policy: local`이다.
- 기대 동작:
  - 부하테스트는 service/backend 한계에 도달할 때까지 트래픽을 증가시킨다.
  - `Load 50`의 service RPS는 실제 upstream service가 받은 트래픽을 해석하는 데 사용된다.
- 실제 동작:
  - `/concerts` 요청이 service에 충분히 도달하기 전에 Kong에서 HTTP `429`로 제한된다.
  - 로컬에서는 모든 VU가 같은 k6 Pod IP에서 나가므로 rate limit bucket이 한 곳에 몰린다.

## Impact

- 영향 범위:
  - 로컬 `reservation-journey-load-test` 결과 해석.
  - `Load 50`의 `Ingress RPS by Service` 패널 해석.
  - service/backend 한계 측정 실험.
- 우선 처리 이유:
  - Kong rate limit에서 잘린 요청을 service 처리량 한계로 오해할 수 있다.
  - 레이턴시가 낮은데 RPS가 낮은 상황에서 병목 후보를 잘못 좁힐 수 있다.
- 우회 방법:
  - service/backend 한계 측정 시 로컬에서는 `reservation-journey-load-test` 실행 전에 Kong rate limit 한도를 크게 올린다.
  - Kong rate limit 정책 자체를 검증하는 실험은 별도 실행으로 분리한다.

## Investigation

| 시간 | 확인 내용 | 결과 |
| --- | --- | --- |
| 2026-06-16 KST | `reservation-journey-load-test` k6 로그 확인 | `/concerts`에서 HTTP `429` 반복 |
| 2026-06-16 KST | k6 summary 확인 | `http_reqs_rate` 약 `5.64 req/s`, `http_req_failed_rate` 약 `12.4%` |
| 2026-06-16 KST | `ticketing-rate-limit-concerts` KongClusterPlugin 확인 | `config.minute=120`, `config.policy=local` |
| 2026-06-16 KST | `concert-public-api` ingress annotation 확인 | `/concerts` public ingress에 `ticketing-rate-limit-concerts` 적용 |
| 2026-06-16 KST | route 인증 여부 확인 | `/concerts` public ingress에는 `ticketing-jwt`가 없어 고객 계정별 식별이 아님 |
| 2026-06-16 KST | 로컬 실행 구조 확인 | k6 Job Pod 하나에서 다수 VU가 실행되어 같은 client IP bucket을 공유 |

## Root Cause

이번 429는 고객 계정별 rate limit이 아니라 로컬 k6 Pod의 client IP 단위 rate limit으로 판단한다.

현재 `/concerts` public ingress는 인증이 없는 공개 route다.

```yaml
konghq.com/plugins: ticketing-rate-limit-concerts,ticketing-correlation-id,ticketing-prometheus
```

`ticketing-rate-limit-concerts` plugin은 다음처럼 설정되어 있다.

```yaml
config:
  minute: 120
  policy: local
```

따라서 Kong은 Medikong auth-service의 고객 계정 단위로 요청을 나누지 않는다. 로컬 k6 Job에서는 여러 VU가 한 Pod 안에서 실행되고, Kong 입장에서는 대부분 같은 client IP에서 오는 요청처럼 보인다.

결과적으로 `minute: 120`은 고객 1명당 120회가 아니라 로컬 k6 Pod 전체 기준 약 `2 req/s` 한도로 작동한다.

```text
1개 k6 Pod 전체 = 1개 client IP bucket
minute: 120 = Pod 전체 기준 약 2 req/s
여러 VU가 동시에 /concerts 호출
=> Kong에서 HTTP 429 발생
```

이 상태에서 `Load 50`의 `Ingress RPS by Service`는 service/backend 한계를 보여주기보다 Kong rate limit에 의해 upstream으로 전달된 요청량만 보여줄 수 있다.

## Decision

- 로컬 `reservation-journey-load-test`는 service/backend 한계 측정을 기본 의도로 둔다.
- 따라서 로컬에서 해당 시나리오를 실행할 때는 Kong rate limit 한도를 기본적으로 크게 올린다.
- 제품 보호 정책을 포함한 rate limit 검증은 같은 시나리오라도 `LOADTEST_DISABLE_KONG_RATE_LIMIT=false`를 명시해 별도로 본다.
- 운영 또는 분산 부하테스트에서는 부하 발생 Pod 수, client IP 분산, Kong rate limit 식별 기준을 별도 실험 조건으로 기록한다.

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | 로컬 `reservation-journey-load-test`에서 Kong rate limit 완화를 기본값으로 설정 | gitops | `gitops/platform/loadtest/Taskfile.yml` |
| done | `LOADTEST_DISABLE_KONG_RATE_LIMIT=false`로 rate limit 포함 실험을 선택할 수 있게 문서화 | gitops | `gitops/platform/loadtest/README.md` |
| done | k6 로그, Kong plugin, ingress annotation으로 원인 분리 | gitops/workspace | 이 문서 |
| todo | 분산 k6 runner 또는 다중 Pod 실행을 별도 실험으로 검토 | gitops | `gitops/platform/loadtest` |
| todo | rate limit 정책 검증용 시나리오와 capacity 측정 시나리오를 대시보드/문서에서 명확히 분리 | gitops/workspace | `Load 50`, `Load 60` |

## Resolution

미해결.

로컬 결과 해석 기준과 우회 방법은 정리했다. 현재 로컬 capacity 측정에서는 `reservation-journey-load-test` 실행 시 Kong rate limit 한도를 크게 올리는 쪽을 기본값으로 둔다.

다만 이 트러블은 제품 장애라기보다 로컬 부하 발생 구조와 Kong rate limit 식별 기준이 겹친 제약이다. 최종 정리는 다음 중 하나를 선택한 뒤 닫는다.

1. 로컬 capacity 테스트는 Kong rate limit 완화를 표준으로 유지한다.
2. k6 runner를 여러 Pod로 나누어 client IP bucket을 분산한다.
3. rate limit 정책 검증은 별도 시나리오로 분리하고, `Load 50` 해석 문서에 포함한다.
