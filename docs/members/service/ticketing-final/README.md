# 공연 티켓 예매 서비스 최종 문서 묶음

이 폴더는 `docs/members/service/`의 HTML 문서를 기준으로 하고, `infra-gitops`와 `observability/live-commerce` 문서에서 공연 티켓 예매에 필요한 내용을 병합한 최종 문서 묶음이다.

## 문서 구성

| 문서 | 목적 |
| --- | --- |
| [01-prd.md](./01-prd.md) | 프로젝트 정의, 검증 질문, 주제 선정 근거, 목표와 범위를 정리한다. |
| [02-service-architecture.md](./02-service-architecture.md) | 서비스 구성, 예매 흐름, API, 데이터 모델, Kafka 이벤트, 좌석 중복 방지 전략을 정리한다. |
| [03-MILESTONES.md](./03-MILESTONES.md) | PRD와 서비스 아키텍처를 기준으로 날짜별 마일스톤, 산출물, 통과 기준을 정리한다. |
| [03-platform-gitops.md](./03-platform-gitops.md) | Kubernetes, Kong, Istio, Helm, Argo CD, RDS/S3, 보안 정책과 배포/롤백 흐름을 정리한다. |
| [04-observability-validation.md](./04-observability-validation.md) | KPI, SLI/SLO, k6/Newman/Testkube, Grafana, Loki, Tempo, Alertmanager, 검증 증거를 정리한다. |
| [05-roadmap-roles.md](./05-roadmap-roles.md) | 확정 일정, 구현 phase, 마일스톤, 역할 분담, epic/issue 관리 방향을 정리한다. |
| [06-presentation-plan.md](./06-presentation-plan.md) | 발표 흐름, Before/After 비교, 시연 항목, 산출물 체크리스트를 정리한다. |

## 병합 기준

| 자료 | 반영 방식 |
| --- | --- |
| service HTML 문서 | 서비스 구성, 핵심 흐름, 목표, Kafka 이벤트, 좌석 중복 방지, phase, 산출물의 기준으로 사용한다. |
| `FEEDBACK.md` | 프로젝트 한 줄 정의, 핵심 검증 질문, 기술 스택, Testkube, 추가 검증 시나리오, PM 문서 순서를 반영한다. |
| `SCHEDULE.md` | 확정 일정과 마일스톤에 반영한다. |
| infra-gitops README | 순간 트래픽, 좌석 동기화, GitOps 배포, 장애 복구, 롤백, DevSecOps, 문서 산출물을 반영한다. |
| observability live-commerce | 라이브 이벤트성 피크 부하, 장애 격리, HPA, 관측성, 발표 증거 수집 기준을 티켓 오픈 시나리오로 치환해 반영한다. |

## 핵심 메시지

인기 공연 티켓 오픈 순간 예매 요청이 폭주해도, 좌석 중복 발행을 막고 결제·티켓 발행·알림 장애를 격리하며 관측 가능한 방식으로 안정적으로 예매를 처리하는 클라우드 네이티브 운영 검증 프로젝트다.
