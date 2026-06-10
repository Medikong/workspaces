---
id: ticketing-final-practice-goals
title: 공연 티켓 예매 프로젝트 실습 목표
type: practice-goals
status: draft
tags: [ticketing, goal, practice, cloud-native]
created: 2026-05-28
updated: 2026-05-29
---

# 공연 티켓 예매 프로젝트 실습 목표

- 서비스 목표: `01-prd.md`
- 시나리오 검증 목표: `04-scenarios/README.md`
- 참조 PRD: `../references/prd/Project-1.md`, `../references/prd/Project-2.md`, `../references/prd/Project-3.md`, `../references/prd/Project-4.md`

## 모니터링, 로깅, 운영 대응

### 지표 정의와 수집

- [x] 모니터링 대상 서비스와 수집 지표(CPU·메모리·요청량·에러율·응답시간)를 정의하고 지표 수집 기준 문서를 작성한다.
- [x] Prometheus를 `kube-prometheus-stack` Helm Chart로 `monitoring` Namespace에 배포하고, 각 서비스의 `/metrics` 엔드포인트를 ServiceMonitor CRD로 scrape 대상에 등록한다.

### 로그 수집과 처리

- [ ] Fluentd를 DaemonSet으로 배포하여 전 Pod 로그를 수집하고 Elasticsearch에 서비스별 인덱스(`orders-logs-*`, `payments-logs-*`)로 적재하는 파이프라인을 구성한다.
- [ ] Elasticsearch와 Splunk의 운영 비용·검색 성능·확장성을 비교 분석하고 선택 근거를 아키텍처 결정 기록(ADR) 문서로 작성한다.
- [ ] 기본 프로젝트의 Fluentd를 Fluent Bit으로 교체하여 DaemonSet 메모리 사용량을 측정·비교하고, 리소스 절감 수치를 문서화한다.
- [ ] Logstash 파이프라인에 서비스별 로그 필터링 규칙(민감 데이터 마스킹, 에러 레벨 자동 분류)을 추가한다.

### 대시보드

- [ ] Kibana 대시보드에서 서비스별 에러 로그 필터, request_id 기반 요청 추적 뷰를 구성한다.
- [ ] Grafana에 주문 처리량·결제 성공률·서비스별 응답 시간을 단일 화면으로 통합한 운영 대시보드를 구성하고, 임계치 초과 시 색상이 변하는 Threshold를 패널별로 설정한다.
- [ ] Kibana/Grafana 대시보드를 서비스 운영 관점(에러율·응답시간·처리량)과 인프라 관점(CPU·메모리·네트워크)으로 분리하여 재설계한다.
- [ ] 에러율·응답시간 지표에 대해 단기(5분)·장기(24시간) 트렌드를 시각화하는 패널을 추가한다.

### 알림과 대응 기준

- [ ] 장애 탐지 기준(에러율 5% 초과, P99 응답시간 2초 초과, Pod CrashLoopBackOff)을 정의하고 이슈 발생 시 대응 프로세스(탐지 → 알림 → 분석 → 조치 → 회고) 문서를 작성한다.
- [ ] Alertmanager를 Prometheus와 연동하여 에러율·응답 지연·Pod CrashLoop 알림 규칙을 PrometheusRule CRD로 정의한다.
- [ ] Slack `#ops-alert` 채널을 알림 채널로 연동하고, 알림이 정상적으로 발송되는지 테스트 알림으로 검증한다.
- [ ] Alertmanager에 기본 프로젝트의 단순 임계치 알림 외에 severity 기반 라우팅 분기(warning/critical)를 추가하고 알림 수신 채널을 이중화한다.

### 운영 분석과 보고

- [ ] 서비스 SLA 기준(월간 가용성 99.9%)을 정의하고 운영 가이드라인 문서를 작성한다.
- [ ] 반복 장애 패턴(특정 시간대 메모리 급증, 배포 직후 에러율 스파이크 등) 2가지 이상을 로그 분석으로 식별하고 각 패턴에 대한 재발 방지 Runbook을 작성한다.
- [ ] 로그 분석 기반으로 SLA 준수 여부를 산출하는 Kibana 뷰를 구성한다.
- [ ] 장애 패턴 식별 결과 및 개선 방안을 정리한 운영 보고서를 작성한다.

## CI/CD, GitOps, 서비스 메시

### 파이프라인

- [ ] Jenkins와 GitHub Actions의 학습 비용·연동 용이성·병렬 처리 지원을 비교하고 선택 근거를 ADR 문서로 작성한다.
- [ ] GitHub Actions로 서비스별 단위 테스트 → Docker 빌드 → Container Registry 푸시 → Kubernetes 배포 단계의 파이프라인을 구성한다. path filter를 적용하여 변경된 서비스만 빌드·배포되도록 한다.
- [ ] 배포 성공·실패 결과를 Slack `#deploy-status` 채널에 자동 발송한다.

### 이미지와 보안 스캔

- [ ] 각 서비스의 Dockerfile을 빌드 스테이지와 런타임 스테이지로 분리하는 멀티스테이지 빌드로 작성하고, 비루트 사용자(`appuser`, UID 1001) 실행으로 설정한다.
- [ ] KT클라우드 Container Registry에 서비스별 저장소를 분리하고 이미지 태그를 `git-sha`로 관리한다.
- [ ] Trivy를 CI 파이프라인에 통합하여 HIGH/CRITICAL CVE 발견 시 레지스트리 푸시를 차단한다.

### Kubernetes 배포

- [ ] 각 서비스에 Deployment + HPA(CPU 70% 기준, 최소 2·최대 10 Replica)를 구성한다.
- [ ] Readiness Probe(`/health/ready`, DB 연결 확인)와 Liveness Probe(`/health`, 프로세스 생존 확인)를 설정하여 배포 중 트래픽 단절이 없도록 한다.
- [ ] Helm Chart로 서비스 배포 설정을 관리하고 Rolling Update 배포 전략을 적용한다.

### 서비스 메시와 Canary

- [ ] Istio와 Linkerd의 기능·리소스 사용량·학습 난이도를 비교 분석하고 선택 근거를 ADR 문서로 작성한다.
- [ ] Istio를 클러스터에 설치하고 서비스 Namespace에 사이드카 자동 주입을 활성화한다.
- [ ] VirtualService와 DestinationRule을 정의하여 이체 서비스에 Canary 라우팅(신규 버전 20% → 50% → 100% 단계적 전환)을 적용한다.
- [ ] Kiali를 배포하여 서비스 토폴로지(서비스 간 트래픽 흐름, 에러율)를 시각화한다.
- [ ] Istio 사이드카 프록시(Envoy)의 메모리·CPU 사용량을 Prometheus로 수집하고 Grafana에서 모니터링한다.
- [ ] DestinationRule의 기본 Circuit Breaker(connectionPool 설정)를 구성하여 서비스 과부하를 방지한다.

### 네트워크 정책과 복구

- [ ] Kubernetes NetworkPolicy를 정의하여 Namespace 내부 서비스 간 통신만 허용하고 외부 직접 접근을 차단한다.
- [ ] Pod 강제 종료 장애 시나리오 1가지를 수행하고 Istio Retry 정책의 동작을 확인한다.
- [ ] 이전 버전으로의 롤백 절차(ArgoCD 이전 Revision 복원 또는 VirtualService 가중치 즉시 전환)를 Runbook으로 작성한다.

## MSA, 관측성, DevSecOps

### 서비스 경계와 데이터

- [ ] 도메인별 서비스 경계를 이벤트 스토밍으로 도출하고, 각 서비스가 독립적으로 배포·확장·장애 격리 가능하도록 경계를 정의한다.
- [ ] 서비스 간 통신 구조(동기 REST API vs 비동기 이벤트)를 설계하고 각 방식의 적용 기준을 문서화한다.
- [ ] 각 서비스별 독립 데이터베이스(Database per Service 패턴)를 적용하고 데이터 공유는 API 또는 이벤트를 통해서만 가능하도록 아키텍처 원칙을 정의한다.

### 통신과 Gateway

- [ ] Kubernetes ClusterIP + DNS로 기본 서비스 디스커버리를 구성하고 서비스 간 내부 통신을 검증한다.
- [ ] Spring Cloud Gateway 또는 Nginx Ingress를 API 게이트웨이로 배포하여 서비스별 경로 라우팅과 JWT 인증 필터를 구성한다.
- [ ] 서비스 장애 격리 시나리오(의존 서비스 다운 시 부분 응답 반환)를 설계 문서로 작성한다.

### 테스트와 관측성

- [x] JUnit으로 각 서비스의 단위 테스트를 작성하고 CI 파이프라인에서 자동 실행한다.
- [x] Postman Collection으로 서비스 간 연계 시나리오(환자 예약 → 예약 확정 이벤트 → 알림 발송)를 E2E 테스트로 작성한다.
- [x] Prometheus + Grafana로 서비스별 에러율과 API 응답 시간을 수집하고 배포 후 기본 Observability 확인 체계를 수립한다.

### 배포 독립성과 가용성

- [ ] 서비스별 독립 배포 파이프라인을 분리하고, 한 서비스의 배포가 다른 서비스에 영향을 주지 않음을 E2E 테스트로 검증한다.
- [ ] API 게이트웨이와 서비스 메시의 협업 구조를 검토하고 최적 구조를 선택하여 적용한다.
- [ ] PodDisruptionBudget(PDB)으로 클러스터 유지보수 중에도 각 서비스의 최소 Pod 수(2개)를 보장한다.

### DevSecOps

- [ ] CI 파이프라인에 SonarQube 정적 분석을 통합한다. 코드 커버리지 80% 미만 또는 Critical 이슈 발견 시 파이프라인을 중단하고 결과를 PR 코멘트로 자동 게시한다.
- [ ] Trivy로 Kubernetes 매니페스트 스캔(`trivy config`)을 추가하여 privileged 컨테이너, 루트 실행 등 보안 위반 설정을 배포 전에 차단한다.
- [ ] 보안 스캔 결과를 Slack `#security-report` 채널에 연동한다.

### 접근 제어

- [ ] Kubernetes RBAC을 정의하여 개발자(조회 전용)·운영자(Deployment 수정)·SRE(Namespace 전체 권한)로 역할을 분리한다.
- [ ] 서비스별 ServiceAccount를 분리하고 최소 권한 원칙에 따라 ClusterRole 대신 Role + RoleBinding을 사용한다.
- [ ] NetworkPolicy로 서비스 간 접근 제어 정책을 구현하고 의도하지 않은 통신이 차단됨을 테스트로 검증한다.

## 성능 최적화, 트래픽 관리, 장애 대응

### 성능 측정

- [ ] k6로 기준 성능을 측정한다(P99 응답시간, 최대 처리량, 에러율). k6 스크립트는 `tests/performance/` 디렉토리에 코드로 관리하여 CI에서 정기 실행한다.
- [ ] Prometheus 메트릭 분석으로 CPU·메모리·네트워크 I/O 병목 지점을 서비스별로 식별하고, 병목 원인과 개선 방향을 문서화한다.

### 오토스케일링

- [ ] HPA(CPU 기준) 설정 후 동일 k6 시나리오로 오토스케일링 동작을 검증하고 스케일아웃 응답 시간을 측정한다.

### 대시보드와 알림

- [ ] 기존 Prometheus 수집 지표에 서비스 전용 커스텀 지표(동시 접속자 수, 처리량, 도메인별 핵심 지표)를 추가한다.
- [ ] Grafana 대시보드를 성능 관점(응답시간·처리량·에러율)과 리소스 관점(CPU·메모리)으로 분리하여 구성하고, 실시간 지표가 1초 간격으로 갱신되는 대시보드를 구성한다.
- [ ] 성능 지표 임계치 초과 시 Alertmanager를 통해 Slack 알림이 발송되도록 연동한다.

### 트래픽 제어

- [ ] Prometheus 메트릭(30일치)을 분석하여 시간대별·이벤트별 트래픽 패턴을 분류하고, 각 패턴에 적합한 스케일링 전략(Scheduled vs Event-driven)을 수립한다.
- [ ] Istio VirtualService로 서비스 트래픽 라우팅 정책을 구성한다. 가중치 기반 트래픽 분배를 적용하고 신규 버전 Canary 라우팅을 구현한다.
- [ ] Rate Limiting 정책을 API 게이트웨이 또는 Istio 레벨에서 적용한다.

### 장애 대응

- [ ] Circuit Breaker(Resilience4j 또는 Istio outlierDetection)를 구현하여 의존 서비스 장애 시 Graceful Degradation이 동작함을 실제 장애 주입으로 검증한다.
- [ ] Alertmanager 알림 → Slack `#incident` 채널 자동 생성 연동을 구성한다.
- [ ] 장애 복구 절차를 단계별로 정의한 Runbook을 작성하고 실제 장애 시나리오로 검증한다.

### 평가와 보고

- [ ] 튜닝 방안 적용 전후를 동일한 k6 시나리오로 비교 측정한다. P99 응답시간·최대 처리량·에러율 개선 수치를 Before/After 표로 정리하고 목표치 달성 여부를 평가한다.
- [ ] 트래픽 관리 정책 적용 전후의 서비스 안정성(에러율, 응답시간 표준편차, SLA 준수율)을 동일 부하 테스트 시나리오로 비교 측정한다.
- [ ] MTTR(평균 복구 시간) 개선 수치를 정량화하고 운영 개선 보고서를 작성한다.
- [ ] 최적화 결과를 기술 문서로 작성하여 팀 위키에 공유하고, 운영 환경 적용을 위한 점진적 적용 가이드라인을 작성한다.
