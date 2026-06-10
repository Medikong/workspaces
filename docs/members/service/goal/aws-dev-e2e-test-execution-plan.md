# AWS dev 실제 검증 계획

## 문서 목적

AWS dev Kubernetes 환경에서 공연 티켓 예매 서비스가 실제로 어떤 순서로 동작하는지 검증한다.

이 문서는 "무엇을 테스트한다"가 아니라 "어떤 명령을 실행하고, 어떤 값을 넣고, 어떤 결과가 나오면 통과인지"를 기준으로 한다.

최종적으로 증명하려는 흐름은 다음이다.

```text
Client
-> Kong Gateway
-> auth / concert / reservation / payment API
-> Kafka event
-> ticket-service consumer
-> notification-service consumer
-> Kiali / Prometheus / Grafana evidence
```

## 현재 전제와 막힌 지점

2026-06-10 기준으로 GitOps 설정은 다음까지 반영됐다.

- `reservation-service`에 Kafka producer env가 반영됐다.
  - `KAFKA_BOOTSTRAP_SERVERS`
  - `RESERVATION_CREATED_TOPIC`
  - `RESERVATION_EXPIRED_TOPIC`
- `payment-service`에 Kafka producer env가 반영됐다.
  - `KAFKA_BOOTSTRAP_SERVERS`
  - `PAYMENT_APPROVED_TOPIC`
  - `PAYMENT_FAILED_TOPIC`
- ArgoCD에서 `reservation-aws-dev`, `payment-aws-dev` 수동 sync가 성공했다.

하지만 실제 API 테스트는 아직 바로 시작할 수 없다.

현재 새 service Pod가 다음 사유로 `Pending` 상태가 된다.

```text
0/4 nodes are available:
1 node(s) had untolerated taint(s),
3 Insufficient cpu
```

즉, Istio sidecar가 붙은 서비스들을 `replicas: 2`, `HPA minReplicas: 2`로 모두 올리기에는 AWS dev 클러스터 CPU request가 부족하다.

따라서 테스트 시작 전에 아래 둘 중 하나를 먼저 선택한다.

| 선택지 | 설명 | 장점 | 단점 |
| --- | --- | --- | --- |
| A. aws-dev 테스트용 replica 축소 | 테스트 기간 동안 핵심 서비스 replica/HPA min을 1로 낮춘다. | 가장 빠르게 E2E 검증 가능 | 최종 요구사항의 min 2 검증은 나중에 다시 해야 함 |
| B. worker node 증설 또는 instance type 상향 | 클러스터 CPU를 늘린다. | 최종 요구사항에 가까운 검증 가능 | 비용과 Terraform 변경이 필요 |

현재 목적이 "아키텍처가 실제로 돌아가는지 증명"이라면 A를 먼저 진행하고, 최종 운영 검증 전에 B 또는 min 2 복구 검증을 수행한다.

임시로 낮춘 값과 복구 기준은 [AWS dev 테스트용 임시 리소스 완화 기록](./aws-dev-temporary-resource-overrides.md)에 정리한다.

## 테스트 환경 변수

SSH 접속 후 AWS dev control plane에서 실행하는 것을 기본으로 한다.

```bash
ssh -i ~/.ssh/k8s-key ubuntu@13.125.191.132
```

Kong Gateway URL은 NodePort에서 가져온다.

```bash
KONG_NODE_PORT=$(kubectl get svc -n kong kong-kong-proxy -o jsonpath='{.spec.ports[?(@.port==80)].nodePort}')
KONG_URL="http://127.0.0.1:${KONG_NODE_PORT}"
echo "$KONG_URL"
```

로컬 PC에서 직접 호출하고 싶으면 SSH 터널을 연다.

```bash
ssh -i ~/.ssh/k8s-key -L 18080:127.0.0.1:${KONG_NODE_PORT} ubuntu@13.125.191.132
```

이 경우 로컬 PC에서는 다음 URL을 쓴다.

```bash
KONG_URL="http://127.0.0.1:18080"
```

## 테스트 계정

`auth-service`는 기동 시 demo 계정을 seed한다.

| 역할 | email | password | 사용 목적 |
| --- | --- | --- | --- |
| CUSTOMER | `customer@example.com` | `customer1234` | 실제 예매, 결제, 티켓/알림 조회 |
| PROVIDER | `provider@example.com` | `provider1234` | 공연/공연시간/좌석 준비 |
| ADMIN | `admin@example.com` | `admin1234` | 승인, 운영 확인, 권한 테스트 |

로그인 요청:

```bash
curl -sS -X POST "$KONG_URL/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: e2e-login-customer-001" \
  -d '{"email":"customer@example.com","password":"customer1234"}'
```

응답에서 확인할 값:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "user": {
    "id": "1",
    "email": "customer@example.com",
    "role": "CUSTOMER"
  }
}
```

이후 보호 API 호출에는 다음 헤더를 사용한다.

```bash
Authorization: Bearer ${CUSTOMER_TOKEN}
X-Request-Id: e2e-normal-flow-001
```

주의: Kong을 경유할 때 `X-User-Id`, `X-User-Email`, `X-User-Role`, `X-Token-Id`, `X-Provider-Id`는 직접 넣지 않는다. Kong의 `ticketing-identity-headers` plugin이 JWT payload를 읽어서 내부 서비스 요청에 주입한다.

## Phase 0. 테스트 가능 상태 만들기

### 목적

API 테스트 전에 서비스 Pod, DB, Kafka, Kong, Istio가 최소한 요청을 받을 수 있는 상태인지 확인한다.

### 실행 명령

```bash
kubectl get applications -n argocd
kubectl get pods -A
kubectl get svc -A
kubectl get endpoints -A
```

핵심 서비스만 좁혀서 본다.

```bash
kubectl get pods -n ticketing-auth
kubectl get pods -n ticketing-concert
kubectl get pods -n ticketing-reservation
kubectl get pods -n ticketing-payment
kubectl get pods -n ticketing-ticket
kubectl get pods -n ticketing-notification
kubectl get pods -n ticketing-messaging
kubectl get pods -n kong
kubectl get pods -n istio-system
```

### 통과 기준

최소 통과 기준:

```text
auth-service          1개 이상 Running
concert-service       1개 이상 Running
reservation-service   1개 이상 Running
payment-service       1개 이상 Running
ticket-service        1개 이상 Running
notification-service  1개 이상 Running
kafka                 1개 이상 Running
kong proxy            1개 이상 Running
istiod                1개 이상 Running
kiali                 1개 이상 Running
```

최종 요구사항 기준:

```text
각 service Deployment desired replica = 2 이상
각 service Pod READY = 2/2
HPA minReplicas = 2
PDB minAvailable 또는 maxUnavailable 기준 충족
```

현재 AWS dev 리소스가 부족하면, 먼저 최소 통과 기준으로 정상 흐름을 검증하고 나중에 최종 요구사항 기준으로 재검증한다.

## Phase 1. Kong Gateway smoke test

### 목적

외부 사용자가 Kong을 통해 들어오는 기본 경로가 정상인지 확인한다.

### 1-1. Public API 확인

```bash
curl -i "$KONG_URL/concerts"
```

기대 결과:

```text
HTTP/1.1 200 OK
```

확인할 헤더:

```text
X-Kong-Proxy-Latency
X-Kong-Upstream-Latency
X-RateLimit-*
```

### 1-2. 인증 없는 보호 API 차단 확인

```bash
curl -i "$KONG_URL/payments"
```

기대 결과:

```text
HTTP/1.1 401 Unauthorized
```

### 1-3. CUSTOMER 로그인 확인

```bash
CUSTOMER_LOGIN=$(curl -sS -X POST "$KONG_URL/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: e2e-login-customer-001" \
  -d '{"email":"customer@example.com","password":"customer1234"}')

echo "$CUSTOMER_LOGIN"
```

`jq`가 있으면 token을 변수로 저장한다.

```bash
CUSTOMER_TOKEN=$(echo "$CUSTOMER_LOGIN" | jq -r '.accessToken')
```

`jq`가 없으면 `accessToken` 값을 직접 복사해서 넣는다.

```bash
CUSTOMER_TOKEN="<복사한 accessToken>"
```

### 1-4. Role guard 확인

CUSTOMER token으로 customer API는 통과해야 한다.

```bash
curl -i "$KONG_URL/reservations/me" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -H "X-Request-Id: e2e-role-customer-001"
```

기대 결과:

```text
HTTP/1.1 200 OK
```

CUSTOMER token으로 provider/admin API는 차단되어야 한다.

```bash
curl -i "$KONG_URL/~/provider/concerts" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -H "X-Request-Id: e2e-role-provider-deny-001"
```

기대 결과:

```text
HTTP/1.1 403 Forbidden
```

## Phase 2. 공연/좌석 테스트 데이터 준비

### 목적

정상 예매 E2E에 필요한 `concertId`, `performanceId`, `seatId`를 확보한다.

### 우선 확인: 기존 데이터가 있는지 조회

```bash
curl -sS "$KONG_URL/concerts?limit=20" \
  -H "X-Request-Id: e2e-concert-list-001"
```

기존 공연이 있다면 응답에서 첫 번째 공연의 `id`를 `CONCERT_ID`로 사용한다.

```bash
CONCERT_ID="<concert id>"
```

공연 시간 조회:

```bash
curl -sS "$KONG_URL/concerts/${CONCERT_ID}/performances?limit=20" \
  -H "X-Request-Id: e2e-performance-list-001"
```

응답에서 첫 번째 공연 시간의 `id`를 사용한다.

```bash
PERFORMANCE_ID="<performance id>"
SHOWTIME_ID="${PERFORMANCE_ID}"
```

좌석 조회:

```bash
curl -sS "$KONG_URL/performances/${PERFORMANCE_ID}/seats?limit=20" \
  -H "X-Request-Id: e2e-seat-list-001"
```

응답에서 `status`가 `available`인 좌석 하나를 선택한다.

```bash
SEAT_ID="<available seat id>"
```

### 기존 데이터가 없을 때

현재 GitOps Ingress에는 provider/admin 일부 경로가 `/~/provider/...`, `/~/admin/...` 형태로 선언되어 있다. 서비스 코드는 `/provider/...`, `/admin/...`를 받는다.

Kong rewrite 설정이 명확히 보이지 않으므로, E2E 테스트 데이터 생성은 둘 중 하나로 진행한다.

1. provider/admin Ingress path를 서비스 코드와 맞춘 뒤 Kong으로 seed한다.
2. 테스트 준비 단계에서만 `concert-service`를 port-forward해서 내부 API로 seed한다.

빠른 검증 목적이면 2번을 사용한다.

```bash
kubectl port-forward -n ticketing-concert svc/concert-service 18082:8082
```

다른 터미널에서 seed를 만든다.

```bash
CONCERT_URL="http://127.0.0.1:18082"
```

Provider 계정으로 만든 것처럼 내부 헤더를 직접 넣는다.

```bash
VENUE=$(curl -sS -X POST "$CONCERT_URL/provider/venues" \
  -H "Content-Type: application/json" \
  -d '{"name":"AWS Dev Hall","address":"Seoul","totalSeats":2}')

VENUE_ID=$(echo "$VENUE" | jq -r '.id')
```

```bash
CONCERT=$(curl -sS -X POST "$CONCERT_URL/provider/concerts" \
  -H "Content-Type: application/json" \
  -H "X-Provider-Id: provider-e2e" \
  -d '{"title":"AWS Dev Live","description":"E2E test concert","ageRating":"ALL","runningMinutes":120}')

CONCERT_ID=$(echo "$CONCERT" | jq -r '.id')
```

```bash
SHOWTIME=$(curl -sS -X POST "$CONCERT_URL/provider/concerts/${CONCERT_ID}/showtimes" \
  -H "Content-Type: application/json" \
  -d '{"venueId":"'"${VENUE_ID}"'","startsAt":"2026-07-01T11:00:00Z","endsAt":"2026-07-01T13:00:00Z"}')

PERFORMANCE_ID=$(echo "$SHOWTIME" | jq -r '.id')
SHOWTIME_ID="${PERFORMANCE_ID}"
```

```bash
curl -i -X POST "$CONCERT_URL/provider/showtimes/${PERFORMANCE_ID}/seat-map" \
  -H "Content-Type: application/json" \
  -d '{"sections":[{"name":"A","rows":[{"name":"1","seatNumbers":["1","2"]}]}]}'
```

좌석을 다시 조회한다.

```bash
curl -sS "$KONG_URL/performances/${PERFORMANCE_ID}/seats?limit=20"
SEAT_ID="<available seat id>"
```

## Phase 3. 정상 예매 E2E

### 목적

사용자 관점에서 핵심 흐름이 끝까지 이어지는지 확인한다.

```text
Login
-> Concert 조회
-> Seat 조회
-> Reservation 생성
-> Payment 승인
-> payment-approved Kafka event
-> Ticket 발행
-> ticket-issued Kafka event
-> Notification 저장
```

### 테스트 입력값

```bash
CUSTOMER_EMAIL="customer@example.com"
CUSTOMER_PASSWORD="customer1234"
CONCERT_ID="<Phase 2에서 확보한 concert id>"
PERFORMANCE_ID="<Phase 2에서 확보한 performance id>"
SHOWTIME_ID="${PERFORMANCE_ID}"
SEAT_ID="<Phase 2에서 확보한 available seat id>"
PAYMENT_AMOUNT=120000
PAYMENT_METHOD="card"
REQUEST_ID="e2e-normal-$(date +%Y%m%d%H%M%S)"
```

### 3-1. 로그인

```bash
CUSTOMER_LOGIN=$(curl -sS -X POST "$KONG_URL/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: ${REQUEST_ID}-login" \
  -d '{"email":"customer@example.com","password":"customer1234"}')

CUSTOMER_TOKEN=$(echo "$CUSTOMER_LOGIN" | jq -r '.accessToken')
CUSTOMER_ID=$(echo "$CUSTOMER_LOGIN" | jq -r '.user.id')
```

통과 기준:

```text
accessToken != null
user.role == CUSTOMER
```

### 3-2. 공연/좌석 조회

```bash
curl -sS "$KONG_URL/concerts/${CONCERT_ID}" \
  -H "X-Request-Id: ${REQUEST_ID}-concert"
```

```bash
curl -sS "$KONG_URL/performances/${PERFORMANCE_ID}/seats?limit=20" \
  -H "X-Request-Id: ${REQUEST_ID}-seats"
```

통과 기준:

```text
공연 조회 200
좌석 조회 200
선택한 SEAT_ID가 seats.items 안에 존재
```

### 3-3. 예약 생성

```bash
RESERVATION=$(curl -sS -X POST "$KONG_URL/reservations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -H "X-Request-Id: ${REQUEST_ID}-reservation" \
  -d '{
    "performanceId":"'"${PERFORMANCE_ID}"'",
    "seatId":"'"${SEAT_ID}"'",
    "concertId":"'"${CONCERT_ID}"'",
    "showtimeId":"'"${SHOWTIME_ID}"'"
  }')

echo "$RESERVATION"
RESERVATION_ID=$(echo "$RESERVATION" | jq -r '.id')
```

기대 응답:

```json
{
  "id": "res-...",
  "userId": "1",
  "performanceId": "...",
  "seatId": "...",
  "status": "pending",
  "expiresAt": "...",
  "createdAt": "..."
}
```

통과 기준:

```text
HTTP status = 201
status = pending
reservationId 확보
reservation-service 로그에 reservation-created publish 시도 확인
```

### 3-4. 결제 승인

```bash
PAYMENT=$(curl -sS -X POST "$KONG_URL/payments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -H "Idempotency-Key: ${REQUEST_ID}-payment" \
  -H "X-Request-Id: ${REQUEST_ID}-payment" \
  -d '{
    "reservationId":"'"${RESERVATION_ID}"'",
    "concertId":"'"${CONCERT_ID}"'",
    "seatId":"'"${SEAT_ID}"'",
    "amount":120000,
    "method":"card",
    "simulation":"approve"
  }')

echo "$PAYMENT"
PAYMENT_ID=$(echo "$PAYMENT" | jq -r '.id')
```

기대 응답:

```json
{
  "id": "pay-...",
  "reservationId": "...",
  "concertId": "...",
  "amount": 120000,
  "method": "card",
  "status": "approved",
  "approvedAt": "..."
}
```

통과 기준:

```text
HTTP status = 201
status = approved
payment-approved 이벤트 발행 로그 확인
```

### 3-5. 티켓 발행 확인

Kafka consumer가 `payment-approved`를 처리할 시간을 주기 위해 잠시 대기한다.

```bash
sleep 5
```

내 티켓 조회:

```bash
curl -sS "$KONG_URL/tickets/me" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -H "X-Request-Id: ${REQUEST_ID}-tickets"
```

기대 결과:

```text
reservationId = RESERVATION_ID인 ticket 1건 존재
status = ISSUED 또는 issued
qrUrl 또는 pdfUrl 존재 여부 확인
```

주의: 현재 ticket-service 구현은 `status`를 `ISSUED`로 반환할 수 있고, 문서 계약은 `issued`를 기대할 수 있다. 테스트에서는 우선 티켓 발행 자체를 통과 기준으로 잡고, status 대소문자 차이는 계약 정합성 보완 항목으로 기록한다.

### 3-6. 알림 저장 확인

```bash
curl -sS "$KONG_URL/notifications" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -H "X-Request-Id: ${REQUEST_ID}-notifications"
```

통과 기준:

```text
reservation-created, payment-approved, ticket-issued 중 1개 이상에 대한 알림 존재
해당 알림의 userId가 CUSTOMER_ID와 연결
```

## Phase 4. Kafka 이벤트 증거 수집

### 목적

API 응답만 보는 것이 아니라, 실제 비동기 이벤트가 Kafka를 통과했는지 확인한다.

### Topic 확인

```bash
kubectl exec -n ticketing-messaging deploy/kafka -- \
  timeout 10 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka:9092 \
  --list
```

필수 topic:

```text
reservation-created
reservation-expired
payment-approved
payment-failed
ticket-issued
```

### Consumer group 확인

```bash
kubectl exec -n ticketing-messaging deploy/kafka -- \
  timeout 10 /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --list
```

필수 consumer group:

```text
ticket-service
notification-service
```

Lag 확인:

```bash
kubectl exec -n ticketing-messaging deploy/kafka -- \
  timeout 10 /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --describe \
  --group ticket-service
```

```bash
kubectl exec -n ticketing-messaging deploy/kafka -- \
  timeout 10 /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --describe \
  --group notification-service
```

통과 기준:

```text
payment-approved topic offset 증가
ticket-service lag가 처리 후 0 또는 감소
notification-service lag가 처리 후 0 또는 감소
```

### 서비스 로그 확인

```bash
kubectl logs deploy/reservation-service -n ticketing-reservation --since=15m | grep -E "reservation-created|KAFKA|Kafka|${REQUEST_ID}"
kubectl logs deploy/payment-service -n ticketing-payment --since=15m | grep -E "payment-approved|payment-failed|KAFKA|Kafka|${REQUEST_ID}"
kubectl logs deploy/ticket-service -n ticketing-ticket --since=15m | grep -E "payment-approved|ticket-issued|KAFKA|Kafka|${REQUEST_ID}|${RESERVATION_ID}"
kubectl logs deploy/notification-service -n ticketing-notification --since=15m | grep -E "reservation-created|payment-approved|ticket-issued|KAFKA|Kafka|${REQUEST_ID}|${RESERVATION_ID}"
```

통과 기준:

```text
payment-service가 payment-approved를 publish
ticket-service가 payment-approved를 consume
ticket-service가 ticket-issued를 publish
notification-service가 이벤트를 consume
correlationId 또는 reservationId로 흐름 추적 가능
```

## Phase 5. Kiali와 Prometheus에서 mesh traffic 확인

### 목적

Istio sidecar가 붙은 서비스의 traffic이 mesh 관측 도구에서 보이는지 확인한다.

### Kiali 접속

```bash
kubectl port-forward -n istio-system svc/kiali 20001:20001
```

브라우저:

```text
http://127.0.0.1:20001
```

확인 대상:

```text
ticketing-concert
ticketing-reservation
ticketing-payment
ticketing-ticket
ticketing-notification
```

통과 기준:

```text
서비스 node가 Kiali graph에 표시
요청량과 error rate가 표시
sidecar가 붙은 workload가 mesh participant로 표시
```

### Prometheus query

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
```

브라우저:

```text
http://127.0.0.1:9090
```

조회할 PromQL:

```promql
sum(rate(istio_requests_total[5m])) by (destination_workload, response_code)
```

```promql
sum(rate(istio_requests_total{destination_workload=~"reservation-service|payment-service|ticket-service|notification-service"}[5m])) by (destination_workload)
```

```promql
histogram_quantile(0.99, sum(rate(istio_request_duration_milliseconds_bucket[5m])) by (le, destination_workload))
```

통과 기준:

```text
테스트 요청 이후 destination_workload별 request metric 증가
5xx가 없거나 원인을 설명 가능
P99 응답시간 확인 가능
```

## Phase 6. Kong Rate Limit 검증

### 목적

Kong이 외부 과호출을 제한하는지 확인한다.

현재 rate limit 설정은 서비스별 `minute: 120`, `policy: local`이다.

따라서 1분 안에 같은 route를 121회 이상 호출하면 429가 나와야 한다.

### 실행

```bash
for i in $(seq 1 130); do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$KONG_URL/concerts" \
    -H "X-Request-Id: e2e-rate-limit-${i}")
  echo "$i $code"
done
```

통과 기준:

```text
초반 요청은 200
limit 초과 후 429 발생
Kong response header에서 rate limit 관련 값 확인
```

주의: Kong `local` policy는 Kong Pod 단위로 rate limit을 계산한다. Kong Pod가 여러 개면 요청 분산 때문에 정확히 121번째에서 429가 나오지 않을 수 있다. 이 경우 "429 발생 여부"와 "Kong Pod 수"를 함께 기록한다.

## Phase 7. Canary와 Circuit Breaker 검증

### 목적

Istio VirtualService/DestinationRule이 실제 트래픽 제어에 관여하는지 확인한다.

### Canary 20/50/100 검증

현재 reservation traffic manifest가 있다.

```text
platform/istio/traffic/reservation/scenarios/canary-20
platform/istio/traffic/reservation/scenarios/canary-50
platform/istio/traffic/reservation/scenarios/canary-100
platform/istio/traffic/reservation/scenarios/rollback
```

적용 후 확인:

```bash
kubectl get virtualservice reservation-service -n ticketing-reservation -o yaml
kubectl get destinationrule reservation-service -n ticketing-reservation -o yaml
```

트래픽을 반복 생성:

```bash
for i in $(seq 1 100); do
  curl -sS -o /dev/null -w "%{http_code}\n" "$KONG_URL/reservations/me" \
    -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
    -H "X-Request-Id: e2e-canary-${i}"
done
```

Prometheus에서 subset별 metric 또는 Kiali graph를 확인한다.

통과 기준:

```text
20% 설정 시 v2 traffic이 일부 발생
50% 설정 시 v2 traffic 비율 증가
100% 설정 시 v2로 전환
rollback 적용 시 v1 100% 복귀
```

### Circuit Breaker 1차 검증

DestinationRule에서 확인할 항목:

```text
connectionPool.tcp.maxConnections
connectionPool.http.http1MaxPendingRequests
connectionPool.http.maxRequestsPerConnection
outlierDetection
```

검증 순서:

```text
1. 정상 traffic 기준 latency/error 확인
2. fault-delay 또는 fault-5xx scenario 적용
3. retry/timeout 응답 확인
4. Prometheus에서 5xx/error rate 증가 확인
5. rollback 적용
6. 정상 응답 복귀 확인
```

통과 기준:

```text
장애 scenario 적용 시 오류가 관측됨
retry/timeout 설정이 VirtualService에 존재함
rollback 후 정상 응답으로 복귀함
```

주의: 실제 outlier ejection까지 보려면 연속 5xx를 반환하는 canary workload 또는 failure endpoint가 필요하다. 현재 서비스가 실패 전용 endpoint를 제공하지 않으면, 1차 검증은 VirtualService fault injection과 metric 확인으로 제한한다.

## Phase 8. 테스트 결과 기록 양식

각 테스트는 아래 형식으로 결과를 남긴다.

```text
테스트명:
실행 일시:
GitOps commit:
service image tag:
Kong URL:
요청 Request-Id:

입력값:
- customerId:
- concertId:
- performanceId:
- seatId:
- reservationId:
- paymentId:

결과:
- HTTP status:
- reservation status:
- payment status:
- ticket status:
- notification count:
- Kafka topic offset:
- consumer lag:
- Kiali 확인:
- Prometheus query 결과:

판정:
- PASS / FAIL / BLOCKED

실패 원인:
- manifest:
- service code:
- DB/Kafka:
- resource:
- network/security policy:

후속 작업:
```

## 최종 완료 기준

이 테스트 계획의 완료 기준은 다음이다.

- Kong을 통해 CUSTOMER가 로그인한다.
- Kong을 통해 공연/좌석을 조회한다.
- Kong을 통해 예약을 생성한다.
- Kong을 통해 결제를 승인한다.
- `payment-approved`가 Kafka에 발행된다.
- ticket-service가 `payment-approved`를 consume하고 티켓을 발행한다.
- ticket-service가 `ticket-issued`를 발행한다.
- notification-service가 예약/결제/티켓 이벤트 중 1개 이상을 consume하고 알림을 저장한다.
- `/tickets/me`와 `/notifications`로 사용자 결과를 조회한다.
- Kiali에서 서비스 traffic이 보인다.
- Prometheus에서 `istio_requests_total` 또는 서비스 metric 증가를 확인한다.
- Kong rate limit 429를 1회 이상 확인한다.

## 다음 구현 판단

현재 바로 필요한 작업은 테스트 스크립트 작성이 아니라 테스트 가능 상태 복구다.

우선순위:

1. AWS dev에서 service Pod가 최소 1개씩 Running 되도록 CPU request 또는 replica를 조정한다.
2. provider/admin seed 경로의 Kong path mismatch 여부를 확인한다.
3. 정상 예매 E2E를 shell script 또는 Newman collection으로 고정한다.
4. Kafka topic/consumer lag 확인 명령을 실행 문서에 붙인다.
5. Kiali/Prometheus 캡처를 남긴다.

이 순서로 가면 단순 API 테스트가 아니라 PRD가 요구하는 운영 검증 증거로 이어진다.
