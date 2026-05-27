# 06. 발표 계획

## 발표 메시지

> 티켓 오픈 순간 트래픽과 좌석 경쟁이 발생해도, Kubernetes 기반 플랫폼에서 예매 core flow를 유지하고 장애를 격리하며 운영자가 지표와 로그로 상태를 판단할 수 있는가?

## 발표 흐름

1. 문제 제기: 티켓 오픈 순간 특정 공연 회차 좌석 요청이 폭증한다.
2. 목표 정의: 중복 좌석 없이 예매 core flow를 유지하고, 장애를 격리하며, 운영자가 지표로 판단할 수 있게 한다.
3. 서비스 구조: auth, concert, reservation, payment, ticket, notification, dashboard를 최소 MSA로 구성한다.
4. 기준선 측정: 초기 부하 테스트에서 P99, 에러율, 중복 예매 수를 측정한다.
5. 개선 적용: DB constraint/lock, Kafka event, HPA, Rate Limiting, Observability dashboard를 적용한다.
6. 재검증: 동일 k6 시나리오로 Before/After KPI를 비교한다.
7. 장애 시연: payment 또는 notification 장애를 주입하고 core flow가 유지되는지 확인한다.
8. 운영 증거: Grafana, Alertmanager, Loki, Tempo로 장애 감지와 원인 판단을 보여준다.
9. 배포 안정성: Canary 또는 rollback 시나리오로 변경 관리 안정성을 보여준다.
10. 회고: 성공한 검증, 미완성 범위, 후속 과제를 구분한다.

## 발표에서 가장 강한 조합

| 조합 | 이유 |
| --- | --- |
| 티켓 오픈 피크 테스트 | 공연 예매에서 부하 테스트가 왜 필요한지 가장 직관적이다. |
| 좌석 정합성 검증 | 동시성 문제가 비즈니스 손실과 직접 연결된다. |
| 결제 또는 알림 장애 격리 | 외부 의존/부가 기능 장애를 core flow와 분리하는 장면을 보여준다. |
| HPA Before/After | Kubernetes 기반 확장 효과를 수치로 보여준다. |
| Canary/Rollback | GitOps 기반 변경 관리 안정성을 보여준다. |

## 슬라이드 초안

| 순서 | 제목 | 핵심 내용 | 증거 |
| --- | --- | --- | --- |
| 1 | 프로젝트 배경 | 티켓 오픈 피크와 좌석 경쟁 문제 | 문제 시나리오 다이어그램 |
| 2 | 목표와 성공 기준 | KPI, SLO, 핵심 검증 질문 | KPI 표 |
| 3 | 서비스 구조 | 최소 MSA와 요청/이벤트 흐름 | 아키텍처 다이어그램 |
| 4 | 좌석 중복 방지 | reservation-service 단일 책임과 constraint/lock | 동시성 테스트 결과 |
| 5 | 이벤트 기반 후속 처리 | payment-approved, ticket-issued, notification 흐름 | Kafka lag, ticket issue delay |
| 6 | 기준선과 개선 | Before/After 부하 테스트 | k6 결과, Grafana |
| 7 | Kubernetes 확장 | HPA 적용과 replica 변화 | Pod 수 변화, P99 비교 |
| 8 | 장애 격리 | payment 또는 notification 장애 시나리오 | 장애 전후 지표, 로그 |
| 9 | 관측성과 알림 | 운영자가 장애를 판단하는 흐름 | Grafana, Alertmanager, Loki/Tempo |
| 10 | 배포 안정성 | Canary 또는 rollback | 버전별 에러율, rollback 기록 |
| 11 | 결과 요약 | 성공/실패 케이스와 배운 점 | KPI 비교표 |
| 12 | 회고와 후속 과제 | 남은 범위와 개선 방향 | 후속 과제 목록 |

## 시연 우선순위

| 우선순위 | 시연 | 실패 시 백업 |
| --- | --- | --- |
| 1 | 정상 예매 E2E | Newman report 캡처 |
| 2 | 좌석 동시성 k6 | DB 최종 상태와 k6 summary |
| 3 | HPA scale-out | Grafana replica graph와 `kubectl describe hpa` |
| 4 | payment/notification 장애 격리 | 장애 전후 dashboard와 log query |
| 5 | Canary/Rollback | Argo CD 또는 rollout event 캡처 |

## 발표 준비 체크리스트

- 문제 상황을 30초 안에 설명할 수 있다.
- 핵심 E2E 흐름이 한 장의 그림으로 설명된다.
- P0 시나리오 중 최소 3개 이상의 결과가 캡처되어 있다.
- Before/After 비교표가 있다.
- Grafana 대시보드 캡처가 있다.
- 장애 알림 또는 로그 추적 증거가 있다.
- 시연 실패에 대비한 백업 캡처가 있다.
- 미완성 항목은 숨기지 않고 후속 과제로 분류되어 있다.

## 최종 산출물

- 공연 티켓 서비스 API와 이벤트 계약
- FastAPI 서비스 코드와 dashboard
- Kafka 기반 티켓 발행/알림 이벤트 흐름
- Kubernetes/Kong/Istio 배포 manifest
- Grafana dashboard와 alert
- RDS/S3/VPC Terraform 또는 설계 문서
- 부하 테스트와 장애 주입 결과
- Trivy/SonarQube CI 결과
- 요구사항 충족표와 목표 검증 script
