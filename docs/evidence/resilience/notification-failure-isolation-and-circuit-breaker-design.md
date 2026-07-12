### 1. 설계 목적

본 설계의 목적은 `notification-service` 장애가 핵심 예매 흐름에 전파되지 않도록 격리하는 것이다.

티켓 예매 서비스에서 핵심 흐름은 다음과 같다.

```
reservation-service
→ payment-service
→ ticket-service
→ notification-service
```

이 중 `notification-service`는 사용자에게 알림을 저장하거나 발송하는 후속 처리 서비스이다. 알림은 사용자 경험에 중요하지만, 알림 장애 때문에 예약, 결제, 티켓 발행 자체가 실패하면 안 된다.

따라서 장애 격리의 핵심 원칙은 다음과 같다.

```
notification-service 장애 발생
→ reservation/payment/ticket 핵심 흐름은 유지
→ notification만 실패 또는 재시도 상태로 관리
```

---

### 2. 서비스별 장애 격리 기준

| 서비스               | 장애 영향도                      | 장애 격리 전략                                                  |
| -------------------- | -------------------------------- | --------------------------------------------------------------- |
| reservation-service  | 예매 진입점, 좌석 lock/예약 생성 | Canary, timeout, rollback 중심                                  |
| payment-service      | 결제 승인, 상태 확정             | 짧은 timeout, 제한적 retry, idempotency, 실패 상태 전이         |
| ticket-service       | 티켓 발행, QR/PDF 생성           | 발행 지연 상태, retry, 재처리                                   |
| notification-service | 알림 저장/발송                   | 핵심 흐름과 분리, retry, DLQ 또는 failed 상태, outlierDetection |

---

### 3. Canary 적용 대상

Canary는 `reservation-service`에 우선 적용한다.

이유는 다음과 같다.

```
1. reservation-service는 예매 요청의 진입점이다.
2. 티켓 오픈 시 가장 먼저 트래픽 피크를 받는다.
3. 좌석 lock, 예약 생성, 중복 예매 방지와 직접 연결된다.
4. 새 버전 배포 실패 시 사용자 예매 흐름 전체에 영향을 줄 수 있다.
```

따라서 `reservation-service`에 v1/v2 Canary를 적용하고, GitOps 기반으로 canary-20 및 rollback을 검증한 것은 적절하다.

---

### 4. 장애 격리 우선 대상

장애 격리는 `notification-service`를 우선 대상으로 한다.

이유는 다음과 같다.

```
1. notification-service는 핵심 거래 흐름 이후의 후속 처리 서비스이다.
2. 알림 실패는 사용자 경험 문제지만 예약/결제/티켓 발행 실패로 이어지면 안 된다.
3. 실패한 알림은 retry, failed status, DLQ 등으로 후처리할 수 있다.
```

---

### 5. Notification 장애 시 기대 동작

정상적인 장애 격리 동작은 다음과 같다.

```
1. 사용자가 예매 요청을 보낸다.
2. reservation-service가 좌석 lock 및 예약 생성을 처리한다.
3. payment-service가 mock 결제를 처리한다.
4. ticket-service가 티켓을 발행한다.
5. notification-service 장애가 발생한다.
6. 핵심 예매 흐름은 성공으로 유지된다.
7. notification만 실패 또는 retry_pending 상태로 기록된다.
8. notification-service 복구 후 재시도 또는 재처리를 수행한다.
```

---

### 6. Istio 정책 설계

`notification-service`에는 DestinationRule을 통해 connectionPool과 outlierDetection을 적용한다.

목표는 다음과 같다.

```
1. notification-service 장애 endpoint를 빠르게 격리한다.
2. notification-service 장애가 호출자에게 장시간 대기/연쇄 장애로 전파되지 않게 한다.
3. 장애 발생 시 Prometheus에서 5xx, retry, latency를 관측할 수 있게 한다.
```

예상 정책:

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: notification-service
  namespace: ticketing-notification
spec:
  host: notification-service.ticketing-notification.svc.cluster.local
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

---

### 7. Payment 장애 처리 설계

`payment-service`는 알림과 달리 핵심 거래 흐름에 포함된다. 따라서 무작정 retry를 많이 수행하면 중복 결제나 상태 불일치 위험이 있다.

payment-service의 장애 처리 기준은 다음과 같다.

```
1. timeout은 짧게 둔다.
2. retry는 제한적으로만 허용한다.
3. 결제 요청에는 idempotency key를 사용한다.
4. 실패 시 예약을 결제 실패 또는 결제 대기 상태로 전이한다.
5. 좌석 lock은 만료 또는 보상 처리한다.
```

---

### 8. 검증 시나리오

### 시나리오 A. Notification 장애 격리

```
조건:
notification-service 장애 또는 5xx 발생

기대:
reservation/payment/ticket 핵심 흐름은 성공
notification만 실패 또는 retry_pending 상태

관측:
core_flow_success_rate 유지
notification 5xx 또는 retry_count 증가
Prometheus에서 notification-service error metric 확인
```

### 시나리오 B. Notification 복구

```
조건:
notification-service 복구

기대:
새 알림 요청 정상 처리
기존 실패 알림은 재시도 또는 failed 상태로 남음

관측:
notification-service 200 증가
5xx 증가 중단
```

---

### 9. 최종 판정 기준

장애 격리 성공 기준은 다음과 같다.

```
1. notification-service 장애 중에도 reservation/payment/ticket 핵심 API는 성공한다.
2. notification-service 장애는 notification metric에서만 관측된다.
3. 핵심 흐름의 5xx error가 증가하지 않는다.
4. notification 장애는 retry/failure 상태로 분리된다.
5. notification 복구 후 정상 알림 처리가 가능하다.
```
