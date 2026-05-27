## 프로젝트 한 줄 정의

인기 공연 티켓 오픈 순간 예매 요청이 폭주해도, 좌석 중복 발행을 막고 결제·티켓 발행·알림 장애를 격리하며 관측 가능한 방식으로 안정적으로 예매를 처리하는 클라우드 네이티브 운영 검증 프로젝트다.

## 핵심 검증 질문

> 티켓 오픈 중 트래픽이 급증해도 핵심 예매 흐름을 유지하고, 좌석 정합성을 보장하며, 운영자가 지표와 로그로 상태를 판단할 수 있는가?

## 왜 이 주제인가

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

---

## 기술 스택

- **백엔드**: Python, FastAPI, REST API, JWT
- **데이터**: PostgreSQL, Redis, MongoDB, S3
- **메시징**: Kafka
- **런타임/오케스트레이션**: Docker, Kubernetes, HPA
- **게이트웨이/서비스 메시**: Kong Gateway, Istio
- **CI/CD**: GitHub Actions, Helm, ArgoCD
- **클라우드/IaC**: AWS, Terraform, Sealed Secrets
- **관측성**: Prometheus, Grafana, Loki, Tempo, Alertmanager
- **테스트/품질**: k6, Postman/Newman, Trivy, SonarQube

### 테스트 시나리오 기술 스택

- **테스트 오케스트레이션**: Testkube
- **부하 테스트**: k6
- **API/E2E 테스트**: Postman, Newman
- **Kubernetes 테스트 실행 환경**: Grafana k6 Operator, Testkube Agent
- **지표 수집**: Prometheus
- **시각화**: Grafana
- **CI/CD 연동**: GitHub Actions, ArgoCD
- **시나리오 정의**: Testkube Test Workflows, k6 JavaScript scripts, Postman Collections
- **검증 증거 관리**: k6 reports, Grafana snapshots, Newman reports, Kubernetes event/log outputs

---

## 추가적인 발표 검증 시나리오

### HPA 검증

k6로 예약 피크를 만들고, reservation-service HPA가 CPU 70% 기준으로 min 2, max 10 범위에서 반응하는지 본다. metrics-server, kubectl, Prometheus, Grafana로 replica와 성능 변화를 비교한다.

성공 기준은 scale-out 60초 이내 시작, 3분 이내 4개 이상 replica 도달, P99 또는 에러율 20% 이상 개선이다. 산출물은 k6 리포트, HPA describe 결과, CPU/replica/latency 캡처다.

### Rate Limiting

k6로 단일 사용자의 과도한 좌석 조회/예약 호출과 정상 사용자 예매 부하를 함께 실행한다.
성공 기준은 과호출은 429로 제한하고 정상 사용자 예매 성공률은 99% 이상 유지하는 것이며, 산출물은 차단 건수, 정상 사용자 지표, gateway 로그다.

### Canary 배포

ArgoCD와 Istio 또는 Argo Rollouts로 reservation-service 신규 버전을 20%, 50%, 100% 순서로 전환한다.
성공 기준은 신규 버전 에러율이 기존 대비 +1%p 이하, P99가 +20% 이내인 것이며, 산출물은 버전별 지표와 rollout 기록이다.

### Canary 롤백

Canary 구간에서 신규 버전 오류를 주입하고 Alertmanager 알림 이후 rollback을 실행한다.
성공 기준은 이상 감지 후 3분 이내 이전 버전으로 복구하고 5xx를 1% 이하로 낮추는 것이며, 산출물은 알림 기록과 rollback 이벤트 로그다.

---

# PM 관점 문서 정리 순서

1. PRD 파일
2. 프로젝트 계획 파일
3. 마일스톤 파일
4. 시나리오 파일
5. 에픽 파일
6. 이슈 WorkPlan workspace/docs/projects_plan/workplans

---
