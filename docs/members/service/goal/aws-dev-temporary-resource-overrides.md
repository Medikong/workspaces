# AWS dev 테스트용 임시 리소스 완화 기록

## 문서 목적

AWS dev 클러스터에서 정상 예매 E2E와 Kong/Kafka/Istio 검증을 먼저 수행하기 위해 어떤 설정을 임시로 낮췄는지 기록한다.

이 문서는 최종 운영 기준을 바꾸기 위한 문서가 아니다. 최종 검증 단계에서는 이 문서의 "복구 기준"으로 되돌린 뒤 HPA, PDB, min replica 요구사항을 다시 확인한다.

## 왜 낮추는가

현재 AWS dev 클러스터는 worker node 3대가 각각 1 vCPU 수준이다. 여기에 Istio sidecar가 붙은 서비스들을 모두 `replicas: 2`로 올리면 앱 컨테이너와 Envoy sidecar가 함께 CPU request를 잡는다.

실제 확인된 scheduler 이벤트는 다음과 같다.

```text
0/4 nodes are available:
1 node(s) had untolerated taint(s),
3 Insufficient cpu
```

따라서 지금 단계에서는 고가용성 검증보다 정상 흐름 검증이 우선이다.

```text
먼저 1 replica로 전체 흐름을 검증
-> Kong / Kafka / Ticket / Notification / Kiali / Prometheus 증거 확보
-> 최종 단계에서 2 replica와 PDB/HPA 기준으로 복구 검증
```

## 서비스 리소스 완화

대상 파일:

```text
gitops/values/env/aws-dev.yaml
gitops/values/services/auth.yaml
gitops/values/services/concert.yaml
gitops/values/services/reservation.yaml
gitops/values/services/payment.yaml
gitops/values/services/ticket.yaml
gitops/values/services/notification.yaml
gitops/values/services/dashboard.yaml
```

### 공통 aws-dev 값

| 항목 | 기존 값 | 테스트 완화 값 | 복구 기준 |
| --- | --- | --- | --- |
| `deployment.replicas` | `2` | `1` | `2` |
| `hpa.minReplicas` | `2` | `1` | `2` |
| `hpa.maxReplicas` | `10` | `3` | 요구사항 검증 시 `10` |
| `hpa.targetCPUUtilizationPercentage` | `70` | `70` | `70` |
| `container.resources.requests.cpu` | `50m` | 변경 없음 | `50m` |
| `container.resources.requests.memory` | `128Mi` | 변경 없음 | `128Mi` |
| `pdb.minAvailable` | `1` | 변경 없음 | `1` |

### 서비스별 값

| 서비스 | 기존 `deployment.replicas` | 테스트 `deployment.replicas` | 기존 `hpa.minReplicas` | 테스트 `hpa.minReplicas` | 기존 `hpa.maxReplicas` | 테스트 `hpa.maxReplicas` |
| --- | --- | --- | --- | --- | --- | --- |
| auth-service | `2` | `1` | `2` | `1` | `10` | `3` |
| concert-service | `2` | `1` | `2` | `1` | `10` | `3` |
| reservation-service | `2` | `1` | `2` | `1` | `10` | `3` |
| payment-service | `2` | `1` | `2` | `1` | `10` | `3` |
| ticket-service | `2` | `1` | `2` | `1` | `10` | `3` |
| notification-service | `2` | `1` | `2` | `1` | `10` | `3` |
| dashboard | `2` | `1` | 없음 | 없음 | 없음 | 없음 |

## Kong 리소스 완화

Kong은 이미 `aws-dev`와 `aws-prod` 값을 분리해 두고 있다. 현재 `aws-dev`는 운영 후보 값보다 낮은 resource request/limit을 사용한다.

대상 파일:

```text
gitops/platform/kong/values-aws-dev.yaml
gitops/platform/kong/values-aws-prod.yaml
```

### Kong replica와 노출 방식

| 항목 | prod 후보 값 | aws-dev 테스트 값 | 의미 |
| --- | --- | --- | --- |
| `replicaCount` | `2` | `1` | dev에서는 단일 Kong Pod로 리소스 절약 |
| `proxy.type` | `LoadBalancer` | `NodePort` | dev에서는 외부 LB 비용 없이 NodePort로 테스트 |
| `proxy.http.nodePort` | 없음 | `32407` | AWS dev 테스트 고정 포트 |

### Kong proxy container resource

| 항목 | prod 후보 값 | aws-dev 테스트 값 |
| --- | --- | --- |
| `resources.requests.cpu` | `100m` | `5m` |
| `resources.requests.memory` | `256Mi` | `128Mi` |
| `resources.limits.cpu` | `1000m` | `500m` |
| `resources.limits.memory` | `1Gi` | `768Mi` |

### Kong ingressController resource

| 항목 | prod 후보 값 | aws-dev 테스트 값 |
| --- | --- | --- |
| `ingressController.resources.requests.cpu` | `50m` | `5m` |
| `ingressController.resources.requests.memory` | `128Mi` | `64Mi` |
| `ingressController.resources.limits.cpu` | `500m` | `200m` |
| `ingressController.resources.limits.memory` | `512Mi` | `256Mi` |

## 테스트에서 기대하는 효과

리소스 완화 후 기대 상태:

```text
auth-service          1/1 Running
concert-service       2/2 Running 또는 최소 app+sidecar Ready
reservation-service   2/2 Running 또는 최소 app+sidecar Ready
payment-service       2/2 Running 또는 최소 app+sidecar Ready
ticket-service        2/2 Running 또는 최소 app+sidecar Ready
notification-service  2/2 Running 또는 최소 app+sidecar Ready
dashboard             1/1 Running
```

Istio sidecar가 붙은 서비스는 Pod READY가 `2/2`로 보이는 것이 정상이다.

## 적용 후 확인 명령

ArgoCD 수동 sync:

```bash
argocd app sync auth-aws-dev --core --timeout 180
argocd app sync concert-aws-dev --core --timeout 180
argocd app sync reservation-aws-dev --core --timeout 180
argocd app sync payment-aws-dev --core --timeout 180
argocd app sync ticket-aws-dev --core --timeout 180
argocd app sync notification-aws-dev --core --timeout 180
argocd app sync dashboard-aws-dev --core --timeout 180
```

Deployment/HPA 확인:

```bash
kubectl get deploy,hpa -n ticketing-auth
kubectl get deploy,hpa -n ticketing-concert
kubectl get deploy,hpa -n ticketing-reservation
kubectl get deploy,hpa -n ticketing-payment
kubectl get deploy,hpa -n ticketing-ticket
kubectl get deploy,hpa -n ticketing-notification
kubectl get deploy -n ticketing-dashboard
```

Pending 원인 확인:

```bash
kubectl get pods -A | grep -E 'Pending|ImagePullBackOff|CrashLoopBackOff'
kubectl describe pod <pod-name> -n <namespace>
```

## 복구 기준

정상 예매 E2E, Kafka 이벤트 흐름, Kiali/Prometheus traffic 확인이 끝나면 아래 기준으로 복구한다.

| 항목 | 복구 값 |
| --- | --- |
| 서비스 `deployment.replicas` | `2` |
| 서비스 `hpa.minReplicas` | `2` |
| 서비스 `hpa.maxReplicas` | 요구사항 기준 `10` |
| Kong `aws-dev` 값 | dev 검증이 계속 필요하면 유지 가능 |
| Kong `aws-prod` 값 | 변경하지 않음 |

복구 후에는 다음을 다시 확인해야 한다.

```text
PodDisruptionBudget 기준 충족
HPA min 2 기준 충족
서비스별 Pod 2개 이상 Running
Istio sidecar 포함 READY 정상
Kong smoke test 재통과
정상 예매 E2E 재통과
```
