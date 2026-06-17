# 2026-06-15 GOAL 점검 정리

## 1. 폴더 목적

이 폴더는 `00-GOAL.md`와 `01-prd.md`를 기준으로, 팀원이 다시 확인해야 하는 목표 충족 판단과 실행 가능한 검증 기준만 모아둔다.

기준은 다음이다.

```text
기술 스택 이름이 달라도 기능 목적을 만족하면 충족으로 인정한다.
manifest나 코드만 있고 실제 실행 증거가 부족하면 부분 충족으로 둔다.
최종 완료 체크는 클러스터, CI, API 응답, metric/log/trace, runtime test 같은 실행 증거가 있을 때만 한다.
```

긴 phase별 실행 로그, 개인 판단 초안, 임시 smoke script는 커밋 대상 팀 문서에서 제외하고 `docs/personal/execution/2026-06-15-goal-review/`로 이동했다. `docs/personal/`은 `.gitignore` 대상이므로 팀 공유 commit에는 포함하지 않는다.

## 2. 팀 공유 문서

| 문서 | 역할 |
| --- | --- |
| `goal-functional-equivalence-checklist-2026-06-15.md` | 가장 중요한 체크리스트. 기술명이 달라도 기능 목적을 만족하면 `[x]`로 인정하고, runtime 증거가 부족하면 `[ ]` 또는 부분 충족으로 둔다. |
| `goal-prd-full-traceability-assessment-2026-06-15.md` | `00-GOAL.md`와 `01-prd.md` 전체 목표를 항목별로 추적한다. 무엇이 완료, 부분 충족, 미충족인지 근거와 함께 정리한다. |
| `goal-evidence-runbook.md` | 남은 체크리스트를 닫기 위해 어떤 명령과 증거를 모아야 하는지 정리한 실행 기준 문서다. |
| `networkpolicy-beginner-guide-2026-06-16.md` | NetworkPolicy ingress/egress, DNS, OTel, DB, Kafka, Istio 허용 범위를 초보자 관점에서 설명한다. |

## 3. Evidence와 Trouble 연결

실제 검증 결과와 문제 분석은 아래 위치에 둔다.

| 구분 | 위치 | 의미 |
| --- | --- | --- |
| NetworkPolicy runtime PASS evidence | `docs/evidence/security/network-policy-block/README.md` | private-dev에서 DB/Kafka 접근 제어 NetworkPolicy가 의도대로 동작함을 검증한 결과 |
| NetworkPolicy connect-only false positive trouble | `docs/trouble/2026-06-17-networkpolicy-connect-only-false-positive.md` | Istio sidecar가 있는 Pod에서 `socket.connect()`만으로 검증하면 허용처럼 보일 수 있었던 문제와 최종 판정 |

팀 공유 문서에는 최종 판단과 링크를 남기고, 원본 터미널 로그나 개인 메모는 `docs/personal/`에 둔다.

## 4. 현재 가장 중요한 판단

현재 프로젝트는 다음 기반을 갖추고 있다.

```text
FastAPI 서비스
pytest 단위 테스트
Postman/Newman E2E 기반
Dockerfile / AWS ECR / GitHub Actions
Helm / ArgoCD
Kong Gateway
Kafka 이벤트 흐름
서비스별 DB
Prometheus / Grafana / Loki / Tempo / OpenTelemetry Collector
ServiceMonitor / PodMonitor
Istio / Kiali / VirtualService / DestinationRule
NetworkPolicy / RBAC / ServiceAccount
k6 synthetic runner
```

완료로 인정할 수 있는 대표 항목은 다음이다.

```text
좌석 중복 0건 검증
Kafka 기반 후속 처리 분리
notification 장애 격리
Kong JWT / role guard / rate limit 검증
Prometheus / Loki / Tempo 기반 관측성 일부 검증
DB/Kafka NetworkPolicy runtime 검증
```

아직 완료라고 말하면 안 되는 대표 항목은 다음이다.

```text
운영급 HPA k6 p99/5xx/scale-out time
Istio mTLS runtime 검증
Canary 20/50/100 traffic ratio
rollback_time_seconds
Circuit breaker 장애 주입과 outlier ejection
Slack 알림
S3 ticket artifact
SLA / MTTR / 운영 보고서
```

## 5. 다음 진행 순서

체크리스트 기준으로 다음 순서가 가장 현실적이다.

```text
1. RBAC / ServiceAccount 권한을 kubectl auth can-i로 검증한다.
2. NetworkPolicy evidence를 goal checklist에 최종 반영한다.
3. 기본 프로젝트 문서 구멍을 닫는다.
   - event-storming
   - service-communication-policy
   - failure-isolation
4. HPA k6 기반 성능 검증을 수행한다.
5. Istio mTLS / Canary / Rollback / Circuit Breaker runtime 검증을 수행한다.
6. DevSecOps 보강 항목을 결정한다.
   - SonarQube 또는 대체 정적 분석
   - coverage 80% gate
   - Trivy fail evidence
   - Slack 연동 여부
7. S3 ticket artifact와 SLA/MTTR 보고서를 마무리한다.
```

## 6. 개인 실행 로그 위치

아래 자료는 팀 공유 commit에는 포함하지 않는다.

```text
docs/personal/execution/2026-06-15-goal-review/
```

이 위치에는 phase별 실행 기록, smoke script, 개인 판단 초안, 긴 터미널 기반 분석 문서를 보관한다. 팀에 필요한 내용은 요약해서 `goal`, `evidence`, `trouble` 문서로 승격한다.
