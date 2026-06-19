# GOAL 기능 동등성 체크리스트

작성일: 2026-06-15
최종 업데이트: 2026-06-17

## 1. 문서 목적

이 문서는 `workspace/docs/project_docs/00-GOAL.md`와 `workspace/docs/project_docs/01-prd.md`의 목표를 체크박스 방식으로 다시 정리한다.

기준은 기술 스택 이름이 아니라 기능 충족 여부다.

예를 들어 다음처럼 판단한다.

```text
JUnit 요구
  Java/JUnit 자체를 쓰지 않아도 Python/FastAPI 서비스에서 pytest 단위 테스트와 CI 자동 실행이 되면 기능 동등 충족으로 본다.

Spring Cloud Gateway 또는 Nginx Ingress 요구
  현재 프로젝트가 Kong Gateway로 서비스 라우팅, JWT, role guard, rate limit을 제공하면 기능 동등 충족으로 본다.

Elasticsearch/Kibana/Logstash/Fluentd 요구
  현재 프로젝트가 Loki, Tempo, Grafana, OpenTelemetry Collector로 로그 수집, 검색, trace 연결, dashboard를 제공하면 기능 동등 충족으로 본다.

KT Cloud Container Registry 요구
  현재 프로젝트가 AWS ECR로 서비스별 이미지 저장소, git-sha tag, Kubernetes image pull을 제공하면 기능 동등 충족으로 본다.
```

단, manifest나 코드만 있고 실제 운영 증거가 부족한 항목은 체크하지 않고 `부분 충족`으로 둔다.

## 1.1 2026-06-17 최신 반영 요약

2026-06-16에 Phase 9/10 관련 GitOps 변경을 `gitops` `main` 브랜치에 push했다.

```text
commit: 72502d3 feat: add network and mesh gitops readiness
주요 포함 범위:
  서비스별 NetworkPolicy egress allowlist
  data/private-dev DB, MongoDB, Kafka, pgAdmin NetworkPolicy
  AWS dev data NetworkPolicy 전용 ArgoCD Application
  Istio mTLS STRICT scenario manifest
  reservation canary v2 Helm values
  monitoring SLO rule과 Business KPI dashboard
```

push 전 로컬 검증은 다음을 통과했다.

```text
helm lint charts/medikong-service
AWS dev/private-dev 서비스 Helm render
reservation canary Helm render
platform/data-private-dev kustomize
platform/data-aws-dev-networkpolicies kustomize
platform/data, monitoring, namespaces, istio security/traffic kustomize
git diff --check
```

private-dev 클러스터 확인 결과는 다음이다.

```text
클러스터 노드 6개 Ready
private-dev 핵심 서비스 Application 대부분 Synced/Healthy
data-private-dev는 OutOfSync/Healthy
data-private-dev의 NetworkPolicy 리소스 8개는 ArgoCD 리소스 목록에서 Synced
data-private-dev OutOfSync 원인은 NetworkPolicy가 아니라 DB/Kafka StatefulSet drift
ArgoCD가 보고 있는 revision fb83a48...은 72502d3 이후 commit이므로 NetworkPolicy 변경을 포함한다
```

따라서 이 문서의 최신 판단은 다음과 같다.

```text
NetworkPolicy 구성은 GitOps와 private-dev runtime 검증 관점에서 DB/Kafka 접근 제어 기준을 충족한다.
초기 connect-only 테스트에서 보인 충돌 응답은 Istio sidecar 환경의 false positive로 trouble에 정리했다.
mTLS, canary traffic split, rollback time, circuit breaker는 manifest 준비와 dry-run까지 완료됐고 runtime 검증은 아직 미완료다.
```

## 2. 체크 기준

| 표시 | 의미 |
| --- | --- |
| `[x]` | 기능 목적을 현재 프로젝트 방식으로 충족했다. 기술 스택명이 달라도 동등 기능이면 체크한다. |
| `[ ]` | 아직 미충족이거나, 구현 기반은 있지만 검증 증거가 부족하다. |

상태 보조 표기:

```text
기능 동등 충족
  목표에 적힌 기술과 다르지만 같은 기능 목적을 현재 스택으로 만족한다.

부분 충족
  코드/manifest/문서는 있지만 실제 실행 증거, 수치, 캡처, 알림, 장애 주입 결과가 부족하다.

증거 필요
  기능이 있을 가능성은 높지만 현재 문서화된 운영 증거가 부족하다.
```

## 3. 01-PRD 핵심 목표 체크

### 3.1 좌석 중복 0건

- [x] 동시 예매와 예매 완료 후 재시도 상황에서도 한 좌석에는 하나의 유효 티켓만 발행한다.
  - 근거: reservation active seat unique constraint, `reservation.conflict`, `reservation_conflicts_total` metric 기반이 있다.
  - 2026-06-15 AWS dev Kong 동시성 smoke에서 동일 `showtimeId + seatId`에 동시 예약 10개를 요청했고, 1건은 `201`, 9건은 `409 reservation.conflict`였다.
  - 같은 `concertId + seatId`의 최종 티켓 수는 1개였고, 추가 중복 티켓은 0개였다.
  - 2026-06-15 Phase 3B에서 티켓 발행 후 같은 좌석 재예약이 `201`로 허용되는 결함을 확인했다.
  - 2026-06-15 Phase 3C에서 `TICKETED` 전환 시 `active_seat_key`를 유지하도록 코드 수정했고, 로컬 `reservation-service` 테스트는 `28 passed, 4 skipped`로 통과했다.
  - 2026-06-15 Phase 3D에서 `reservation-service:v0.1.3`을 tag 기반으로 배포했고, AWS dev Kong 경유 Phase 3B smoke 재실행에서 티켓 발행 후 같은 좌석 재예약이 `409 reservation.conflict`로 차단됐다.
  - Phase 3D 결과: `firstReservationId=rsv-1974158659e443a3`, 첫 예약 상태 `TICKETED`, `rebookResult=blocked`, `matchingTicketCount=1`, `duplicateExtraReservationCount=0`.

- [x] 좌석 충돌을 비즈니스 오류로 식별하고 metric/log로 관측할 수 있다.
  - 근거: `reservation.conflict`, `reservation_conflicts_total`, synthetic conflict trouble 문서가 있다.

### 3.2 후속 처리 분리

- [x] 예약 API와 티켓/알림 후속 처리를 Kafka 이벤트로 분리한다.
  - 근거: Kafka topic, reservation/payment/ticket/notification Kafka 설정, Postman happy path가 있다.
  - 2026-06-15 AWS dev Kong smoke에서 `payment-approved` 이후 `ticket issue: found on attempt 2`, `reservation-created`, `payment-approved`, `ticket-issued` notification 저장을 확인했다.

- [x] `reservation_api_p95_ms`, `ticket_issue_delay_ms`, `kafka_consumer_lag`를 운영 지표로 증명한다.
  - 근거: 2026-06-15 Phase 4에서 AWS dev Kong 경유 smoke와 Kafka CLI, Prometheus query로 측정했다.
  - Kafka CLI 기준 consumer lag는 측정 전후 모두 0이었다.
  - offset 변화: `ticket-service/payment-approved 6 -> 7`, `reservation-service/ticket-issued 6 -> 7`, `notification-service/reservation-created 7 -> 8`, `notification-service/payment-approved 6 -> 7`, `notification-service/ticket-issued 6 -> 7`.
  - API smoke 기준 `reservationApiMs=34`, `paymentApiMs=32`, `paymentToTicketFoundMs=1068`, `reservationToTicketFoundMs=1114`.
  - Prometheus 기준 `ticket_issue_duration_seconds` p95 over 5m은 `0.00975s`, reservation create command duration p95는 `0.009914572656352387s`, payment request duration p95는 `0.02425s`였다.
  - 보강: Kafka lag 자체는 Prometheus metric이 아니라 Kafka CLI snapshot으로 확인했다. 지속적인 dashboard화를 원하면 Kafka exporter 계열 추가가 필요하다.

### 3.3 장애 격리

- [x] notification-service를 core booking flow와 분리된 서비스로 구성한다.
  - 근거: notification-service, notification-db, Kafka consumer 구조가 분리되어 있다.

- [x] 알림 장애가 결제 완료와 티켓 발행 흐름을 실패시키지 않음을 실제 장애 주입으로 검증한다.
  - 근거: 2026-06-15 Phase 4 notification 장애 격리 검증에서 `notification-service`를 replicas=0으로 내린 상태로 AWS dev Kong 경유 core booking flow를 실행했다.
  - 결과: 예약 생성 `201`, 결제 승인 `201`, 티켓 발행 성공, 같은 좌석 재예약 `409`, `matchingTicketCount=1`, `duplicateExtraReservationCount=0`.
  - 복구 후 `notification-service`는 `replicas=1 ready=1`, `notification-aws-dev`는 `Synced / Healthy`였다.
  - Kafka offset은 `reservation-created 9 -> 10`, `payment-approved 8 -> 9`, `ticket-issued 8 -> 9`로 증가했고, 복구 후 notification consumer lag는 0이었다.
  - 주의: 이 검증은 Kafka 기반 비동기 장애 격리 검증이며, Istio Circuit Breaker 검증은 아니다.

### 3.4 트래픽 폭발 대응

- [x] Kubernetes HPA 리소스 기반을 구성한다.
  - 근거: Helm chart HPA template, AWS dev HPA 리소스, HPA scenario values가 있다.

- [x] 제한된 AWS dev 환경에서 HPA controller scale-out smoke를 수행한다.
  - 근거: 2026-06-16 Phase 7에서 `metrics-server` 정상, `kubectl top` 정상, `concert-service` HPA `ScalingActive=True`를 확인했다.
  - 짧은 Kong 경유 `/concerts` 요청 부하에서 HPA target이 `84%/70%`, `74%/70%`까지 올라갔다.
  - 임시 HPA 조건에서 `horizontalpodautoscaler/concert-service SuccessfulRescale New size: 2`와 Deployment `Scaled up replica set concert-service-5d86988bcb from 1 to 2` 이벤트를 확인했다.
  - 주의: AWS dev `aws-dev-smoke-stable.yaml`은 `maxReplicas=1`을 강제하므로 이 결과는 운영급 성능 검증이 아니라 HPA 기능 smoke다.

- [ ] HPA scale-out을 k6 부하로 검증하고 `hpa_scale_out_seconds`, `p99_latency`, `5xx_rate`를 남긴다. `부분 충족`
  - 부족: 현재 핵심 서비스 HPA maxPods가 대부분 1이라 운영값 그대로는 scale-out이 제한된다.
  - Phase 7에서 제한적 `1 -> 2` scale-out 이벤트는 확인했지만, k6 기반 p99/5xx/scale-out time과 before/after 성능 수치는 아직 없다.

- [x] k6 synthetic traffic 실행 기반을 구성한다.
  - 근거: `gitops/platform/synthetic`, synthetic image publish workflow, k6 architecture 문서가 있다.

### 3.5 통신 보안과 배포 안정성

- [x] API Gateway를 통해 외부 진입점을 단일화한다. `기능 동등 충족`
  - 목표 문구: Spring Cloud Gateway 또는 Nginx Ingress
  - 현재 충족 방식: Kong Gateway / Kong Ingress Controller

- [x] Gateway에서 JWT 인증 기반을 제공한다. `기능 동등 충족`
  - 근거: Kong JWT plugin, identity headers plugin, auth route 예외 정책이 있다.
  - 2026-06-15 AWS dev Kong smoke에서 customer/provider/admin JWT login과 보호 API 접근을 확인했다.
  - 2026-06-16 Phase 8에서 `GET /reservations/me` 토큰 없음은 `401`, 잘못된 JWT는 `401`로 차단됨을 확인했다.

- [x] Gateway에서 role guard 기반 접근 제어를 제공한다.
  - 근거: Kong role guard plugin과 서비스별 route annotation 기반이 있다.
  - 2026-06-15 AWS dev Kong smoke에서 provider path, admin path, customer path를 역할별 JWT로 통과했다.
  - 2026-06-16 Phase 8에서 customer token의 `/provider/venues` 접근은 `403`, provider token의 `/admin/concert-requests` 접근은 `403`, admin token의 `/admin/concert-requests` 접근은 `200`임을 확인했다.
  - customer token에 `X-User-Role: ADMIN` header를 직접 붙여도 `/provider/venues`는 `403`으로 차단되어 header spoofing으로 role guard를 우회할 수 없음을 확인했다.

- [x] Gateway에서 rate limiting 기반을 제공한다.
  - 근거: Kong rate limit plugin 기반이 있다.
  - 2026-06-16 Phase 8에서 `/concerts` 130회 연속 요청 결과 `119 x 200`, `11 x 429`가 반환되어 `minute: 120` 제한이 실제 동작함을 확인했다.
  - Prometheus에서 `kong_http_requests_total{code="429",source="kong",job="kong-kong-proxy"}`가 조회됐다.

- [x] Kubernetes NetworkPolicy를 서비스별로 구성한다.
  - 근거: Helm chart NetworkPolicy, 서비스별 NetworkPolicy, AWS dev 실제 리소스, Calico running 상태가 있다.
  - 2026-06-16 `gitops` commit `72502d3`에 서비스별 egress allowlist와 data/private-dev DB, MongoDB, Kafka, pgAdmin NetworkPolicy를 포함해 push했다.
  - 2026-06-17 private-dev `data-private-dev` Application 리소스 목록에서 `allow-auth-db-ingress`, `allow-concert-db-ingress`, `allow-reservation-db-ingress`, `allow-payment-db-ingress`, `allow-ticket-db-ingress`, `allow-notification-db-ingress`, `allow-kafka-ingress`, `allow-pgadmin-runtime` NetworkPolicy가 `Synced`임을 확인했다.

- [x] NetworkPolicy가 의도하지 않은 통신을 실제로 차단하는지 검증한다. `DB/Kafka 접근 제어 기준 충족`
  - 2026-06-16 Phase 9에서 서비스 egress와 DB/Kafka ingress NetworkPolicy 설계는 GitOps에 반영했고 Kustomize/Helm server dry-run을 통과했다.
  - 2026-06-16 `gitops` commit `72502d3`로 Git push는 완료했다.
  - 2026-06-17 private-dev에서는 data NetworkPolicy 리소스가 ArgoCD `Synced`로 확인됐다. ArgoCD revision `fb83a48...`는 `72502d3` 이후 commit이므로 NetworkPolicy 변경을 포함한다.
  - 2026-06-16 Phase 9B에서 현재 AWS dev live 기준 runtime baseline test를 수행했다. Kong namespace -> 서비스 앱 포트 6건은 모두 허용, 임의 namespace debug pod -> 서비스 앱 포트 6건은 모두 차단, debug pod -> OTel Collector도 차단됐다.
  - 2026-06-17 private-dev DB/Kafka runtime test에서 임의 namespace debug pod -> auth-db/reservation-db/payment-db/kafka/notification-db가 모두 timeout으로 차단됐다.
  - sidecar 비활성 테스트 Pod에 실제 서비스 label을 부여해 reservation/payment/notification 역할별 자기 DB/Kafka 허용, 타 DB 차단을 확인했다.
  - 결과 문서: `docs/evidence/security/network-policy-block/README.md`
  - 관련 trouble: `docs/trouble/2026-06-17-networkpolicy-connect-only-false-positive.md`
  - 주의: Istio sidecar가 있는 실제 서비스 Pod에서 `socket.connect()`만으로 판단하면 false positive가 날 수 있으므로, NetworkPolicy 검증은 sidecar 비활성 테스트 Pod 또는 protocol handshake 방식으로 수행한다.

- [x] Istio와 Kiali 기반을 설치한다.
  - 근거: istio-base, istiod, Kiali Application과 Running Pod가 있다.
  - 2026-06-16 Phase 10A에서 ArgoCD Application `istio-base`, `istiod`, `kiali`, `reservation-canary-traffic`가 모두 `Synced/Healthy`임을 확인했다.
  - `istiod`와 Kiali Pod가 Running이고, Istio CRD(`VirtualService`, `DestinationRule`, `PeerAuthentication`, `AuthorizationPolicy`)가 설치되어 있음을 확인했다.

- [제외] Istio mTLS를 검증한다. `준비 완료, runtime 증거 필요`
  - 현재 live cluster에는 `PeerAuthentication`, `AuthorizationPolicy` 리소스가 없다.
  - 2026-06-16 Phase 10B에서 Kong이 mesh 밖에 있는 현재 구조를 고려하여 namespace-wide STRICT가 아니라 meshed backend workload selector 기준 STRICT mTLS scenario manifest를 추가했다.
  - `gitops/platform/istio/security/scenarios/mtls-strict-meshed-backends`는 Kustomize render와 AWS API server dry-run을 통과했다.
  - 2026-06-16 `gitops` commit `72502d3`로 Git push는 완료했다.
  - 아직 ArgoCD 최신 revision 반영, scenario sync, 실제 mTLS 통신 검증은 수행하지 않았다.

- [x] Canary와 rollback manifest 기반을 구성한다.
  - 근거: reservation VirtualService, DestinationRule, canary 20/50/100, rollback manifests가 있다.
  - 2026-06-16 Phase 10C에서 stable, canary 20/50/100, rollback manifests가 Kustomize render와 AWS API server dry-run을 통과했다.
  - reservation canary v2 workload는 Helm render와 AWS API server dry-run을 통과했다.

- [] Canary traffic split 시간 측정한다. `증거 필요`
  - 부족: traffic_split_ratio, rollback_time 측정이 필요하다.
  - 2026-06-16 Phase 10D에서 `rollback_time_seconds` 측정 절차를 문서화했다.
  - 현재 stable VirtualService가 이미 v1 100%이고 rollback manifest도 v1 100%라서, 실제 rollback 시간 측정은 canary 20/50/100 runtime 적용 후 진행해야 한다.
  - 2026-06-16 `gitops` commit `72502d3`로 reservation canary v2 Helm values와 Istio traffic scenario 준비 변경은 push했다.
  - 2026-06-17 private-dev `reservation-canary-traffic-private-dev`는 `Synced/Healthy`이나 revision은 `fb83a48...`로 표시되어, 최신 `72502d3` 기준 반영 여부는 refresh 후 재확인이 필요하다.

### 3.6 운영 가시성

- [x] metric, log, trace 수집 기반을 구성한다.
  - 근거: Prometheus, Grafana, Loki, Tempo, OpenTelemetry Collector, ServiceMonitor, PodMonitor가 있다.
  - 2026-06-15 Phase 5 기준 Prometheus/Loki/Grafana/Alertmanager는 실제 조회 증거를 확보했다.
  - 2026-06-16 Phase 5B에서 서비스 namespace label 누락으로 Collector NetworkPolicy ingress 조건을 만족하지 못한 것이 Tempo trace ingest gap의 원인임을 확인했고, AWS dev 보정 후 신규 Kong 요청 `trace_id=974318956cd50c26424ee5024d7070d1`이 Tempo `/api/traces`와 TraceQL 검색에서 조회됐다.

- [x] 로그와 trace를 연결할 수 있는 공통 필드를 서비스 로그에 포함한다.
  - 근거: `trace_id`, `span_id`, `request_id`, `service.name`, `deployment.environment` 기반이 있다.
  - 2026-06-15 Phase 5에서 `reservation-service:v0.1.3` 로그에 `request_id`, `trace_id`, `span_id`, `service.name`, `service.environment`, `http.route`, `http.status_code`, `duration_ms`가 포함됨을 확인했다.

- [x] Grafana dashboard로 운영 상태를 볼 수 있게 구성한다.
  - 근거: logs, ops, DB, gateway/mesh, Business KPI dashboard가 있다.

### 3.7 Object Storage 분리

- [제외] 티켓 QR/PDF artifact를 S3에 저장한다. `부분 충족`
  - 근거: ticket-service values에 S3 관련 환경변수 기반은 있다.
  - 부족: 실제 S3 object 생성, `ticket_artifact_upload_success_rate`, `s3_object_count` 증거가 필요하다.

## 4. 00-GOAL: 모니터링, 로깅, 운영 대응

### 4.1 지표 정의와 수집

- [x] 모니터링 대상 서비스와 수집 지표를 정의한다.
  - 근거: service metric package, dashboard, monitoring 문서 기반이 있다.

- [x] Prometheus를 `kube-prometheus-stack`으로 `monitoring` namespace에 배포한다.
  - 근거: monitoring Application과 Prometheus Pod가 Running이다.

- [x] 각 서비스의 `/metrics` endpoint를 ServiceMonitor scrape 대상으로 등록한다.
  - 근거: ServiceMonitor template과 AWS dev ServiceMonitor 리소스가 있다.

- [x] 모든 서비스 Prometheus target이 최신 기준으로 `up`인지 증거를 남긴다.
  - 근거: 2026-06-15 Phase 5 Prometheus query `up{service=~".*-service"}`에서 `auth-service`, `concert-service`, `payment-service`, `ticket-service`, `reservation-service`, `notification-service`가 모두 `up=1`이었다.

### 4.2 로그 수집과 처리

- [x] 각 서비스가 구조화된 JSON 로그를 출력한다.

- [x] 로그에 `trace_id`, `span_id`, `request_id`, `service.name`, `deployment.environment`를 포함한다.

- [x] OpenTelemetry Collector로 서비스 로그를 수집하고 Loki로 적재한다. `기능 동등 충족`
  - 목표 문구가 Fluentd/Logstash 계열이어도, 현재 Collector/Loki 조합이 로그 수집과 적재 목적을 충족한다.

- [ ] Collector processor에 민감 데이터 마스킹, 불필요 속성 제거, batch, memory limit 설정을 검증한다. `부분 충족` 
  - 문서 보고 파악한뒤에 바로 보고 스크린샷이랑 같이 문서중 일부 파트로 할애해서넣기

- [x] Grafana 로그 dashboard에서 서비스명, 환경, 로그 레벨, request_id, trace_id로 조회한다. `기능 동등 충족`
  - 목표 문구가 Kibana여도 Grafana/Loki로 기능 목적을 충족한다.
  - 근거: 2026-06-15 Phase 5에서 Loki query로 `reservation.conflict` 409 앱 로그를 조회했고 `request_id=3b2d4bc6-d556-4ef1-9f98-12a8909d848b`, `trace_id=e7dd2cc88df4d4f5ccbf7e17882cdd58`를 확인했다.

- [x] Grafana에서 Tempo trace 연결을 실제 trace 조회까지 제공한다. `기능 동등 충족`
  - 근거: Grafana Tempo datasource와 trace panel dashboard 구성은 있다.
  - 2026-06-15 Phase 5에서는 Loki 로그의 `trace_id`를 Tempo `/api/traces/{trace_id}`로 조회했지만 `404`였고 TraceQL 검색도 empty였다.
  - 2026-06-16 Phase 5B에서 원인을 서비스 namespace label 누락으로 확인했다. Collector NetworkPolicy는 `namespaceSelector app.kubernetes.io/part-of=medikong`과 `podSelector ticketing.io/tier=api`를 요구했는데, 서비스 namespace에는 해당 label이 없었다.
  - AWS dev에서 서비스 namespace label을 보정한 뒤 `GET /concerts` 신규 요청 `trace_id=974318956cd50c26424ee5024d7070d1`가 Tempo `/api/traces`에서 `200`으로 조회됐고 TraceQL `{resource.service.name="concert-service"}` 검색 결과에도 나타났다.

### 4.3 대시보드

- [x] Loki 로그를 서비스명, 환경, 로그 레벨, request_id, trace_id 기준으로 조회하는 dashboard를 구성한다. `기능 동등 충족`
  - 근거: 2026-06-15 Phase 5에서 `medikong-logs-dashboards` ConfigMap과 Loki request_id/trace_id 조회를 확인했다.

- [x] 서비스별 에러 로그, 요청 흐름, Tempo trace 연계 dashboard를 구성한다.
  - 2026-06-16 Phase 5B 기준 Tempo 실제 trace 조회까지 확인했다.

- [x] 주문/예약 처리량, 결제 성공률, 서비스별 응답시간을 단일 화면으로 통합한 운영 dashboard를 구성한다.
  - 근거: `04-business-kpi-overview.json`

- [제외] 운영 dashboard의 threshold 색상 변화가 실제 트래픽에서 동작함을 캡처한다. `증거 필요`

- [x] 서비스 운영, 인프라, 로그 분석 관점으로 dashboard를 분리한다.

- [x] 에러율과 응답시간의 단기/장기 trend panel을 구성한다.

### 4.4 알림과 대응 기준

- [x] 에러율 5% 초과, P99 2초 초과 기준을 PrometheusRule로 정의한다.
  - 근거: `service-slo-alerts.yaml`

- [x] Kubernetes/Pod 문제 알림 기준을 PrometheusRule로 정의한다.
  - 근거: `system-kubernetes-alerts.yaml`

- [x] Alertmanager와 PrometheusRule을 실제 firing까지 검증한다.
  - 근거: 2026-06-15 Phase 5에서 `service-slo-alerts`, `system-kubernetes-alerts` PrometheusRule 리소스를 확인했고, Prometheus API에서 `medikong.service.slo` rule group이 `health=ok`로 로드됨을 확인했다.
  - 실제 firing 근거: `ALERTS{alertstate="firing"}`와 Alertmanager `/api/v2/alerts`에서 `MedikongDeploymentReplicasUnavailable`, `MedikongPodNotReady`, `etcdInsufficientMembers` 등 active alert를 확인했다.
  - 주의: Alertmanager receiver는 현재 `null`이다. Slack/외부 채널 발송은 아직 미충족이다.

- [ ] Discord `#ops-alert` 채널을 알림 채널로 연동한다. `스크린샷 필요`
  - Slack 대신 현재 팀원들이 사용중인 Discord 채널을 연동했다.

- [ ] severity 기반 warning/critical routing과 알림 채널 이중화를 검증한다. `증거 필요`

- [x] 장애 대응 Runbook 기반을 작성한다.
  - 근거: incident/recovery runbook, goal evidence runbook이 있다.

### 4.5 운영 분석과 보고

- [ ] 서비스 SLA 기준 99.9%와 산출 방식을 문서화한다. `미충족`
  - 해당 부분은 문서화는 하지않되 기준치만 잡고 그 근거만 설명

- [ ] 반복 장애 패턴 2가지 이상을 운영 보고서로 정리한다.장애 패턴 식별 결과와 개선 방안을 운영 보고서로 작성한다. `증거 필요`
  - ECR registry 403 에러 있음
  - ImagePullBackOff,  arm64, amd64  서비스는 멀티 빌드가 챙겨져있는데 다른 것들은 누락하다보니 이런 문제가 발생함.
  - 부하테스트할때  부하너무 서비스자체에서 readness liveness 쿠버네티스에서 트래픽 단절 ( 머신 성능 문제 )
  - 근거: [ECR registry 403 ImagePullBackOff trouble](../../../../trouble/ecr-registry-403/README.md)로 반복 장애 패턴 1차 증거를 분리했다.
  - 근거: [Image manifest pull failure on arm64 trouble](../../../../trouble/image-multi-arch-pull-failure/README.md)로 이미지 manifest/tag 문제를 ECR 인증 문제와 분리했다.
  - 근거: trouble 문서는 있으나 SLA/운영 보고 형태로 묶이지 않았다.

- [x] 로그 분석 기반 SLA/장애 분석 화면을 구성할 수 있는 dashboard 기반이 있다. `기능 동등 충족`
  - 목표 문구는 Kibana지만 현재는 Grafana/Loki로 기능 동등하게 접근한다.

## 5. 00-GOAL: CI/CD, GitOps, 서비스 메시

### 5.1 파이프라인

- [x] 서비스별 단위 테스트를 CI에서 자동 실행한다. `기능 동등 충족`
  - 목표 문구는 JUnit이지만 현재 서비스는 Python/FastAPI이므로 pytest가 기능 목적을 충족한다.

- [x] GitHub Actions로 변경 서비스만 감지하는 path filter를 구성한다.

- [x] Docker image build와 registry push workflow를 구성한다.

- [x] Container Registry에 서비스별 이미지를 push한다. `기능 동등 충족`
  - 목표 문구는 KT Cloud Registry지만 현재 AWS ECR이 기능 목적을 충족한다.

- [x] image tag를 git-sha 기준으로 관리한다.

- [x] GitOps values image tag update 기반을 구성한다.

- [ ] 배포 성공/실패 결과를 Discord `#deploy-status`에 자동 발송한다. `이번에 포함, 증거 필요`, `이석진`
  - 현재 Discord 배포 알림 기반이 있다. Discord로 한 그 이유만 근거로 남기기

- [제외] Jenkins와 GitHub Actions 비교/선택 근거를 정리한다. `제외, 보류`
  - ADR을 하지 않기로 했다면 `00-GOAL.md`에서 제외하거나 간단한 목표 정렬 문서로 대체해야 한다.

### 5.2 이미지와 보안 스캔

- [x] 서비스 Dockerfile을 멀티스테이지 빌드로 작성한다.

- [x] runtime container를 non-root 사용자로 실행한다.

- [x] non-root 사용자로 관리한다 `증거 필요`,`이석진`
  - 비루트 사용자로 설정했따라고 발표때 설명만
  - 현재 UID 10001 계열이다. 기능 목적은 충족하지만 숫자 요구는 다르다.

- [x] 서비스별 registry repository와 git-sha image tag를 사용한다. `기능 동등 충족`
  - AWS ECR 기준.

- [x] Trivy image scan workflow를 구성한다.

- [x] Trivy Kubernetes manifest scan workflow를 구성한다.

- [ ] HIGH/CRITICAL CVE 발견 시 push 차단이 실제로 동작하는지 최신 workflow 증거를 남긴다. `이번에 포함, 증거 필요`, `이석진`

- [X] 보안 스캔 결과를 git actions에서 Discord로 연동한다. 
  - 현재 Discord 알림 기반이 있다.

### 5.3 Kubernetes 배포

- [x] 각 서비스에 Deployment를 구성한다.

- [x] 각 서비스에 HPA 리소스를 구성한다.

- [ ] HPA 목표 수치 CPU 70%, min 2, max 10을 운영 또는 검증 scenario로 만족한다. `이번에 포함, 실험후 결과 정리`, `최범휘`
  - 세부 목표
    - scale-out 응답 시간을 측정한다.
  - 현재 aws-dev 핵심 서비스는 대부분 max 1이라 운영값 기준 scale-out은 제한된다.
  - Phase 7에서 `concert-service` 제한적 smoke로 HPA가 1 -> 2 scale-out 이벤트를 만들 수 있음을 확인했다.
  - 

- [x] Readiness Probe와 Liveness Probe를 구성한다. `기능 동등 충족`
  - 목표 문구는 `/health/ready`, `/health`지만 현재 서비스 표준은 `/readyz`, `/healthz`다.

- [x] Helm Chart로 서비스 배포 설정을 관리한다.

- [x] Rolling Update 배포 전략을 구성한다.

- [ ] Rolling Update 중 트래픽 단절이 없음을 검증한다. `이번에 포함, 증거 필요`, `박명수`
  - 명수님이 준비한 rolling update 시나리오로 검증을 진행하고, 트래픽 단절이 없었다는 증거를 남긴다.

### 5.4 서비스 메시와 Canary

- [x] Istio를 클러스터에 설치한다.

- [x] 주요 backend 서비스에 Istio sidecar injection을 적용한다.

- [x] Kiali를 배포한다.

- [x] Envoy sidecar metric을 Prometheus로 수집하는 기반을 구성한다.
  - 2026-06-16 Phase 10A에서 Prometheus `up{job=~".*istio.*|.*envoy.*|.*sidecar.*"}` 조회 결과 `istiod`와 meshed backend sidecar scrape가 `up=1`임을 확인했다.
  - `istio_requests_total{destination_service_namespace=~"ticketing-.*"}`에서 reservation, notification, payment, ticket, concert service 요청 series가 조회됐다.

- [x] Grafana에서 gateway/mesh metric dashboard를 구성한다.

- [x] VirtualService와 DestinationRule으로 Canary manifest를 구성한다.
  - 2026-06-16 Phase 10C에서 stable, canary 20/50/100, rollback scenario가 Kustomize render와 AWS API server dry-run을 통과했다.

- [x] Canary 신규 버전 20% -> 50% -> 100% 전환을 실제 traffic ratio로 검증한다. `증거 필요`
  - 준비: canary v2 workload manifest는 Helm render/server dry-run을 통과했다.
  - 2026-06-16 `gitops` commit `72502d3`로 canary v2 values와 traffic scenario 준비 변경은 push했다.
  - 보류: ArgoCD가 최신 `72502d3`를 인식했는지 확인해야 하고, Kong은 mesh 밖에 있으므로 외부 Kong 요청이 VirtualService weight를 타는지 별도 확인이 필요하다. 먼저 mesh 내부 client에서 traffic ratio를 측정해야 한다.

- [x] DestinationRule에 circuit breaker 기반을 구성한다.
  - 2026-06-16 Phase 10A/10E에서 live reservation `DestinationRule`에 `connectionPool`과 `outlierDetection`이 존재함을 확인했다.
  - fault-delay, fault-5xx scenario는 Kustomize render와 AWS API server dry-run을 통과했다.

- [ ] Circuit breaker가 실제 장애 주입에서 동작함을 검증한다. `이번에 포함`, `증거 필요`, `박명수`
  - 주의: notification 장애 격리 검증은 Kafka 비동기 분리 검증이므로 이 항목의 근거로 사용하지 않는다.
  - 2026-06-16 Phase 10E에서 장애 주입 검증 절차는 준비했지만, 현재 reservation v2 endpoint가 live에 없고 v1 endpoint도 1개라 outlier ejection을 의미 있게 검증하기 어렵다.
  - 실제 검증은 reservation v1/v2 또는 동일 subset 최소 2개 이상의 healthy endpoint를 확보한 뒤 진행해야 한다.

- [ ] Istio를 기술 스택으로 선택한 이유와 근거를 작성한다. `이번에포함, 보류`, `박명수`
  - ADR을 하지 않기로 했다면 목표에서 제외하거나 Istio 선택을 기능 기준으로 인정해야 한다.

### 5.5 네트워크 정책과 복구

- [x] Kubernetes NetworkPolicy를 서비스별로 정의한다.

- [x] 외부 진입을 Kong 중심으로 제한하는 ingress 정책을 구성한다.

- [x] monitoring namespace의 metrics scrape 예외를 구성한다.

- [x] 의도하지 않은 통신이 차단됨을 debug pod로 검증한다. `DB/Kafka 접근 제어 기준 충족`
  - 2026-06-16 Phase 9B에서 AWS dev 기존 live 정책 기준 baseline은 수행했다.
  - Kong namespace -> 서비스 앱 포트 허용, 임의 namespace -> 서비스 앱 포트 차단은 확인했다.
  - 2026-06-17 private-dev 최신 DB/Kafka 정책 기준으로 임의 namespace debug pod와 service-label 테스트 Pod runtime 검증을 수행했다.
  - 결과: `docs/evidence/security/network-policy-block/README.md`

- [x] DB/Kafka 접근 제어 NetworkPolicy를 구성한다. `runtime 검증 완료`
  - 서비스 NetworkPolicy 외에 data/messaging 정책을 GitOps에 추가했다.
  - 2026-06-16 Phase 9에서 `gitops/platform/data/networkpolicies.yaml`을 추가하여 PostgreSQL, MongoDB, Kafka, pgAdmin 접근 제어 정책을 설계했다.
  - 2026-06-16 `gitops` commit `72502d3`로 `platform/data/networkpolicies.yaml`, `platform/data-private-dev/networkpolicies.yaml`, `platform/data-aws-dev-networkpolicies/networkpolicies.yaml`을 push했다.
  - 2026-06-17 private-dev `data-private-dev` Application 리소스 목록에서 DB/Kafka/pgAdmin NetworkPolicy 8개가 `Synced`로 확인됐다.
  - 2026-06-17 private-dev runtime test에서 reservation/payment/notification 역할 Pod가 자기 DB/Kafka에만 접근하고, 타 DB 접근은 timeout으로 차단됨을 확인했다.
  - 주의: `data-private-dev` Application 전체는 StatefulSet drift 때문에 `OutOfSync/Healthy`이며, NetworkPolicy 자체는 `Synced`다.

- [ ] Pod 강제 종료 장애 시나리오를 수행하고 Istio Retry를 확인한다. `이번에포함`, `증거 필요`, `박명수`

- [x] rollback manifest와 recovery runbook 기반을 작성한다.

- [ ] 실제 rollback 절차를 수행하고 rollback time을 측정한다. `증거 필요`, `박명수`

## 6. 00-GOAL: MSA, 관측성, DevSecOps

### 6.1 서비스 경계와 데이터

- [x] 도메인별 서비스를 분리한다.
  - auth, concert, reservation, payment, ticket, notification

- [x] 각 서비스가 독립적으로 배포될 수 있는 chart/value/Application 기반을 구성한다.

- [x] REST API와 Kafka 이벤트 기반 통신을 함께 설계한다.

- [x] 서비스별 독립 DB 기반을 구성한다.

- [x] 데이터 공유가 API 또는 이벤트를 통해서만 가능함을 NetworkPolicy/테스트로 검증한다. `증거 필요`, `박명수`

### 6.2 통신과 Gateway

- [x] Kubernetes ClusterIP + DNS 기반 서비스 디스커버리를 구성한다.

- [x] API Gateway 라우팅을 구성한다. `기능 동등 충족`
  - 목표 문구는 Spring Cloud Gateway/Nginx Ingress지만 현재 Kong Gateway가 기능 목적을 충족한다.

- [x] JWT 인증 필터 기능을 Gateway에 구성한다. `기능 동등 충족`

- [ ] 의존 서비스 다운 시 부분 응답 또는 graceful degradation을 검증한다. `증거 필요`, `박명수`

### 6.3 테스트와 관측성

- [x] 각 서비스 단위 테스트를 작성하고 CI에서 실행한다. `기능 동등 충족`
  - JUnit 대신 pytest.

- [x] Postman Collection으로 서비스 간 E2E 시나리오를 작성한다.
  - 현재 공연 티켓 happy path 기준.

- [x] Newman 실행 기반을 구성한다.

- [x] AWS dev에서 E2E 최신 성공 결과를 남긴다. `기능 동등 충족`
  - 근거: AWS dev Kong 경유 business happy path smoke 검증 결과를 확인했다.
  - 정확한 Newman XML report는 아직 아니지만, 같은 business happy path를 AWS dev Kong 경유 smoke로 검증했다.

- [x] Prometheus + Grafana로 에러율과 API 응답시간을 수집하는 기반을 구성한다.

### 6.4 배포 독립성과 가용성

- [x] 서비스별 독립 image publish 기반을 구성한다.

- [x] 서비스별 ArgoCD Application 기반을 구성한다.

- [제외] 한 서비스 배포가 다른 서비스에 영향을 주지 않음을 E2E로 검증한다. `증거 필요`

- [x] API Gateway와 Service Mesh의 역할 분리 기반을 구성한다.

- [x] PDB 리소스를 구성한다.

- [x] PDB로 각 서비스 최소 Pod 수 2개를 보장한다. 

### 6.5 DevSecOps

- [ ] SonarQube 정적 분석을 통합한다. `이번에포함`, `미충족`, `이석진`

- [x] code coverage가 몇%인지 측정해서 남기기. `이번에포함`, `부분 충족`, `최범휘`
  - coverage report 생성 기반은 있으나 80% gate 증거는 부족하다.
  - [Service Unit Test 증거](../../../../evidence/ci/service-unit-tests/README.md)

- [ ] Critical issue 발견 시 pipeline을 중단하고 PR comment를 게시한다. `이번에포함`, `미충족`, `이석진`

- [x] Trivy image scan을 구성한다.

- [x] Trivy Kubernetes manifest scan을 구성한다.

### 6.6 접근 제어

- [x] Kubernetes RBAC 역할 분리 기반을 구성한다.

- [x] 서비스별 ServiceAccount를 분리한다.

- [x] Role + RoleBinding 기반 최소 권한 구조를 구성한다.

- [x] ServiceAccount token automount를 기본 false로 둔다.

- [x] `kubectl auth can-i`로 역할별 권한을 검증한다. `증거 필요`, `박명수`

- [x] NetworkPolicy 차단 테스트를 검증한다. `증거 필요`, `박명수`

## 7. 00-GOAL: 성능 최적화, 트래픽 관리, 장애 대응

### 7.1 성능 측정

- [x] k6 기반 성능/합성 트래픽 실행 구조를 설계한다.

- [x] k6 synthetic runner를 GitOps로 배포할 수 있게 구성한다.

- [ ] 기준 성능 baseline을 측정한다. P99, P95, P50 응답시간, 최대 처리량, 에러율을 보고서를 자동으로 생성한다. `이번에포함`, `증거 필요`, `최범휘`
  - 부하테스트  티켓 오픈 시점, 평상시 피크치  1만 MAU, 동접자 100명

- [ ] aws에서 자동화 테스트 `synthetic`를 정기 실행한다. `이번에 포함`, `증거 필요`, `최범휘`
  - synthetic은 현재 주기적으로 실행중이므로, 그 결과를 보고서랑 스크린샷으로 남기기

- [ ] CPU, memory, network I/O 병목을 서비스별로 식별하고 개선 방향을 문서화한다. `이번에 포함` `증거 필요`, `최범휘`

### 7.2 오토스케일링

- [x] HPA 리소스 기반을 구성한다.

### 7.3 대시보드와 알림

- [x] 서비스 전용 custom metric 기반을 추가한다.
  - reservation, payment, ticket, notification metric 기반.

- [x] 성능 관점 dashboard와 리소스 관점 dashboard를 구성한다.

- [제외] 성능 임계치 초과 시 Alertmanager를 통해 Discord 알림을 발송한다. `불일치`, 
  - CPU 80% 초과, Mem 80% 초과

### 7.4 트래픽 제어

- [제외] 30일치 Prometheus metric을 분석하여 트래픽 패턴을 분류한다. `미충족`

- [제외] Scheduled vs Event-driven scaling 전략을 수립한다. `미충족`

- [x] Istio VirtualService로 traffic routing 정책 기반을 구성한다.
  - 2026-06-16 Phase 10C에서 traffic routing scenario render/server dry-run을 완료했다.

- [x] Canary routing manifest를 구성한다.
  - 2026-06-16 Phase 10C에서 20/50/100, rollback scenario와 canary v2 workload dry-run을 완료했다.

- [x] Gateway rate limiting 정책 기반을 구성한다.

- [x] rate limit 초과 시 429 응답을 실제로 검증한다.
  - 근거: 2026-06-16 Phase 8에서 AWS dev Kong 경유 `/concerts` 130회 연속 요청 결과 `119 x 200`, `11 x 429`가 반환됐다.
  - Prometheus query `kong_http_requests_total{code="429",source="kong"}`에서 `job="kong-kong-proxy"`, `endpoint="status"`, `route="ticketing-concert.concert-public-api.concert-service..8082"` series가 조회됐다.

### 7.5 장애 대응

- [x] Istio outlierDetection 기반 circuit breaker를 구성한다.
  - 2026-06-16 Phase 10E에서 live `DestinationRule`의 `connectionPool`/`outlierDetection`과 fault scenario dry-run을 확인했다.

- [ ] 장애 주입으로 circuit breaker와 graceful degradation을 검증한다. `증거 필요`, `박명수`
  - 주의: notification-service down 상태에서 core booking flow가 성공한 것은 비동기 장애 격리 근거다. Istio circuit breaker와 동기 의존성 graceful degradation은 별도 검증이 필요하다.
  - 준비: fault-delay/fault-5xx scenario와 circuit breaker 설정은 준비되어 있다.
  - 보류: outlierDetection ejection은 healthy endpoint 수가 충분해야 의미가 있으므로, 저사양 AWS dev의 replica 축소 상태에서는 운영급 표본으로 보지 않는다.

- [x] 장애 복구 Runbook 기반을 작성한다.

- [ ] Runbook을 실제 장애 시나리오로 검증한다. `증거 필요` `박명수` `이번에포함`
  - 장애 발생했을 때 탐지를  그라파나 대시보드로 확인하고, Runbook에 따라 대응 절차를 수행한 뒤 복구까지의 시간을 측정한다.

### 7.6 평가와 보고

- [ ] k6 튜닝 전후 P99, throughput, error rate 개선 수치를 비교한다. `이번에포함` `미충족`, `최범휘`
  - k6 부하 테스트를 튜닝하기 전과 후의 P99 응답시간, 최대 처리량, 에러율을 비교해서 개선 수치를 정량적으로 산출한다.

- [제외] traffic 관리 정책 전후 안정성을 비교한다. `미충족`

- [ ] SLA 준수율을 산출한다. `미충족`
  - SLA 기준을 한다고해서, AWS를 24시간 게속 사용하지 못했으므로  일일 10시간 기준 99.9% 준수율이 나오는지 산출한다.

- [ ] MTTR 개선 수치를 정량화한다. `미충족`
  - `Pod 강제 종료 장애 시나리오를 수행하고 Istio Retry를 확인한다.` 목표의 검증 결과를 기반으로, 장애 발생부터 복구까지의 시간을 측정해서 MTTR 개선 수치를 산출한다.

- [ ] 프로젝트 개선 보고서를 작성한다. `미충족`, `다음주에 작업하기`
  - 지난 기본 프로젝트 대비 어떠하게 개선됐는지, 어떤 부분이 부족한지, 다음 단계로 무엇을 할 수 있을지 등을 정리한 보고서를 작성한다.

- [x] 최적화 결과와 점진적 적용 가이드라인을 팀 위키에 공유한다.
  - 발표때 팀 문서 공유로 남기고 있다라고 설명만 하기

