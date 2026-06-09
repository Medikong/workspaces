# 00-GOAL 요구사항 충족도 점검

## 문서 목적

`docs/project_docs/00-GOAL.md`의 요구사항을 기준으로 현재 `service`, `gitops`, `workspace`에 반영된 내용을 점검한다.

판단 기준은 두 단계로 나눈다.

- 구현 기반 있음: 코드, Helm chart, GitOps manifest, CI workflow, ADR 또는 설계 문서가 존재한다.
- 충족 완료: 실제 클러스터 적용, API 호출, 대시보드, 알림, 장애 주입, 로그/메트릭 캡처 같은 운영 증거까지 있다.

따라서 이 문서에서 `부분 충족`은 구현 기반은 있지만 운영 증거가 부족한 상태를 의미한다.

## 전체 판단

현재 프로젝트는 MSA 서비스, Kong Gateway, GitOps 배포, Istio Service Mesh, Kafka 이벤트, RBAC/ServiceAccount, 기본 모니터링 기반까지는 꽤 많이 진행되어 있다.

하지만 `00-GOAL.md` 전체 요구사항을 모두 만족한다고 보기는 어렵다. 특히 다음 영역은 아직 운영 증거가 부족하거나 구현 방향을 다시 결정해야 한다.

- Elasticsearch/Kibana/Logstash/Fluentd 계열 요구사항
- Alertmanager Slack 알림과 severity routing
- Grafana dashboard와 threshold 증거
- k6 성능 측정과 Before/After 개선 수치
- Canary 실제 traffic split 증거
- Circuit Breaker 실제 장애 주입 증거
- mTLS STRICT 적용 증거
- SLA/MTTR/운영 보고서
- SonarQube, 이미지 CVE 차단, Slack 보안 리포트

## 충족 또는 거의 충족된 부분

| 영역 | 요구사항 | 현재 상태 | 근거 |
| --- | --- | --- | --- |
| MSA 서비스 | 도메인별 서비스 분리 | 충족에 가까움 | `auth`, `concert`, `reservation`, `payment`, `ticket`, `notification` 서비스 존재 |
| OpenAPI | 서비스 API 계약 | 충족에 가까움 | `service/contracts/services/*/openapi.yaml` 존재 |
| Database per Service | 서비스별 독립 DB | 부분 충족 이상 | 서비스별 DB URL과 schema 구조 존재, 실제 운영 연결 증거는 추가 필요 |
| Kafka 이벤트 | 비동기 이벤트 통신 | 충족에 가까움 | `reservation-created`, `reservation-expired`, `payment-approved`, `payment-failed`, `ticket-issued` 계약과 producer/consumer 코드 존재 |
| Kong Gateway | API Gateway, JWT, role guard, rate limit | 충족에 가까움 | `gitops/platform/kong/plugins/*`, `values/services/*` Ingress 설정 |
| Helm 배포 | Deployment/Service/Ingress/HPA/PDB/NetworkPolicy/ServiceMonitor | 기반 충족 | `gitops/charts/medikong-service/templates/*` |
| CI 단위 테스트 | 변경 서비스만 테스트 | 충족에 가까움 | `service/.github/workflows/service-tests.yml`, path filter 사용 |
| 이미지 publish | ECR push, git-sha tag | 충족에 가까움 | `service/.github/workflows/image-publish.yml`, `IMAGE_TAG: github.sha` |
| Kubernetes manifest scan | Trivy config scan | 부분 충족 | `gitops/.github/workflows/k8s-security-scan.yml` |
| Istio 설치 | istio-base, istiod, Kiali | 기반 충족 | `gitops/platform/istio/argocd/*` |
| Sidecar injection | 주요 backend 서비스 sidecar | 부분 충족 이상 | `values/services/concert`, `reservation`, `payment`, `ticket`, `notification`에 injection 설정 |
| Canary manifest | 20/50/100/rollback | 기반 충족 | `platform/istio/traffic/reservation/scenarios/*` |
| Circuit Breaker manifest | DestinationRule connectionPool/outlierDetection | 기반 충족 | `platform/istio/traffic/reservation/destination-rule.yaml` |
| RBAC | 개발자/운영자/SRE 역할 분리 | 기반 충족 | `gitops/platform/policies/human-rbac.yaml` |
| ServiceAccount | 서비스별 ServiceAccount | 기반 충족 | Helm chart 기본 `serviceAccount.create: true` |

## 부분 충족된 부분

### Prometheus와 Grafana

현재 상태:

- `kube-prometheus-stack` values와 monitoring namespace 구성이 있다.
- 서비스별 `ServiceMonitor` 템플릿이 있다.
- Istio용 `PodMonitor`가 있다.
- Kiali가 Prometheus를 바라보도록 구성되어 있다.

부족한 점:

- 서비스별 `/metrics`가 실제 Prometheus target으로 잡힌 증거가 부족하다.
- Grafana dashboard JSON 또는 캡처가 부족하다.
- 에러율, P99, 처리량, 결제 성공률 threshold가 적용된 운영 dashboard 증거가 부족하다.
- 단기 5분/장기 24시간 trend panel 증거가 부족하다.

판단:

```text
구현 기반: 있음
운영 증거: 부족
상태: 부분 충족
```

### HPA

현재 상태:

- Helm chart에 HPA 템플릿이 있다.
- AWS HPA scenario values가 있다.

부족한 점:

- 요구사항은 CPU 70%, min 2, max 10이다.
- 현재 AWS scenario는 CPU 60%, min 2, max 4로 보인다.
- 부하 테스트로 scale-out을 검증한 증거가 부족하다.

판단:

```text
구현 기반: 있음
요구 수치 불일치: 있음
운영 증거: 부족
상태: 부분 충족
```

### Dockerfile 보안

현재 상태:

- 각 서비스 Dockerfile이 있다.
- 멀티스테이지 빌드 구조가 적용되어 있다.
- runtime stage에서 non-root user를 사용한다.

부족한 점:

- 요구사항은 `appuser`, UID `1001`이다.
- 현재 예시 Dockerfile은 UID `10001` 계열이다.
- 요구사항을 그대로 맞출지, `10001`을 보안상 허용 기준으로 ADR/문서화할지 결정해야 한다.

판단:

```text
구현 기반: 있음
요구사항 세부값 불일치: 있음
상태: 부분 충족
```

### NetworkPolicy

현재 상태:

- Helm chart에 NetworkPolicy 템플릿이 있다.
- 서비스별 values에 기본 ingress 제한이 있다.
- Prometheus scrape 허용 규칙도 ServiceMonitor와 연결되어 있다.
- 별도 설계 문서가 있다.

부족한 점:

- 의도하지 않은 통신이 실제로 차단되는지 테스트 증거가 부족하다.
- Istio, Prometheus, Kiali, Kafka, DB, DNS 예외 정책이 실제 환경에서 검증되어야 한다.

판단:

```text
구현 기반: 있음
차단 검증 증거: 부족
상태: 부분 충족
```

### Istio/Kiali/Canary/Circuit Breaker

현재 상태:

- Istio platform layer가 있다.
- Kiali가 있다.
- reservation-service 기준 `VirtualService`, `DestinationRule`이 있다.
- canary 20/50/100/rollback manifest가 있다.
- retry, timeout, connectionPool, outlierDetection 설정이 있다.

부족한 점:

- Kiali topology screenshot 또는 traffic edge 증거가 부족하다.
- Prometheus에서 `istio_requests_total` 같은 metric query 증거가 부족하다.
- canary 비율이 실제 요청 비율에 반영되는지 검증 증거가 부족하다.
- VirtualService fault injection은 synthetic 5xx라 outlierDetection endpoint ejection 증거로는 약하다.
- 실제 실패 Pod 또는 실패 canary workload를 통한 ejection 검증이 필요하다.

판단:

```text
구현 기반: 있음
운영 검증: 부족
상태: 부분 충족
```

## 부족하거나 미충족된 부분

### Elasticsearch/Kibana/Logstash/Fluentd

`00-GOAL.md`에는 Fluentd, Elasticsearch, Kibana, Logstash, ILM, Elasticsearch vs Splunk ADR이 포함되어 있다.

현재 프로젝트는 Loki, Tempo, OpenTelemetry Collector, Grafana 중심으로 가고 있다.

부족한 점:

- Fluentd DaemonSet 구현 증거 부족
- Elasticsearch 서비스별 인덱스 구성 부족
- Kibana dashboard 부족
- Logstash masking/filtering pipeline 부족
- ILM 정책 부족
- Elasticsearch vs Splunk ADR 부족
- Fluentd -> Fluent Bit 전환 비교와 메모리 절감 수치 부족

판단:

```text
현재 방향: Loki/Tempo 기반
원 요구사항과 차이: 큼
상태: 미충족 또는 대체 ADR 필요
```

결정 필요:

- 원문대로 EFK/Logstash를 추가할 것인가
- Loki/Tempo/Grafana로 대체하고 ADR을 남길 것인가

### Alertmanager와 Slack

부족한 점:

- 에러율 5%, P99 2초, CrashLoopBackOff PrometheusRule 증거 부족
- Slack `#ops-alert` 연동 증거 부족
- 테스트 알림 발송 증거 부족
- severity 기반 warning/critical routing 증거 부족
- Slack + email 이중화 증거 부족
- `#incident` 자동 생성 webhook 증거 부족

판단:

```text
구현 기반: 일부 있음
운영 알림 증거: 부족
상태: 미충족에 가까운 부분 충족
```

### 성능 테스트와 최적화

부족한 점:

- `tests/performance/`의 k6 스크립트 부족
- P99, 최대 처리량, 에러율 baseline 측정 부족
- HPA 적용 전후 비교 부족
- Before/After 개선 표 부족
- 성능 병목 분석 문서 부족
- 30일치 Prometheus metric 기반 traffic pattern 분석 부족

판단:

```text
상태: 미충족
```

### DevSecOps

부족한 점:

- SonarQube 정적 분석 부족
- code coverage 80% gate 부족
- Critical issue pipeline block 부족
- PR comment 자동 게시 부족
- 이미지 CVE Trivy scan으로 push 차단하는 구조 부족
- Slack `#security-report` 연동 부족
- OPA Gatekeeper, Falco, OWASP ZAP은 아직 선택 요구사항 수준에서도 증거 부족

판단:

```text
Trivy config scan: 부분 충족
나머지 DevSecOps: 미충족
```

### SLA, MTTR, 운영 보고서

부족한 점:

- 월간 가용성 99.9% 산출 기준 부족
- SLA 준수 여부 산출 view 부족
- 반복 장애 패턴 2개 이상 분석 부족
- MTTR 개선 수치 부족
- 운영 개선 보고서 부족
- 주간 SLA 리포트 자동화 부족

판단:

```text
Runbook 일부 있음
정량 운영 보고: 부족
상태: 미충족
```

## `00-GOAL.md` 체크박스 수정 관점

현재 `00-GOAL.md`에서는 `JUnit`, `Postman E2E`만 체크되어 있다.

하지만 현재 프로젝트는 Python 기반이라 `JUnit`이라는 표현은 맞지 않는다.

정확한 표현:

```text
서비스별 단위 테스트를 pytest로 작성하고 CI 파이프라인에서 자동 실행한다.
```

따라서 `00-GOAL.md`는 다음처럼 정리하는 것이 좋다.

- Java/JUnit 문구는 Python/pytest에 맞게 변경
- 구현 기반이 있는 항목은 `[~]` 같은 별도 표시가 필요하지만 Markdown checkbox는 기본적으로 `[ ]`/`[x]`만 있으므로 표로 관리하는 편이 좋다.
- 실제 운영 증거가 있는 것만 `[x]`로 둔다.
- manifest만 있는 것은 체크하지 말고 “부분 충족” 표에 둔다.

## 우선순위 제안

### 1순위: 현재 구현한 흐름의 운영 증거 확보

먼저 이미 구현한 것부터 증거를 남긴다.

1. Kong smoke test
2. JWT/role guard/rate limit 확인
3. Kafka topic/consumer group 확인
4. `payment-approved -> ticket-service -> ticket-issued -> notification-service` 확인
5. Kiali topology 확인
6. Prometheus Istio metric query 확인
7. Canary 20/50/100/rollback 확인
8. Circuit Breaker retry/timeout/fault/rollback 확인

이 단계가 끝나야 현재 구현한 GitOps/Istio/Kong 작업을 “완료”라고 말할 수 있다.

### 2순위: 모니터링과 알림 완성

1. ServiceMonitor target 확인
2. Grafana dashboard JSON 저장
3. 에러율/P99/CrashLoop PrometheusRule 작성
4. Alertmanager Slack 연동
5. 테스트 알림 발송
6. threshold 캡처 저장

### 3순위: 요구사항과 현재 방향 차이 결정

가장 큰 결정은 logging stack이다.

선택지:

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| EFK/Logstash/Kibana 추가 | 원 요구사항과 정확히 맞음 | 리소스와 구현량 증가 |
| Loki/Tempo/Grafana로 대체 | 현재 구조와 잘 맞음, 가벼움 | 원 요구사항과 다르므로 ADR 필요 |

개인 판단:

현재 프로젝트 리소스와 이미 들어간 구조를 보면 Loki/Tempo/Grafana를 유지하고, Elasticsearch/Kibana 요구사항은 대체 ADR로 정리하는 편이 더 현실적이다.

### 4순위: 성능/DevSecOps/운영 보고

1. k6 baseline 스크립트 작성
2. HPA 수치 요구사항에 맞게 조정 또는 ADR 작성
3. Before/After 성능 측정
4. SonarQube 또는 대체 정적 분석 도입
5. 이미지 Trivy scan push block
6. SLA/MTTR 운영 보고서 작성

## 최종 판단

현재 상태를 한 문장으로 정리하면 다음과 같다.

```text
서비스, Kong, GitOps, Istio, Kafka 이벤트의 구현 기반은 상당히 진행됐지만,
00-GOAL.md 전체 요구사항을 충족하려면 운영 증거, 대시보드/알림, 로깅 stack 결정,
성능 측정, DevSecOps gate, SLA/MTTR 보고가 아직 필요하다.
```

따라서 다음 작업은 새 기능을 무작정 추가하는 것이 아니라, 이미 만든 구조가 실제 AWS dev 환경에서 동작한다는 증거를 먼저 확보하는 것이다.
