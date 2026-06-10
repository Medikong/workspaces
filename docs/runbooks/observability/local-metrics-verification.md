# 로컬 메트릭 수집 확인 런북

## 목적

Docker Desktop Kubernetes에 Medikong 로컬 스택을 배포한 뒤 서비스별 `/metrics` 노출, `ServiceMonitor` 등록, Prometheus scrape, Grafana 조회가 정상인지 확인한다.

이 런북은 서비스 metric 구현 또는 GitOps monitoring 설정을 변경한 뒤 "실제로 수집되는가"를 눈으로 검증할 때 사용한다.

## 적용 범위

- `service` repo의 FastAPI 서비스 metric 변경 검증
- `gitops` repo의 `task dev` 기반 로컬 배포 검증
- Prometheus, Grafana, ServiceMonitor 연결 확인

로컬 E2E 테스트용 Docker Compose는 이 런북의 기준 경로가 아니다. 로컬 통합 검증은 `gitops`의 `task dev`를 기준으로 한다.

## 사전 조건

- Docker Desktop Kubernetes가 켜져 있다.
- `task` 명령을 사용할 수 있다.
- 로컬 registry `localhost:5001`을 사용할 수 있다.
- `service` repo가 `gitops` repo의 형제 경로 `../service`에 있다.

기준 경로:

```text
/Users/danghamo/Documents/gituhb/medikong
├── gitops
├── service
└── workspace
```

## 1. 로컬 스택 배포

`gitops` repo에서 로컬 dev 배포를 실행한다.

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
task dev SERVICE_REPO=../service DEV_REGISTRY=localhost:5001 DEV_IMAGE_TAG=dev
```

기본 대상 서비스는 다음과 같다.

```text
auth concert notification payment reservation ticket
```

일부 서비스만 확인할 때는 `DEV_SERVICES`를 좁힌다.

```bash
task dev DEV_SERVICES="auth payment"
```

단일 서비스만 다시 배포할 때는 다음 명령을 사용한다.

```bash
task dev:service SERVICE=auth
```

## 2. Pod와 ServiceMonitor 확인

서비스와 monitoring stack이 올라왔는지 확인한다.

```bash
kubectl get pods -A | grep -E "ticketing-|monitoring|observability|kong"
```

Prometheus가 scrape할 `ServiceMonitor`가 생성됐는지 확인한다.

```bash
kubectl get servicemonitor --all-namespaces -l release=kube-prometheus-stack
```

정상 기준:

- `ticketing-*` namespace의 서비스 Pod가 `Running` 상태다.
- `monitoring` namespace의 Prometheus, Grafana Pod가 `Running` 상태다.
- 서비스별 `ServiceMonitor`가 조회된다.

## 3. 서비스 `/metrics` 직접 확인

Prometheus를 보기 전에 서비스가 metric을 직접 노출하는지 먼저 확인한다.

예: `auth-service`

```bash
kubectl -n ticketing-auth port-forward svc/auth-service 18080:8080
curl -s http://127.0.0.1:18080/metrics | grep -E "auth_attempts_total|auth_tokens_issued_total|audit_events_total"
```

서비스별 직접 확인 대상:

| 서비스 | Namespace | Service | Port-forward 예시 | 대표 metric |
| --- | --- | --- | --- | --- |
| auth | `ticketing-auth` | `auth-service` | `18080:8080` | `auth_attempts_total` |
| payment | `ticketing-payment` | `payment-service` | `18081:8080` | `payments_total` |
| concert | `ticketing-concert` | `concert-service` | `18082:8082` | `catalog_queries_total` |
| reservation | `ticketing-reservation` | `reservation-service` | `18083:8083` | `reservations_total` |
| notification | `ticketing-notification` | `notification-service` | `18084:8084` | `notifications_created_total` |
| ticket | `ticketing-ticket` | `ticket-service` | `18085:8085` | `tickets_issued_total` |

정상 기준:

- `/metrics`가 HTTP 200으로 응답한다.
- 서비스별 대표 metric 이름이 출력된다.
- 아직 API 호출이나 이벤트 처리를 하지 않았다면 counter series가 없거나 0일 수 있다.

## 4. API 호출로 metric 발생시키기

Counter와 histogram은 실제 요청, command, event consume/publish가 지나간 뒤 값이 보인다. `/metrics`만 열었을 때 비어 보이면 먼저 트래픽을 만든다.

Kong proxy를 통해 호출하려면 port-forward를 연다.

```bash
kubectl -n kong port-forward svc/kong-kong-proxy 8080:80
```

포트포워드를 사용하면 Kong 호출 기준 주소는 다음과 같다.

```text
http://127.0.0.1:8080
```

Docker Desktop에서 Kong proxy Service가 `localhost:80`으로 바로 열려 있으면 같은 경로를 다음 주소로 호출할 수도 있다.

```text
http://localhost
```

먼저 인증 없이 접근 가능한 auth API로 demo 계정을 확인한다.

```bash
curl -fsS http://127.0.0.1:8080/auth/demo-accounts
```

고객 API를 확인할 때는 `CUSTOMER` 역할 토큰을 발급한다. `admin@example.com` 토큰은 관리자 route에는 맞지만, `/reservations`, `/payments`, `/tickets`, `/notifications` 같은 customer route에서는 Kong role guard가 403을 반환한다.

```bash
CUSTOMER_TOKEN="$(
  curl -fsS -X POST http://127.0.0.1:8080/auth/login \
    -H 'content-type: application/json' \
    -d '{"email":"customer@example.com","password":"customer1234"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])'
)"

echo "${CUSTOMER_TOKEN:0:20}..."
```

그다음 확인하려는 서비스의 API를 호출한다. 예를 들어 auth metric을 확인할 때는 로그인, refresh, logout, me 요청 중 하나를 호출한 뒤 다시 `/metrics` 또는 Prometheus query를 본다.

Kong route 연결만 가볍게 확인할 때는 조회 API를 먼저 호출한다. `GET /reservations`, `GET /payments`, `GET /tickets`는 현재 API에 없거나 상세 조회용 경로라서 405/404가 날 수 있다.

```bash
curl -fsS http://127.0.0.1:8080/concerts

curl -fsS http://127.0.0.1:8080/reservations/me \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}"

curl -fsS http://127.0.0.1:8080/tickets/me \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}"

curl -fsS http://127.0.0.1:8080/notifications \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}"
```

결제 서비스는 목록 조회 API가 없으므로, 도메인 metric 확인용으로 결제 생성 API를 호출한다.

```bash
SMOKE_ID="$(date +%s)"

curl -fsS -X POST http://127.0.0.1:8080/payments \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -H 'content-type: application/json' \
  -H "Idempotency-Key: payment-smoke-${SMOKE_ID}" \
  -d "{\"reservationId\":\"reservation-smoke-${SMOKE_ID}\",\"concertId\":\"concert-smoke-${SMOKE_ID}\",\"seatId\":\"A-1\",\"amount\":50000,\"method\":\"mock\",\"simulation\":\"approve\"}"
```

예약 command metric을 증가시키려면 예약 생성 API를 호출한다.

```bash
SMOKE_ID="$(date +%s)"

curl -fsS -X POST http://127.0.0.1:8080/reservations \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -H 'content-type: application/json' \
  -d "{\"concertId\":\"concert-smoke-${SMOKE_ID}\",\"showtimeId\":\"showtime-smoke-${SMOKE_ID}\",\"performanceId\":\"performance-smoke-${SMOKE_ID}\",\"seatId\":\"A-1\"}"
```

티켓 발급 metric을 증가시키려면 티켓 발급 API를 호출한다. 로컬 기본 설정에서는 AWS access key가 비어 있으면 QR/PDF 업로드는 건너뛰고 URL을 `null`로 둔다.

```bash
SMOKE_ID="$(date +%s)"

curl -fsS -X POST http://127.0.0.1:8080/tickets/issue \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" \
  -H 'content-type: application/json' \
  -d "{\"reservationId\":\"reservation-smoke-${SMOKE_ID}\",\"userId\":\"1\",\"concertId\":\"concert-smoke-${SMOKE_ID}\",\"seatId\":\"A-1\"}"
```

결제 상세 조회 route 자체만 확인하고 싶으면 존재하지 않는 ID를 조회해도 된다. 이 경우 HTTP 404가 정상이라 `-f`를 쓰지 않는다.

```bash
curl -s -o /dev/null -w "payment detail status=%{http_code}\n" \
  http://127.0.0.1:8080/payments/payment-smoke-missing \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}"
```

서비스별 Kong route 기준:

| 서비스 | 대표 route | 인증 | 비고 |
| --- | --- | --- | --- |
| auth | `POST /auth/login` | 불필요 | 토큰 발급 |
| concert | `GET /concerts` | 불필요 | 공개 조회 |
| performance seats | `GET /performances/{id}/seats` | 불필요 | 공개 조회, 실제 performance ID 필요 |
| reservation | `GET /reservations/me`, `POST /reservations` | 필요 | `GET /reservations`는 없음 |
| payment | `POST /payments`, `GET /payments/{paymentId}` | 필요 | 목록 조회 없음 |
| ticket | `GET /tickets/me`, `POST /tickets/issue` | 필요 | `GET /tickets`는 없음 |
| notification | `GET /notifications` | 필요 | 목록 조회 |

이벤트 기반 metric은 해당 이벤트가 실제로 발행 또는 소비되어야 증가한다.

예시:

- `payment-service`: 결제 승인/실패 흐름 호출 후 `payments_total`, `payment_events_published_total` 확인
- `reservation-service`: 예약 command 호출 후 `reservations_total`, `reservation_events_published_total` 확인
- `ticket-service`: 결제 승인 이벤트 소비 후 `tickets_issued_total`, `ticket_events_consumed_total` 확인
- `notification-service`: 비즈니스 이벤트 소비 후 `notifications_created_total`, `notification_events_consumed_total` 확인

## 5. Prometheus target 확인

Prometheus UI를 연다.

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090:9090
```

브라우저에서 다음 주소를 연다.

```text
http://127.0.0.1:9090
```

확인 순서:

1. `Status > Targets`로 이동한다.
2. `ticketing-*` namespace의 서비스 target이 있는지 확인한다.
3. target 상태가 `UP`인지 확인한다.
4. `Last Scrape`, `Scrape Duration`, `Error` 값을 확인한다.

정상 기준:

- 서비스 target이 `UP`이다.
- target error가 비어 있다.
- scrape 시간이 주기적으로 갱신된다.

## 6. Prometheus query 확인

Prometheus query 화면에서 서비스별 metric을 직접 조회한다.

```promql
auth_attempts_total
payments_total
reservations_total
tickets_issued_total
notifications_created_total
catalog_queries_total
```

rate 계산을 보고 싶으면 다음처럼 조회한다.

```promql
rate(auth_attempts_total[5m])
rate(payments_total[5m])
rate(reservations_total[5m])
```

scrape 자체를 확인할 때는 다음 query를 사용한다.

```promql
up
```

서비스 namespace 기준으로 좁혀 볼 수 있다.

```promql
up{namespace=~"ticketing-.*"}
```

## 7. Grafana 확인

Grafana UI를 연다.

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80
```

브라우저에서 다음 주소를 연다.

```text
http://127.0.0.1:3000
```

로컬 계정:

```text
admin / prom-local
```

확인 순서:

1. Prometheus datasource가 정상인지 확인한다.
2. Explore에서 Prometheus datasource를 선택한다.
3. 서비스별 대표 metric을 조회한다.
4. 필요한 경우 label 필터를 추가해 서비스별 결과를 확인한다.

Grafana Explore에 넣을 서비스별 대표 query:

| 서비스 | 확인 목적 | PromQL 예시 |
| --- | --- | --- |
| auth | 인증 시도 결과 | `auth_attempts_total` |
| auth | 로그인/refresh/logout/me 최근 증가율 | `sum by (action, result) (rate(auth_attempts_total[5m]))` |
| auth | 토큰 발급 수 | `auth_tokens_issued_total` |
| auth | 감사 이벤트 생성 수 | `audit_events_total` |
| concert | 공개 조회 결과 | `catalog_queries_total` |
| concert | 공개 조회 최근 증가율 | `sum by (resource, result) (rate(catalog_queries_total[5m]))` |
| concert | 공개 조회 p95 지연 | `histogram_quantile(0.95, sum by (le, resource) (rate(catalog_query_duration_seconds_bucket[5m])))` |
| reservation | 예약 command 결과 | `reservations_total` |
| reservation | 예약 command 최근 증가율 | `sum by (result, error_code) (rate(reservations_total[5m]))` |
| reservation | 예약 command p95 지연 | `histogram_quantile(0.95, sum by (le, command) (rate(reservation_command_duration_seconds_bucket[5m])))` |
| reservation | 예약 이벤트 발행 결과 | `reservation_events_published_total` |
| payment | 결제 결과 | `payments_total` |
| payment | 결제 최근 증가율 | `sum by (method, result) (rate(payments_total[5m]))` |
| payment | 결제 API p95 지연 | `histogram_quantile(0.95, sum by (le, method) (rate(payment_request_duration_seconds_bucket[5m])))` |
| payment | PG 호출 p95 지연 | `histogram_quantile(0.95, sum by (le, provider) (rate(payment_provider_duration_seconds_bucket[5m])))` |
| ticket | 티켓 발급 결과 | `tickets_issued_total` |
| ticket | 티켓 발급 최근 증가율 | `sum by (source, result) (rate(tickets_issued_total[5m]))` |
| ticket | 티켓 발급 p95 지연 | `histogram_quantile(0.95, sum by (le, source) (rate(ticket_issue_duration_seconds_bucket[5m])))` |
| ticket | 티켓 이벤트 소비 결과 | `ticket_events_consumed_total` |
| notification | 알림 생성 결과 | `notifications_created_total` |
| notification | 알림 생성 최근 증가율 | `sum by (event_type, result) (rate(notifications_created_total[5m]))` |
| notification | 알림 생성 p95 지연 | `histogram_quantile(0.95, sum by (le, event_type) (rate(notification_create_duration_seconds_bucket[5m])))` |
| notification | 알림 조회 결과 | `notification_reads_total` |

Counter metric은 API 호출이나 이벤트 처리가 지나간 뒤 series가 생긴다. 조회 결과가 비어 있으면 먼저 4번의 Kong 호출 또는 이벤트 흐름을 다시 실행한 뒤 scrape interval이 지난 다음 재조회한다.

## 문제 상황별 확인

### ServiceMonitor가 없다

확인:

```bash
kubectl get servicemonitor --all-namespaces -l release=kube-prometheus-stack
```

볼 것:

- `task dev`가 끝까지 성공했는지 확인한다.
- 서비스 Helm release가 배포됐는지 확인한다.
- 로컬 dev values에서 `serviceMonitor.enabled`가 켜져 있는지 확인한다.

### Prometheus target이 DOWN이다

확인:

```bash
kubectl get svc -A | grep -E "auth-service|payment-service|reservation-service|ticket-service|notification-service|concert-service"
kubectl get endpoints -A | grep -E "auth-service|payment-service|reservation-service|ticket-service|notification-service|concert-service"
```

볼 것:

- Service selector가 Pod label과 맞는지 확인한다.
- Pod readiness가 통과했는지 확인한다.
- NetworkPolicy가 monitoring namespace scrape를 허용하는지 확인한다.
- Prometheus target error 메시지를 확인한다.

### `/metrics`는 보이는데 Prometheus query가 비어 있다

볼 것:

- `Status > Targets`에서 해당 서비스 target이 `UP`인지 확인한다.
- scrape interval 이후 다시 조회한다.
- query metric 이름이 실제 `/metrics` 출력과 같은지 확인한다.
- API 호출이나 이벤트 처리가 아직 없어 series가 생성되지 않은 상태인지 확인한다.

### counter가 증가하지 않는다

볼 것:

- 해당 API, command, event consume/publish 흐름이 실제로 실행됐는지 확인한다.
- 서비스 로그에서 요청 또는 이벤트 처리 로그를 확인한다.
- metric label에 고카디널리티 값이 들어가 series가 예상과 다르게 나뉘지 않았는지 확인한다.
- 실패 흐름은 `result`, `error_code`, `failure_kind`, `retryable` label 기준으로 조회한다.

### Grafana에서 datasource 오류가 난다

볼 것:

- Prometheus port-forward가 열려 있는지 확인한다.
- Grafana datasource가 Prometheus를 바라보는지 확인한다.
- `monitoring` namespace의 Prometheus service가 존재하는지 확인한다.

## 일시 중지와 정리

로컬 검증이 끝났지만 다음에 다시 이어서 확인할 예정이면 `dev:pause`를 사용한다. 이 명령은 Helm release, PVC, Service, ServiceMonitor를 삭제하지 않고 Pod만 0 replica로 낮춘다.

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
task dev:pause
```

다시 켤 때는 평소처럼 `task dev`를 실행한다.

```bash
task dev
```

`dev:pause` 대상:

- 서비스 Pod
- DB/Kafka Pod
- Kong Pod
- Tempo/Loki/Collector Pod
- Prometheus/Grafana Pod

로컬 클러스터를 완전히 깨끗하게 정리해야 할 때만 `dev:down`을 사용한다.

```bash
task dev:down
```

`dev:down` 삭제 대상:

- 서비스 Helm release
- Tempo/Loki backend
- Prometheus stack
- Kong
- data platform
- 로컬 dev namespace

## 관련 문서

- `docs/architecture/observability/metrics/README.md`
- `docs/architecture/observability/metrics/service-metrics.md`
- `docs/architecture/observability/metrics/system-metrics.md`
- `gitops/platform/monitoring/README.md`
