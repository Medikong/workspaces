### 1. 검증 목적

private-dev 환경에서 GitOps로 적용한 HA baseline이 실제 Kubernetes 리소스에 반영되었는지 확인한다.

검증 기준은 다음과 같다.

```
deployment.replicas = 2
hpa.minReplicas = 2
hpa.maxReplicas = 4
pdb.minAvailable = 1
```

이 기준을 통해 각 핵심 백엔드 서비스가 최소 2개 Pod로 실행되고, voluntary disruption 상황에서 PDB가 중단 가능 Pod 수를 제한하는지 확인한다.

---

### 2. 검증 대상 서비스

핵심 백엔드 서비스 기준으로 검증한다.

```
auth-service
concert-service
notification-service
payment-service
reservation-service
ticket-service
```

dashboard와 synthetic-traffic은 현재 ImagePullBackOff/ErrImagePull 상태가 남아 있어, 핵심 백엔드 HA/PDB 검증 범위에서는 제외하고 별도 이미지 pull 이슈로 분리한다.

---

### 3. Deployment 검증 결과

실행 명령어:

```bash
kubectl get deploy -A | grep -E 'auth-service|concert-service|dashboard|frontend|notification-service|payment-service|reservation-service|ticket-service'
```

핵심 백엔드 서비스 결과:

```
ticketing-auth           auth-service             2/2     2     2
ticketing-concert        concert-service          2/2     2     2
ticketing-notification   notification-service     2/2     2     2
ticketing-payment        payment-service          2/2     2     2
ticketing-reservation    reservation-service      2/2     2     2
ticketing-ticket         ticket-service           2/2     2     2
```

해석:

```
핵심 백엔드 서비스는 모두 Deployment 기준으로 2개 replica가 Ready/Available 상태이다.
```

---

### 4. HPA 검증 결과

실행 명령어:

```bash
kubectl get hpa -A | grep -E 'auth-service|concert-service|dashboard|frontend|notification-service|payment-service|reservation-service|ticket-service'
```

핵심 백엔드 서비스 결과:

```
auth-service             min=2   max=4   replicas=2
concert-service          min=2   max=4   replicas=2
notification-service     min=2   max=4   replicas=2
payment-service          min=2   max=4   replicas=2
reservation-service      min=2   max=4   replicas=2
ticket-service           min=2   max=4   replicas=2
```

해석:

```
private-dev HA baseline 기준에 따라 HPA minReplicas=2, maxReplicas=4가 적용되었다.
```

HPA 자체가 필수 요구사항은 아니지만, 본 프로젝트에서는 최소 Pod 2개 유지 기준을 HPA minReplicas와 Deployment replicas를 통해 함께 보장한다.

---

### 5. PDB 검증 결과

실행 명령어:

```bash
kubectl get pdb -A | grep -E 'auth-service|concert-service|dashboard|frontend|notification-service|payment-service|reservation-service|ticket-service'
```

핵심 백엔드 서비스 결과:

```
auth-service             minAvailable=1   allowedDisruptions=1
concert-service          minAvailable=1   allowedDisruptions=1
notification-service     minAvailable=1   allowedDisruptions=1
payment-service          minAvailable=1   allowedDisruptions=1
reservation-service      minAvailable=1   allowedDisruptions=2
ticket-service           minAvailable=1   allowedDisruptions=1
```

해석:

```
replica 2개를 가진 서비스에서 PDB minAvailable=1 기준으로 allowed disruptions=1이 계산되었다.
이는 voluntary disruption 상황에서 동시에 모든 Pod가 내려가지 않도록 제한한다는 의미이다.
```

reservation-service의 allowedDisruptions가 2로 계산된 이유는 canary v2 Pod가 동일한 PDB selector에 포함되기 때문이다.

```
reservation-service v1 Pod 2개
reservation-service-v2 Pod 1개
총 3개 Pod가 app=reservation-service selector에 매칭
minAvailable=1
allowedDisruptions=2
```

---

### 6. Pod 상태 검증 결과

실행 명령어:

```bash
kubectl get pods -A | grep -E 'auth-service|concert-service|dashboard|frontend|notification-service|payment-service|reservation-service|ticket-service'
```

핵심 백엔드 서비스 결과:

```
auth-service             2개 Pod Running
concert-service          2개 Pod Running
notification-service     2개 Pod Running
payment-service          2개 Pod Running
reservation-service      2개 Pod Running
ticket-service           2개 Pod Running
```

Istio sidecar가 주입된 서비스는 Pod 상태가 `2/2 Running`으로 표시된다.

```
app container 1개
istio-proxy Envoy sidecar 1개
총 2개 container Ready
```

따라서 `2/2 Running`은 애플리케이션 컨테이너와 Envoy sidecar가 모두 정상 Ready 상태임을 의미한다.

---

### 7. 예외 리소스

다음 리소스는 별도 이슈로 분리한다.

```
ticketing-dashboard/dashboard   ImagePullBackOff / ErrImagePull
synthetic/synthetic-traffic     ImagePullBackOff
```

해당 리소스는 핵심 백엔드 MSA 서비스의 HA/PDB 검증 범위에서 제외하고, dashboard 또는 synthetic traffic 검증 단계에서 별도 복구한다.

---

### 8. 최종 판정

핵심 백엔드 서비스 기준으로 private-dev HA/PDB baseline은 정상 반영되었다.

```
Deployment replicas=2 반영 확인
HPA minReplicas=2, maxReplicas=4 반영 확인
PDB minAvailable=1 반영 확인
PDB allowed disruptions 계산 확인
서비스별 Pod 2개 Running 확인
Istio sidecar 포함 Pod Ready 확인
```

최종 판정:

```
private-dev 핵심 백엔드 서비스 HA/PDB 검증 통과
```
