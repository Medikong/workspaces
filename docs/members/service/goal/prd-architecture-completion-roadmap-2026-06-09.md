# PRD와 서비스 아키텍처 목표 달성 로드맵

## 문서 목적

`docs/project_docs/01-prd.md`와 `docs/project_docs/02-service-architecture.md`의 목표를 현재 구현 상태와 비교하고, 목표 달성을 위해 어떤 순서로 task를 진행해야 하는지 정리한다.

이 문서는 기능 목록이 아니라 "최종적으로 무엇을 증명해야 하는가"를 기준으로 한다. PRD의 핵심 질문은 다음 하나로 압축된다.

```text
티켓 오픈 중 트래픽이 급증해도 핵심 예매 흐름을 유지하고,
좌석 정합성을 보장하며,
운영자가 지표와 로그로 상태를 판단할 수 있는가?
```

따라서 완료 기준은 단순히 코드가 존재하는 것이 아니라, 테스트 결과, 로그, 메트릭, 대시보드, Kubernetes 상태, ArgoCD sync, 장애 주입 결과 같은 증거가 남는 것이다.

## 현재 상황 요약

### 레포 상태

현재 기준:

- `gitops`: `main...origin/main`, clean
- `service`: `main...origin/main`, 기존 개인 로컬 변경 `.gitignore` 있음
- `workspace`: `main...origin/main`, 기존 개인 로컬 변경 `.gitignore` 있음

따라서 새 기능 브랜치를 바로 파기 전에, 지금은 목표 달성 계획과 검증 순서를 정리하기 좋은 상태다.

### 구현 기반이 있는 것

| 영역 | 현재 상태 |
| --- | --- |
| 서비스 | `auth`, `concert`, `reservation`, `payment`, `ticket`, `notification` 서비스가 있다. |
| API 계약 | `service/contracts/services/*/openapi.yaml`에 서비스별 OpenAPI 계약이 있다. |
| 운영 endpoint | `/healthz`, `/readyz`, `/metrics` 공통 처리와 테스트가 있다. |
| Kafka 이벤트 | 예약/결제/티켓/알림 이벤트 계약과 producer/consumer 코드가 있다. |
| Kong | JWT, role guard, identity header, rate limit, correlation id, prometheus plugin이 있다. |
| GitOps/Helm | 공통 Helm chart에 Deployment, Service, Ingress, HPA, PDB, ServiceMonitor, NetworkPolicy, ServiceAccount/RBAC 템플릿이 있다. |
| Istio | istio-base, istiod, Kiali, sidecar injection, reservation VirtualService/DestinationRule이 있다. |
| Canary | reservation-service 기준 v1/v2 subset과 20/50/100/rollback scenario manifest가 있다. |
| Circuit Breaker | DestinationRule connectionPool/outlierDetection, VirtualService retry/timeout, fault scenario가 있다. |
| Observability 기반 | Prometheus/Grafana, Loki, Tempo, OpenTelemetry Collector 경로가 있다. |
| CI/CD | service test, image build/publish, ECR push, GitOps values update workflow가 있다. |
| 보안 기반 | Trivy config scan, RBAC/ServiceAccount, NetworkPolicy 기반이 있다. |

### 아직 부족한 것

| 영역 | 부족한 점 |
| --- | --- |
| 정상 예매 E2E | AWS dev 또는 local Kubernetes에서 Login -> Concert -> Reservation -> Payment -> Kafka -> Ticket -> Notification까지 끝까지 성공한 증거가 필요하다. |
| 좌석 중복 방지 | 동시 예약 k6/pytest 결과와 DB 최종 상태 증거가 필요하다. |
| Kafka 후속 처리 | topic, consumer group, consumer lag, ticket issued, notification 저장 증거가 필요하다. |
| S3 artifact | QR/PDF 업로드가 실제 S3 또는 mock S3 기준으로 성공하는지 확인이 필요하다. |
| Kong smoke | JWT/role guard/rate limit/request id가 실제 요청에서 동작하는 증거가 필요하다. |
| Kiali/Prometheus | 실제 traffic을 만든 뒤 topology와 `istio_requests_total` query 증거가 필요하다. |
| Canary | v1/v2 traffic split 비율과 rollback 증거가 필요하다. |
| Circuit Breaker | fault delay/5xx, retry/timeout, rollback, 실제 endpoint ejection 증거가 필요하다. |
| HPA | 요구 목표 수치와 현재 설정을 맞추고, k6 부하로 scale-out 증거가 필요하다. |
| Grafana dashboard | 운영/성능/인프라 dashboard와 threshold 캡처가 필요하다. |
| Alertmanager | Slack 알림, severity routing, 테스트 알림 증거가 필요하다. |
| 보안 | SonarQube, image CVE scan gate, 보안 리포트 Slack은 아직 부족하다. |

## PRD 목표별 달성 방법

## 1. 좌석 중복 0건

### PRD 목표

동시 예매 상황에서도 한 좌석에는 하나의 유효 티켓만 발행한다.

성공 지표:

```text
duplicate_ticket_count = 0
reservation_conflict_count
```

### 현재 상태

서비스 아키텍처는 DB transaction과 unique constraint를 1차 전략으로 둔다. `reservation-service`가 좌석 점유 상태를 책임지고, 동일 좌석 동시 요청 중 하나만 성공하고 나머지는 `409 Conflict`가 되어야 한다.

### 해야 할 일

1. reservation DB schema에서 active reservation 또는 seat lock unique constraint를 확인한다.
2. 동일 `concertId/showtimeId/seatId`에 대해 동시 예약 요청을 보내는 테스트를 작성한다.
3. 성공 1건, conflict N-1건을 확인한다.
4. 결제 승인 후 ticket-service에 중복 티켓이 생기지 않는지 DB와 API로 확인한다.
5. 결과를 `duplicate_ticket_count = 0` 증거로 남긴다.

### 완료 증거

- k6 또는 pytest concurrency 결과
- `409 Conflict` 응답 수
- reservation DB 최종 상태
- ticket DB 최종 상태
- 중복 티켓 0건 캡처 또는 쿼리 결과

## 2. Kafka 후속 처리 분리

### PRD 목표

예약 API와 티켓/알림 후속 처리를 Kafka 이벤트로 분리한다.

성공 지표:

```text
reservation_api_p95_ms
ticket_issue_delay_ms
kafka_consumer_lag
```

### 현재 상태

현재 코드에는 다음 흐름이 있다.

```text
reservation-service
  -> reservation-created
  -> reservation-expired

payment-service
  -> payment-approved
  -> payment-failed

ticket-service
  <- payment-approved
  -> ticket-issued

notification-service
  <- reservation-created
  <- reservation-expired
  <- payment-approved
  <- payment-failed
  <- ticket-issued
```

즉 코드 기반은 있다. 부족한 것은 실제 운영 환경에서 topic, consumer group, lag, 처리 로그를 확인하는 것이다.

### 해야 할 일

1. Kafka pod와 service가 살아 있는지 확인한다.
2. 필수 topic을 확인한다.
3. consumer group `ticket-service`, `notification-service`를 확인한다.
4. Kong 또는 service 내부 경로로 결제를 승인한다.
5. `payment-approved`가 발행되는지 payment-service 로그로 확인한다.
6. ticket-service가 이벤트를 consume하고 티켓을 발행하는지 확인한다.
7. ticket-service가 `ticket-issued`를 발행하는지 확인한다.
8. notification-service가 결제/티켓 이벤트를 consume하고 알림을 저장하는지 확인한다.
9. consumer lag와 처리 지연을 Prometheus 또는 Kafka CLI로 기록한다.

### 완료 증거

- Kafka topic 목록
- Kafka consumer group 목록과 lag
- payment API 응답
- ticket-service consume 로그
- ticket API 조회 결과
- notification API 조회 결과
- correlationId가 연결된 로그

## 3. 장애 격리

### PRD 목표

알림 장애가 결제 완료와 티켓 발행 흐름을 실패시키지 않는다.

성공 지표:

```text
core_flow_success_rate
notification_retry_count
```

### 현재 상태

아키텍처는 notification을 Kafka consumer로 분리한다. 따라서 notification-service가 느리거나 장애가 나도 payment-service의 API 응답과 ticket-service의 티켓 발행은 분리되어야 한다.

### 해야 할 일

1. 정상 예매 E2E를 먼저 성공시킨다.
2. notification-service를 scale down 또는 장애 상태로 만든다.
3. 예약과 결제를 다시 수행한다.
4. payment-service와 ticket-service가 정상 흐름을 유지하는지 확인한다.
5. notification-service 복구 후 lag 또는 미처리 이벤트가 처리되는지 확인한다.

### 완료 증거

- notification 장애 전후 API 성공률
- ticket 발행 성공 여부
- notification consumer lag 변화
- notification 복구 후 처리 로그
- core flow success rate

## 4. 트래픽 폭발 대응

### PRD 목표

HPA와 backpressure 관측으로 티켓 오픈 피크를 설명한다.

성공 지표:

```text
hpa_scale_out_seconds
p99_latency
5xx_rate
```

### 현재 상태

Helm chart에 HPA 템플릿이 있고 AWS scenario values가 있다. 다만 `00-GOAL.md`의 기준은 CPU 70%, min 2, max 10인데 현재 HPA scenario는 CPU 60%, min 2, max 4로 보인다.

### 해야 할 일

1. HPA 목표 수치를 PRD/GOAL 기준으로 맞출지 결정한다.
2. `tests/performance/`에 k6 스크립트를 둔다.
3. 기준 부하를 먼저 측정한다.
4. HPA 적용 후 같은 부하를 다시 측정한다.
5. replica 증가 시점, P99, 5xx rate를 비교한다.
6. Grafana에 Before/After 캡처를 남긴다.

### 완료 증거

- k6 report
- `kubectl describe hpa`
- deployment replica 변화
- Grafana latency/error dashboard
- Before/After 표

## 5. 통신 보안과 배포 안정성

### PRD 목표

Kong JWT, NetworkPolicy, Istio mTLS, canary/rollback을 검증한다.

성공 지표:

```text
mtls_enabled_services
traffic_split_ratio
rollback_time
```

### 현재 상태

Kong과 Istio는 역할 분리 구조로 구현되어 있다.

```text
Client
  -> Kong
  -> Kubernetes Service
  -> Istio sidecar가 붙은 service Pod
```

Kong은 외부 요청의 인증/인가/rate limit을 담당하고, Istio는 내부 service-to-service traffic policy를 담당한다.

### 해야 할 일

1. Kong 경유 `/auth/login`을 성공시킨다.
2. CUSTOMER/PROVIDER/ADMIN role guard를 검증한다.
3. rate limit 429를 확인한다.
4. NetworkPolicy 적용 후 허용/차단 통신을 검증한다.
5. Kiali에서 sidecar가 붙은 서비스 topology를 확인한다.
6. reservation-service canary v2 workload를 켠다.
7. VirtualService weight를 20 -> 50 -> 100으로 바꾼다.
8. Prometheus/Kiali에서 traffic split을 확인한다.
9. rollback manifest로 v1 100% 복구를 확인한다.
10. mTLS STRICT는 Kong 경로 영향 분석 후 단계 적용한다.

### 완료 증거

- Kong 200/401/403/429 응답
- NetworkPolicy allow/deny 테스트
- Kiali topology 캡처
- Prometheus `istio_requests_total` query
- canary 20/50/100 traffic ratio
- rollback time 기록
- mTLS 적용 범위와 예외 문서

## 6. 운영 가시성

### PRD 목표

metric, log, trace로 병목과 장애 원인을 찾을 수 있다.

성공 지표:

```text
alert_firing_time
trace_duration
로그 추적 시간
```

### 현재 상태

Prometheus/Grafana, Loki, Tempo, OpenTelemetry Collector 구성 경로가 있다. 하지만 실제 dashboard, alert, trace/log 추적 증거가 부족하다.

### 해야 할 일

1. 서비스별 `/metrics`가 Prometheus target에 잡히는지 확인한다.
2. Grafana dashboard를 운영/성능/인프라 관점으로 나눈다.
3. Loki에서 `request_id` 또는 `correlationId`로 로그를 찾는다.
4. Tempo trace가 연결되는지 확인한다.
5. 실패 또는 지연 요청 1건을 만들고 3분 이내 추적하는 runbook을 수행한다.
6. Alertmanager rule과 Slack 알림을 붙인다.

### 완료 증거

- Prometheus target 목록
- Grafana dashboard 캡처
- Loki query 결과
- Tempo trace id 또는 캡처
- Alertmanager firing/resolved
- 3분 이내 조사 절차 기록

## 7. Object Storage 분리

### PRD 목표

티켓 QR/PDF artifact를 S3에 저장해 app pod를 stateless하게 유지한다.

성공 지표:

```text
ticket_artifact_upload_success_rate
s3_object_count
```

### 현재 상태

ticket-service에는 QR/PDF 업로드 흐름이 있다. GitOps values에는 S3 관련 환경변수가 있다. 다만 실제 AWS S3 권한, bucket, mock 여부가 명확히 검증되어야 한다.

### 해야 할 일

1. S3 bucket 이름과 접근 방식을 확정한다.
2. ticket-service의 AWS credential 주입 방식을 정한다.
3. 실제 S3 또는 local/mock S3 중 하나로 테스트 기준을 정한다.
4. 티켓 발행 후 QR/PDF key가 DB에 저장되는지 확인한다.
5. S3 object count와 업로드 성공률을 기록한다.

### 완료 증거

- ticket API 응답
- ticket DB `qr_url`, `pdf_url` 또는 key
- S3 object 목록
- 실패 시 재시도 또는 오류 처리 로그

## 목표 달성을 위한 전체 작업 흐름

## Phase 1. 기준선 재정렬

목표:

현재 문서, 코드, GitOps가 같은 목표를 바라보도록 맞춘다.

Task:

1. `01-prd.md`, `02-service-architecture.md`, `00-GOAL.md`의 용어 차이를 정리한다.
2. JUnit 같은 Java 전제 문구를 Python/pytest 기준으로 바꿀지 결정한다.
3. HPA 수치, Docker UID, logging stack 같은 요구사항 불일치를 목록화한다.
4. EFK/Logstash를 추가할지 Loki/Tempo로 대체할지 ADR 초안을 작성한다.
5. 현재 구현된 항목과 증거가 부족한 항목을 체크리스트로 고정한다.

완료 기준:

- 팀이 "완료는 증거 기준"이라는 원칙에 합의한다.
- 대체할 요구사항은 ADR 후보로 분리된다.

## Phase 2. AWS dev 상태 복구와 배포 상태 확인

목표:

검증을 시작할 수 있는 클러스터 상태를 만든다.

Task:

1. SSH known_hosts 문제를 정리하고 control plane 접속을 복구한다.
2. `kubectl get applications -n argocd`로 ArgoCD 상태를 확인한다.
3. 모든 service Pod가 `Running`인지 확인한다.
4. DB, Kafka, MongoDB, S3 관련 endpoint와 secret을 확인한다.
5. Kong external URL을 확인한다.
6. Kiali, Prometheus, Grafana 접근 방식을 확인한다.

완료 기준:

- 주요 서비스가 API 호출 가능한 상태다.
- Kafka topic과 consumer group을 조회할 수 있다.
- Kong, Kiali, Prometheus 접근 경로가 확보된다.

## Phase 3. 정상 예매 E2E 완성

목표:

PRD의 모든 운영 검증의 출발점인 정상 예매 흐름을 끝까지 연결한다.

Task:

1. `/auth/login`으로 CUSTOMER token을 발급한다.
2. `/concerts`와 `/performances/{id}/seats`를 조회한다.
3. `/reservations`로 좌석을 예약한다.
4. `/payments`로 결제 승인 mock을 수행한다.
5. Kafka `payment-approved` 발행을 확인한다.
6. ticket-service가 티켓을 발행하는지 확인한다.
7. notification-service가 알림을 저장하는지 확인한다.
8. `/tickets/me`, `/notifications` 조회로 결과를 확인한다.
9. Newman collection 또는 shell script로 반복 가능한 형태로 만든다.

완료 기준:

- Login -> Concert -> Reservation -> Payment -> Kafka -> Ticket -> Notification이 한 번에 성공한다.
- 동일 절차를 다른 사람이 재현할 수 있다.

## Phase 4. 정합성과 비동기 처리 검증

목표:

좌석 중복 0건과 Kafka 후속 처리 분리를 증명한다.

Task:

1. 동일 좌석 동시 예약 테스트를 작성한다.
2. 성공 1건, conflict N-1건을 확인한다.
3. 중복 티켓 0건을 DB/API로 확인한다.
4. 결제 승인 이후 ticket issue delay를 측정한다.
5. Kafka consumer lag를 측정한다.
6. notification 장애를 주입하고 core flow가 유지되는지 확인한다.

완료 기준:

- 중복 티켓 0건 증거가 있다.
- Kafka consumer lag와 ticket issue delay 증거가 있다.
- notification 장애가 핵심 흐름을 깨지 않는다는 증거가 있다.

## Phase 5. Kong과 서비스 메시 검증

목표:

외부 진입 정책과 내부 traffic policy를 분리해서 증명한다.

Task:

1. Kong JWT 인증 성공/실패를 확인한다.
2. role guard 401/403/200을 확인한다.
3. rate limit 429를 확인한다.
4. mesh 내부 client에서 reservation-service를 호출한다.
5. Kiali topology를 확인한다.
6. Prometheus에서 Istio metric을 확인한다.
7. canary 20/50/100을 적용하고 traffic split을 확인한다.
8. rollback 시간을 측정한다.
9. fault delay/5xx로 retry/timeout을 확인한다.
10. 실제 ejection 검증은 실패 canary workload 또는 실패 endpoint를 준비해서 수행한다.

완료 기준:

- Kong 정책 증거가 있다.
- Kiali/Prometheus mesh traffic 증거가 있다.
- Canary와 rollback 증거가 있다.
- Circuit Breaker 1차 증거가 있다.

## Phase 6. 부하, HPA, 운영 가시성 검증

목표:

티켓 오픈 피크를 수치로 설명한다.

Task:

1. k6 baseline script를 작성한다.
2. 기준 부하에서 P95/P99, 5xx, 처리량을 측정한다.
3. HPA 적용 후 같은 부하를 다시 수행한다.
4. replica 증가 시간과 latency 변화를 기록한다.
5. Grafana dashboard에 성능/리소스/업무 지표를 구성한다.
6. Alertmanager rule과 Slack 테스트 알림을 구성한다.
7. 장애 1건을 metric/log/trace로 3분 이내 추적한다.

완료 기준:

- k6 report가 있다.
- HPA scale-out 증거가 있다.
- Grafana dashboard 캡처가 있다.
- Alertmanager 테스트 알림 증거가 있다.
- Loki/Tempo/Prometheus를 연결한 장애 추적 기록이 있다.

## Phase 7. 보안과 운영 보고 정리

목표:

DevSecOps와 운영 대응 요구사항을 최종 산출물로 연결한다.

Task:

1. Trivy config scan 결과를 정리한다.
2. 이미지 CVE scan gate를 추가할지 결정한다.
3. SonarQube 또는 대체 정적 분석 범위를 정한다.
4. NetworkPolicy allow/deny 테스트를 수행한다.
5. RBAC 권한 분리 테스트를 수행한다.
6. SLA 99.9% 산출 기준을 정한다.
7. MTTR 측정 시나리오를 수행한다.
8. 운영 보고서와 Runbook을 정리한다.

완료 기준:

- 보안 스캔 결과가 있다.
- NetworkPolicy/RBAC 테스트 증거가 있다.
- SLA/MTTR 계산 기준과 결과가 있다.
- 장애 대응 Runbook이 실제 시나리오와 연결된다.

## 바로 다음 task

지금 바로 다음 task는 새 기능 구현이 아니라 `AWS dev 상태 확인과 정상 예매 E2E 시작점 복구`다.

이유:

- PRD의 모든 핵심 검증은 정상 예매 E2E가 선행되어야 한다.
- Canary, Circuit Breaker, Kiali, Prometheus도 실제 traffic이 없으면 증거가 나오지 않는다.
- Kafka 이벤트 흐름도 DB/Kafka/service Pod가 정상이어야 검증할 수 있다.

### 다음 task 1. AWS dev 접속과 ArgoCD 상태 확인

실행:

```bash
ssh-keygen -R 13.125.191.132
ssh -i ~/.ssh/k8s-key ubuntu@13.125.191.132
kubectl get applications -n argocd
kubectl get pods -A
kubectl get svc -A
kubectl get endpoints -A
```

확인:

- ArgoCD Application 상태
- 서비스 Pod Running 여부
- DB/Kafka endpoint 여부
- Kong endpoint 여부

### 다음 task 2. Kong smoke test

실행:

```bash
curl -sS -X POST "$KONG_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com","password":"customer1234"}'
```

확인:

- access token 발급
- 보호 API 200
- 토큰 없음 401
- 잘못된 role 403
- rate limit 429

### 다음 task 3. 정상 예매 E2E 1회 성공

실행 흐름:

```text
Login
-> Concert 조회
-> Seat 조회
-> Reservation 생성
-> Payment 승인
-> Kafka payment-approved 확인
-> Ticket 발행 확인
-> Notification 저장 확인
```

완료 기준:

- 티켓 1건이 발행된다.
- 알림 1건 이상이 저장된다.
- 각 단계의 요청/응답과 로그가 문서에 남는다.

## 최종 완성 흐름

전체 완성은 다음 순서로 가는 것이 가장 안전하다.

```text
1. AWS dev 상태 확인
2. Kong smoke test
3. 정상 예매 E2E
4. 좌석 중복 0건 검증
5. Kafka 후속 처리 지연과 consumer lag 측정
6. notification 장애 격리 검증
7. Kiali/Prometheus mesh traffic 확인
8. Canary 20/50/100과 rollback 검증
9. Circuit Breaker fault/retry/timeout/ejection 검증
10. k6 피크 부하와 HPA scale-out 검증
11. Grafana/Alertmanager/Loki/Tempo 운영 증거 정리
12. NetworkPolicy/RBAC/보안 스캔 증거 정리
13. SLA/MTTR/운영 보고서 작성
14. 최종 증거 색인과 발표 자료 정리
```

## 가장 중요한 판단

현재 프로젝트는 "기능 구현이 전혀 안 된 상태"가 아니다. 오히려 서비스, Kafka, Kong, GitOps, Istio 기반은 꽤 많이 있다.

문제는 PRD가 요구하는 것이 코드 존재가 아니라 운영 검증 증거라는 점이다.

따라서 앞으로의 작업은 다음 순서여야 한다.

```text
이미 있는 구조를 실제 환경에서 실행한다
-> 요청과 이벤트가 끝까지 흐르는지 확인한다
-> 장애와 부하를 넣는다
-> metric/log/trace/dashboard로 설명한다
-> 결과를 문서와 캡처로 고정한다
```

이 순서를 지키면 PRD와 서비스 아키텍처의 목표를 기능 구현이 아니라 운영 검증 프로젝트로 완성할 수 있다.
