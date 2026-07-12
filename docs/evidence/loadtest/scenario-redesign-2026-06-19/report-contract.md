# Report Contract

## 목적

보고서는 실행 로그 모음이 아니라 실험 1회의 판단 단위여야 한다. `loadtest_run_id` 하나가 하나의 실험 리포트가 되고, 같은 조건을 재실행해 Before/After 비교가 가능해야 한다.

## 보고서 입력

| 출처 | 포함 값 |
| --- | --- |
| k6 | summary, threshold, step별 p50/p95/p99, RPS, error rate |
| Prometheus | 서비스별 CPU, memory, request count, latency, DB connection, Kafka lag |
| Kubernetes | Pod count, HPA desired/current, Ready event, restart, scheduling event |
| Loki | `loadtest_experiment_conditions`, `loadtest_summary`, `loadtest_api_summary`, `loadtest_run_report` |
| Grafana | `Load 60 - k6 Runner Execution`의 run-scoped 화면 |

## 실행 조건

리포트에는 다음 실행 조건을 반드시 남긴다.

| 항목 | 예시 |
| --- | --- |
| `loadtest_run_id` | Pod 또는 Job 기준으로 안정적인 run id |
| environment | `aws-dev`, `local` |
| scenario | `reservation-journey-load-test` |
| preset | `baseline`, `stress-find-limit`, `spike-hpa` |
| start/end time | UTC와 KST를 함께 남김 |
| base URL | Gateway 또는 internal service URL |
| dataset profile/revision | `reservation-journey`, `reservation-create-v1` |
| customer pool revision | run에서 사용한 계정 풀 revision |
| HPA condition | ON/OFF, min, max, CPU target |
| app revision | image tag 또는 commit |

## 필수 비교 표

튜닝 전후 비교는 같은 scenario, preset, dataset, HPA 조건에서만 의미가 있다.

| 항목 | Before | After | 개선율 |
| --- | ---: | ---: | ---: |
| P50 |  |  |  |
| P95 |  |  |  |
| P99 |  |  |  |
| Max RPS |  |  |  |
| Error Rate |  |  |  |
| Scale-out Time |  |  |  |
| Max Pods |  |  |  |

계산식:

```text
P99 개선율 = (Before P99 - After P99) / Before P99 * 100
Throughput 개선율 = (After RPS - Before RPS) / Before RPS * 100
Error rate 개선율 = (Before Error - After Error) / Before Error * 100
```

Before Error가 0이면 error rate 개선율은 계산하지 않고 "비교 불가"로 표시한다.

## 서비스별 표

전체 평균만 남기면 MSA 병목을 놓치기 쉽다. 리포트에는 서비스별 표를 함께 둔다.

| 서비스 | P95 | P99 | RPS | Error Rate | CPU Max | Memory Max | Max Pods | 주요 신호 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Kong Gateway |  |  |  |  |  |  |  |  |
| auth-service |  |  |  |  |  |  |  |  |
| concert-service |  |  |  |  |  |  |  |  |
| reservation-service |  |  |  |  |  |  |  |  |
| payment-service |  |  |  |  |  |  |  |  |
| ticket-service |  |  |  |  |  |  |  |  |
| notification-service |  |  |  |  |  |  |  |  |
| DB |  |  |  |  |  |  |  | connection/query latency |
| Kafka |  |  |  |  |  |  |  | lag/produce/consume |

## HPA 타임라인 표

Spike 리포트에는 HPA 타임라인을 별도 표로 둔다.

| 서비스 | 부하 시작 | CPU 70% 도달 | HPA 판단 | Pod Ready | 트래픽 유입 | P99 안정화 | Scale-out Time |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| auth-service |  |  |  |  |  |  |  |
| concert-service |  |  |  |  |  |  |  |
| reservation-service |  |  |  |  |  |  |  |
| payment-service |  |  |  |  |  |  |  |
| ticket-service |  |  |  |  |  |  |  |

## 성공 기준

| 실험 | 성공 기준 |
| --- | --- |
| smoke | 전체 실행 경로와 report 생성 확인 |
| baseline | p50/p95/p99, max RPS, error rate 산출 가능 |
| stress | 첫 한계 후보와 원인 후보 설명 가능 |
| spike | scale-out 응답시간과 p99 안정화 여부 판단 가능 |
| tuning | 같은 조건에서 Before/After 개선율 산출 가능 |
| report | k6 결과, Prometheus 지표, HPA 이벤트가 하나의 run 리포트로 연결됨 |

## 반복 실행 규칙

- `loadtest_run_id`는 한 Job/Pod 실행 동안 안정적으로 유지한다.
- iteration별 동적 값은 `iteration_id`로 분리한다.
- request id, trace id, user id, token, email은 metric label에 넣지 않는다.
- 같은 실험을 재실행할 때 scenario, preset, dataset, HPA 조건을 바꾸지 않는다.
- 조건을 바꿨다면 튜닝 비교가 아니라 새 실험으로 기록한다.

