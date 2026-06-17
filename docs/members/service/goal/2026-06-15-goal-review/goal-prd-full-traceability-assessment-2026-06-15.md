# GOAL / PRD 전체 추적 점검

작성일: 2026-06-15

## 1. 문서 목적

이 문서는 특정 기술 하나를 점검하는 문서가 아니다.

`00-GOAL.md`와 `01-prd.md`의 전체 목표를 기준으로 현재 `service`, `gitops`, `infra`, `workspace` 그리고 AWS dev 클러스터가 어디까지 준비되었는지 추적한다.

이전 점검에서 NetworkPolicy, Kong, monitoring 같은 특정 영역에 초점이 맞춰졌는데, 그 방식만으로는 목표 전체를 판단하기 어렵다. NetworkPolicy는 전체 목표 중 하나의 세부 항목일 뿐이다.

따라서 이 문서는 다음 질문에 답한다.

```text
전체 goal 중 무엇이 완료에 가까운가
무엇은 구현 기반만 있고 운영 증거가 없는가
무엇은 현재 서비스 방향과 목표 문구가 불일치하는가
무엇은 아직 거의 비어 있는가
다음 작업을 어떤 순서로 진행해야 전체 목표에 맞는가
```

## 2. 결론

현재 프로젝트는 특정 기술 한두 개만 진행된 상태는 아니다. 오히려 다음 기반은 꽤 넓게 들어가 있다.

```text
FastAPI 기반 마이크로서비스
OpenAPI 계약
서비스별 pytest
Dockerfile / image publish workflow
AWS ECR 기반 이미지 배포
Helm chart 기반 서비스 배포
ArgoCD Application 구조
Kong Gateway / JWT / role guard / rate limit 기반
Kafka 기반 예약/결제/티켓/알림 이벤트 흐름
서비스별 DB
Prometheus / Grafana / Loki / Tempo / OpenTelemetry Collector
ServiceMonitor / PodMonitor
Grafana logs / ops / DB / gateway / mesh dashboard
Trivy image/config scan
Istio / Kiali / VirtualService / DestinationRule 기반
NetworkPolicy / ServiceAccount / RBAC 기반
k6 synthetic runner 기반
Postman/Newman E2E collection
```

하지만 `00-GOAL.md`와 `01-prd.md`를 완전히 만족했다고 보기는 어렵다.

가장 큰 이유는 다음이다.

```text
목표 문서의 일부 스택이 현재 구현과 다르다.
  JUnit -> 현재 pytest
  KT Cloud Container Registry -> 현재 AWS ECR
  Spring Cloud Gateway/Nginx Ingress -> 현재 Kong
  ELK/Kibana/Logstash/Fluentd -> 현재 Loki/Tempo/Grafana/Collector
  Slack -> 현재 일부 Discord

구현 기반은 있으나 운영 증거가 부족한 항목이 많다.
  E2E 예매 성공 증거
  좌석 중복 0건 증거
  Kafka lag / ticket issue delay
  notification 장애 격리
  HPA scale-out
  canary 20/50/100 traffic ratio
  rollback time
  mTLS STRICT
  S3 artifact upload
  SLA/MTTR 보고
```

따라서 현재 상태는 다음 문장으로 정리하는 것이 가장 정확하다.

```text
프로젝트는 PRD 검증을 위한 구현 기반은 넓게 갖췄지만,
전체 goal을 완료 처리하려면 목표별 운영 증거와 불일치 정리가 아직 필요하다.
```

## 3. 판단 기준

이 문서의 상태 표기는 다음과 같다.

| 상태 | 의미 |
| --- | --- |
| 완료에 가까움 | 코드/manifest가 있고 클러스터 또는 테스트 증거도 일부 있다. 남은 것은 최신 증거 정리 수준이다. |
| 부분 충족 | 구현 기반은 있으나 운영 증거, 수치, 캡처, 실제 장애/부하 검증이 부족하다. |
| 불일치 | 목표 문구와 현재 구현 스택 또는 수치가 다르다. 목표를 고치거나 구현을 바꿔야 한다. |
| 미충족 | 구현 기반이나 검증 증거가 거의 없다. |
| 보류/결정 필요 | 할지 말지 결정이 먼저 필요하다. |

중요한 기준:

```text
manifest가 있다는 것만으로 완료가 아니다.
dashboard JSON이 있다는 것만으로 완료가 아니다.
ArgoCD Application이 있다는 것만으로 GitOps 완료가 아니다.
테스트 파일이 있다는 것만으로 PRD 검증 완료가 아니다.

완료라고 말하려면 실제 실행 결과, 클러스터 상태, API 응답, Prometheus/Grafana/Loki/Tempo 증거, 또는 보고서가 필요하다.
```

## 4. 01-PRD 핵심 목표 추적

### 4.1 좌석 중복 0건

PRD 요구:

```text
동시 예매 상황에서도 한 좌석에는 하나의 유효 티켓만 발행한다.
성공 지표: duplicate_ticket_count = 0, reservation_conflict_count
```

현재 근거:

```text
reservation-service에 seat_id 기반 active reservation 조회 로직이 있다.
reservation-service entity에 active_seat_key unique constraint가 있다.
reservation.conflict 예외와 reservation_conflicts_total metric이 있다.
concert-service에 seat map / seat inventory / public seat 조회 API가 있다.
Postman happy path가 좌석 선택 -> 예약 -> 결제 -> 티켓 -> 알림 흐름을 포함한다.
synthetic-e2e 문서에 available seat 분산 선택과 conflict retry 설계가 있다.
```

상태:

```text
부분 충족
```

부족한 증거:

```text
동일 좌석 동시 요청 테스트 결과
duplicate_ticket_count = 0 metric 또는 DB 검증 결과
reservation_conflict_count / reservation_conflicts_total 실제 수치
결제 완료 이후 ticket-service가 같은 seat에 티켓을 1개만 발행했다는 증거
```

다음 액션:

```text
1. 동일 showtime/seat에 동시 reservation 생성 테스트를 만든다.
2. 성공 1건, conflict N건이 나오는지 확인한다.
3. ticket table 또는 ticket API에서 같은 seat ticket이 1건인지 확인한다.
4. Prometheus에서 reservation_conflicts_total을 캡처한다.
```

### 4.2 후속 처리 분리

PRD 요구:

```text
예약 API와 티켓/알림 후속 처리를 Kafka 이벤트로 분리한다.
성공 지표: reservation_api_p95_ms, ticket_issue_delay_ms, kafka_consumer_lag
```

현재 근거:

```text
gitops/platform/data/kafka.yaml에 topic 생성 Job이 있다.
topic: reservation-created, reservation-expired, payment-approved, payment-failed, ticket-issued
reservation/payment/ticket/notification values에 Kafka bootstrap 설정이 있다.
ticket-service와 notification-service가 Kafka 이벤트를 consume하는 구조가 있다.
Postman happy path가 payment-approved 이후 ticket 발행과 notification 저장 polling을 포함한다.
AWS dev 클러스터에 kafka service/pod가 Running이다.
```

상태:

```text
부분 충족
```

부족한 증거:

```text
실제 AWS dev에서 예약 API 응답과 후속 ticket issue delay 측정
Kafka topic list / consumer group lag 캡처
ticket-issued 이벤트 발행 증거
notification consumer 처리 증거
```

다음 액션:

```text
1. AWS dev에서 happy path를 Kong 경유로 실행한다.
2. Kafka topic과 consumer group lag를 조회한다.
3. reservation created time, payment approved time, ticket issued time을 비교한다.
4. ticket_issue_delay_ms 또는 대체 지표를 dashboard에 연결한다.
```

### 4.3 장애 격리

PRD 요구:

```text
알림 장애가 결제 완료와 티켓 발행 흐름을 실패시키지 않는다.
성공 지표: core_flow_success_rate, notification_retry_count
```

현재 근거:

```text
notification-service는 별도 서비스와 별도 DB로 분리되어 있다.
notification은 Kafka event consumer로 후속 처리 흐름에 있다.
payment/ticket core flow와 notification 저장 흐름이 구조적으로 분리되어 있다.
```

상태:

```text
부분 충족에 가까운 미검증
```

부족한 증거:

```text
notification-service 장애 주입
notification-db 장애 주입
장애 중 payment approve와 ticket issue가 성공하는 증거
notification retry_count 또는 실패 로그
복구 후 지연 처리 증거
```

다음 액션:

```text
1. notification-service를 scale 0 하거나 fault를 주입한다.
2. 예약/결제/티켓 흐름을 실행한다.
3. ticket 발행 성공 여부를 확인한다.
4. notification 실패/재시도 metric과 로그를 캡처한다.
```

### 4.4 트래픽 폭발 대응

PRD 요구:

```text
HPA와 backpressure 관측으로 티켓 오픈 피크를 설명한다.
성공 지표: hpa_scale_out_seconds, p99_latency, 5xx_rate
```

현재 근거:

```text
Helm chart에 HPA template이 있다.
gitops/values/scenarios/aws/hpa.yaml이 있다.
k6 synthetic runner chart가 있다.
synthetic traffic image publish workflow가 있다.
workspace/docs/architecture/synthetic-e2e에 k6 설계 문서가 있다.
Prometheus/Grafana에서 request rate, p99, 5xx를 볼 기반이 있다.
```

현재 AWS dev 증거:

```text
HPA 리소스는 존재한다.
하지만 핵심 서비스 대부분이 min=1, max=1 상태다.
```

상태:

```text
부분 충족
```

부족한 증거:

```text
HPA maxReplicas 상향 적용
k6 부하 실행 결과
replica 증가 시점
p99 latency 변화
5xx rate 변화
backpressure 또는 rate limiting 효과
Before/After 표
```

다음 액션:

```text
1. HPA 검증용 scenario를 적용한다.
2. reservation 중심 k6 부하를 실행한다.
3. Prometheus에서 hpa_scale_out_seconds에 해당하는 증거를 만든다.
4. p99/5xx/throughput을 Before/After 표로 정리한다.
```

### 4.5 통신 보안과 배포 안정성

PRD 요구:

```text
Kong JWT, NetworkPolicy, Istio mTLS, canary/rollback을 검증한다.
성공 지표: mtls_enabled_services, traffic_split_ratio, rollback_time
```

현재 근거:

```text
Kong Gateway와 Kong shared resources가 ArgoCD에서 Synced/Healthy다.
Kong JWT, identity headers, role guard, rate limit plugin manifest가 있다.
서비스별 Ingress는 Kong class를 사용한다.
서비스별 NetworkPolicy가 실제 클러스터에 있다.
Calico가 있어 NetworkPolicy enforcement 기반이 있다.
Istio base, istiod, Kiali가 있다.
reservation VirtualService / DestinationRule / canary 20/50/100 / rollback manifest가 있다.
```

상태:

```text
부분 충족
```

부족한 증거:

```text
JWT 없는 요청 차단 증거
role guard 차단 증거
rate limit 429 증거
NetworkPolicy 허용/차단 runtime test
PeerAuthentication STRICT 또는 mTLS 증거
AuthorizationPolicy 증거
canary traffic_split_ratio 증거
rollback_time 측정
```

중요한 현재 gap:

```text
kubectl get peerauthentication,authorizationpolicy -A 결과가 비어 있다.
즉 Istio mTLS/authorization 목표는 아직 완료가 아니다.
```

다음 액션:

```text
1. Kong 인증/인가/rate limit smoke test를 먼저 실행한다.
2. NetworkPolicy runtime test를 실행한다.
3. mTLS 적용 범위를 정하고 PeerAuthentication을 추가한다.
4. canary 20/50/100 요청 분산을 반복 요청으로 측정한다.
5. rollback time을 기록한다.
```

### 4.6 운영 가시성

PRD 요구:

```text
metric, log, trace로 병목과 장애 원인을 찾을 수 있다.
성공 지표: alert_firing_time, trace_duration, 로그 추적 시간
```

현재 근거:

```text
서비스 공통 observability package가 request_id, trace_id, span_id를 로그에 포함한다.
Prometheus metrics package가 HTTP duration/count metric을 제공한다.
OpenTelemetry Collector, Loki, Tempo, Grafana가 배포되어 있다.
logs-10부터 logs-80까지 로그 dashboard가 있다.
ops dashboard, DB dashboard, gateway/mesh dashboard가 있다.
service-slo-alerts PrometheusRule과 Business KPI dashboard를 추가했다.
AWS dev에서 Prometheus rule API와 Grafana dashboard API 로드 증거가 있다.
```

상태:

```text
완료에 가까운 부분 충족
```

부족한 증거:

```text
Kong 경유 실제 요청 1건의 trace_id를 Loki와 Tempo에서 끝까지 추적한 최신 증거
장애를 일부러 발생시킨 뒤 alert_firing_time 측정
운영자가 로그/metric/trace로 원인을 찾는 데 걸린 시간
Alertmanager receiver 전송 증거
```

다음 액션:

```text
1. AWS dev에서 E2E 요청을 1건 실행한다.
2. response/log에서 request_id/trace_id를 확보한다.
3. Loki에서 trace_id로 검색한다.
4. Tempo에서 같은 trace를 조회한다.
5. 장애 1건을 발생시키고 alert firing까지 시간을 기록한다.
```

### 4.7 Object Storage 분리

PRD 요구:

```text
티켓 QR/PDF artifact를 S3에 저장해 app pod를 stateless하게 유지한다.
성공 지표: ticket_artifact_upload_success_rate, s3_object_count
```

현재 근거:

```text
ticket-service values에 S3_BUCKET 환경변수 흔적이 있다.
ticket-service는 별도 서비스로 분리되어 있다.
Postman happy path 설명에는 qrUrl/pdfUrl을 문자열 또는 null로 허용한다고 명시되어 있다.
```

상태:

```text
미충족에 가까운 부분 충족
```

부족한 증거:

```text
실제 S3 bucket 생성/권한/secret
ticket artifact upload 코드 경로 확인
ticket_artifact_upload_success_rate metric
S3 object count
발행된 티켓의 qrUrl/pdfUrl이 실제 S3 object를 가리키는 증거
```

다음 액션:

```text
1. ticket-service의 S3 연동 코드를 확인한다.
2. AWS dev S3 bucket/secret/IAM 권한을 확인한다.
3. 티켓 발행 후 S3 object 생성 여부를 확인한다.
4. metric과 dashboard를 연결한다.
```

## 5. 00-GOAL: 모니터링, 로깅, 운영 대응

### 5.1 지표 정의와 수집

요구:

```text
CPU, 메모리, 요청량, 에러율, 응답시간 수집 기준 문서화
Prometheus kube-prometheus-stack 배포
ServiceMonitor로 각 서비스 /metrics scrape
```

현재 근거:

```text
gitops/platform/monitoring
gitops/charts/medikong-service/templates/servicemonitor.yaml
service/packages/metrics
Prometheus/Grafana Running
ServiceMonitor 다수 존재
```

상태:

```text
완료에 가까움
```

남은 증거:

```text
Prometheus target up 최신 캡처
서비스별 /metrics query 결과
```

### 5.2 로그 수집과 처리

요구:

```text
JSON 로그
trace_id / span_id / request_id
Collector log pipeline
Loki 적재
민감 데이터 마스킹
불필요 속성 제거
batch / memory limit
Grafana log dashboard와 Tempo trace 연결
```

현재 근거:

```text
service/packages/observability
gitops/platform/observability/collector
gitops/platform/observability/loki
gitops/platform/observability/tempo
gitops/platform/monitoring/dashboards/logs
```

상태:

```text
부분 충족
```

완료에 가까운 부분:

```text
JSON 로그
trace_id/span_id/request_id
Collector -> Loki
Grafana log dashboard
trace 검색 dashboard
```

부족한 부분:

```text
민감 데이터 마스킹 검증
processor resource usage 측정
불필요 속성 제거 정책 검증
```

다음 액션:

```text
Collector processor 설정을 점검하고, 샘플 민감값이 Loki에 남지 않는지 테스트한다.
```

### 5.3 Grafana 대시보드

요구:

```text
로그 분석 dashboard
서비스 에러 로그 / 요청 흐름 / Tempo trace 연계
주문 처리량 / 결제 성공률 / 서비스별 응답시간 단일 운영 dashboard
threshold 색상
서비스 운영 / 인프라 / 로그 분석 관점 분리
5분 / 24시간 trend panel
```

현재 근거:

```text
logs-10 ~ logs-80 dashboard
ops 00 ~ 04 dashboard
db 10 ~ 40 dashboard
gateway/mesh dashboard
Business KPI dashboard 추가
Grafana API로 Business KPI dashboard 로드 확인
```

상태:

```text
완료에 가까운 부분 충족
```

부족한 증거:

```text
결제/예약/티켓 실제 트래픽이 dashboard에 표시되는 캡처
threshold 색상 변화가 실제로 보이는 캡처
Grafana sidecar가 ArgoCD desired state에서 지속적으로 로드하는지 확인
```

### 5.4 알림과 대응 기준

요구:

```text
에러율 5% 초과
P99 2초 초과
Pod CrashLoopBackOff
대응 프로세스 문서
Alertmanager 연동
Slack #ops-alert
severity warning/critical routing
알림 채널 이중화
```

현재 근거:

```text
system-kubernetes-alerts PrometheusRule
service-slo-alerts PrometheusRule 추가
Alertmanager Pod Running
incident/recovery runbook 일부 존재
```

상태:

```text
부분 충족
```

부족한 부분:

```text
Slack 연동 없음 또는 확인되지 않음
severity routing 증거 부족
테스트 alert 발송 증거 부족
CrashLoop alert firing 증거 부족
대응 프로세스 전체 문서 부족
```

다음 액션:

```text
1. Alertmanager receiver를 확인한다.
2. Slack을 쓸지 Discord를 인정할지 목표 기준을 정한다.
3. 테스트 alert를 firing시켜 알림 수신 증거를 남긴다.
```

### 5.5 운영 분석과 보고

요구:

```text
SLA 99.9%
반복 장애 패턴 2개
Kibana view
운영 보고서
```

현재 근거:

```text
runbook 일부
trouble 문서 일부
Loki/Grafana dashboard
```

상태:

```text
미충족
```

불일치:

```text
목표는 Kibana view를 말하지만 현재는 Loki/Grafana다.
```

다음 액션:

```text
1. Kibana를 실제로 할지, Grafana/Loki로 대체할지 목표 문서에서 정리한다.
2. SLA 산출 쿼리와 월간 가용성 계산식을 만든다.
3. 반복 장애 패턴 2개를 trouble 문서에서 골라 운영 보고서로 승격한다.
```

## 6. 00-GOAL: CI/CD, GitOps, 서비스 메시

### 6.1 파이프라인

요구:

```text
Jenkins vs GitHub Actions 선택 근거
GitHub Actions 단위 테스트 -> Docker build -> Registry push -> Kubernetes 배포
path filter
Slack #deploy-status 알림
```

현재 근거:

```text
service/.github/workflows/service-tests.yml
service/.github/workflows/image-publish.yml
gitops/.github/workflows/gitops-validate.yml
image-publish workflow의 paths-filter
ECR push
gitops values 이미지 태그 업데이트
Discord 배포 알림
```

상태:

```text
부분 충족 + 불일치
```

불일치:

```text
Slack이 아니라 Discord 알림이다.
Jenkins 비교/선택 ADR 또는 목표 정리 문서가 없다.
```

다음 액션:

```text
1. Slack이 필수면 GitHub Actions Slack webhook을 추가한다.
2. Discord를 인정하려면 00-GOAL의 알림 채널을 수정한다.
3. Jenkins 비교는 ADR을 안 하기로 했다면 목표에서 제외 또는 대체 근거를 문서화한다.
```

### 6.2 이미지와 보안 스캔

요구:

```text
멀티스테이지 Dockerfile
non-root appuser UID 1001
KT Cloud Container Registry
git-sha tag
Trivy HIGH/CRITICAL CVE push 차단
```

현재 근거:

```text
서비스별 Dockerfile
ECR image publish workflow
IMAGE_TAG github.sha
security-scan workflow
Trivy image scan
Trivy config scan
```

상태:

```text
부분 충족 + 불일치
```

불일치:

```text
KT Cloud Registry가 아니라 AWS ECR이다.
UID 1001이 아니라 UID 10001 계열이다.
Slack security report가 아니라 Discord 알림이다.
```

부족한 증거:

```text
HIGH/CRITICAL 발견 시 push가 실제로 차단되는 증거
최신 workflow 성공/실패 링크
```

다음 액션:

```text
1. UID 1001로 맞출지, non-root 고정 UID로 목표를 완화할지 정한다.
2. ECR을 공식 목표로 인정할지 정리한다.
3. Trivy 실패 조건과 push 차단 흐름을 실제 workflow 결과로 확인한다.
```

### 6.3 Kubernetes 배포

요구:

```text
Deployment + HPA CPU 70%, min 2, max 10
Readiness /health/ready, DB 연결 확인
Liveness /health
Helm Chart
Rolling Update
```

현재 근거:

```text
medikong-service Helm chart
Deployment, Service, Ingress, HPA, PDB, NetworkPolicy, ServiceMonitor template
aws-dev values
서비스별 ArgoCD Application
```

상태:

```text
부분 충족 + 수치 불일치
```

불일치:

```text
현재 공통 endpoint는 /healthz, /readyz, /metrics 기준이다.
목표 문서는 /health, /health/ready를 말한다.
현재 AWS dev 핵심 서비스 HPA maxPods는 대부분 1이다.
00-GOAL의 min 2 / max 10과 다르다.
aws-dev rollingUpdate는 replicas 1에서 maxSurge 0, maxUnavailable 1이라 무중단 증거로는 약하다.
```

다음 액션:

```text
1. health endpoint 목표 문구를 현재 서비스 표준에 맞춘다.
2. HPA goal scenario를 따로 만든다.
3. replicas 2 이상에서 rollout 무중단을 검증한다.
```

### 6.4 서비스 메시와 Canary

요구:

```text
Istio/Linkerd 비교
Istio 설치
sidecar 자동 주입
VirtualService/DestinationRule canary 20 -> 50 -> 100
Kiali topology
Envoy CPU/memory Prometheus 수집
DestinationRule circuit breaker
```

현재 근거:

```text
istio-base, istiod, Kiali app
concert/reservation/payment/ticket/notification sidecar injection 설정
reservation VirtualService/DestinationRule
canary 20/50/100/rollback manifests
fault delay / fault 5xx scenarios
PodMonitor ticketing-envoy-sidecars
gateway/mesh Grafana dashboard
```

상태:

```text
부분 충족
```

부족한 증거:

```text
Istio/Linkerd 비교는 목표에서 제외하거나 정리 필요
서비스 namespace 전체 자동 주입인지, 서비스별 주입인지 명확화 필요
Kiali topology 실제 traffic edge 증거
canary 실제 traffic ratio
circuit breaker outlier ejection 증거
Envoy CPU/memory dashboard 최신 캡처
```

다음 액션:

```text
1. Kiali/Prometheus에서 istio_requests_total을 확인한다.
2. reservation canary v2 workload를 실제로 배포한다.
3. 20/50/100 반복 요청으로 traffic ratio를 측정한다.
4. 실패 canary workload로 outlierDetection을 검증한다.
```

### 6.5 네트워크 정책과 복구

요구:

```text
NetworkPolicy로 namespace 내부 서비스 간 통신만 허용하고 외부 직접 접근 차단
Pod 강제 종료 장애 시나리오
Istio Retry 확인
ArgoCD 이전 Revision 또는 VirtualService 가중치 rollback runbook
```

현재 근거:

```text
서비스별 NetworkPolicy
Calico Running
Istio retry/timeout policy
rollback VirtualService manifest
incident-recovery-runbook
```

상태:

```text
부분 충족
```

부족한 증거:

```text
NetworkPolicy runtime 허용/차단 테스트
DB/Kafka NetworkPolicy
Pod kill 장애 주입
Retry metric/log 증거
Rollback runbook 실제 실행 기록
```

## 7. 00-GOAL: MSA, 관측성, DevSecOps

### 7.1 서비스 경계와 데이터

요구:

```text
이벤트 스토밍으로 도메인 경계 도출
REST vs 비동기 이벤트 기준 문서화
Database per Service
데이터 공유는 API 또는 이벤트만 허용
```

현재 근거:

```text
auth/concert/reservation/payment/ticket/notification 서비스 분리
OpenAPI 계약
Kafka 이벤트 계약
서비스별 DB service
architecture / phase 문서 일부
```

상태:

```text
부분 충족
```

부족한 증거:

```text
이벤트 스토밍 산출물
REST vs Kafka 적용 기준 명시 문서
서비스 간 DB 직접 접근 차단 증거
```

다음 액션:

```text
1. 서비스 경계 표를 작성한다.
2. 각 서비스의 소유 데이터와 외부 노출 API/event를 정리한다.
3. DB 직접 접근 금지를 NetworkPolicy 또는 테스트로 증명한다.
```

### 7.2 통신과 Gateway

요구:

```text
Kubernetes ClusterIP + DNS 서비스 디스커버리
Spring Cloud Gateway 또는 Nginx Ingress
JWT 인증 필터
의존 서비스 다운 시 부분 응답 반환 설계
```

현재 근거:

```text
Kubernetes Service DNS 사용
Kong Gateway 사용
Kong JWT plugin
role guard plugin
rate limit plugin
service discovery / gateway 문서 일부
```

상태:

```text
부분 충족 + 불일치
```

불일치:

```text
현재 Gateway는 Kong이다.
목표 문구의 Spring Cloud Gateway/Nginx Ingress와 다르다.
```

다음 액션:

```text
1. 목표 문서에서 Kong을 공식 Gateway로 인정한다.
2. Kong route/JWT/role/rate limit smoke 증거를 만든다.
3. 의존 서비스 다운 시 graceful degradation 시나리오를 작성하고 검증한다.
```

### 7.3 테스트와 관측성

요구:

```text
JUnit 단위 테스트
Postman E2E
Prometheus + Grafana 기본 observability
```

현재 근거:

```text
Python/FastAPI pytest
service/tests/Taskfile.yml
Postman collection 01~04
04-user-booking-happy-path
Newman runner
Prometheus/Grafana
```

상태:

```text
완료에 가까운 부분 충족 + 문구 불일치
```

불일치:

```text
JUnit이 아니라 pytest다.
Postman 문구는 환자 예약 예시가 남아 있지만 현재는 공연 티켓 happy path다.
```

다음 액션:

```text
1. 00-GOAL의 JUnit 문구를 pytest로 정리한다.
2. Postman E2E 설명을 공연 티켓 흐름으로 정리한다.
3. AWS dev Newman 실행 결과를 남긴다.
```

### 7.4 배포 독립성과 가용성

요구:

```text
서비스별 독립 배포
한 서비스 배포가 다른 서비스에 영향 없음을 E2E로 검증
Gateway와 Service Mesh 협업 구조 선택
PDB 최소 Pod 수 2
```

현재 근거:

```text
서비스별 image publish matrix
서비스별 ArgoCD Application
Helm chart PDB
Kong + Istio 역할 분리 문서
```

상태:

```text
부분 충족
```

부족한 증거:

```text
특정 서비스만 배포하고 E2E 영향 없음 검증
PDB minAvailable 2 적용 증거
replicas 2 이상 운영 증거
```

현재 불일치:

```text
aws-dev는 PDB minAvailable 1이다.
대부분 replicas 1이다.
```

### 7.5 DevSecOps

요구:

```text
SonarQube 정적 분석
coverage 80% gate
Critical issue pipeline block
PR comment
Trivy Kubernetes manifest scan
Slack security report
```

현재 근거:

```text
service security-scan workflow
gitops k8s-security-scan workflow
Trivy image/config scan
SARIF upload
Discord security scan notification
pytest coverage report 생성 기반
```

상태:

```text
부분 충족 + 미충족 혼재
```

완료에 가까운 부분:

```text
Trivy image scan
Trivy config scan
SARIF upload
```

미충족:

```text
SonarQube
coverage 80% gate
Critical issue PR comment
Slack security-report
```

다음 액션:

```text
1. SonarQube를 실제 요구로 유지할지 결정한다.
2. 유지한다면 workflow 추가가 필요하다.
3. 유지하지 않는다면 ruff/basedpyright/pytest coverage 같은 Python 대체 품질 gate로 목표를 고친다.
```

### 7.6 접근 제어

요구:

```text
Kubernetes RBAC 개발자/운영자/SRE 분리
서비스별 ServiceAccount
Role + RoleBinding
NetworkPolicy 차단 테스트
```

현재 근거:

```text
gitops/platform/policies/human-rbac.yaml
medikong-service chart의 ServiceAccount/Role/RoleBinding template
automountServiceAccountToken false 기본값
서비스별 NetworkPolicy
```

상태:

```text
부분 충족
```

부족한 증거:

```text
실제 계정/group binding 확인
권한별 kubectl auth can-i 결과
NetworkPolicy 차단 테스트
```

## 8. 00-GOAL: 성능 최적화, 트래픽 관리, 장애 대응

### 8.1 성능 측정

요구:

```text
k6 baseline
P99 응답시간
최대 처리량
에러율
tests/performance 코드 관리
CI 정기 실행
병목 분석 문서
```

현재 근거:

```text
gitops/platform/synthetic k6 runner
synthetic CronJob
synthetic image publish workflow
workspace/docs/architecture/synthetic-e2e/k6-architecture.md
logs-50-synthetic dashboard
```

상태:

```text
부분 충족
```

부족한 부분:

```text
tests/performance 디렉토리 기준 k6 baseline
정기 CI 실행 증거
최대 처리량 측정
병목 분석 문서
Before/After 표
```

다음 액션:

```text
1. synthetic runner와 PRD 성능 테스트의 관계를 정리한다.
2. baseline scenario를 고정한다.
3. 결과를 Prometheus/Grafana와 문서로 남긴다.
```

### 8.2 오토스케일링

요구:

```text
HPA CPU 기준 설정 후 동일 k6 시나리오로 scale-out 검증
scale-out response time 측정
```

현재 근거:

```text
HPA template과 HPA 리소스
aws hpa scenario
```

상태:

```text
부분 충족
```

부족한 증거:

```text
scale-out 실제 발생
replica count 변화
scale-out seconds
동일 부하 시나리오 전후 비교
```

### 8.3 성능 dashboard와 알림

요구:

```text
서비스 커스텀 지표
동시 접속자 수
처리량
도메인 핵심 지표
성능/리소스 dashboard
1초 간격 갱신
Alertmanager Slack 알림
```

현재 근거:

```text
reservations_total
reservation_conflicts_total
payments_total
tickets_issued_total
notifications_created_total
Business KPI dashboard
service runtime dashboard
pod/container resource dashboard
```

상태:

```text
부분 충족
```

부족한 부분:

```text
동시 접속자 수 metric
1초 refresh 검증
성능 알림 Slack 전송
실제 traffic 표시 캡처
```

### 8.4 트래픽 제어

요구:

```text
30일치 Prometheus metric 분석
시간대별/이벤트별 traffic pattern
Scheduled vs Event-driven scaling 전략
Istio VirtualService traffic routing
Canary
Rate limiting
```

현재 근거:

```text
Kong rate limit plugin
Istio VirtualService
canary scenarios
synthetic traffic 기반
```

상태:

```text
부분 충족
```

부족한 부분:

```text
30일치 metric 분석
traffic pattern 보고서
Scheduled/Event-driven scaling 전략
rate limit 429 실제 증거
canary 실제 분산 증거
```

### 8.5 장애 대응

요구:

```text
Circuit Breaker
Graceful Degradation
Alertmanager -> Slack #incident 자동 생성
장애 복구 Runbook
실제 장애 시나리오 검증
```

현재 근거:

```text
Istio DestinationRule outlierDetection
fault-delay / fault-5xx scenarios
incident-recovery-runbook
system/service PrometheusRule 기반
```

상태:

```text
부분 충족
```

부족한 부분:

```text
실패 endpoint ejection 증거
Graceful Degradation API 응답 증거
Slack #incident 자동 생성
장애 복구 runbook 실행 기록
MTTR 측정
```

### 8.6 평가와 보고

요구:

```text
튜닝 전후 k6 비교
P99/throughput/error 개선 수치
traffic 정책 전후 안정성 비교
SLA 준수율
MTTR 개선
운영 개선 보고서
팀 위키 공유
점진적 적용 가이드라인
```

현재 근거:

```text
일부 runbook과 troubleshooting 문서
synthetic/k6 설계 문서
```

상태:

```text
미충족
```

다음 액션:

```text
1. baseline을 먼저 만든다.
2. HPA/rate limit/canary/circuit breaker 중 하나씩 적용 전후를 비교한다.
3. 결과를 수치 표로 남긴다.
4. 최종 운영 개선 보고서로 묶는다.
```

## 9. 목표 문서와 현재 구현의 불일치 목록

### 9.1 반드시 정리해야 하는 불일치

| 목표 문구 | 현재 구현 | 판단 |
| --- | --- | --- |
| JUnit | pytest | 목표 문구 수정 필요 |
| KT Cloud Container Registry | AWS ECR | 목표 문구 수정 또는 registry 변경 필요 |
| Spring Cloud Gateway / Nginx Ingress | Kong Gateway | Kong을 공식 Gateway로 인정 필요 |
| Kibana / Elasticsearch / Logstash / Fluentd | Loki / Tempo / Grafana / OpenTelemetry Collector | 대체 인정 또는 ELK 추가 필요 |
| Slack 알림 | Discord 일부, Alertmanager receiver 미확인 | Slack 추가 또는 목표 수정 필요 |
| HPA min 2 / max 10 | aws-dev 대부분 min 1 / max 1 또는 3 | 검증용 scenario 필요 |
| PDB 최소 Pod 2 | aws-dev minAvailable 1 | 검증용 HA profile 필요 |
| `/health`, `/health/ready` | `/healthz`, `/readyz` | 목표 문구 수정 필요 |
| appuser UID 1001 | app UID 10001 계열 | UID 변경 또는 목표 완화 필요 |
| SonarQube | 확인되지 않음 | 도입 또는 제외 결정 필요 |

### 9.2 ADR을 안 한다면 어떻게 해야 하는가

사용자는 ADR을 하지 않아도 된다고 했다.

그렇다면 대체 방식은 다음이다.

```text
00-GOAL.md 자체를 현재 프로젝트 기준으로 업데이트한다.
또는 별도 traceability 문서에서 "대체 인정"을 명시한다.
```

ADR 없이도 괜찮지만, 아무 문서에도 남기지 않으면 다음 문제가 생긴다.

```text
구현은 Kong인데 목표는 Nginx/Spring Gateway라고 되어 있음
구현은 Loki인데 목표는 Kibana라고 되어 있음
구현은 AWS ECR인데 목표는 KT Cloud Registry라고 되어 있음
```

그러면 실제로 잘 구현해도 평가 시점에는 "목표와 다른 것을 했다"처럼 보일 수 있다.

따라서 ADR을 생략한다면, 최소한 `00-GOAL.md` 또는 이 추적 문서에서 대체 기준을 명확히 해야 한다.

## 10. 지금부터의 진행 방향

### Phase 1. 목표 정렬

목적:

```text
현재 구현과 목표 문구의 충돌을 없앤다.
```

작업:

```text
JUnit -> pytest
KT Registry -> AWS ECR
Spring/Nginx Gateway -> Kong
ELK/Kibana -> Loki/Tempo/Grafana
Slack -> Slack 추가 또는 Discord 대체 인정
health endpoint 문구 정리
HPA/PDB 수치는 aws-dev 기본값과 검증용 scenario로 분리
```

완료 기준:

```text
목표 문서를 읽었을 때 현재 프로젝트가 왜 이 스택을 쓰는지 모순이 없다.
```

### Phase 2. GitOps drift 정리

목적:

```text
검증 전에 클러스터 상태와 Git desired state를 맞춘다.
```

현재 문제:

```text
핵심 서비스 ArgoCD Application이 OutOfSync다.
```

작업:

```text
auth/concert/reservation/payment/ticket/notification diff 확인
istio-base/istiod diff 확인
의도한 drift는 Git에 반영
임시 drift는 ArgoCD sync로 정리
```

완료 기준:

```text
핵심 API 서비스가 Synced Healthy 상태다.
```

### Phase 3. 핵심 예매 E2E 증거

목적:

```text
PRD의 중심 흐름을 먼저 증명한다.
```

작업:

```text
Kong 경유 login
공연/회차/좌석 조회
좌석 예약
mock payment approve
ticket 발행 확인
notification 저장 확인
trace_id로 Loki/Tempo 추적
```

완료 기준:

```text
한 번의 예매 흐름이 API, DB/Kafka, metric, log, trace에서 모두 연결된다.
```

### Phase 4. 좌석 정합성과 장애 격리

목적:

```text
PRD의 비즈니스 핵심을 닫는다.
```

작업:

```text
동일 좌석 동시 예약 테스트
duplicate ticket 0 검증
reservation conflict metric 확인
notification 장애 주입
core flow success 확인
```

완료 기준:

```text
좌석 중복 0건과 알림 장애 격리 증거가 있다.
```

### Phase 5. 운영 검증

목적:

```text
Cloud-native 운영 프로젝트라는 성격을 증명한다.
```

작업:

```text
HPA scale-out
rate limit 429
canary 20/50/100
rollback time
circuit breaker
mTLS
NetworkPolicy runtime test
```

완료 기준:

```text
운영 시나리오가 수치와 캡처로 남는다.
```

### Phase 6. 보고서화

목적:

```text
최종 발표/평가에서 보여줄 산출물을 만든다.
```

작업:

```text
SLA 산출
MTTR 기록
Before/After 성능 표
장애 패턴 2개
운영 개선 보고서
```

완료 기준:

```text
목표별 증거와 수치가 하나의 최종 보고서로 이어진다.
```

## 11. 최종 판단

이번에 봐야 하는 핵심은 NetworkPolicy가 아니다.

NetworkPolicy는 다음 큰 목표의 일부일 뿐이다.

```text
통신 보안과 배포 안정성
접근 제어
트래픽 관리
장애 대응
```

전체 목표 관점에서 보면 지금 가장 중요한 일은 다음이다.

```text
1. 목표 문구와 현재 구현의 불일치를 정리한다.
2. ArgoCD OutOfSync를 정리한다.
3. 핵심 예매 E2E를 AWS dev에서 증명한다.
4. 좌석 중복 0건과 Kafka 후속 처리 분리를 증명한다.
5. 그 다음 HPA, canary, mTLS, NetworkPolicy, alert, SLA/MTTR을 닫는다.
```

즉, 진행 순서는 "NetworkPolicy부터 완성"이 아니라 다음이 맞다.

```text
목표 정렬
-> GitOps 상태 정리
-> 핵심 예매 흐름 증명
-> 좌석 정합성/장애 격리 증명
-> 운영 보안/트래픽/알림 검증
-> SLA/MTTR/최종 보고서
```
