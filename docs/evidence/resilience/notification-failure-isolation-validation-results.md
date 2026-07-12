### 1. 검증 목적

본 검증의 목적은 `notification-service` 장애가 핵심 예매 흐름에 전파되지 않는지 확인하는 것이다.

핵심 예매 흐름은 다음 서비스로 구성된다.

```
reservation-service
payment-service
ticket-service
```

`notification-service`는 알림 저장/발송을 담당하는 후속 처리 서비스이다. 따라서 notification 장애가 발생하더라도 예약, 결제, 티켓 발행 서비스의 기본 가용성은 유지되어야 한다.

---

### 2. GitOps 상시 적용 정책

이번 검증을 위해 GitOps에는 `notification-service`의 상시 장애 격리 정책을 추가했다.

상시 적용 대상은 Istio `DestinationRule`이다.

```
namespace: ticketing-notification
resource: DestinationRule
name: notification-service
target host: notification-service.ticketing-notification.svc.cluster.local
```

적용한 정책은 다음과 같다.

```yaml
trafficPolicy:
  connectionPool:
    tcp:
      maxConnections: 50
    http:
      http1MaxPendingRequests: 50
      maxRequestsPerConnection: 20
  outlierDetection:
    consecutive5xxErrors: 3
    interval: 10s
    baseEjectionTime: 30s
    maxEjectionPercent: 50
```

이 정책의 목적은 다음과 같다.

```
1. notification-service 장애 시 연결과 대기 요청이 과도하게 쌓이지 않도록 제한한다.
2. 반복적으로 5xx를 반환하는 endpoint를 Envoy가 일정 시간 트래픽 대상에서 제외하도록 한다.
3. notification 장애가 핵심 서비스로 연쇄 전파되는 것을 줄인다.
```

단, 장애를 강제로 만드는 `VirtualService fault injection`은 상시 적용하지 않는다. 이는 테스트 시나리오 전용 리소스이며, 평상시 GitOps 운영 경로에는 포함하지 않는다.

---

### 3. 장애 주입 전 baseline

장애 주입 전 mesh 내부 client인 `mesh-curl`에서 각 서비스 health를 확인했다.

```
reservation=200
payment=200
ticket=200
notification=200
```

이를 통해 장애 주입 전 모든 서비스가 정상 응답 상태임을 확인했다.

---

### 4. 장애 주입 방식

notification-service에 대해 Istio `VirtualService` fault injection을 적용했다.

적용한 장애 방식은 다음과 같다.

```
대상 서비스: notification-service
장애 방식: Istio fault injection
장애 내용: 100% HTTP 503 abort
적용 범위: mesh 내부에서 notification-service로 향하는 요청
```

장애 주입 리소스는 다음 형태로 적용했다.

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: notification-service-fault
  namespace: ticketing-notification
  labels:
    app.kubernetes.io/name: notification-service
    app.kubernetes.io/part-of: medikong
    medikong.io/scenario: notification-fault-abort
spec:
  hosts:
    - notification-service
    - notification-service.ticketing-notification.svc.cluster.local
  gateways:
    - mesh
  http:
    - name: notification-100-percent-503
      fault:
        abort:
          percentage:
            value: 100
          httpStatus: 503
      route:
        - destination:
            host: notification-service.ticketing-notification.svc.cluster.local
```

이 리소스는 장애 검증을 위한 임시 리소스이므로 검증 완료 후 삭제했다.

---

### 5. 장애 주입 결과

Istio fault injection 적용 후 notification-service health를 확인했다.

```
notification=503
```

이는 notification-service 장애가 의도대로 재현되었음을 의미한다.

---

### 6. 핵심 서비스 영향 확인

notification-service 장애 상태에서 핵심 서비스 health를 확인했다.

```
reservation=200
payment=200
ticket=200
```

이를 통해 notification-service 장애가 reservation-service, payment-service, ticket-service의 기본 health 응답에는 전파되지 않음을 확인했다.

즉, notification-service는 장애 상태였지만 핵심 예매/결제/티켓 서비스는 정상 응답을 유지했다.

---

### 7. Prometheus metric 확인

Prometheus에서 Istio request metric을 조회했다.

조회 결과 reservation-service, payment-service, ticket-service는 200 응답을 유지했다.

다만 Istio fault abort는 요청이 실제 destination workload까지 전달되지 않을 수 있으므로, destination 기준 metric에서는 notification 503 증가량이 명확하게 잡히지 않을 수 있다. 따라서 본 검증에서는 curl 기반 HTTP 응답 결과를 1차 증거로 사용하고, Prometheus metric은 보조 증거로 해석한다.

---

### 8. 검증 중 발견한 운영 이슈와 복구

초기 검증 과정에서 Pod 재생성이 발생하며 다음 운영 이슈가 발견되었다.

```
1. ECR imagePullSecret 문제로 ImagePullBackOff 발생
2. nodeSelector와 실제 node label 불일치로 Pending 발생
3. Ready endpoint 부재로 Envoy no healthy upstream 발생
```

복구 절차는 다음과 같았다.

```
1. 각 namespace의 ecr-registry secret 갱신
2. ImagePullBackOff Pod 재생성
3. app node에 누락된 role=app label 보정
4. mesh-curl 재생성
5. baseline health 재확인
```

복구 후 baseline은 다음과 같이 정상화되었다.

```
reservation=200
payment=200
ticket=200
notification=200
```

이 과정을 통해 장애 검증 전에 imagePullSecret 유효성, nodeSelector와 node label 정합성, Ready endpoint 상태를 사전 점검해야 함을 확인했다.

---

### 9. 최종 판정

```
판정: 성공
```

notification-service 요청은 Istio fault injection에 의해 HTTP 503을 반환했지만, reservation-service, payment-service, ticket-service는 모두 HTTP 200을 유지했다.

따라서 notification-service 장애가 핵심 예매/결제/티켓 서비스의 기본 가용성에는 전파되지 않음을 확인했다.

---

### 10. 검증 범위와 한계

본 검증은 health endpoint 기준의 인프라 레벨 장애 격리 검증이다.

추가로 보완하면 좋은 검증은 다음과 같다.

```
1. 실제 예매 E2E API 실행 중 notification 장애 주입
2. reservation 생성, payment 승인, ticket 발행 성공 여부 확인
3. notification 실패 또는 retry 상태 확인
4. Kafka consumer lag 및 notification retry metric 확인
```

---

### 11. 후속 조치

추가로 진행할 작업은 다음과 같다.

```
1. notification-service DestinationRule이 ArgoCD를 통해 Sync 상태인지 확인한다.
2. fault injection VirtualService는 시나리오 파일로만 보관하고 상시 운영 경로에는 포함하지 않는다.
3. ECR imagePullSecret 갱신 자동화 방안을 마련한다.
4. nodeSelector와 node label 기준을 GitOps/infra 코드에서 일관되게 정리한다.
5. 실제 예매 E2E API 기준 graceful degradation 검증을 추가 수행한다.
```
