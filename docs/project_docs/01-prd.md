# 01. PRD

## 프로젝트 한 줄 정의

인기 공연 티켓 오픈 순간 예매 요청이 폭주해도, 좌석 중복 발행을 막고 결제·티켓 발행·알림 장애를 격리하며 관측 가능한 방식으로 안정적으로 예매를 처리하는 클라우드 네이티브 운영 검증 프로젝트다.

## 핵심 검증 질문

> 티켓 오픈 중 트래픽이 급증해도 핵심 예매 흐름을 유지하고, 좌석 정합성을 보장하며, 운영자가 지표와 로그로 상태를 판단할 수 있는가?

## 왜 공연 티켓 예매인가

공연 티켓 예매는 특정 시점의 트래픽 피크와 좌석 경쟁이 결합되어 장애 조건이 자연스럽게 발생한다.

- 티켓 오픈 직후 접속자와 좌석 조회 요청이 급증한다.
- 같은 좌석을 여러 사용자가 동시에 선택하면서 중복 예매 위험이 생긴다.
- 예약, 결제, 티켓 발행, 알림이 연쇄적으로 이어진다.
- 결제 승인 지연이나 실패가 예약 상태와 좌석 해제에 영향을 준다.
- 티켓 QR/PDF 생성과 저장이 후속 처리 지연을 만들 수 있다.
- 알림 지연 또는 실패가 사용자 경험에 영향을 준다.
- 배포 직후 에러율 상승이 예매 실패와 민원으로 연결될 수 있다.

따라서 이 주제는 부하 테스트, 장애 격리, 좌석 정합성, 이벤트 기반 후속 처리, 관측성, 무중단 배포, 보안 정책을 하나의 서비스 시나리오에 연결할 수 있다.

## 주제 선정 근거

1. 클라우드 네이티브 운영 검증에 적합하다.
   - 티켓 오픈은 특정 시점에 트래픽이 몰리는 구조라 부하 테스트와 확장성 검증을 설명하기 쉽다.
   - 좌석 조회, 예약, 결제, 티켓 발행, 알림이 이어지므로 여러 서비스의 배포와 운영 상태를 함께 볼 수 있다.
   - 앱 기능보다 Kubernetes 배포, HPA, 장애 격리, 관측성 같은 운영 요소를 중심에 두기 좋다.

2. 정량 지표를 만들기 쉽다.
   - 예매 성공률, P95/P99 응답시간, 에러율, 최대 처리량을 핵심 KPI로 사용할 수 있다.
   - 중복 티켓 수, 예약 충돌 수, 결제 실패율, 티켓 발행 지연처럼 비즈니스 흐름과 연결된 지표를 만들 수 있다.
   - Before/After 비교를 통해 HPA, Rate Limiting, Canary, rollback의 효과를 수치로 보여줄 수 있다.

3. 장애 시나리오가 자연스럽다.
   - 결제 승인 지연이나 실패는 외부 의존 서비스 장애를 가정하기 좋다.
   - 알림 장애는 핵심 티켓 발행 흐름과 부가 기능을 분리해 검증하기 좋다.
   - 티켓 artifact 저장 지연이 발생해도 예약과 결제 상태가 유실되지 않는지 확인할 수 있다.

4. 팀 역할을 기능 구현보다 검증 중심으로 나눌 수 있다.
   - 프론트엔드, 백엔드, 인프라로 역할을 고정하지 않아도 된다.
   - 핵심 예매 흐름, 좌석 정합성, Kubernetes 배포, 확장성, 관측성, 테스트 증거처럼 시나리오 중심으로 일을 나눌 수 있다.
   - 발표 산출물도 코드 양이 아니라 운영 증거와 검증 결과 중심으로 정리할 수 있다.

## 목표

| 목표 | 설명 | 성공 지표 |
| --- | --- | --- |
| 좌석 중복 0건 | 동시 예매 상황에서도 한 좌석에는 하나의 유효 티켓만 발행한다. | `duplicate_ticket_count = 0`, `reservation_conflict_count` |
| 후속 처리 분리 | 예약 API와 티켓/알림 후속 처리를 Kafka 이벤트로 분리한다. | `reservation_api_p95_ms`, `ticket_issue_delay_ms`, `kafka_consumer_lag` |
| 장애 격리 | 알림 장애가 결제 완료와 티켓 발행 흐름을 실패시키지 않는다. | `core_flow_success_rate`, `notification_retry_count` |
| 트래픽 폭발 대응 | HPA와 backpressure 관측으로 티켓 오픈 피크를 설명한다. | `hpa_scale_out_seconds`, `p99_latency`, `5xx_rate` |
| 통신 보안과 배포 안정성 | Kong JWT, NetworkPolicy, Istio mTLS, canary/rollback을 검증한다. | `mtls_enabled_services`, `traffic_split_ratio`, `rollback_time` |
| 운영 가시성 | metric, log, trace로 병목과 장애 원인을 찾을 수 있다. | `alert_firing_time`, `trace_duration`, 로그 추적 시간 |
| Object Storage 분리 | 티켓 QR/PDF artifact를 S3에 저장해 app pod를 stateless하게 유지한다. | `ticket_artifact_upload_success_rate`, `s3_object_count` |

## 범위

| 포함 | 제외 |
| --- | --- |
| 로그인/JWT, 공연/좌석 조회, 좌석 lock, 예약 생성, mock 결제, 티켓 발행, 알림 저장 | 실제 PG 연동 |
| Kafka 기반 후속 처리와 idempotency | 장기 정산/환불/배송 관리 |
| Docker Compose E2E, k6 부하 테스트, Newman API 검증 | 실제 공연장 좌석 UI 완성도 |
| Kubernetes, Kong, Istio, Helm, Argo CD 배포 검증 | 대규모 상용 운영 수준의 SLO 계약 |
| Prometheus, Grafana, Loki, Tempo, Alertmanager 증거 | 실제 SMS/Email 외부 발송 |

## 기술 스택

- 백엔드: Python, FastAPI, REST API, JWT
- 데이터: PostgreSQL, Redis 후보, MongoDB, S3
- 메시징: Kafka
- 런타임/오케스트레이션: Docker, Kubernetes, HPA
- 게이트웨이/서비스 메시: Kong Gateway, Istio
- CI/CD: GitHub Actions, Helm, Argo CD
- 클라우드/IaC: AWS, Terraform, Sealed Secrets
- 관측성: Prometheus, Grafana, Loki, Tempo, Alertmanager
- 테스트/품질: k6, Postman/Newman, Testkube, Grafana k6 Operator, Trivy, SonarQube
