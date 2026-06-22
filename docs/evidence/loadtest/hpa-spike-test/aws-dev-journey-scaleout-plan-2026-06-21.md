# AWS Dev Reservation Journey Scale-out Plan

## Purpose

이 실험은 AWS `aws-dev` 환경에서 전체 예매 journey 부하를 `10 journey/s` 단위로 올리면서, 기본 2 Pod에서 HPA가 서비스별 Pod를 얼마나 늘리는지 확인한다.

단, 현재 실험은 바로 실행하지 않는다. HPA scale-out 전에 DB connection budget 문제가 먼저 확인됐으므로, 서비스/Helm 배포와 DB pool 제한을 aws-dev에 반영하고 검증한 뒤에만 부하테스트를 실행한다.

목표는 단순 최대 RPS가 아니라 다음 질문에 답하는 것이다.

| 질문 | 산출물 |
| --- | --- |
| `N journey/s`를 안정 처리하려면 서비스별 Pod가 몇 개 필요한가? | journey/s별 필요 Pod 산정표 |
| HPA가 어느 서비스에서 먼저 반응하는가? | 서비스별 desired/ready replica 변화 |
| scale-out 전후 p95/p99와 실패율은 어떻게 달라지는가? | stage별 latency/error/domain result |
| 첫 한계 후보는 API, DB pool, HPA 지연, node capacity 중 무엇인가? | first limit candidate와 증거 로그 |

## Scope

| 항목 | 값 |
| --- | --- |
| environment | `aws-dev` |
| scenario | `reservation-journey-load-test` |
| base preset | `aws-dev-hpa-spike-8m` |
| measured journey | `GET /concerts` -> `GET /concerts/{id}/performances` -> `GET /performances/{id}/seats` -> `POST /reservations` -> `POST /payments` -> `GET /tickets/me` |
| auth | 측정 전 setup에서 로그인 토큰 준비 |
| dataset | 측정 전 dataset setup Job으로 준비 |
| primary unit | `journey/s` |
| report root | `workspace/docs/evidence/loadtest/hpa-spike-test/reports/` |

## Deployment Surface

AWS 실험 전에 Argo CD 기준으로 아래 Application이 Sync/Healthy 상태여야 한다.

| 구분 | Application / 리소스 | 확인 이유 |
| --- | --- | --- |
| entrypoint | `medikong-aws-dev-apps` | platform/services Application 진입점 |
| namespace | `namespaces-aws-dev` | `ticketing-*`, `loadtest`, `monitoring`, `observability`, `kong` namespace 준비 |
| data | `data-aws-dev` | auth/concert/reservation/payment/ticket DB와 MongoDB 준비 |
| gateway | `kong-aws-dev`, `kong-shared-resources-aws-dev` | Kong proxy, IngressClass, 공통 plugin, rate limit 완화 |
| metrics | `metrics-server-aws-dev` | HPA CPU 판단과 `kubectl top` 확인 |
| monitoring | `monitoring-aws-dev` | Prometheus/Grafana 지표 확인 |
| observability | `loki-aws-dev`, `tempo-aws-dev`, `pyroscope-aws-dev`, `opentelemetry-collector-aws-dev` | 로그, trace, profile 확인 |
| services | `auth/concert/reservation/payment/ticket/notification-aws-dev` | 예매 journey 대상 서비스 |
| loadtest | `read-api-loadtest-aws-dev` | dataset/read manual Job 실행 |

배포 순서는 loadtest 실행보다 중요하다. 먼저 service image와 Helm chart/value 변경이 aws-dev 서비스 Application에 반영되어야 하고, 그 다음 dataset setup과 read Job을 실행한다.

| 순서 | 작업 | 완료 조건 |
| ---: | --- | --- |
| 1 | GitOps root/platform bootstrap 확인 | `medikong-aws-dev-apps`, namespace, storage, data, Kong, metrics, observability가 Sync/Healthy |
| 2 | 신규 서비스 image와 Helm chart/value 배포 | `auth/concert/reservation/payment/ticket/notification-aws-dev`가 최신 revision으로 Sync/Healthy |
| 3 | HPA와 DB connection budget 확인 | min `2`, max `10`, target `70%`, pool budget 계산이 DB 한도 안에 있음 |
| 4 | loadtest chart와 Secret/RBAC 확인 | `read-api-loadtest-aws-dev`, credential Secret, HPA polling 권한 확인 |
| 5 | dataset setup Job 실행 | dataset revision과 row count 검증 완료 |
| 6 | reservation journey run 실행 | 단일 run id로 `R10`부터 `R50`까지 실행 |

## Preflight Checklist

아래 명령은 AWS kubeconfig context에서 실행한다. 현재 로컬 터미널 context가 `docker-desktop`이면 AWS 상태 확인이 아니므로 먼저 context를 바꾼다.

```bash
kubectl config current-context
task --dir gitops aws:check
task --dir gitops aws:status
kubectl -n argocd get applications
```

| 확인 | 명령 |
| --- | --- |
| Argo sync/health | `kubectl -n argocd get applications` |
| 서비스/HPA/PDB | `kubectl get pods,svc,hpa,pdb --all-namespaces -l app.kubernetes.io/part-of=medikong` |
| HPA metrics | `kubectl top nodes`, `kubectl top pods -A` |
| loadtest Secret | `kubectl -n loadtest get secret read-api-loadtest-credentials` |
| loadtest RBAC | `kubectl get clusterrole,clusterrolebinding | grep read-api-loadtest` |
| Kong rate limit 완화 | `kubectl get kongclusterplugin -A | grep ticketing-rate-limit` |
| loadtest 중복 실행 | `kubectl -n loadtest get jobs,pods -l medikong.io/phase=loadtest` |
| DB Pod 상태 | `kubectl get pods -A | grep -E 'auth-db|concert-db|reservation-db|payment-db|ticket-db'` |
| DB max connections | `kubectl -n ticketing-concert exec statefulset/concert-db -- psql -U user -d concert_db -tAc 'show max_connections;'`, 다른 DB도 동일하게 확인 |
| service image/tag | `kubectl get deploy -A -l app.kubernetes.io/part-of=medikong -o custom-columns='NS:.metadata.namespace,NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image'` |
| 서비스 Pod 안정화 | `kubectl get deploy,hpa -n ticketing-auth`, 다른 `ticketing-*` namespace도 동일하게 확인 |

## Precondition

`aws-dev` 서비스 배포값은 평소에도 HPA 검증이 가능한 개발환경 기준으로 둔다. 이 실험을 위해 별도 임시 override를 씌우기보다, 기본 `aws-dev` 값 자체를 아래 기준으로 유지한다.

| 항목 | `aws-dev` 기준 |
| --- | --- |
| deployment replicas | `2` |
| HPA enabled | `true` |
| HPA minReplicas | `2` |
| HPA maxReplicas | `10` |
| HPA CPU target | `70%` |
| CPU request | capacity baseline 기준값 우선 |
| CPU limit | 없거나 throttling이 측정에 끼어들지 않을 만큼 충분히 높게 설정 |
| SQLAlchemy pool | HPA 최대치와 DB `max_connections` 안에서 계산 |
| SQLAlchemy max overflow | `0` 기준. overflow로 DB 접속 폭증을 만들지 않는다 |
| PDB | 서비스별 현재 정책 유지 |
| metrics-server | HPA와 `kubectl top` 모두 정상 |
| ServiceMonitor | enabled |
| Kong rate limit | 부하테스트를 막지 않는 값 |

현재 적용 위치는 `gitops/values/env/aws-dev.yaml`과 `gitops/values/services/aws-dev/<service>.yaml`이다. 서비스별 override가 공통 env 값을 덮어쓸 수 있으므로, 각 서비스의 `deployment.replicas`와 `hpa` 값도 같은 기준으로 맞춘다.

서비스 manifest는 Argo CD에서 아래 valueFiles 순서로 합성된다.

```text
values/base.yaml
values/env/aws-dev.yaml
values/services/<service>.yaml
values/services/aws-dev/<service>.yaml
```

따라서 HPA 기준은 공통 env와 서비스별 aws-dev override 둘 다에서 확인한다.

## DB Connection Budget Gate

HPA 실험 전에 이 gate를 통과해야 한다. HPA는 Pod를 늘려 처리량을 키우지만, DB connection budget이 맞지 않으면 scale-out이 DB 접속 실패 증가로 바뀐다.

aws-dev data values의 PostgreSQL 값은 `max_connections=300`이다. 현재 서비스 API process는 `UVICORN_WORKERS=2`이고, reservation/payment/ticket은 background worker Deployment도 1개씩 가진다. 따라서 SQLAlchemy pool은 아래 계산을 통과해야 한다.

```text
api_connection_budget = hpa.maxReplicas * UVICORN_WORKERS * (poolSize + maxOverflow)
worker_connection_budget = workerReplicas * (poolSize + maxOverflow)
total_service_connection_budget = api_connection_budget + worker_connection_budget
```

aws-dev 1차 기준은 `poolSize=8`, `maxOverflow=0`, `poolTimeoutSeconds=15`이다.

| service | API max replicas | API workers | worker replicas | pool | max overflow | worst-case app connections | DB max connections | 판단 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| auth | 10 | 2 | 0 | 8 | 0 | 160 | 300 | 여유 140 |
| concert | 10 | 2 | 0 | 8 | 0 | 160 | 300 | 여유 140 |
| reservation | 10 | 2 | 1 | 8 | 0 | 168 | 300 | 여유 132 |
| payment | 10 | 2 | 1 | 8 | 0 | 168 | 300 | 여유 132 |
| ticket | 10 | 2 | 1 | 8 | 0 | 168 | 300 | 여유 132 |
| notification | 10 | 2 | 1 | 8 | 0 | n/a | MongoDB | PostgreSQL 대상 아님 |

이 gate가 실패하면 `PRESET=aws-dev-hpa-journey-r10-r50 task --dir gitops aws:loadtest`를 실행하지 않는다. 먼저 service values, DB max connections, worker 수, HPA max 중 하나를 조정한다.

## Baseline Inputs

`1000m` CPU request 기준 Pod당 RPS는 capacity baseline 최종 분석값을 시작점으로 둔다.

| service | 1000m 기준 Pod당 RPS | journey 1회당 호출 가중치 | rough scale-out trigger with 2 pods |
| --- | ---: | ---: | ---: |
| auth-service | 30 | setup only | measured stage 제외 |
| concert-service | 140 | 3 | 약 90 journey/s 이상부터 주의 |
| reservation-service | 140 | 1 | 약 280 journey/s 이상부터 주의 |
| payment-service | 150 | 1 | 약 300 journey/s 이상부터 주의 |
| ticket-service | 75 | 1 | 약 150 journey/s 이상부터 주의 |
| notification-service | 320 | 0 | measured stage 제외 |

위 표는 capacity baseline을 이용한 사전 추정이다. 실제 AWS run에서는 Kong, network, DB pool, Pod 분산, HPA window, node 여유가 함께 작동하므로 최종 판단은 `loadtest_run_report`와 서비스 로그를 기준으로 한다.

## Dataset And Preset

실행 preset은 `gitops/platform/loadtest/values/presets/reservation-journey/aws-dev-hpa-journey-r10-r50.yaml`이다.

| 항목 | 값 |
| --- | --- |
| dataset profile | `reservation-journey` |
| dataset revision | `reservation-hpa-journey-r10-r50-v1` |
| concerts | `80` |
| performances per concert | `3` |
| customer pool | `500` |
| active customers | `500` |
| expected journeys | `38340` |
| target tickets per customer | `100` |
| read Job activeDeadlineSeconds | `2700` |
| runner resources | request `500m/512Mi`, limit `2 CPU/1Gi` |

`80 * 3 * 300 = 72000` seats가 준비되므로, 약 `38340`회 journey를 한 번 실행하는 데 필요한 좌석 여유가 있다. setup과 본 실행은 `read-api-loadtest-credentials` Secret의 `LOADTEST_PROVIDER_EMAIL`, `LOADTEST_PROVIDER_PASSWORD`, `LOADTEST_ADMIN_EMAIL`, `LOADTEST_ADMIN_PASSWORD`를 사용한다.

## Experiment Shape

기본 실험은 `R10`부터 `R50`까지를 하나의 k6 실행 안에서 모두 처리한다. `R10`, `R20`처럼 실행을 나누지 않고, 같은 `loadtest_run_id` 안에서 stage만 `10 journey/s` 단위로 올린다. 하강 구간에서는 품질 회복과 HPA scale-down 관찰을 분리해서 본다.

HPA template에는 별도 `behavior.scaleDown` 정책이 없으므로 scale-down은 Kubernetes 기본 안정화 정책 영향을 받는다. 따라서 짧은 cooldown은 p95/p99 회복을 보는 구간이고, replicas가 `2`까지 내려오는지는 별도 idle wait에서 확인한다.

| stage | 목적 | load | expected signal |
| --- | --- | --- | --- |
| warmup-low | 배선과 낮은 부하 확인 | `2m@2` | dataset, auth setup, report, HPA polling 정상 |
| warmup-ramp | HPA 입력 전 점진 증가 | `2m@5` | 초기 p95/p99, dropped iterations 없음 |
| R10 | 낮은 기준선 | `3m@10` | 기본 2 Pod에서 안정 처리 |
| R20 | 낮은 증가 | `3m@20` | p95/p99와 CPU 증가폭 확인 |
| R30 | 중간 증가 | `3m@30` | concert read latency 변화 확인 |
| R40 | 기존 local 안정권 비교 | `4m@40` | local 40 journey/s 결과와 비교 |
| R50 | local 한계 후보 재검증 | `4m@50` | concert timeout, DB pool wait, HPA 반응 확인 |
| cooldown-half | 부하 절반 하강 | `3m@25` | p95/p99 회복 여부 확인 |
| cooldown-low | 낮은 부하 유지 | `5m@2` | recovery 품질과 HPA scale-down 관찰 |

run이 끝난 뒤에는 최대 `10m`까지 idle wait를 두고 HPA current/desired replicas가 `2`로 돌아오는지 확인한다. 이 idle wait는 k6 통계 구간에 넣지 않고 Kubernetes/Grafana 관측으로만 기록한다.

이 기본 실행에서 `R50`까지 안정적이면, 다음 실행은 같은 구조에 `R60`, `R70` 같은 상승 stage만 추가한다. 아래 stop condition 중 하나가 특정 stage에서 나오면 그 stage를 첫 한계 후보로 기록하고, cooldown 결과를 확인한 뒤 다음 실행 대신 원인 분리 실험으로 넘어간다.

## Stop Conditions

| 조건 | 판단 |
| --- | --- |
| `http_req_failed`가 3% 이상 | 네트워크/API 실패 후보 |
| journey success rate가 97% 미만 | 도메인 처리 실패 후보 |
| ticket issued rate가 97% 미만 | 예매 완료성 실패 후보 |
| conflict rate가 15% 초과 | 좌석 후보/동시성 조건 재검토 |
| p95가 2s 초과 또는 p99가 5s 초과 | 사용자 체감 한계 후보 |
| dropped iterations가 1% 초과 | k6 runner 또는 maxVUs 부족 후보 |
| 특정 서비스 HPA desired replicas가 10 도달 | max replica 용량 한계 후보 |
| cooldown에서도 p95/p99가 정상화되지 않음 | scale-out 이후 backlog 또는 downstream 병목 후보 |
| idle wait 후에도 desired/current replicas가 2로 내려오지 않음 | scale-down 정책, metrics 잔류, background load 후보 |
| Pod restart, readiness 실패, probe timeout 발생 | service saturation 후보 |
| DB pool timeout 또는 max connections 근접 | DB connection budget 후보 |
| node CPU/memory pressure 발생 | cluster capacity 후보 |

## Required Observations

이 실험은 `loadtest_run_id` 하나를 기준으로 아래 항목을 남긴다.

| 관측 항목 | 출처 |
| --- | --- |
| preset, run id, dataset revision, stage table | `loadtest_experiment_conditions`, `loadtest_run_report` |
| stage별 journey/s, p95, p99, failed rate | `scenario_report.stage_results` |
| 첫 한계 후보 | `scenario_report.first_limit_candidate` |
| 서비스별 HPA decision/ready seconds | `scenario_report.scale_out_results` |
| 서비스별 max desired/ready replicas | HPA/Deployment polling result |
| cooldown p95/p99/error와 recovered 여부 | stage별 cooldown row, recovery observation |
| idle wait 후 desired/current replicas | HPA/Deployment polling 또는 `kubectl get hpa,deploy` |
| API step별 p95/p99/failed | `loadtest_api_summary` 또는 report step rows |
| service별 CPU/memory | Prometheus, Grafana |
| DB pool timeout, probe timeout, restart | Loki service logs, Kubernetes events |

## Result Table Template

실행 후 보고서는 아래 표를 채운다.

| stage journey/s | k6 result | max desired replicas | p95 | p99 | failed | success | first limit | decision |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 10 | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| 20 | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| 30 | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| 40 | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| 50 | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

cooldown과 scale-down은 별도 표로 정리한다.

| recovery stage | load | p95 | p99 | failed | success | recovered | desired/current replicas | 판단 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| cooldown-half | 25 | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| cooldown-low | 2 | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| idle-wait | 0 | n/a | n/a | n/a | n/a | n/a | TBD | TBD |

서비스별 Pod 산정표는 아래 형식으로 정리한다.

| target journey/s | auth | concert | reservation | payment | ticket | notification | 판단 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 10 | setup | TBD | TBD | TBD | TBD | n/a | TBD |
| 20 | setup | TBD | TBD | TBD | TBD | n/a | TBD |
| 30 | setup | TBD | TBD | TBD | TBD | n/a | TBD |
| 40 | setup | TBD | TBD | TBD | TBD | n/a | TBD |
| 50 | setup | TBD | TBD | TBD | TBD | n/a | TBD |

## Interpretation Rules

| 상황 | 해석 |
| --- | --- |
| HPA desired는 올랐지만 ready가 늦다 | Pod scheduling, image pull, readiness, node 여유를 먼저 본다 |
| ready는 빨리 올랐지만 p99가 회복되지 않는다 | DB pool, connection wait, lock, downstream 병목을 본다 |
| 부하를 낮춘 뒤 p95/p99가 정상화된다 | scale-out은 유효하고 target plateau의 용량 또는 대기열 문제로 본다 |
| 부하를 낮춰도 p95/p99가 유지된다 | backlog, connection leak, stuck request, downstream queue를 본다 |
| idle wait 후에도 replica가 줄지 않는다 | scale-down 실패로 단정하지 않고 HPA metrics window와 background traffic을 같이 확인한다 |
| CPU 70% 미만인데 latency가 커진다 | CPU보다 DB pool, sync worker, network, lock 후보가 우선이다 |
| 특정 stage에서 concert API만 실패한다 | `/concerts`, performances, seats step을 분리해 concert-service를 먼저 본다 |
| domain success만 낮고 HTTP error는 낮다 | 좌석 후보, conflict, ticket issue 완료 조건을 먼저 본다 |
| k6 dropped iterations가 높다 | 서비스 한계로 해석하기 전에 runner VU와 resource를 조정한다 |

## Execution Notes

실험 실행은 서비스/Helm 배포와 DB connection budget gate를 통과한 뒤에만 진행한다. 아래 명령은 바로 첫 단계로 실행하는 명령이 아니라, 배포와 사전 확인이 끝난 뒤 read Job을 트리거하는 명령이다.

```bash
PRESET=aws-dev-hpa-journey-r10-r50 task --dir gitops aws:loadtest
```

`task aws:loadtest`는 `platform/loadtest/values/runs/aws-dev/reservation-journey-aws-dev-hpa-journey-r10-r50.yaml`에 새 run id를 쓰고, `argo/applications/aws-dev/platform/loadtest.yaml`의 valueFiles를 갱신한 뒤 Git commit/push로 Argo CD 실행을 트리거한다. 따라서 실행 전 `gitops` repo는 push 가능한 clean 상태여야 한다.

명시적 run id를 남기려면 아래처럼 실행한다.

```bash
LOADTEST_RUN_ID=aws-dev-hpa-journey-r10-r50-20260621 \
  PRESET=aws-dev-hpa-journey-r10-r50 \
  task --dir gitops aws:loadtest
```

실행 후 확인 명령은 아래를 기본으로 한다.

```bash
kubectl -n loadtest get jobs,pods
kubectl -n loadtest logs job/read-api-loadtest-read-<run-id> --tail=-1
kubectl get hpa -A
kubectl get deploy -A | grep -E 'auth-service|concert-service|reservation-service|payment-service|ticket-service|notification-service'
```

기본 실행이 `R50`까지 안정적이면 같은 단일 실행 구조에 `R60`, `R70`, `R80` stage를 추가한다.

## Follow-up Experiments

| 조건 | 다음 실험 |
| --- | --- |
| `R50` 이하에서 concert timeout | concert-service DB pool/worker/probe 분리 실험 |
| HPA가 10 replicas까지 도달 | node capacity와 cluster autoscaler 후보 검토 |
| ticket-service가 먼저 실패 | `/tickets/me` list cost, pagination, issue 완료 조건 분리 |
| reservation conflict가 급증 | seat candidate pool, active customer count, max seat attempts 재조정 |
| payment p99가 커짐 | payment DB pool, outbox/worker 분리 상태, downstream timeout 확인 |
