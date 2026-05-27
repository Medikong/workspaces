---
id: ticketing-final-service-milestones
title: 공연 티켓 예매 서비스 마일스톤
type: milestone-plan
status: draft
tags: [ticketing, milestone, sprint, cloud-native, gitops, observability]
created: 2026-05-27
updated: 2026-05-27
---

# 공연 티켓 예매 서비스 마일스톤

## 문서 목적

이 문서는 `docs/project_docs/01-prd.md`와 `docs/project_docs/02-service-architecture.md`를 실제 일정에 맞춰 계획 기간, 구현 스프린트, 검증 스프린트, 발표 준비 구간으로 나누기 위한 마일스톤 계획서다.

- `docs/project_docs/01-prd.md`: 프로젝트 정의, 목표, 범위, 성공 지표
- `docs/project_docs/02-service-architecture.md`: 서비스 구성, 핵심 예매 흐름, API, Kafka 이벤트, 데이터 모델
- `docs/members/service/ticketing-final/03-MILESTONES.md`: 날짜별 마일스톤, 산출물, 통과 기준
- `docs/members/service/ticketing-final/03-platform-gitops.md`: Kubernetes, Kong, Istio, Helm, Argo CD, AWS 배포와 롤백 기준
- `docs/members/service/ticketing-final/04-observability-validation.md`: KPI, SLI/SLO, 테스트 자동화, 관측성 검증 기준
- `docs/members/service/ticketing-final/05-roadmap-roles.md`: 역할 분담, 구현 phase, epic/issue 작성 기준

마일스톤은 개별 이슈 목록이 아니라, 각 구간이 끝났을 때 무엇이 구현되고 무엇이 검증되어야 하는지 정의한다.

## 확정 일정

| 구분 | 날짜 | 의미 |
| --- | --- | --- |
| 계획 기간 | 2026-05-27(수) ~ 2026-06-02(화) | 서비스 범위, API/event 계약, 검증 시나리오, 역할을 정한다. |
| 중간 발표 | 2026-06-12(금) | 핵심 예매 흐름, 배포 방향, 초기 검증 결과, 남은 위험 요소를 공유한다. |
| 실험 결과 고정 | 2026-06-19(금) 업무 종료 전 | 발표에 쓸 부하/장애/보안/통신/배포 검증 결과를 모두 준비한다. |
| 최종 발표 준비 | 2026-06-22(월) ~ 2026-06-23(화) | 새 실험 없이 자료 정리, 리허설, 백업 캡처를 준비한다. |
| 최종 발표 | 2026-06-24(수) | 최종 결과를 발표한다. |

## 운영 전제

- 전체 일정은 약 5주로 본다.
- 첫 주는 구현 스프린트가 아니라 계획과 계약 확정 기간으로 분리한다.
- 프로젝트의 핵심 검증 질문은 "티켓 오픈 중 트래픽이 급증해도 핵심 예매 흐름을 유지하고, 좌석 정합성을 보장하며, 운영자가 지표와 로그로 상태를 판단할 수 있는가?"이다.
- 서비스 구현은 `auth-service`, `concert-service`, `reservation-service`, `payment-service`, `ticket-service`, `notification-service`, `dashboard`를 기준으로 한다.
- 좌석 중복 방지는 `reservation-service`의 DB transaction과 unique constraint를 1차 기준으로 둔다.
- 결제 이후 티켓 발행과 알림 저장은 Kafka 이벤트로 분리한다.
- GitOps와 Argo CD는 AWS 시연 배포, 독립 배포, 롤백 설명에서 핵심 절차로 포함한다.
- 관측성은 Prometheus, Grafana, Loki, Tempo, Alertmanager를 기준으로 하되, 최종 발표에는 실제 캡처 가능한 범위를 우선한다.
- 테스트 증거는 k6, Newman, Testkube, Grafana dashboard, 로그/트레이스 캡처 중 하나 이상으로 남긴다.
- 마지막 주는 발표 준비 구간으로 보고 새 기능이나 새 실험을 추가하지 않는다.
- 모든 실험과 검증 결과는 늦어도 2026-06-19(금)까지 준비한다.

## 전체 마일스톤 요약

| 구간 | 기간 | 목표 | 핵심 질문 | 통과 기준 |
| --- | --- | --- | --- | --- |
| Phase 0 | 2026-05-27 ~ 2026-06-02 | 계획과 계약 확정 | 무엇을 만들고 무엇을 검증할 것인가? | PRD, 아키텍처, API/event 계약, P0 시나리오, 역할이 정리된다. |
| Sprint 1 | 2026-06-03 ~ 2026-06-09 | 핵심 예매 흐름 구현 | 좌석 조회부터 결제, 티켓 발행까지 정상 흐름이 재현되는가? | Local E2E에서 정상 예매 흐름과 좌석 conflict 테스트가 통과한다. |
| Sprint 2 | 2026-06-10 ~ 2026-06-16 | 플랫폼 배포와 운영 검증 | Kubernetes/GitOps 경로와 운영 통제가 동작하는가? | 중간 발표에서 배포 상태, 초기 부하/장애/보안 검증, 남은 위험 요소를 설명한다. |
| Sprint 3 | 2026-06-17 ~ 2026-06-19 | 실험 결과 고정 | 발표에 쓸 근거 자료가 충분한가? | 최소 2개 이상의 운영 검증 결과가 캡처와 함께 확정된다. |
| Final Prep | 2026-06-22 ~ 2026-06-24 | 발표 준비와 리허설 | 결과를 하나의 운영 개선 흐름으로 설명할 수 있는가? | 발표 흐름, 캡처, 백업 자료, 회고가 준비된다. |

## Phase 0: 계획과 계약 확정

### 목표

구현에 들어가기 전에 서비스 범위, API/event 계약, 검증 시나리오, 역할, 완료 기준을 확정한다.

### 주요 질문

- 공연 티켓 예매 프로젝트가 증명하려는 운영 능력은 무엇인가?
- PRD의 목표 중 발표에서 반드시 증명할 P0 항목은 무엇인가?
- 서비스별 API와 Kafka 이벤트 계약은 병렬 개발이 가능할 만큼 명확한가?
- 좌석 중복 방지 전략은 DB transaction과 unique constraint만으로 1차 검증이 가능한가?
- AWS 데모 겸 QA 환경은 어떤 최소 범위로 준비할 것인가?
- 중간 발표에서 어떤 기본 상태와 초기 결과를 보여줄 것인가?

### 주요 산출물

- MVP 범위 합의안
- API 계약 초안
- Kafka 이벤트 계약 초안
- 데이터 모델 초안
- P0 검증 시나리오
- 역할과 소유 영역
- GitOps/Argo CD 배포 경로 누락 항목 목록
- observability metric/log/trace 이름 초안
- 시작/완료 기준

### 통과 기준

- 팀이 프로젝트 한 줄 정의와 MVP 범위에 합의했다.
- 서비스별 책임과 주요 API가 문서화됐다.
- `payment-approved`, `payment-failed`, `ticket-issued` 등 핵심 이벤트 계약이 정리됐다.
- P0 시나리오와 후순위 과업이 분리됐다.

## Sprint 1: 핵심 예매 흐름 구현

### 목표

정상 사용자 흐름을 먼저 재현해 부하, 장애, 보안, 배포 검증의 출발점을 만든다.

### 주요 질문

- 사용자가 로그인하고 공연/좌석을 조회할 수 있는가?
- 동일 좌석 동시 요청에서 하나만 성공하고 나머지는 `409 Conflict`로 실패하는가?
- 예약 생성, mock 결제, Kafka 이벤트 발행, 티켓 발행, 알림 저장 흐름이 연결되는가?
- 티켓 QR/PDF artifact를 pod local이 아니라 S3 또는 S3 mock 기준으로 분리할 수 있는가?
- 같은 절차를 다른 팀원이 재현할 수 있는가?

### 주요 산출물

- `auth-service`, `concert-service`, `reservation-service` 기본 API
- `payment-service`, `ticket-service`, `notification-service` 최소 흐름
- Kafka topic과 producer/consumer 연결 결과
- 좌석 conflict 테스트 결과
- 정상 예매 E2E 절차
- Docker Compose 또는 local Kubernetes 실행 절차
- 테스트 데이터와 seed 기준

### 통과 기준

- 정상 예매 흐름이 한 번 이상 성공했다.
- 동일 좌석 동시 요청에서 중복 티켓이 발생하지 않았다.
- 결제 승인 이벤트 이후 티켓 발행과 알림 저장이 비동기로 이어졌다.
- Sprint 2에서 배포/관측성/정책 검증에 쓸 기본 상태가 있다.

## Sprint 2: 플랫폼 배포와 운영 검증

### 목표

Kubernetes, Kong, Istio, GitOps, 관측성, 보안 스캔을 실제 서비스 흐름에 적용하고 중간 발표에서 초기 결과와 위험 요소를 공유한다.

### 주요 질문

- 서비스가 Kubernetes namespace에 배포되고 Gateway/Ingress 라우팅으로 접근되는가?
- Kong JWT와 route 설정이 핵심 API 앞단에서 동작하는가?
- Argo CD 또는 task 기반 배포 경로가 재현 가능한가?
- Istio mTLS, traffic split, NetworkPolicy 중 발표에 넣을 수 있는 통신 제어 결과가 있는가?
- Prometheus/Grafana로 예매 성공률, 에러율, P95/P99, Kafka lag를 볼 수 있는가?
- Trivy 또는 SonarQube 결과를 CI/CD 품질 게이트로 설명할 수 있는가?

### 주요 산출물

- Kubernetes manifest 또는 Helm values
- Kong route/JWT 설정 결과
- Argo CD 애플리케이션 동기화 상태 또는 대체 배포 경로 확인 결과
- Istio mTLS/traffic split 적용 결과
- Prometheus metric 수집 결과
- Grafana dashboard 1차 완성본
- Loki 로그 조회 경로
- Tempo trace 조회 경로 또는 추후 적용 판단 기록
- Trivy/SonarQube 스캔 기준과 실패 샘플
- 중간 발표용 진행 요약

### 통과 기준

- 서비스가 local Kubernetes 또는 AWS 데모 환경에서 최소 1회 배포됐다.
- 정상 예매 흐름이 배포 환경에서 재현됐다.
- 부하, 장애, 보안 스캔, 통신 차단 중 최소 1개 이상은 실제 결과가 있다.
- 중간 발표에서 완료/진행/위험 요소/다음 조치를 구분해 설명할 수 있다.

## Sprint 3: 실험 결과 고정

### 목표

최종 발표에 사용할 부하, 장애, 보안, 통신, 배포 검증 결과를 2026-06-19(금)까지 고정한다.

### 주요 질문

- k6 부하 테스트에서 티켓 오픈 피크 상황을 설명할 수 있는 수치가 있는가?
- 결제 장애 또는 알림 장애가 핵심 예매 흐름 전체를 실패시키지 않는다는 근거가 있는가?
- 좌석 중복 0건을 테스트 결과와 DB 상태로 보여줄 수 있는가?
- HPA, rollback, canary 중 최소 하나를 Before/After로 보여줄 수 있는가?
- 모든 주요 주장이 로그, 지표, 캡처, 테스트 결과 중 하나로 뒷받침되는가?

### 주요 산출물

- k6 부하 테스트 결과
- Newman API 회귀 테스트 결과
- Testkube 실행 결과
- 좌석 conflict 최종 결과
- 결제 장애 또는 알림 장애 시나리오 결과
- HPA scale-out 결과
- rollback 또는 canary 검증 결과
- 통신 정책 적용 전/후 결과
- 보안 스캔 정상/실패 결과
- 최종 근거 자료 색인 초안

### 통과 기준

- 최소 2개 이상의 운영 검증 결과가 최신 근거 자료로 확정됐다.
- 좌석 중복 방지 결과가 캡처 또는 테스트 결과로 남아 있다.
- P0 시나리오 중 미완성 항목은 후속 과제로 분류됐다.
- 2026-06-22부터는 새 실험 없이 발표 준비로 전환할 수 있다.

## Final Prep: 발표 준비와 리허설

### 목표

새 기능과 새 실험을 추가하지 않고, 준비된 결과를 최종 발표에서 설명할 흐름과 자료로 정리한다.

### 주요 질문

- 발표를 듣는 사람이 "운영할 수 있는 수준이 어떻게 나아졌는지" 이해할 수 있는가?
- PRD 목표와 실제 검증 결과가 서로 연결되는가?
- 서비스 아키텍처, GitOps 배포, 관측성 검증이 하나의 이야기로 이어지는가?
- 발표 시연 실패에 대비한 백업 캡처가 있는가?

### 주요 산출물

- 발표 흐름
- 아키텍처 다이어그램
- 예매 흐름 시연 절차
- 검증 결과 캡처 목록
- 10분 발표 리허설 피드백
- 회고와 후속 과제
- 백업 캡처 목록

### 통과 기준

- 최종 발표 흐름이 문제, 목표, 설계, 검증, 결과, 회고 순서로 연결된다.
- 발표 당일 사용할 캡처와 백업 자료가 준비되어 있다.
- 미완성 항목은 숨기지 않고 후속 과제로 설명된다.

## 주간 운영 리듬

| 시점 | 활동 | 목적 |
| --- | --- | --- |
| 주 시작 | 스프린트 계획 | 이번 구간 목표, 범위, 완료 기준 확정 |
| 매일 | 진행 공유 | 진행 상황, 막힌 점, 당일 검증 목표 공유 |
| 주 중반 | 중간 점검 | 시나리오가 실제로 재현되는지 확인 |
| 주 후반 | 증거 자료 고정 | 발표/리뷰에 쓸 결과 캡처와 로그 정리 |
| 구간 종료 | 리뷰와 회고 | 결과 검토, 다음 스프린트 조정, 행동 개선 |

## 마일스톤별 의사결정 게이트

### Gate 1: 범위 고정

2026-06-02(화)까지 필수 범위와 권장 범위를 확정한다.

- 필수 범위는 정상 예매 E2E, 좌석 중복 방지, Kafka 후속 처리, 배포 검증, 관측성 증거로 둔다.
- 권장 범위는 발표 증거 준비에 직접 도움이 되는 것만 남긴다.
- 선택 범위는 중간 발표 이후 여유가 없으면 제외한다.

### Gate 2: 중간 발표 리셋

2026-06-12(금) 중간 발표 이후에는 범위를 늘리지 않고 검증 결과를 모으는 데 집중한다.

- 시나리오가 없는 기능은 우선순위를 낮춘다.
- 설치만 된 기능은 완료로 보지 않는다.
- 실패 케이스를 만들 수 없는 기능은 발표 핵심에서 제외한다.
- GitOps/Argo CD와 LGTM는 동기화 결과, 로그/지표 조회 결과, 장애 전후 캡처가 있어야 완료로 본다.

### Gate 3: 실험 결과 고정

2026-06-19(금) 이후에는 새 실험을 추가하지 않는다.

- 남은 시간은 재현성, 캡처, 발표 흐름, 회고 정리에 쓴다.
- 미완성 기능은 숨기지 않고 후속 과제로 분류한다.
- 발표 시연이 불안정하면 화면 캡처와 로그를 백업 자료로 준비한다.

## 다음 단계

- `docs/project_docs/01-prd.md`의 목표별 성공 지표를 issue 완료 기준으로 옮긴다.
- `docs/project_docs/02-service-architecture.md`의 API/event 계약을 각 서비스 작업 단위로 쪼갠다.
- `docs/members/service/ticketing-final/04-observability-validation.md`의 P0/P1/P2 시나리오를 Sprint 2~3 일정에 배치한다.
- GitHub Projects 또는 Linear의 작업 주기를 이 구간 이름과 날짜로 만든다.
- 중간 발표용 자료 초안을 Sprint 2 시작 전 만들어둔다.
