# 05. 로드맵과 역할

## 확정 일정

| 구분 | 날짜 | 의미 |
| --- | --- | --- |
| 계획 기간 | 2026-05-27(수) ~ 2026-06-02(화) | 범위, 시나리오, Epic, workplan, 역할을 정한다. |
| 중간 발표 | 2026-06-12(금) | 방향, 기본 상태, 초기 검증 결과, 남은 위험 요소를 공유한다. |
| 실험 결과 고정 | 2026-06-19(금) 업무 종료 전 | 발표에 쓸 장애/보안/통신/배포 검증 결과를 모두 준비한다. |
| 최종 발표 준비 | 2026-06-22(월) ~ 2026-06-23(화) | 새 실험 없이 자료 정리, 리허설, 백업 캡처를 준비한다. |
| 최종 발표 | 2026-06-24(수) | 최종 결과를 발표한다. |

## 구현 Phase

| Phase | 목표 | 주요 작업 |
| --- | --- | --- |
| 0. Contract | 병렬 개발 전 계약 확정 | API, event, env, metric 이름 확정 |
| 1. Core Service | 티켓 예매 핵심 흐름 구현 | auth, concert, reservation, payment, ticket, notification |
| 2. Platform | Kubernetes와 Kong에 서비스 배포 | namespace, DB/Kafka, Helm values, Kong route/JWT |
| 3. Mesh | 서비스 통신 보안과 점진 배포 검증 | Istio sidecar, mTLS, traffic split |
| 4. Observability | metric/log/trace와 alert 연결 | Prometheus, Grafana, Loki, Tempo, Alertmanager |
| 5. Cloud | AWS 데이터/스토리지 연결 | RDS, S3, VPC Endpoint, backup/restore |
| 6. Evidence | 발표용 검증 증거 수집 | k6, Newman, Testkube, 장애 주입, HPA, rollback, Trivy |

## 3인 역할 분담

| 담당 | 역할 | 주요 책임 |
| --- | --- | --- |
| Person 1 | Platform / Cloud / Runtime | K8s, Kong/Istio 설치 기반, AWS VPC/RDS/S3, PDB/RBAC/ServiceAccount |
| Person 2 | Service / Gateway / Mesh | 서비스 API, Kafka event 발행/소비, Kong route, Istio traffic policy |
| Person 3 | Quality / Observability / DevSecOps | pytest/Newman/k6, Testkube, Grafana/Loki/Tempo, Trivy/SonarQube, 요구사항 충족표 |

## 마일스톤

| 마일스톤 | 완료 기준 |
| --- | --- |
| M0. 계약 확정 | API, event, env, metric 이름이 문서화되고 issue로 쪼개짐 |
| M1. Core API | auth, concert, reservation 기본 API와 좌석 conflict 테스트 통과 |
| M2. Event Flow | payment-approved -> ticket-issued -> notification 흐름 연결 |
| M3. Local E2E | Docker Compose 또는 local K8s에서 정상 예매 E2E 통과 |
| M4. GitOps Deploy | infra-gitops values와 Argo CD 또는 task 기반 배포 검증 |
| M5. Observability | Grafana dashboard, alert, log/trace 추적 증거 확보 |
| M6. Failure Evidence | 결제 장애, notification 장애, HPA, rollback 결과 고정 |
| M7. Presentation Ready | 발표 캡처, 결과표, 백업 시나리오, 회고 정리 |

## PM 관점 문서 순서

FEEDBACK 기준으로 문서는 다음 순서로 정리한다.

1. PRD 파일
2. 프로젝트 계획 파일
3. 마일스톤 파일
4. 시나리오 파일
5. 에픽 파일
6. 이슈 관리

현재 `ticketing-final/` 문서 묶음은 1~4번을 우선 정리한다. Epic과 issue 관리는 실제 작업 분배가 확정된 뒤 별도 문서 또는 GitHub Issues/Linear에 연결한다.

## Epic 후보

| Epic | 포함 작업 |
| --- | --- |
| E1. Ticketing Core | auth, concert, reservation, payment, ticket, notification 구현 |
| E2. Seat Consistency | 좌석 lock, unique constraint, conflict response, 동시성 테스트 |
| E3. Event Processing | Kafka topic, producer/consumer, idempotency, retry |
| E4. Platform Deploy | namespace, Helm values, Kong route, DB/Kafka manifest |
| E5. Mesh and Security | Istio mTLS, traffic split, NetworkPolicy, Secret 관리 |
| E6. Observability | metrics, logs, traces, dashboards, alerts |
| E7. Validation Evidence | k6/Newman/Testkube, 장애 주입, HPA, rollback, 발표 캡처 |

## Issue 작성 기준

각 issue는 다음 필드를 가진다.

- 배경: 이 작업이 어떤 목표나 검증 시나리오와 연결되는지
- 범위: 구현 또는 문서화할 대상
- 완료 기준: 테스트, 캡처, 명령 결과, dashboard 등 확인 가능한 증거
- 의존성: 선행 issue 또는 repo
- 담당: 주 담당과 리뷰 담당
