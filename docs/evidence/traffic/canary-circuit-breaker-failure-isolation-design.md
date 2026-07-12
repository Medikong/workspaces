응. **현재 구조처럼 Canary / 장애 격리 / Circuit Breaker가 특정 서비스에만 적용되어 있는 것 자체는 문제가 아니야.**

오히려 실무에서는 보통 **모든 서비스에 똑같이 거는 게 아니라, 서비스의 역할과 장애 영향도에 따라 다르게 설계**해.

다만 지금 너희 구조는 이렇게 정리하는 게 정확해.

```
현재 상태:
reservation-service 중심으로 Canary / DestinationRule / Circuit Breaker 성격의 정책이 적용됨

실무형 목표:
서비스별 역할에 따라 Canary, timeout, retry, outlierDetection, fallback 전략을 다르게 설계
```

즉 “특정 서비스에만 되어 있어서 문제”가 아니라, **왜 그 서비스에 적용했는지 설명할 수 있어야 하고, 장애 격리 대상 서비스가 도메인 흐름과 맞아야 해.**

---

# 1. 모든 서비스에 Canary를 적용해야 하냐?

아니야.

실무에서도 모든 서비스에 Canary를 무조건 적용하지 않아.

Canary는 보통 이런 서비스에 우선 적용해.

```
1. 트래픽이 많고 사용자 영향이 큰 서비스
2. 배포 변경이 자주 일어나는 서비스
3. 장애 시 전체 흐름에 영향이 큰 서비스
4. 신규 버전 검증이 중요한 서비스
```

너희 티켓 예매 도메인에서는 1순위가 `reservation-service`야.

이유:

```
예매 요청의 진입점
좌석 lock / 예약 생성과 직접 연결
트래픽 피크가 가장 먼저 몰림
중복 예매나 예약 실패에 직접 영향
```

그래서 reservation-service에 Canary가 있는 건 설계상 자연스러워.

PRD에서도 이 프로젝트의 핵심은 티켓 오픈 순간 트래픽 폭주, 좌석 중복 방지, 장애 격리, 관측 가능한 운영 검증이야.

그중 reservation-service는 핵심 예매 흐름의 중심이니까 canary 우선 적용 대상으로 적절해.

---

# 2. 모든 서비스에 Circuit Breaker를 똑같이 걸어야 하냐?

이것도 아니야.

Circuit Breaker는 “내가 호출하는 의존 서비스가 장애일 때, 내 서비스까지 같이 무너지지 않게 하는 장치”야.

그래서 중요한 건:

```
어떤 서비스가 어떤 서비스를 호출하는가?
그 의존성이 핵심 흐름인가, 부가 흐름인가?
실패했을 때 fallback이 가능한가?
```

이거야.

예를 들어:

```
notification-service 장애
→ 핵심 예매 성공에는 영향 주면 안 됨
→ retry / DLQ / 나중에 재발송 가능
```

이 경우 notification에는 장애 격리가 강하게 필요해.

반대로:

```
payment-service 장애
→ 결제 없이는 티켓 발행 불가
→ 무조건 성공 처리하면 안 됨
→ timeout 후 결제 실패/예약 대기/좌석 해제 같은 상태 전이 필요
```

이 경우는 단순 fallback이 아니라 **정합성 있는 실패 처리**가 더 중요해.

---

# 3. 현재 reservation-service DestinationRule의 의미

현재 GitOps에는 reservation-service 대상 DestinationRule이 있어.

내용은 다음과 같아.

```yaml
connectionPool:
  tcp:
    maxConnections: 100
  http:
    http1MaxPendingRequests: 100
    maxRequestsPerConnection: 50

outlierDetection:
  consecutive5xxErrors: 5
  interval: 10s
  baseEjectionTime: 30s
  maxEjectionPercent: 50
```

이건 reservation-service로 들어오는 트래픽에 대해 연결 수 제한과 이상 endpoint 격리를 적용하는 설정이야.

이건 **Canary + reservation-service 안정성** 관점에서는 괜찮아.

하지만 “알림 장애가 핵심 흐름을 실패시키지 않는다”는 장애 격리 목표까지 완전히 설명하려면 notification-service 쪽 설계가 추가되어야 해.

PRD의 장애 격리 목표는 “알림 장애가 결제 완료와 티켓 발행 흐름을 실패시키지 않는다”이고, 성공 지표도 `core_flow_success_rate`, `notification_retry_count`로 되어 있어.

---

# 4. 실무형 설계는 서비스별로 다르게 간다

너희 서비스 기준으로 실무형 설계를 잡으면 이렇게 하는 게 좋아.

## A. reservation-service

역할:

```
예매 진입점
좌석 lock
예약 생성
트래픽 피크 대응
```

적용 정책:

```
Canary / Rollback 우선 적용
timeout 짧게
retry 제한
connectionPool 적용
outlierDetection 적용
rate limit 또는 backpressure 고려
```

권장 이유:

```
배포 안정성과 트래픽 피크 대응이 가장 중요하기 때문
```

너희가 이미 reservation-service에 Canary를 적용한 건 맞는 방향이야.

---

## B. payment-service

역할:

```
결제 승인
예약 상태 확정
```

적용 정책:

```
timeout 필수
retry 매우 제한적
idempotency key 필수
fallback은 “성공 처리”가 아니라 “결제 실패/대기 상태 전이”
circuit breaker는 가능하지만 비즈니스 정합성과 함께 설계
```

주의:

```
payment-service는 무작정 retry하면 중복 결제나 상태 불일치 위험이 있음.
```

그래서 실무에서는 payment 쪽은 “retry 많이”가 아니라:

```
짧은 timeout
idempotent retry
실패 상태 명확화
좌석 lock 만료/해제
```

가 중요해.

---

## C. ticket-service

역할:

```
티켓 발행
QR/PDF artifact 생성
S3 저장
```

적용 정책:

```
비동기 처리 권장
retry 가능
DLQ 또는 failed-ticket 상태 필요
ticket_issue_delay_ms 관측
```

ticket-service 장애는 결제와 연결되므로 중요하지만, 결제 완료 후 티켓 발행이 지연될 수 있는 구조로 처리할 수 있어.

---

## D. notification-service

역할:

```
알림 저장/발송
사용자 안내
```

적용 정책:

```
핵심 거래 흐름과 분리
Kafka consumer 기반 비동기 처리
retry / DLQ / notification_failed 상태
outlierDetection 적용하기 좋음
core flow와 강결합 금지
```

장애 격리의 1순위 대상은 notification이야.

```
notification 장애가 나도 reservation/payment/ticket은 성공해야 함.
```

---

## E. auth-service

역할:

```
JWT 발급/검증
```

적용 정책:

```
Kong JWT 검증과 역할 분리
auth-service 자체 canary는 변경 많을 때만 적용
timeout/retry는 낮게
장애 시 로그인/토큰 발급만 영향
```

---

## F. concert-service

역할:

```
공연/좌석 조회
```

적용 정책:

```
조회 트래픽 캐싱 고려
timeout/retry 가능
read-only라 circuit breaker 부담 낮음
캐시 fallback 가능
```

---

# 5. 실무형 전체 정책 매트릭스

이렇게 정리하면 가장 설득력 있어.

| 서비스               | Canary 우선순위 | Circuit Breaker/Outlier | Timeout/Retry              | 장애 격리 전략                       |
| -------------------- | --------------- | ----------------------- | -------------------------- | ------------------------------------ |
| reservation-service  | 높음            | 중간~높음               | 짧은 timeout, 제한적 retry | 예매 진입점 보호, 좌석 정합성 유지   |
| payment-service      | 중간            | 높음                    | timeout 필수, retry 제한   | 실패/대기 상태 전이, idempotency     |
| ticket-service       | 중간            | 중간                    | retry 가능                 | 발행 지연/재처리, S3 저장 실패 격리  |
| notification-service | 낮음~중간       | 높음                    | retry/DLQ                  | 핵심 흐름과 분리, 실패해도 예매 성공 |
| auth-service         | 중간            | 낮음~중간               | 짧은 timeout               | 인증 실패 범위 제한                  |
| concert-service      | 낮음~중간       | 낮음~중간               | 조회 timeout/retry         | 캐시 fallback 가능                   |

---

# 6. 실무에서 “모든 서비스에 같은 DestinationRule”은 비추천

예를 들어 모든 서비스에 똑같이:

```yaml
consecutive5xxErrors: 5
maxConnections: 100
retry attempts: 3
```

이렇게 박아버리면 안 좋아.

왜냐하면 payment와 notification은 성격이 다르기 때문이야.

```
notification retry 3회 → 괜찮음
payment retry 3회 → 중복 결제 위험
concert 조회 retry 3회 → 괜찮을 수 있음
reservation 생성 retry 3회 → 중복 예약 위험
```

그래서 서비스별 정책이 달라야 해.

---

# 7. 현재 구조를 실무용으로 개선한다면

## 1단계: 현재 유지

```
reservation-service canary + DestinationRule 유지
```

이건 이미 검증했고 좋음.

---

## 2단계: notification 장애 격리 설계 추가

GitOps에 notification-service용 DestinationRule 추가.

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

notification은 핵심 흐름에서 분리되어야 하므로, 장애 endpoint를 빠르게 격리하는 정책이 잘 맞아.

---

## 3단계: payment timeout 정책 추가

payment에는 retry보다 timeout과 idempotency가 중요해.

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: payment-service
  namespace: ticketing-payment
spec:
  hosts:
    - payment-service
    - payment-service.ticketing-payment.svc.cluster.local
  gateways:
    - mesh
  http:
    - name: payment-timeout
      timeout: 2s
      retries:
        attempts: 1
        perTryTimeout: 1s
        retryOn: connect-failure,refused-stream,5xx
      route:
        - destination:
            host: payment-service.ticketing-payment.svc.cluster.local
```

문서에는 반드시 이렇게 써야 해.

```
payment는 중복 결제 위험이 있으므로 retry를 제한하고, 실패 시 결제 실패/대기 상태로 전이한다.
```

---

## 4단계: notification 장애 주입 테스트

가장 실무적인 검증은 이거야.

```
notification-service 장애 주입
→ 예매 핵심 흐름 API는 성공
→ notification 실패/재시도 metric 증가
→ notification 복구 후 재처리 가능
```

장애 주입 방법은 간단히:

```bash
kubectl -n ticketing-notification scale deploy/notification-service --replicas=0
```

단, 이것은 GitOps와 충돌할 수 있으므로 테스트용으로만 하고, 가능하면 GitOps scenario로 하는 게 더 좋아.

---

# 8. 과제용으로는 어떻게 말해야 하냐?

현재 구현 상태는 이렇게 말하면 돼.

```
Canary와 traffic split 검증은 reservation-service를 대상으로 우선 적용했다. reservation-service는 예매 요청의 진입점이며, 트래픽 피크와 좌석 정합성에 직접 영향을 주므로 배포 안정성 검증 대상으로 선정했다.
```

그리고 장애 격리는 이렇게 설계 설명:

```
장애 격리와 Circuit Breaker는 모든 서비스에 동일 정책을 적용하지 않고, 장애 영향도에 따라 서비스별로 다르게 설계한다. notification-service는 핵심 예매 흐름과 분리되는 후속 처리 서비스이므로 장애 격리의 우선 대상이며, 장애 발생 시 예약/결제/티켓 발행은 유지하고 알림만 재시도 또는 실패 상태로 관리한다. payment-service는 핵심 거래 흐름에 속하므로 무분별한 retry 대신 짧은 timeout, idempotency, 실패 상태 전이를 중심으로 설계한다.
```

---

# 9. 지금 바로 해야 할 다음 행동

먼저 실제 현재 리소스 확인부터 하자.

```bash
echo "===== DESTINATION RULES ====="
kubectl get destinationrule -A

echo "===== VIRTUAL SERVICES ====="
kubectl get virtualservice -A

echo "===== NOTIFICATION DESTINATION RULE ====="
kubectl -n ticketing-notification get destinationrule notification-service -o yaml || true

echo "===== PAYMENT VIRTUAL SERVICE ====="
kubectl -n ticketing-payment get virtualservice payment-service -o yaml || true
```

이 결과를 보면 현재 장애 격리 정책이 `reservation-service`만인지, 다른 서비스에도 일부 있는지 확정할 수 있어.

---

# 최종 답

현재 구조가 특정 서비스에만 되어 있는 것은 **문제가 아니다.**

실무에서도 중요도와 장애 영향도에 따라 선택적으로 적용한다.

다만 지금 상태에서 실무형 설계라고 말하려면 다음 보완이 필요해.

```
1. reservation-service: canary/rollback 대상 — 현재 설계 적절
2. notification-service: 장애 격리 핵심 대상 — DestinationRule/outlier/retry/DLQ 설계 필요
3. payment-service: timeout/idempotency/상태 전이 중심 설계 필요
4. ticket-service: 발행 지연/재처리 중심 설계 필요
5. 모든 서비스에 같은 retry/circuit breaker를 적용하지 않는다
```

즉 방향은 맞는데, **장애 격리 시나리오는 reservation이 아니라 notification/payment/ticket 흐름 중심으로 다시 설계하는 게 실무적으로 더 맞아.**
