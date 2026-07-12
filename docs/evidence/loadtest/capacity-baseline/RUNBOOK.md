# Capacity Baseline Runbook

이 문서는 `capacity-baseline-load-test`를 로컬에서 실행하고 결과를 보관할 때 사용하는 명령어 모음이다.

## 1. 실행 전 상태 확인

작업 전에는 nested repo 상태를 먼저 확인한다.

```bash
git -C gitops status --short --branch
git -C workspace status --short --branch
```

현재 선택 가능한 capacity baseline preset을 확인한다.

```bash
find gitops/platform/loadtest/values/presets/capacity-baseline -maxdepth 1 -type f | sort
```

기존 loadtest Job이 실행 중이면 새 run을 시작하지 않는다.

```bash
kubectl -n loadtest get jobs \
  -l 'app.kubernetes.io/name=read-api-loadtest,medikong.io/scenario!=setup-read-dataset'
```

Kong rate limit 상태를 확인한다.

```bash
task --dir gitops/platform/loadtest kong-rate-limit:status
```

## 2. Preset Render 확인

짧은 smoke preset이다.

```bash
task --dir gitops/platform/loadtest render \
  SCENARIO=capacity-baseline-load-test \
  PRESET=local-smoke \
  >/tmp/capacity-baseline-local-smoke.yaml
```

실제 측정용 500m preset이다.

```bash
task --dir gitops/platform/loadtest render \
  SCENARIO=capacity-baseline-load-test \
  PRESET=local-baseline-500m \
  >/tmp/capacity-baseline-local-baseline-500m.yaml
```

실험 조건이 의도대로 들어갔는지 확인한다.

```bash
rg 'LOADTEST_TRAFFIC_MODEL_PRESET|LOADTEST_CAPACITY_BASELINE_STAGES|LOADTEST_CAPACITY_BASELINE_FIXED_CONDITIONS|LOADTEST_CAPACITY_BASELINE_SEED_ROW_COUNTS' \
  /tmp/capacity-baseline-local-baseline-500m.yaml
```

기대값은 다음과 같다.

```text
LOADTEST_TRAFFIC_MODEL_PRESET: "local-baseline-500m"
LOADTEST_CAPACITY_BASELINE_STAGES: 10, 20, 40, 80, 160 RPS
LOADTEST_CAPACITY_BASELINE_FIXED_CONDITIONS: cpuRequest=500m, cpuLimit=none, hpa=disabled, replicas=1
```

특정 서비스 step만 실행하려면 preset의 `scenarios.capacityBaseline.serviceSteps` 배열을 바꾼다.

```yaml
scenarios:
  capacityBaseline:
    serviceSteps:
      - payment
```

사용 가능한 값은 `auth`, `concert`, `reservation`, `payment`, `ticket`, `notification`이다. 전체 실행이 너무 길거나 후반 서비스만 재검증할 때는 이 배열을 줄여서 같은 시나리오를 서비스 step 단위로 실행한다.

파일을 바꾸지 않고 한 번만 override할 수도 있다.

```bash
LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS='["payment"]' \
SCENARIO=capacity-baseline-load-test \
PRESET=local-baseline-500m \
task --dir gitops/platform/loadtest render
```

## 3. 정적 검증

loadtest chart lint를 실행한다.

```bash
task --dir gitops/platform/loadtest lint
```

서비스 Helm chart lint를 실행한다.

```bash
task --dir gitops helm:lint
```

`k6 inspect`는 env 값을 명시해야 한다. 간단히 시나리오가 6개 서비스 단계로 잡히는지만 볼 때는 아래처럼 실행한다.

```bash
k6 inspect \
  -e LOADTEST_SCENARIO=capacity-baseline-load-test \
  -e LOADTEST_ENVIRONMENT=local \
  -e LOADTEST_TARGET=local \
  -e LOADTEST_BASE_URL=http://localhost:32080 \
  -e LOADTEST_PROFILE=capacity-baseline \
  -e LOADTEST_DATASET_REVISION=capacity-baseline-v1 \
  -e LOADTEST_CUSTOMER_POOL_SIZE=500 \
  -e LOADTEST_CUSTOMER_POOL_EMAIL_PREFIX=capacity-customer \
  -e LOADTEST_CUSTOMER_POOL_EMAIL_DOMAIN=loadtest.medikong.local \
  -e LOADTEST_CUSTOMER_POOL_PASSWORD=loadtest1234 \
  -e LOADTEST_CAPACITY_BASELINE_STAGES='[{"duration":"60s","target":10},{"duration":"60s","target":20},{"duration":"60s","target":40},{"duration":"60s","target":80},{"duration":"60s","target":160}]' \
  -e LOADTEST_CAPACITY_BASELINE_TIMEOUT_SECONDS=10 \
  -e LOADTEST_CAPACITY_BASELINE_SETUP_TIMEOUT=10m \
  -e LOADTEST_CAPACITY_BASELINE_PRE_ALLOCATED_VUS=400 \
  -e LOADTEST_CAPACITY_BASELINE_MAX_VUS=1000 \
  -e LOADTEST_CAPACITY_BASELINE_GRACEFUL_STOP=15s \
  -e LOADTEST_CAPACITY_BASELINE_ACTIVE_CUSTOMER_COUNT=200 \
  -e LOADTEST_CAPACITY_BASELINE_CONCERT_LIMIT=20 \
  -e LOADTEST_CAPACITY_BASELINE_PERFORMANCE_LIMIT=20 \
  -e LOADTEST_CAPACITY_BASELINE_SEAT_LIMIT=200 \
  -e LOADTEST_CAPACITY_BASELINE_TICKET_LIST_LIMIT=20 \
  -e LOADTEST_CAPACITY_BASELINE_PAYMENT_AMOUNT=50000 \
  -e LOADTEST_CAPACITY_BASELINE_PAYMENT_POOL_COUNT=24000 \
  -e LOADTEST_CAPACITY_BASELINE_TICKETS_PER_CUSTOMER=30 \
  -e LOADTEST_CAPACITY_BASELINE_NOTIFICATIONS_PER_CUSTOMER=30 \
  -e LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS='["auth","concert","reservation","payment","ticket","notification"]' \
  -e LOADTEST_CAPACITY_BASELINE_TARGET_UTILIZATION=0.70 \
  -e LOADTEST_CAPACITY_BASELINE_SEED_METHOD=deterministic_bulk_insert \
  -e LOADTEST_CAPACITY_BASELINE_SCHEMA_REVISIONS='{}' \
  -e LOADTEST_CAPACITY_BASELINE_SEED_ROW_COUNTS='{"customer_count":500,"provider_count":1,"admin_count":1,"concert_count":8,"performance_count":32,"seat_count":32000,"payment_pool_count":24000,"ticket_count":15000,"notification_count":15000}' \
  -e LOADTEST_CAPACITY_BASELINE_FIXED_CONDITIONS='{"hpa":"disabled","replicas":"1","cpuRequest":"500m","cpuLimit":"none"}' \
  -e LOADTEST_CAPACITY_BASELINE_RESOURCE_OBSERVATION_ENABLED=false \
  -e LOADTEST_CAPACITY_BASELINE_RESOURCE_OBSERVATION_SOURCE=metrics-api \
  -e LOADTEST_CAPACITY_BASELINE_RESOURCE_TARGETS='[]' \
  -e LOADTEST_CAPACITY_BASELINE_THRESHOLD_HTTP_REQ_FAILED_RATE=0.01 \
  -e LOADTEST_CAPACITY_BASELINE_THRESHOLD_HTTP_REQ_DURATION_P95_MS=100 \
  -e LOADTEST_CAPACITY_BASELINE_THRESHOLD_HTTP_REQ_DURATION_P99_MS=300 \
  -e LOADTEST_CAPACITY_BASELINE_THRESHOLD_CHECKS_RATE=0.99 \
  gitops/platform/loadtest/scenarios/capacity-baseline-load-test.js \
  >/tmp/capacity-baseline-inspect.json

jq '.scenarios | keys' /tmp/capacity-baseline-inspect.json
```

서비스 step 하나만 확인할 때는 `LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS`만 바꿔서 inspect한다.

```bash
k6 inspect \
  -e LOADTEST_SCENARIO=capacity-baseline-load-test \
  -e LOADTEST_TARGET=local \
  -e LOADTEST_BASE_URL=http://localhost:32080 \
  -e LOADTEST_DATASET_REVISION=capacity-baseline-v1 \
  -e LOADTEST_CUSTOMER_POOL_SIZE=500 \
  -e LOADTEST_CUSTOMER_POOL_EMAIL_PREFIX=capacity-customer \
  -e LOADTEST_CUSTOMER_POOL_EMAIL_DOMAIN=loadtest.medikong.local \
  -e LOADTEST_CUSTOMER_POOL_PASSWORD=loadtest1234 \
  -e LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS='["payment"]' \
  -e LOADTEST_CAPACITY_BASELINE_STAGES='[{"duration":"60s","target":10},{"duration":"60s","target":20}]' \
  -e LOADTEST_CAPACITY_BASELINE_FIXED_CONDITIONS='{"hpa":"disabled","replicas":"1","cpuRequest":"500m","cpuLimit":"none","authTokenTtlSeconds":"7200"}' \
  -e LOADTEST_CAPACITY_BASELINE_SCHEMA_REVISIONS='{}' \
  -e LOADTEST_CAPACITY_BASELINE_SEED_ROW_COUNTS='{}' \
  -e LOADTEST_CAPACITY_BASELINE_RESOURCE_OBSERVATION_ENABLED=false \
  -e LOADTEST_CAPACITY_BASELINE_RESOURCE_TARGETS='[]' \
  gitops/platform/loadtest/scenarios/capacity-baseline-load-test.js \
  >/tmp/capacity-baseline-payment-inspect.json

jq '.scenarios | keys' /tmp/capacity-baseline-payment-inspect.json
```

## 4. Smoke 실행

배선 확인이 목적이면 smoke를 먼저 실행한다.

```bash
SCENARIO=capacity-baseline-load-test \
PRESET=local-smoke \
task --dir gitops dev:loadtest
```

smoke는 짧게 끝나야 한다. 통과 후 실제 측정용 preset으로 넘어간다.

dataset setup은 같은 `dataset_revision`의 capacity baseline 소유 데이터를 먼저 정리한 뒤 다시 insert한다. 따라서 `local-smoke` 실행 후 같은 `capacity-baseline-v1` revision으로 `local-baseline-500m`을 실행해도 좌석 수나 customer pool 크기 차이 때문에 중복 key가 나면 안 된다.

## 5. 실제 Baseline 실행

500m CPU request 조건으로 실제 측정용 preset을 실행한다.

```bash
SCENARIO=capacity-baseline-load-test \
PRESET=local-baseline-500m \
task --dir gitops dev:loadtest
```

특정 서비스 step만 다시 실행할 때는 배열 override를 함께 준다.

```bash
LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS='["payment","ticket"]' \
SCENARIO=capacity-baseline-load-test \
PRESET=local-baseline-500m \
task --dir gitops dev:loadtest
```

이 명령은 capacity baseline일 때 먼저 서비스를 `local-capacity-baseline` 조건으로 배포한다. CPU request 값은 선택한 preset의 `scenarios.capacityBaseline.fixedConditions.cpuRequest`에서 읽어 서비스 Helm 배포에 override한다.

실행 로그에서 다음 줄을 확인한다.

```text
Capacity baseline service CPU request=500m values=platform/loadtest/values/presets/capacity-baseline/local-baseline-500m.yaml
```

## 6. Pod 조건 확인

실행 중 또는 실행 직후 서비스 Pod 조건을 확인한다.

```bash
for pair in \
  ticketing-auth/auth-service \
  ticketing-concert/concert-service \
  ticketing-reservation/reservation-service \
  ticketing-payment/payment-service \
  ticketing-ticket/ticket-service \
  ticketing-notification/notification-service
do
  ns=${pair%/*}
  name=${pair#*/}
  kubectl -n "$ns" get deploy "$name" -o json \
    | jq -c '{
        service: .metadata.name,
        namespace: .metadata.namespace,
        replicas: .spec.replicas,
        cpu_request: .spec.template.spec.containers[0].resources.requests.cpu,
        cpu_limit: .spec.template.spec.containers[0].resources.limits.cpu,
        proxy_cpu_limit: .spec.template.metadata.annotations["sidecar.istio.io/proxyCPULimit"],
        node_selector: .spec.template.spec.nodeSelector,
        maxSurge: .spec.strategy.rollingUpdate.maxSurge,
        maxUnavailable: .spec.strategy.rollingUpdate.maxUnavailable
      }'
done
```

HPA가 남아 있지 않은지 확인한다.

```bash
for pair in \
  ticketing-auth/auth-service \
  ticketing-concert/concert-service \
  ticketing-reservation/reservation-service \
  ticketing-payment/payment-service \
  ticketing-ticket/ticket-service \
  ticketing-notification/notification-service
do
  ns=${pair%/*}
  name=${pair#*/}
  printf '%s/%s ' "$ns" "$name"
  kubectl -n "$ns" get hpa "$name" --ignore-not-found -o name
done
```

DB가 서비스 CPU request 실험의 첫 병목이 되지 않도록 로컬 DB 리소스 조건을 확인한다.

```bash
for pair in \
  ticketing-auth/auth-db \
  ticketing-concert/concert-db \
  ticketing-reservation/reservation-db \
  ticketing-payment/payment-db \
  ticketing-ticket/ticket-db \
  ticketing-notification/notification-db
do
  ns=${pair%/*}
  name=${pair#*/}
  kubectl -n "$ns" get sts "$name" -o json \
    | jq -c '{
        database: .metadata.name,
        namespace: .metadata.namespace,
        resources: .spec.template.spec.containers[0].resources,
        args: .spec.template.spec.containers[0].args
      }'
done
```

capacity baseline 기준에서 DB CPU/memory limit은 없어야 한다. DB CPU, memory, connection pool이 먼저 막히면 해당 서비스 결과는 CPU request 산출에서 제외하고 DB 조건을 조정한 뒤 재실험한다.

## 7. Job과 로그 확인

최근 loadtest Job을 확인한다.

```bash
kubectl -n loadtest get jobs \
  -l app.kubernetes.io/name=read-api-loadtest \
  --sort-by=.metadata.creationTimestamp
```

예를 들어 Job 이름이 `read-api-loadtest-read-manual-YYYYMMDDHHMMSS`라면 아래 변수에 넣는다.

```bash
JOB_NAME=read-api-loadtest-read-manual-YYYYMMDDHHMMSS
```

생성된 이벤트 종류와 `loadtest_run_id`를 확인한다.

```bash
kubectl -n loadtest logs "job/${JOB_NAME}" \
  | rg '^\{"event"' \
  | jq -s 'map({event, loadtest_run_id, status, scenario, preset: (.traffic_model_preset // .execution_conditions.traffic_model_preset)})'
```

capacity baseline 결과 이벤트는 두 개만 남아야 한다.

```text
loadtest_experiment_conditions
loadtest_run_report
```

사용하지 않는 이벤트가 섞이지 않았는지 확인한다.

```bash
kubectl -n loadtest logs "job/${JOB_NAME}" \
  | rg '^\{"event":"(loadtest_api_summary|loadtest_summary|loadtest_threshold_exit)"' || true
```

서비스별 최대 유효 RPS와 CPU request 후보를 확인한다.

```bash
kubectl -n loadtest logs "job/${JOB_NAME}" \
  | rg '^\{"event":"loadtest_run_report"' \
  | jq '{
      loadtest_run_id,
      status,
      fixed: .execution_conditions.capacity_baseline_fixed_conditions,
      services: .scenario_report.services
    }'
```

step별 상세 결과를 확인한다.

```bash
kubectl -n loadtest logs "job/${JOB_NAME}" \
  | rg '^\{"event":"loadtest_run_report"' \
  | jq '.scenario_report.step_results[] | {
      service,
      api,
      capacity_step,
      target_rps,
      p95_ms,
      p99_ms,
      error_rate,
      cpu_usage_m,
      cpu_throttling,
      request_candidate_m,
      status,
      decision_reasons
    }'
```

Kong rate limit이 복구됐는지 확인한다.

```bash
task --dir gitops/platform/loadtest kong-rate-limit:status
```

## 8. 결과 보관

새 report 폴더를 만든다. 날짜는 실행일 기준으로 바꾼다.

```bash
REPORT_DIR=workspace/docs/evidence/loadtest/capacity-baseline/reports/local-baseline-500m-YYYY-MM-DD
mkdir -p "$REPORT_DIR"
```

원문 `loadtest_run_report`를 저장한다.

```bash
kubectl -n loadtest logs "job/${JOB_NAME}" \
  | rg '^\{"event":"loadtest_run_report"' \
  | jq . > "${REPORT_DIR}/loadtest-run-report.json"
```

Pod 조건 스냅샷을 저장한다.

```bash
for pair in \
  ticketing-auth/auth-service \
  ticketing-concert/concert-service \
  ticketing-reservation/reservation-service \
  ticketing-payment/payment-service \
  ticketing-ticket/ticket-service \
  ticketing-notification/notification-service
do
  ns=${pair%/*}
  name=${pair#*/}
  kubectl -n "$ns" get deploy "$name" -o json \
    | jq -c '{
        service: .metadata.name,
        namespace: .metadata.namespace,
        replicas: .spec.replicas,
        cpu_request: .spec.template.spec.containers[0].resources.requests.cpu,
        cpu_limit: .spec.template.spec.containers[0].resources.limits.cpu,
        proxy_cpu_limit: .spec.template.metadata.annotations["sidecar.istio.io/proxyCPULimit"],
        node_selector: .spec.template.spec.nodeSelector,
        maxSurge: .spec.strategy.rollingUpdate.maxSurge,
        maxUnavailable: .spec.strategy.rollingUpdate.maxUnavailable
      }'
done | jq -s . > "${REPORT_DIR}/pod-resource-conditions.json"
```

기존 템플릿을 복사해서 결과 README를 시작한다.

```bash
cp \
  workspace/docs/evidence/loadtest/capacity-baseline/.templates/cpu-request-experiment-template.md \
  "${REPORT_DIR}/README.md"
```

결과 README에는 최소한 다음 값을 채운다.

```text
loadtest_run_id
scenario
preset
dataset_revision
CPU request / CPU limit / HPA / replica
RPS steps
서비스별 max_valid_rps
서비스별 request_candidate_m
step별 p95, p99, error_rate, cpu_usage_m, cpu_throttling
판단 결과와 보류 사유
```

## 9. AWS-dev Baseline 실행

AWS-dev에서 유의미한 capacity baseline을 보려면 서비스와 DB 조건을 먼저 실험용으로 맞춘 뒤 loadtest Job을 트리거한다.

AWS-dev capacity baseline의 고정 조건은 다음과 같다.

```text
service CPU request: 1000m
service CPU limit: none
service replica: 1
service HPA: disabled
auth token TTL: 7200s
DB profile: aws-dev-capacity-baseline
RPS steps: 80 -> 120 -> 160 -> 220 -> 300
```

서비스 조건은 다음 value file로 적용한다.

```text
gitops/values/services/aws-dev-capacity-baseline/common.yaml
gitops/values/services/aws-dev-capacity-baseline/auth.yaml
```

DB 조건은 다음 Helm values로 적용한다.

```bash
helm template medikong-data gitops/platform/data/chart \
  -f gitops/platform/data/aws-dev/postgresql.yaml \
  -f gitops/platform/data/aws-dev/postgres-auth.yaml \
  -f gitops/platform/data/aws-dev/postgres-concert.yaml \
  -f gitops/platform/data/aws-dev/postgres-reservation.yaml \
  -f gitops/platform/data/aws-dev/postgres-payment.yaml \
  -f gitops/platform/data/aws-dev/postgres-ticket.yaml \
  -f gitops/platform/data/aws-dev/mongodb.yaml \
  >/tmp/aws-dev-data.yaml

rg 'shared_buffers=256MB|effective_cache_size=1GB|cpu: 1000m|memory: 1Gi|storage: 10Gi' \
  /tmp/aws-dev-data.yaml
```

loadtest preset render를 확인한다.

```bash
LOADTEST_VALUES_FILE=values/aws-dev.yaml \
LOADTEST_SCENARIO_VALUES_FILE=values/presets/capacity-baseline/aws-dev-baseline-1000m.yaml \
task --dir gitops/platform/loadtest render \
  >/tmp/capacity-baseline-aws-dev-baseline-1000m.yaml

rg 'LOADTEST_TRAFFIC_MODEL_PRESET|LOADTEST_CAPACITY_BASELINE_STAGES|LOADTEST_CAPACITY_BASELINE_FIXED_CONDITIONS' \
  /tmp/capacity-baseline-aws-dev-baseline-1000m.yaml
```

AWS-dev는 run values를 GitOps로 갱신해서 실행한다. 새 preset, 서비스 overlay, DB overlay가 먼저 커밋/푸시되어 ArgoCD에서 보이는 상태여야 한다.

서비스 step을 하나씩 실행한다.

```bash
LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS='["auth"]' SCENARIO=capacity-baseline-load-test PRESET=aws-dev-baseline-1000m task --dir gitops aws:loadtest
LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS='["concert"]' SCENARIO=capacity-baseline-load-test PRESET=aws-dev-baseline-1000m task --dir gitops aws:loadtest
LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS='["reservation"]' SCENARIO=capacity-baseline-load-test PRESET=aws-dev-baseline-1000m task --dir gitops aws:loadtest
LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS='["payment"]' SCENARIO=capacity-baseline-load-test PRESET=aws-dev-baseline-1000m task --dir gitops aws:loadtest
LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS='["ticket"]' SCENARIO=capacity-baseline-load-test PRESET=aws-dev-baseline-1000m task --dir gitops aws:loadtest
LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS='["notification"]' SCENARIO=capacity-baseline-load-test PRESET=aws-dev-baseline-1000m task --dir gitops aws:loadtest
```

각 명령은 `platform/loadtest/values/runs/aws-dev/capacity-baseline-aws-dev-baseline-1000m.yaml`의 `manualRuns.read.runId`를 새로 쓰고, `LOADTEST_CAPACITY_BASELINE_SERVICE_STEPS` 값을 run values에 함께 남긴다.

AWS-dev Pod 조건을 확인한다.

```bash
for pair in \
  ticketing-auth/auth-service \
  ticketing-concert/concert-service \
  ticketing-reservation/reservation-service \
  ticketing-payment/payment-service \
  ticketing-ticket/ticket-service \
  ticketing-notification/notification-service
do
  ns=${pair%/*}
  name=${pair#*/}
  kubectl -n "$ns" get deploy "$name" -o json \
    | jq -c '{
        service: .metadata.name,
        replicas: .spec.replicas,
        cpu_request: .spec.template.spec.containers[0].resources.requests.cpu,
        cpu_limit: .spec.template.spec.containers[0].resources.limits.cpu,
        hpa_expected: "disabled"
      }'
  kubectl -n "$ns" get hpa "$name" --ignore-not-found -o name
done
```

DB 조건을 확인한다.

```bash
for pair in \
  ticketing-auth/auth-db \
  ticketing-concert/concert-db \
  ticketing-reservation/reservation-db \
  ticketing-payment/payment-db \
  ticketing-ticket/ticket-db \
  ticketing-notification/notification-db
do
  ns=${pair%/*}
  name=${pair#*/}
  kubectl -n "$ns" get sts "$name" -o json \
    | jq -c '{
        db: .metadata.name,
        cpu_request: .spec.template.spec.containers[0].resources.requests.cpu,
        memory_request: .spec.template.spec.containers[0].resources.requests.memory,
        storage: .spec.volumeClaimTemplates[0].spec.resources.requests.storage,
        args: .spec.template.spec.containers[0].args
      }'
done
```

## 10. CPU Request별 반복 실험

500m 결과를 기준으로 다른 request를 확인하려면 preset을 복제한다.

```bash
cp \
  gitops/platform/loadtest/values/presets/capacity-baseline/local-baseline-500m.yaml \
  gitops/platform/loadtest/values/presets/capacity-baseline/local-baseline-750m.yaml
```

복제한 preset에서 다음 값을 바꾼다.

```yaml
trafficModel:
  preset: local-baseline-750m

scenarios:
  capacityBaseline:
    fixedConditions:
      cpuRequest: 750m
```

변경 후 render로 조건을 확인한다.

```bash
task --dir gitops/platform/loadtest render \
  SCENARIO=capacity-baseline-load-test \
  PRESET=local-baseline-750m \
  >/tmp/capacity-baseline-local-baseline-750m.yaml

rg 'LOADTEST_TRAFFIC_MODEL_PRESET|LOADTEST_CAPACITY_BASELINE_FIXED_CONDITIONS' \
  /tmp/capacity-baseline-local-baseline-750m.yaml
```

실행한다.

```bash
SCENARIO=capacity-baseline-load-test \
PRESET=local-baseline-750m \
task --dir gitops dev:loadtest
```

## 11. 자주 보는 실패

| 증상 | 확인 |
| --- | --- |
| dataset setup Job 실패 | `kubectl -n loadtest logs job/<dataset-job>`로 schema guard, row count mismatch, revision prefix 정리 실패 확인 |
| 좌석 unique key 중복 | runner image가 최신인지 확인하고 `setup_capacity_baseline_dataset.py`가 revision 데이터를 정리한 뒤 insert하는지 확인 |
| `POST /reservations` error rate 100% | reservation seed data와 요청 body의 `concertId`, `showtimeId`, `seatId` 계약 확인 |
| CPU usage가 `0`으로 기록됨 | `resourceObservation.source=metrics-api`, RBAC, `kubectl top pods -A` 확인 |
| Job은 실패 판정인데 report가 있음 | threshold 실패일 수 있음. `loadtest_run_report.status`와 `decision_reasons` 확인 |
| Kong 429 또는 rate limit 영향 | `task --dir gitops/platform/loadtest kong-rate-limit:status` 확인 |
| Pod가 Pending | `kubectl describe pod`, Docker Desktop resource, nodeSelector 제거 여부 확인 |
