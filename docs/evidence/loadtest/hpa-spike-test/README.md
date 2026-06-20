# HPA Spike Loadtest

## Purpose

이 문서는 전체 예매 여정 부하에서 서비스별 HPA가 정상적으로 scale-out 하는지 확인하기 위한 테스트 구성을 기록한다.

HPA spike test는 CPU request를 새로 계산하는 실험이 아니다. 선행 capacity baseline 결과로 정한 서비스별 CPU request를 적용한 뒤, 갑자기 늘어나는 예매 트래픽에서 HPA 판단과 Pod Ready 시간이 정상적으로 이어지는지 본다.

## One Line Command

```bash
PRESET=local-hpa-spike-smoke-1m task --dir gitops dev:loadtest
```

## Test Position

| 실험 | 목적 | HPA |
| --- | --- | --- |
| capacity baseline | 서비스별 CPU request 후보 산출 | off |
| stress find limit | 단일 replica 조건에서 SLO 경계 확인 | off |
| HPA spike smoke | HPA spike 배선, dataset, report 경로 확인 | on |
| HPA spike | 급격한 예매 여정 부하에서 scale-out 반응 확인 | on |

## Scenario And Presets

| 항목 | 값 |
| --- | --- |
| scenario | `reservation-journey-load-test` |
| smoke preset | `local-hpa-spike-smoke-1m` |
| local spike preset | `local-hpa-spike-3m` |
| aws-dev spike preset | `aws-dev-hpa-spike-8m` |
| measured flow | `GET /concerts` -> `GET /concerts/{id}/performances` -> `GET /performances/{id}/seats` -> `POST /reservations` -> `POST /payments` -> `GET /tickets/me` |

인증 토큰 준비와 dataset 준비는 측정 구간 밖에서 처리한다. 측정 구간은 이미 로그인된 고객이 예매 전체 과정을 수행하는 흐름이다.

## Local Smoke Preset

| 항목 | 값 |
| --- | --- |
| preset file | `gitops/platform/loadtest/values/presets/reservation-journey/local-hpa-spike-smoke-1m.yaml` |
| duration | `1m` |
| stages | `30s@1 journey/s`, `30s@3 journey/s` |
| preAllocatedVUs / maxVUs | `20 / 60` |
| customer pool | `30` |
| dataset revision | `reservation-local-hpa-spike-smoke-v1` |
| 목적 | 서비스 재배포, HPA 생성, scale-out 관측 권한, k6 report 생성을 빠르게 확인 |

Smoke는 성능 판단용 수치가 아니다. 실패하면 본 실행을 하지 않고 image, Secret, dataset, network, HPA RBAC, metrics-server 상태를 먼저 확인한다.

## Local Spike Preset

| 항목 | 값 |
| --- | --- |
| preset file | `gitops/platform/loadtest/values/presets/reservation-journey/local-hpa-spike-3m.yaml` |
| duration | `3m` |
| stages | `30s@1`, `30s@5`, `1m@10`, `1m@10 journey/s` |
| preAllocatedVUs / maxVUs | `60 / 160` |
| customer pool | `80` |
| dataset revision | `reservation-local-hpa-spike-v1` |
| 목적 | 로컬 Docker Desktop에서 HPA scale-out 반응과 p95/p99/error 변화를 짧게 확인 |

## Service HPA Conditions

로컬 spike 실행 전 `task --dir gitops dev:loadtest PRESET=local-hpa-spike-smoke-1m` 또는 `PRESET=local-hpa-spike-3m` 명령은 서비스를 `local-hpa-spike` 환경으로 재배포한다.

| 항목 | 값 |
| --- | --- |
| service env values | `gitops/values/env/local-hpa-spike.yaml` |
| HPA | enabled |
| minReplicas / maxReplicas | `1 / 4` |
| target CPU utilization | `70%` |
| CPU limit | `null` |
| ServiceMonitor | enabled |

서비스별 CPU request는 capacity baseline 최신 결과를 기준으로 잡되, 로컬 scale-out 검증에서 HPA 반응을 확인해야 하는 write/read 경로는 50 journey/s 구간에서 target CPU에 가까워지도록 낮춘다.

| 서비스 | CPU request | 기준 |
| --- | ---: | --- |
| auth-service | `2400m` | setup성 작업이므로 scale-out 검증용으로 하향 |
| concert-service | `781m` | capacity baseline 후보 유지 |
| reservation-service | `250m` | 50 journey/s scale-out 검증용 |
| payment-service | `340m` | 50 journey/s scale-out 검증용 |
| ticket-service | `380m` | 50 journey/s scale-out 검증용 |
| notification-service | `427m` | capacity baseline 후보 유지 |

## Helm Chart Layout

| 경로 | 역할 |
| --- | --- |
| `gitops/charts/medikong-service/` | 서비스 Deployment, Service, HPA, ServiceMonitor를 렌더링하는 공통 Helm chart |
| `gitops/charts/medikong-service/templates/hpa.yaml` | `hpa.enabled=true`일 때 `HorizontalPodAutoscaler` 생성 |
| `gitops/values/env/local-hpa-spike.yaml` | 로컬 spike용 공통 환경값. HPA, target CPU, observability, ServiceMonitor 설정 |
| `gitops/values/overrides/local-hpa-spike/<service>.yaml` | capacity baseline 결과를 반영한 서비스별 CPU request override |
| `gitops/platform/loadtest/` | read API loadtest runner Helm chart와 k6 scenario/preset 보관 |
| `gitops/platform/loadtest/values/presets/reservation-journey/` | 같은 `reservation-journey-load-test`에 얹는 smoke/spike 실행 조건 |
| `gitops/platform/loadtest/templates/serviceaccount.yaml` | scale-out 관측용 HPA/Deployment 조회 RBAC 생성 |
| `gitops/platform/loadtest/templates/configmap.yaml` | preset 값을 k6 환경 변수로 전달 |

## Execution Flow

`task --dir gitops dev:loadtest PRESET=local-hpa-spike-smoke-1m` 실행 시 순서는 다음과 같다.

1. 로컬 registry, monitoring, metrics-server를 준비한다.
2. `local-hpa-spike` env와 service별 override로 서비스를 재배포한다.
3. HPA와 ServiceMonitor가 생성된 뒤 짧게 warmup 한다.
4. Kong rate limit을 부하테스트용으로 완화한다.
5. dataset setup Job을 실행한다.
6. `reservation-journey-load-test` read Job을 실행한다.
7. `loadtest_run_report.scenario_report.scale_out_results`에 HPA decision/ready 시간이 남는지 확인한다.

## Result Checks

| 확인 항목 | 기준 |
| --- | --- |
| HPA 생성 | 6개 서비스 HPA가 모두 존재 |
| desired replica | 부하 중 하나 이상의 서비스에서 baseline replica보다 증가 |
| ready replica | HPA decision 후 Pod Ready까지 도달 |
| k6 report | `scenario_report.stage_results`, `scale_out_results` 생성 |
| gateway 조건 | Kong rate limit이 실험 결과를 막지 않음 |
| runner 조건 | dropped iterations나 runner OOM이 먼저 발생하지 않음 |

## Reports

| 실행일 | preset | run id | 결과 | 분석 |
| --- | --- | --- | --- | --- |
| 2026-06-20 | `local-hpa-spike-3m` | `read-api-loadtest-read-manual-20260620055847-9tmqz` | k6 PASS, HPA scale-out 미발생 | [reports/local-hpa-spike-3m-2026-06-20/analysis-report.md](reports/local-hpa-spike-3m-2026-06-20/analysis-report.md) |
| 2026-06-20 | `local-hpa-spike-scaleout-6m` | `read-api-loadtest-read-manual-20260620070803-l2fp4` | HPA scale-out 발생, k6 FAIL | [reports/local-hpa-spike-scaleout-6m-2026-06-20/analysis-report.md](reports/local-hpa-spike-scaleout-6m-2026-06-20/analysis-report.md) |
| 2026-06-20 | `local-hpa-spike-scaleout-6m` | `read-api-loadtest-read-manual-20260620072343-zpsp2` | memory limit 제거 후에도 k6 FAIL, concert DB pool exhaustion 의심 | [reports/local-hpa-spike-scaleout-6m-memory-unlimited-2026-06-20/analysis-report.md](reports/local-hpa-spike-scaleout-6m-memory-unlimited-2026-06-20/analysis-report.md) |

## Follow Up

Smoke가 통과하면 본 실행은 다음 명령으로 진행한다.

```bash
PRESET=local-hpa-spike-3m task --dir gitops dev:loadtest
```

aws-dev에서 같은 목적을 검증할 때는 다음 preset을 사용한다.

```bash
PRESET=aws-dev-hpa-spike-8m task --dir gitops aws:loadtest
```
