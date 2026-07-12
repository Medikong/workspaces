# HPA Spike Loadtest

## Purpose

이 문서는 전체 예매 여정 부하에서 서비스별 HPA가 정상적으로 scale-out 하는지 확인하기 위한 테스트 구성을 기록한다.

HPA spike test는 CPU request를 새로 계산하는 실험이 아니다. 선행 capacity baseline 결과로 정한 서비스별 CPU request를 적용한 뒤, 갑자기 늘어나는 예매 트래픽에서 HPA 판단과 Pod Ready 시간이 정상적으로 이어지는지 본다.

aws-dev reservation journey 실험은 DB connection budget gate를 먼저 통과해야 한다. 서비스/Helm 배포, HPA `2/10/70%`, SQLAlchemy pool budget, dataset setup이 확인되기 전에는 loadtest Job을 실행하지 않는다.

## Documents

| 문서 | 용도 |
| --- | --- |
| [AWS Dev Reservation Journey Scale-out Plan](aws-dev-journey-scaleout-plan-2026-06-21.md) | `aws-dev`에서 `10 journey/s` 단위로 예매 journey 부하를 늘리며 HPA와 필요 Pod 수를 산정하는 실험 계획 |
| [TROUBLE-019](../../../trouble/2026-06-21-hpa-scaleout-db-connection-budget.md) | HPA scale-out 이후 DB connection budget 초과가 발생한 원인과 aws-dev 차단 조건 |

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

전체 예매 과정 spike test는 capacity baseline 결과를 바탕으로 서비스별 CPU request를 조정할 수 있다. 반면 서비스별 HPA spike test는 서비스 간 비교와 원인 분리를 쉽게 하기 위해 `1000m` 기준으로 맞춘다.

| 서비스 | CPU request | 기준 |
| --- | ---: | --- |
| auth-service | `1000m` | 서비스별 spike 공통 기준 |
| concert-service | `1000m` | 서비스별 spike 공통 기준 |
| reservation-service | `1000m` | 서비스별 spike 공통 기준 |
| payment-service | `1000m` | 서비스별 spike 공통 기준 |
| ticket-service | `1000m` | 서비스별 spike 공통 기준 |
| notification-service | `1000m` | 서비스별 spike 공통 기준 |

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

## Service HPA Spike

서비스별 HPA spike test는 전체 예매 과정 spike test를 대체하지 않는다. 전체 예매 과정 spike test는 사용자가 실제로 겪는 예매 흐름에서 운영 검증을 하는 용도이고, 서비스별 spike test는 특정 서비스의 HPA 판단과 Pod Ready 지연을 분리해서 보는 용도다.

| 항목 | 값 |
| --- | --- |
| scenario | `service-hpa-spike-load-test` |
| 목적 | 한 run에서 한 서비스만 측정해 HPA scale-out 원인을 분리 |
| stage | `warmup -> baseline -> spike -> overload -> cooldown` |
| warmup | 판단에서 제외 |
| cooldown | scale-down 확정이 아니라 recovery 관찰로만 해석 |
| report | `loadtest_run_report.scenario_report.report_type=service_hpa_spike` |

Report에는 `stage_results`, `first_limit_candidate`, `scale_out_results`, `service_hpa_results`, `recovery_observations`가 남는다. 서비스별 HPA 결과는 `baseline_replicas`, `max_desired_replicas`, `hpa_decision_seconds`, `scale_out_ready_seconds`를 포함한다.

| 서비스 | preset | 현재 target |
| --- | --- | ---: |
| auth-service | `auth-30rps` | `30 RPS` |
| concert-service | `concert-140rps` | `140 RPS` |
| reservation-service | `reservation-140rps` | `140 RPS` |
| payment-service | `payment-150rps` | `150 RPS` |
| ticket-service | `ticket-75rps` | `75 RPS` |
| notification-service | `notification-400rps` | `400 RPS` |

재시도용 preset은 기존 실행 결과를 바탕으로 따로 둔다. `concert-140rps`는 재실험에서 `2 -> 4` scale-out과 Ready 도달을 확인했으므로 HPA 반응은 유효하다. 다만 baseline 80 RPS부터 일부 API가 SLO를 넘었고 k6 threshold는 실패했다. 추가 trace 확인 결과 직접 원인은 `concert-db` connection exhaustion이다. `payment-150rps`는 post-run CPU가 `42%/70%`, `ticket-75rps`는 `54%/70%`였으므로 RPS와 측정 duration을 올린다.

| 서비스 | retry preset | target | 변경 |
| --- | --- | ---: | --- |
| payment-service | `payment-250rps` | `250 RPS` | baseline/spike/overload/cooldown `90s` |
| ticket-service | `ticket-110rps` | `110 RPS` | baseline/spike/overload/cooldown `90s` |

이번 구성 변경에서는 smoke/load 실행을 하지 않는다. 현재 다른 테스트가 실행 중이므로 아래 명령은 나중에 실행할 예시로만 둔다.

```bash
SCENARIO=service-hpa-spike-load-test PRESET=auth-30rps task --dir gitops dev:loadtest
SCENARIO=service-hpa-spike-load-test PRESET=concert-140rps task --dir gitops dev:loadtest
SCENARIO=service-hpa-spike-load-test PRESET=reservation-140rps task --dir gitops dev:loadtest
SCENARIO=service-hpa-spike-load-test PRESET=payment-150rps task --dir gitops dev:loadtest
SCENARIO=service-hpa-spike-load-test PRESET=ticket-75rps task --dir gitops dev:loadtest
SCENARIO=service-hpa-spike-load-test PRESET=notification-400rps task --dir gitops dev:loadtest
```

실패/재실험 대상 2개는 아래 명령으로 다시 실행한다.

```bash
SCENARIO=service-hpa-spike-load-test PRESET=payment-250rps task --dir gitops dev:loadtest
SCENARIO=service-hpa-spike-load-test PRESET=ticket-110rps task --dir gitops dev:loadtest
```

## Reports

| 실행일 | preset | run id | 결과 | 분석 |
| --- | --- | --- | --- | --- |
| 2026-06-20 | `local-hpa-spike-3m` | `read-api-loadtest-read-manual-20260620055847-9tmqz` | k6 PASS, HPA scale-out 미발생 | [reports/local-hpa-spike-3m-2026-06-20/analysis-report.md](reports/local-hpa-spike-3m-2026-06-20/analysis-report.md) |
| 2026-06-20 | `local-hpa-spike-scaleout-6m` | `read-api-loadtest-read-manual-20260620070803-l2fp4` | HPA scale-out 발생, k6 FAIL | [reports/local-hpa-spike-scaleout-6m-2026-06-20/analysis-report.md](reports/local-hpa-spike-scaleout-6m-2026-06-20/analysis-report.md) |
| 2026-06-20 | `local-hpa-spike-scaleout-6m` | `read-api-loadtest-read-manual-20260620072343-zpsp2` | memory limit 제거 후에도 k6 FAIL, concert DB pool exhaustion 의심 | [reports/local-hpa-spike-scaleout-6m-memory-unlimited-2026-06-20/analysis-report.md](reports/local-hpa-spike-scaleout-6m-memory-unlimited-2026-06-20/analysis-report.md) |
| 2026-06-20 | `local-hpa-spike-scaleout-6m` | `read-api-loadtest-read-manual-20260620074237-npbmp` | concert pool 조정 후 k6 FAIL, reservation DB pool exhaustion 의심 | [reports/local-hpa-spike-scaleout-6m-concert-pool-20-2026-06-20/analysis-report.md](reports/local-hpa-spike-scaleout-6m-concert-pool-20-2026-06-20/analysis-report.md) |
| 2026-06-20 | `local-hpa-spike-scaleout-6m` | `read-api-loadtest-read-manual-20260620075515-4tjs4` | 전체 DB pool 조정 후 k6 FAIL, concert QueuePool `20/20/10` 재포화 | [reports/local-hpa-spike-scaleout-6m-db-pool-20-2026-06-20/analysis-report.md](reports/local-hpa-spike-scaleout-6m-db-pool-20-2026-06-20/analysis-report.md) |
| 2026-06-20 | `local-hpa-spike-scaleout-6m` | `read-api-loadtest-read-manual-20260620082308-ms2vc` | concert pool `35/10/15` 후 40 j/s OK, 50 j/s concert timeout | [reports/local-hpa-spike-scaleout-6m-concert-pool-35-2026-06-20/analysis-report.md](reports/local-hpa-spike-scaleout-6m-concert-pool-35-2026-06-20/analysis-report.md) |
| 2026-06-21 | `service-hpa-spike-summary` | `-` | 서비스별 HPA spike 6개 preset 종합 비교 | [reports/service-hpa-spike-summary-2026-06-21/README.md](reports/service-hpa-spike-summary-2026-06-21/README.md) |
| 2026-06-21 | `auth-30rps` | `read-api-loadtest-read-manual-20260621092401-jqx9r` | FAIL, HPA 유효 | [reports/service-hpa-spike-auth-30rps/README.md](reports/service-hpa-spike-auth-30rps/README.md) |
| 2026-06-21 | `concert-140rps` | `read-api-loadtest-read-manual-20260621121910-8crjb` | FAIL, HPA `2 -> 4` 유효 / `concert-db` connection exhaustion | [reports/service-hpa-spike-concert-140rps/README.md](reports/service-hpa-spike-concert-140rps/README.md) |
| 2026-06-21 | `reservation-140rps` | `read-api-loadtest-read-manual-20260621101259-5vcqs` | PASS, HPA 유효 | [reports/service-hpa-spike-reservation-140rps/README.md](reports/service-hpa-spike-reservation-140rps/README.md) |
| 2026-06-21 | `payment-150rps` | `read-api-loadtest-read-manual-20260621102039-tvll7` | PASS, RPS 부족 | [reports/service-hpa-spike-payment-150rps/README.md](reports/service-hpa-spike-payment-150rps/README.md) |
| 2026-06-21 | `ticket-75rps` | `read-api-loadtest-read-manual-20260621102813-mjt9v` | PASS, RPS 부족 | [reports/service-hpa-spike-ticket-75rps/README.md](reports/service-hpa-spike-ticket-75rps/README.md) |
| 2026-06-21 | `notification-400rps` | `read-api-loadtest-read-manual-20260621103553-7s2j9` | FAIL, HPA 유효 | [reports/service-hpa-spike-notification-400rps/README.md](reports/service-hpa-spike-notification-400rps/README.md) |
| sample | `notification-400rps` | `-` | 서비스별 HPA spike 결론 작성 샘플 | [reports/service-hpa-spike-notification-400rps-sample/README.md](reports/service-hpa-spike-notification-400rps-sample/README.md) |

## Follow Up

Smoke가 통과하면 본 실행은 다음 명령으로 진행한다.

```bash
PRESET=local-hpa-spike-3m task --dir gitops dev:loadtest
```

aws-dev에서 같은 목적을 검증할 때는 다음 preset을 사용한다.

```bash
PRESET=aws-dev-hpa-spike-8m task --dir gitops aws:loadtest
```
