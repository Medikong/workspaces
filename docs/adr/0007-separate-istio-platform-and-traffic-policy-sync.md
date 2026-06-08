---
id: ADR-0007
title: "Istio 설치와 서비스 트래픽 정책은 ArgoCD Application으로 분리한다"
status: accepted
date: 2026-06-08
areas:
  - gitops
  - service-mesh
  - traffic-management
repos:
  - gitops
  - workspace
decision_drivers:
  - Istio CRD 생성 전 VirtualService와 DestinationRule이 적용되는 문제를 피해야 한다.
  - Istio control plane 설치와 서비스별 트래픽 정책의 실패 범위를 분리해야 한다.
  - 서비스 트래픽 정책은 실제 서비스 namespace에 적용되어야 한다.
related:
  - ADR-0003
  - ADR-0006
  - workspace/docs/personal/execution/kong-istio-gitops-service-mesh-implementation.md
links:
  - https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/
  - https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/
  - https://istio.io/latest/docs/reference/config/networking/virtual-service/
  - https://istio.io/latest/docs/reference/config/networking/destination-rule/
supersedes: []
superseded_by: null
---

# ADR 0007: Istio 설치와 서비스 트래픽 정책은 ArgoCD Application으로 분리한다

## 상태

Accepted

## 날짜

2026-06-08

## 배경

공연 티켓 서비스는 Kong을 외부 API Gateway로, Istio를 내부 Service Mesh로 사용하는 구조를 채택했다. GitOps 레포에는 Istio 설치 리소스와 서비스별 트래픽 정책이 모두 들어간다.

처음에는 Istio platform layer 안에 트래픽 정책까지 함께 포함할 수 있었다. 하지만 `VirtualService`, `DestinationRule`은 Istio CRD가 먼저 생성되어 있어야 적용할 수 있다. 또한 `reservation-service`의 traffic policy는 `ticketing-reservation` namespace에 적용되어야 하므로 `istio-system` 또는 ArgoCD platform layer와 책임 범위가 다르다.

따라서 Istio 설치와 서비스별 traffic policy를 같은 ArgoCD Application에서 한 번에 동기화하면 다음 문제가 생길 수 있다.

- Istio CRD가 생성되기 전에 `VirtualService`, `DestinationRule` dry-run이 실패한다.
- Istio control plane 문제와 서비스 트래픽 정책 문제를 구분하기 어렵다.
- 서비스 namespace에 적용되어야 하는 리소스가 platform layer와 섞인다.
- rollback이나 canary scenario 검증 시 platform layer까지 함께 흔들릴 수 있다.

## 결정

Istio 설치와 서비스 트래픽 정책을 별도 ArgoCD Application으로 분리한다.

Istio 설치 Application:

```text
medikong-istio-platform
  path: platform/istio
  sync-wave: -30
  역할: istio-base, istiod, kiali Application 생성
```

서비스 트래픽 정책 Application:

```text
reservation-canary-traffic
  path: platform/istio/traffic/reservation
  namespace: ticketing-reservation
  sync-wave: 20
  역할: reservation-service DestinationRule / VirtualService 적용
```

`reservation-canary-traffic`에는 다음 sync option과 retry를 둔다.

```text
CreateNamespace=false
SkipDryRunOnMissingResource=true
retry limit = 10
```

이 설정은 namespace 생성을 traffic policy Application이 책임지지 않게 하고, Istio CRD 생성 타이밍 문제를 완화한다. 다만 CRD가 실제로 없으면 최종 적용은 여전히 실패하므로, `medikong-istio-platform`이 먼저 정상화되어야 한다.

## 대안

| 대안 | 장점 | 단점 | 판단 |
| --- | --- | --- | --- |
| Istio 설치와 traffic policy를 하나의 Application에 둔다 | 파일 수와 Application 수가 줄어든다. | CRD 순서, namespace 책임, 실패 범위가 섞인다. | 채택하지 않음 |
| traffic policy를 수동 `kubectl apply`로 관리한다 | 즉시 테스트하기 쉽다. | GitOps 추적성과 재현성이 떨어지고 운영 상태가 Git과 달라질 수 있다. | 채택하지 않음 |
| 서비스 Helm chart 안에 VirtualService/DestinationRule을 포함한다 | 서비스 배포와 traffic policy가 함께 움직인다. | Istio CRD 의존성이 서비스 배포에 섞이고, canary/rollback scenario 관리가 복잡해진다. | 보류 |
| Istio 설치와 traffic policy를 별도 Application으로 분리한다 | CRD 설치 순서와 서비스 정책 적용 범위를 분리할 수 있다. | ArgoCD Application 수가 늘어난다. | 채택 |

## 결과

좋아지는 점:

- Istio control plane 설치와 서비스별 traffic policy 적용 상태를 따로 볼 수 있다.
- `medikong-istio-platform`이 Healthy인지 먼저 확인한 뒤 `reservation-canary-traffic`을 확인할 수 있다.
- `DestinationRule`, `VirtualService`는 실제 대상 서비스 namespace에 적용된다.
- canary, rollback, circuit breaker scenario를 platform 설치와 분리해 다룰 수 있다.

비용:

- ArgoCD Application이 하나 더 늘어난다.
- 장애 확인 시 parent Application과 child Application 관계를 함께 봐야 한다.
- 신규 서비스에 traffic policy를 추가할 때 Application 또는 kustomization 배치 기준을 지켜야 한다.

## 후속 작업

| 상태 | 작업 | 담당 | 연결 파일 |
| --- | --- | --- | --- |
| done | Istio platform Application 추가 | service | `gitops/argo/applications/aws-dev/platform/istio.yaml` |
| done | Istio platform layer에서 traffic policy 제거 | service | `gitops/platform/istio/kustomization.yaml` |
| done | reservation traffic policy Application 추가 | service | `gitops/argo/applications/aws-dev/platform/istio-traffic-reservation.yaml` |
| done | reservation DestinationRule / VirtualService 기본 stable 상태 적용 | service | `gitops/platform/istio/traffic/reservation/` |
| todo | DB/Kafka 복구 후 실제 service-to-service traffic 검증 | service | `workspace/docs/personal/execution/kong-istio-gitops-service-mesh-implementation.md` |
| todo | 신규 서비스 traffic policy 추가 시 동일 분리 기준 적용 | service | TBD |
