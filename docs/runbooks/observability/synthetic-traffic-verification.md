# synthetic traffic 검증 런북

## 목적

Kubernetes CronJob 기반 synthetic traffic이 Kong, 서비스, DB, Kafka, Prometheus, Grafana 경로를 계속 지나가는지 확인한다.

이 런북은 운영 부하 테스트가 아니라 대시보드 생존성 확인용이다. 실행 주기는 작게 유지하고, 실패는 Job 실패와 로그로 드러나게 둔다.

## 적용 범위

- synthetic runner image
- `gitops/platform/synthetic` Helm chart
- `workspace/docs/runbooks/observability/local-metrics-verification.md`의 metric 확인 절차

## 사전 조건

- `gitops`의 aws-dev 또는 로컬 dev 스택이 배포되어 있다.
- Kong proxy service가 `kong` namespace에서 동작한다.
- `auth`, `concert`, `reservation`, `payment`, `ticket`, `notification` 서비스가 준비 상태다.
- `reservation-service`, `payment-service`, `ticket-service`, `notification-service`가 Kafka에 연결되어 있다.
- Docker와 로컬 registry `localhost:5001`을 사용할 수 있다.

기본 로컬 CronJob image:

```text
localhost:5001/synthetic-traffic:dev
```

aws-dev image는 `gitops/platform/synthetic/values/aws-dev.yaml`에서 관리한다.

```text
941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/synthetic-traffic:latest
```

aws-dev에서 private ECR을 쓰는 경우 `synthetic` namespace에도 `ecr-registry` image pull secret이 있어야 한다.

## 1. 로컬 배포 방식

synthetic traffic은 기본 `task dev`에 포함하지 않는다. 먼저 `task dev`로 서비스, Kong, DB/Kafka, monitoring stack을 준비한 뒤 필요할 때만 별도로 배포한다.

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
task dev
task dev:synthetic
```

로컬 Helm 렌더링만 확인할 때는 다음 명령을 사용한다.

```bash
task --dir platform/synthetic render
```

로컬 image tag를 바꿀 때는 `DEV_IMAGE_TAG`를 넘긴다.

```bash
task dev:synthetic DEV_REGISTRY=localhost:5001 DEV_IMAGE_TAG=dev
```

`dev:synthetic`은 `platform/synthetic/runner` image를 빌드하고 registry에 push한 뒤 Helm release를 설치/갱신한다. 루트 task는 진입점만 제공하고, 실제 synthetic 작업은 `platform/synthetic/Taskfile.yml`이 소유한다.

`dev:synthetic`은 CronJob 배포 후 내부 `setup-fixture` k6 Job을 자동 실행한다. 사용자가 별도 fixture task를 실행하지 않아도 provider/admin/customer login, venue/concert/showtime/seat-map 준비, sale policy 승인, sales start, public 조회 확인까지 먼저 수행한다.

로컬 credential Secret은 task가 demo 계정 기본값으로 만든다. 다른 계정을 쓰려면 실행 전에 환경변수를 넘긴다.

```bash
SYNTHETIC_CUSTOMER_EMAIL=customer@example.com \
SYNTHETIC_CUSTOMER_PASSWORD=customer1234 \
SYNTHETIC_PROVIDER_EMAIL=provider@example.com \
SYNTHETIC_PROVIDER_PASSWORD=provider1234 \
SYNTHETIC_ADMIN_EMAIL=admin@example.com \
SYNTHETIC_ADMIN_PASSWORD=admin1234 \
task dev:synthetic
```

## 2. aws-dev 배포 방식

aws-dev는 Argo CD Application이 Helm chart와 aws-dev values를 사용한다.

```text
gitops/argo/applications/aws-dev/platform/synthetic.yaml
gitops/platform/synthetic/values/aws-dev.yaml
```

태그를 고정하고 싶으면 `values/aws-dev.yaml`의 `image.tag`를 commit SHA로 바꾼다.

`values/aws-dev.yaml`의 `synthetic.baseUrl`과 `synthetic.externalBaseUrl`은 현재 다음 aws-dev 외부 DNS로 고정한다.

```text
http://medikong-default-kong-nlb-c17a54e23efd293c.elb.ap-northeast-2.amazonaws.com:32407
```

## 3. CronJob 배포 상태 확인

`gitops/platform/synthetic` Argo Application이 생성됐는지 확인한다.

```bash
kubectl -n argocd get application synthetic-traffic-aws-dev
```

Kubernetes 리소스를 확인한다.

```bash
kubectl -n synthetic get namespace,configmap,serviceaccount,cronjob
kubectl -n synthetic describe cronjob synthetic-traffic
```

정상 기준:

- `synthetic` namespace가 존재한다.
- `synthetic-traffic` ConfigMap이 존재한다.
- 로컬 `synthetic-traffic` CronJob schedule이 `* * * * *`로 보인다.
- aws-dev `synthetic-traffic` CronJob schedule이 `*/5 * * * *`로 보인다.
- 최근 Job이 있으면 `LAST SCHEDULE`이 갱신된다.

## 4. 수동 실행

주기 실행을 기다리지 않고 한 번 실행한다.

```bash
task dev:synthetic:run
```

`dev:synthetic:run`도 수동 Job을 만들기 전에 내부 `setup-fixture` k6 Job을 먼저 실행한다. fixture 준비가 실패하면 full journey를 실행하지 않고 해당 단계 로그에서 멈춘다.

생성된 Job과 Pod를 확인한다.

```bash
kubectl -n synthetic get jobs,pods -l app.kubernetes.io/name=synthetic-traffic
```

로그를 본다.

```bash
kubectl -n synthetic logs -l app.kubernetes.io/name=synthetic-traffic --tail=200
```

정상 기준:

- 로그에 `synthetic_run_started`와 `synthetic_run_finished`가 모두 남는다.
- 각 step 로그의 `http_status`가 기대 상태와 맞는다.
- Job `COMPLETIONS`가 `1/1`이다.

실패 기준:

- 로그에 `synthetic_run_failed`가 남는다.
- Job이 `0/1` 또는 `Failed`로 남는다.
- 실패 메시지에 단계명, HTTP status, 응답 본문 일부가 포함된다.

## 5. Prometheus 확인

Prometheus에서 주요 business metric이 증가하는지 본다.

```promql
increase(auth_attempts_total[15m])
increase(catalog_queries_total[15m])
increase(reservations_total[15m])
increase(payments_total[15m])
increase(tickets_issued_total[15m])
increase(notifications_created_total[15m])
```

Kafka 경로까지 확인할 때는 이벤트 발행/소비 metric을 함께 본다.

```promql
increase(reservation_events_published_total[15m])
increase(payment_events_published_total[15m])
increase(ticket_events_consumed_total[15m])
increase(notification_events_consumed_total[15m])
```

정상 기준:

- synthetic Job 실행 이후 위 metric 중 핵심 흐름 counter가 증가한다.
- `result="success"` series가 증가한다.
- 실패가 있다면 `result="failure"` 또는 `result="rejection"`이 함께 증가해 원인 범위를 좁힐 수 있다.

## 6. Grafana 확인

Grafana의 service metrics dashboard에서 다음을 본다.

- auth login 성공 count
- concert catalog query count
- reservation create success count
- payment approved count
- ticket issued count
- notification created/read count

정상 기준:

- 최근 15분 또는 1시간 범위에서 패널이 비어 있지 않다.
- synthetic Job 실행 주기와 counter 증가 시점이 대략 맞는다.
- 특정 서비스만 비어 있으면 해당 서비스 Pod, Kafka topic, consumer 로그를 우선 확인한다.

## 7. synthetic 데이터 구분

synthetic runner는 다음 값을 남긴다.

- `X-Synthetic-Traffic: true`
- `X-Request-Id: synthetic-<run-id>-<suffix>`
- 결제 idempotency key: `synthetic-<run-id>`

주의:

- synthetic ID, reservation ID, payment ID, ticket ID, user ID를 metric label로 쓰지 않는다.
- synthetic 데이터 구분은 DB record, 로그, request id로 한다.
- 운영 트래픽과 synthetic traffic을 합산해 사용자 행동 지표로 해석하지 않는다.

## 8. 자주 보는 실패

### image pull 실패

```bash
kubectl -n synthetic describe pod -l app.kubernetes.io/name=synthetic-traffic
```

확인할 것:

- `synthetic-traffic` image tag가 registry에 존재하는가?
- `synthetic` namespace에 `ecr-registry` secret이 있는가?
- Helm values의 CronJob image tag와 registry에 push한 tag가 같은가?

### 인증 실패

로그에서 `auth.login` 단계를 본다.

확인할 것:

- auth-service가 demo user seed를 실행했는가?
- `synthetic-traffic-credentials` Secret의 `SYNTHETIC_CUSTOMER_EMAIL`, `SYNTHETIC_CUSTOMER_PASSWORD`가 auth-service seed와 맞는가?
- Kong JWT/identity header plugin이 auth token을 해석하는가?

## 9. Loki 로그 확인

k6 runner와 애플리케이션은 Loki를 직접 호출하지 않는다. 둘 다 stdout/stderr로 로그를 남기고, OpenTelemetry Collector가 Kubernetes container log를 수집해 Loki로 보내는 구조를 전제로 한다.

현재 `gitops/platform/observability/collector/values/*.yaml`은 contrib Collector DaemonSet으로 배포되고, `/var/log/pods`와 `/var/log/containers`를 읽어 `filelog -> k8sattributes -> transform/log_labels -> otlphttp/loki` 경로로 Loki에 보낸다. 기존 trace pipeline은 같은 Collector에서 `otlp -> Tempo`로 유지한다.

Collector 상태를 먼저 확인한다.

```bash
kubectl -n observability get daemonset,pod,svc -l app.kubernetes.io/name=opentelemetry-collector
kubectl -n observability logs daemonset/opentelemetry-collector-agent --tail=200
```

Loki에서 synthetic runner 로그를 조회한다.

```logql
{k8s_namespace_name="synthetic", app="synthetic-traffic"}
| json
| event =~ "synthetic_run_started|synthetic_step|synthetic_run_finished|synthetic_run_failed"
```

단계별로 좁힐 때는 낮은 cardinality label만 사용한다.

```logql
{k8s_namespace_name="synthetic", app="synthetic-traffic", scenario="external-journey", step="payment.approve"}
```

`trace_id`, `request_id`, `synthetic_run_id`, reservation/payment/ticket id는 label이 아니라 로그 본문 field로 검색한다.

### 티켓 또는 알림 polling 실패

확인할 것:

- `payment-service`에 `KAFKA_BOOTSTRAP_SERVERS`가 설정되어 있는가?
- `ticket-service` consumer가 `payment-approved` topic을 소비하는가?
- `notification-service` consumer가 `payment-approved`, `ticket-issued` topic을 소비하는가?
- Kafka topic이 `ticketing-messaging` namespace에 존재하는가?

관련 로그:

```bash
kubectl -n ticketing-payment logs deploy/payment-service --tail=200
kubectl -n ticketing-ticket logs deploy/ticket-service --tail=200
kubectl -n ticketing-notification logs deploy/notification-service --tail=200
```

## 관련 문서

- `docs/architecture/synthetic-e2e/README.md`
- `docs/runbooks/observability/local-metrics-verification.md`
- `gitops/platform/synthetic`
- `gitops/platform/synthetic/values/local.yaml`
- `gitops/platform/synthetic/values/aws-dev.yaml`
