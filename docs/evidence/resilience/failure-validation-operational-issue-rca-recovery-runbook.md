### 1. 발생 상황

Notification 장애 격리 검증을 수행하는 과정에서 일부 서비스 Pod가 재생성되었다.

이후 다음 문제가 연쇄적으로 발생했다.

```
1. ECR image pull 403 Forbidden
2. ImagePullBackOff
3. Pending Pod 발생
4. Service Ready endpoint 제거
5. Envoy no healthy upstream
6. reservation/payment/ticket health 503
```

---

### 2. 증상

Core 서비스 health 확인 시 다음과 같은 응답이 발생했다.

```
reservation=503
payment=503
ticket=503
notification=200
```

응답 본문은 애플리케이션 에러가 아니라 Envoy 에러였다.

```
HTTP/1.1 503 Service Unavailable
server: envoy

no healthy upstream
```

이는 애플리케이션이 직접 503을 반환한 것이 아니라, Envoy가 전달할 수 있는 정상 upstream endpoint를 찾지 못했다는 의미다.

---

### 3. 원인 1: ECR imagePullSecret 문제

Pod 재생성 과정에서 새 Pod가 ECR에서 이미지를 pull해야 했다.

그러나 기존 `ecr-registry` secret의 인증 정보가 만료되었거나 권한이 맞지 않아 ECR manifest 요청이 403 Forbidden으로 실패했다.

대표 증상은 다음과 같다.

```
reason: ImagePullBackOff
message: failed to resolve image
unexpected status from HEAD request to ECR manifests: 403 Forbidden
```

즉 기존 Pod는 노드에 캐시된 이미지로 실행 중이었지만, 새 Pod는 이미지를 새로 받아야 했고 이 시점에 ECR 인증 문제가 드러났다.

---

### 4. 원인 2: nodeSelector와 실제 노드 라벨 불일치

ECR Secret을 갱신한 뒤에도 일부 Pod는 Pending 상태에 머물렀다.

Pending 이벤트는 다음과 같았다.

```
0/6 nodes are available:
1 node(s) had untolerated taint(s),
5 node(s) didn't match Pod's node affinity/selector
```

Deployment는 다음 nodeSelector를 요구하고 있었다.

```yaml
nodeSelector:
  medikong.io/workload: app
  role: app
```

하지만 실제 app node에는 `medikong.io/workload=app`만 존재하고 `role=app` 라벨이 없었다.

따라서 새 Pod는 app node에 스케줄링되지 못하고 Pending 상태가 되었다.

---

### 5. 직접 영향

Core service Pod가 Ready 상태가 되지 못하면서 Service endpoint가 비었다.

그 결과 mesh client가 core service를 호출했을 때 Envoy가 정상 upstream을 찾지 못했고, 다음 응답을 반환했다.

```
no healthy upstream
```

즉 이 시점의 503은 notification 장애가 직접 전파된 것이 아니라, Pod 재생성 중 발견된 ECR 인증 문제와 nodeSelector 불일치로 인해 Ready endpoint가 사라져 발생한 것이다.

---

### 6. 복구 절차

### 6.1 ECR Secret 갱신

```bash
REGION=ap-northeast-2
REGISTRY=941141115079.dkr.ecr.ap-northeast-2.amazonaws.com
TOKEN=$(aws ecr get-login-password --region "$REGION")

for ns in ticketing-auth ticketing-concert ticketing-reservation ticketing-payment ticketing-ticket ticketing-notification ticketing-dashboard; do
  kubectl -n "$ns" create secret docker-registry ecr-registry \
    --docker-server="$REGISTRY" \
    --docker-username=AWS \
    --docker-password="$TOKEN" \
    --dry-run=client -o yaml | kubectl apply -f -
done
```

### 6.2 ImagePullBackOff Pod 재생성

```bash
kubectl -n ticketing-reservation delete pod -l app=reservation-service
kubectl -n ticketing-payment delete pod -l app=payment-service
kubectl -n ticketing-ticket delete pod -l app=ticket-service
kubectl -n ticketing-notification delete pod -l app=notification-service
```

### 6.3 app node 라벨 보정

Deployment가 `role=app` 라벨을 요구하고 있었으므로 app node에 누락된 라벨을 추가했다.

```bash
kubectl label node kt-cloud-lab-lee895787-1781252766274-node-3.novalocal role=app --overwrite
kubectl label node kt-cloud-lab-lee895787-1781252766274-node-4.novalocal role=app --overwrite
```

### 6.4 Pod 상태 확인

```bash
kubectl -n ticketing-reservation get pod -l app=reservation-service -o wide
kubectl -n ticketing-payment get pod -l app=payment-service -o wide
kubectl -n ticketing-ticket get pod -l app=ticket-service -o wide
kubectl -n ticketing-notification get pod -l app=notification-service -o wide
```

### 6.5 baseline health 확인

```bash
kubectl -n kong exec -it mesh-curl -c mesh-curl -- \
  curl -s -o /dev/null -w 'reservation=%{http_code}\n' \
  http://reservation-service.ticketing-reservation.svc.cluster.local:8083/health

kubectl -n kong exec -it mesh-curl -c mesh-curl -- \
  curl -s -o /dev/null -w 'payment=%{http_code}\n' \
  http://payment-service.ticketing-payment.svc.cluster.local:8080/health

kubectl -n kong exec -it mesh-curl -c mesh-curl -- \
  curl -s -o /dev/null -w 'ticket=%{http_code}\n' \
  http://ticket-service.ticketing-ticket.svc.cluster.local:8085/health

kubectl -n kong exec -it mesh-curl -c mesh-curl -- \
  curl -s -o /dev/null -w 'notification=%{http_code}\n' \
  http://notification-service.ticketing-notification.svc.cluster.local:8084/health
```

복구 후 결과는 다음과 같았다.

```
reservation=200
payment=200
ticket=200
notification=200
```

---

### 7. 재발 방지 방안

### 7.1 ECR Secret 갱신 자동화

현재 ECR 인증 정보가 만료되면 새 Pod가 이미지를 pull하지 못한다.

개선 방향은 다음과 같다.

```
1. ECR imagePullSecret 갱신 CronJob 구성
2. External Secrets 또는 Sealed Secrets 기반 관리
3. Pod 재생성 전 image pull 가능성 사전 점검
```

### 7.2 노드 라벨 표준화

현재 Deployment는 `medikong.io/workload=app`과 `role=app`을 동시에 요구한다.

개선 방향은 둘 중 하나다.

```
방안 A:
app node에 role=app 라벨을 인프라 코드에서 항상 부여한다.

방안 B:
Deployment nodeSelector에서 role=app을 제거하고 medikong.io/workload=app만 사용한다.
```

현재 노드 라벨 체계가 `medikong.io/workload` 중심으로 구성되어 있으므로, 장기적으로는 `role=app` 조건을 제거하거나 인프라 코드에서 라벨을 일관되게 부여하는 방식 중 하나를 선택해야 한다.

---

### 8. 최종 판정

```
장애 유형:
Pod 재생성 중 ECR 인증 실패 + nodeSelector 라벨 불일치

직접 원인:
Ready endpoint 부재로 인한 Envoy no healthy upstream

복구 결과:
ECR Secret 갱신, app node 라벨 보정, Pod 재생성 후 baseline health 200 복구

운영 교훈:
장애 검증 전 imagePullSecret 유효성, nodeSelector와 실제 node label 정합성, Ready endpoint 상태를 사전 점검해야 한다.
```
