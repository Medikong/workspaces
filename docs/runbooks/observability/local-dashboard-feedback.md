# 로컬 Grafana 대시보드 피드백 런북

## 목적

`gitops/platform/monitoring/dashboards/*.json` 변경 뒤 Docker Desktop Kubernetes에서 Grafana 대시보드가 실제로 반영됐는지 확인하고, 현재 상태 패널과 시간대별 상세 패널을 빠르게 피드백한다.

## 1. 기준 repo 확인

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
git status --short --branch
```

```bash
cd /Users/danghamo/Documents/gituhb/medikong/workspace
git status --short --branch
```

## 2. GitOps 렌더링 확인

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
task --taskfile platform/monitoring/Taskfile.yml render
```

```bash
kubectl kustomize platform/monitoring >/tmp/medikong-monitoring-render.yaml
grep -n "01-service-runtime-health.json" /tmp/medikong-monitoring-render.yaml
grep -n "02-service-runtime-detail.json" /tmp/medikong-monitoring-render.yaml
grep -n "10-system-kubernetes-overview.json" /tmp/medikong-monitoring-render.yaml
grep -n "11-pod-container-resources.json" /tmp/medikong-monitoring-render.yaml
grep -n "12-node-pressure-overview.json" /tmp/medikong-monitoring-render.yaml
grep -n "kind: PrometheusRule" /tmp/medikong-monitoring-render.yaml
```

JSON 문법을 먼저 확인한다.

```bash
python3 -m json.tool platform/monitoring/dashboards/01-service-runtime-health.json >/dev/null
python3 -m json.tool platform/monitoring/dashboards/02-service-runtime-detail.json >/dev/null
python3 -m json.tool platform/monitoring/dashboards/10-system-kubernetes-overview.json >/dev/null
python3 -m json.tool platform/monitoring/dashboards/11-pod-container-resources.json >/dev/null
python3 -m json.tool platform/monitoring/dashboards/12-node-pressure-overview.json >/dev/null
```

## 3. 로컬 배포

전체 서비스 흐름까지 확인할 때:

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
task dev SERVICE_REPO=../service DEV_REGISTRY=localhost:5001 DEV_IMAGE_TAG=dev
```

대시보드와 monitoring stack만 빠르게 확인할 때:

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
task --taskfile platform/monitoring/Taskfile.yml up
```

이미 로컬 stack이 떠 있고 dashboard만 다시 반영할 때:

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
kubectl apply -k platform/monitoring
```

## 4. Pod 상태 확인

```bash
kubectl get pods -A | grep -E "ticketing-|monitoring|observability|kong"
```

```bash
kubectl get pods -n monitoring
kubectl get svc -n monitoring
kubectl get servicemonitor --all-namespaces -l release=kube-prometheus-stack
kubectl get prometheusrule -n monitoring -l release=kube-prometheus-stack
```

Grafana가 느리거나 재시작하면 Metrics API보다 Pod describe와 이벤트를 먼저 본다.

```bash
kubectl describe pod -n monitoring -l app.kubernetes.io/name=grafana
kubectl get events -n monitoring --sort-by=.lastTimestamp | tail -n 40
```

## 5. Dashboard ConfigMap 확인

```bash
kubectl get configmap medikong-service-metrics-dashboards -n monitoring \
  -o jsonpath='{.metadata.labels}'
```

```bash
kubectl get configmap medikong-service-metrics-dashboards -n monitoring \
  -o jsonpath='{.data}' | grep '01-service-runtime-health.json'

kubectl get configmap medikong-service-metrics-dashboards -n monitoring \
  -o jsonpath='{.data}' | grep '02-service-runtime-detail.json'

kubectl get configmap medikong-service-metrics-dashboards -n monitoring \
  -o jsonpath='{.data}' | grep '10-system-kubernetes-overview.json'

kubectl get configmap medikong-service-metrics-dashboards -n monitoring \
  -o jsonpath='{.data}' | grep '11-pod-container-resources.json'

kubectl get configmap medikong-service-metrics-dashboards -n monitoring \
  -o jsonpath='{.data}' | grep '12-node-pressure-overview.json'
```

PrometheusRule 연결을 확인한다.

```bash
kubectl get prometheusrule system-kubernetes-alerts -n monitoring -o yaml | grep -E "MedikongDeploymentReplicasUnavailable|MedikongPodOOMKilled|MedikongContainerCpuThrottlingHigh|MedikongNodeMemoryPressure"
```

## 6. Prometheus 열기

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090:9090
```

브라우저:

```text
http://127.0.0.1:9090
```

API로 바로 확인할 때:

```bash
curl -fsS 'http://127.0.0.1:9090/-/ready'
```

## 7. Grafana 열기

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80
```

브라우저:

```text
http://127.0.0.1:3000
```

로그인:

```text
admin / prom-local
```

## 8. Dashboard 목록 확인

Grafana UI에서 `Dashboards`를 열고 아래 항목을 확인한다.

```text
00 Service Metrics Overview
01 Service Runtime Health
02 Service Runtime Detail
10 System Kubernetes Overview
11 Pod Container Resources
12 Node Pressure Overview
Payment Service Metrics
```

Grafana API로 검색할 때:

```bash
curl -fsS -u admin:prom-local 'http://127.0.0.1:3000/api/search?query=Service%20Runtime' | python3 -m json.tool
curl -fsS -u admin:prom-local 'http://127.0.0.1:3000/api/search?query=System%20Kubernetes' | python3 -m json.tool
curl -fsS -u admin:prom-local 'http://127.0.0.1:3000/api/search?query=Pod%20Container' | python3 -m json.tool
curl -fsS -u admin:prom-local 'http://127.0.0.1:3000/api/search?query=Node%20Pressure' | python3 -m json.tool
```

## 9. 서비스 현재 상태 패널 피드백

`01 Service Runtime Health`에서 먼저 본다.

확인할 패널:

```text
Desired Pods
Available Pods
Unavailable Pods
Ready False Pods
Restart Increase 30m
OOMKilled Containers
Available Pod Ratio by Deployment
Unavailable Pods by Deployment
Deployment Pod Counts
Ready False Pod Detail
Restart Detail 30m
OOMKilled Detail
Memory Limit Usage Top 10
CPU Throttling Ratio Top 10
```

같은 값을 Prometheus에서 확인한다.

```bash
curl -fsG 'http://127.0.0.1:9090/api/v1/query' \
  --data-urlencode 'query=sum(kube_deployment_spec_replicas{namespace=~"ticketing-.*"})' \
  | python3 -m json.tool
```

```bash
curl -fsG 'http://127.0.0.1:9090/api/v1/query' \
  --data-urlencode 'query=sum(kube_deployment_status_replicas_available{namespace=~"ticketing-.*"})' \
  | python3 -m json.tool
```

```bash
curl -fsG 'http://127.0.0.1:9090/api/v1/query' \
  --data-urlencode 'query=sum(kube_deployment_spec_replicas{namespace=~"ticketing-.*"} - kube_deployment_status_replicas_available{namespace=~"ticketing-.*"})' \
  | python3 -m json.tool
```

```bash
curl -fsG 'http://127.0.0.1:9090/api/v1/query' \
  --data-urlencode 'query=sum(kube_pod_status_ready{namespace=~"ticketing-.*",condition="false"})' \
  | python3 -m json.tool
```

```bash
curl -fsG 'http://127.0.0.1:9090/api/v1/query' \
  --data-urlencode 'query=sum(increase(kube_pod_container_status_restarts_total{namespace=~"ticketing-.*",container!="",container!="POD",pod!=""}[30m]))' \
  | python3 -m json.tool
```

```bash
curl -fsG 'http://127.0.0.1:9090/api/v1/query' \
  --data-urlencode 'query=sum(kube_pod_container_status_last_terminated_reason{namespace=~"ticketing-.*",reason="OOMKilled",container!="",pod!=""})' \
  | python3 -m json.tool
```

정상 기준:

```text
Unavailable Pods = 0
Ready False Pods = 0
Restart Increase 30m = 0
OOMKilled Containers = 0
Available Pod Ratio by Deployment = 1 또는 100%
```

## 10. 서비스 상세 차트 피드백

`02 Service Runtime Detail`에서 시간 구간을 바꿔 본다.

추천 시간 범위:

```text
Last 15 minutes
Last 1 hour
Last 6 hours
```

확인할 패널:

```text
Desired vs Available Pods
Unavailable Pods by Deployment
Ready False Pods
Restart Increase 5m
OOMKilled Status
CPU Usage by Service Namespace
Memory Working Set by Service Namespace
Memory Limit Usage by Pod/Container
CPU Throttling Ratio by Pod/Container
Network Receive by Service Namespace
Network Transmit by Service Namespace
```

Prometheus API로 시간 범위를 같이 확인한다.

```bash
END="$(date +%s)"
START="$((END - 3600))"
STEP=30
```

```bash
curl -fsG 'http://127.0.0.1:9090/api/v1/query_range' \
  --data-urlencode 'query=sum by (namespace, deployment) (kube_deployment_spec_replicas{namespace=~"ticketing-.*"} - kube_deployment_status_replicas_available{namespace=~"ticketing-.*"})' \
  --data-urlencode "start=${START}" \
  --data-urlencode "end=${END}" \
  --data-urlencode "step=${STEP}" \
  | python3 -m json.tool
```

```bash
curl -fsG 'http://127.0.0.1:9090/api/v1/query_range' \
  --data-urlencode 'query=sum by (namespace, pod, container) (increase(kube_pod_container_status_restarts_total{namespace=~"ticketing-.*",container!="",container!="POD",pod!=""}[5m]))' \
  --data-urlencode "start=${START}" \
  --data-urlencode "end=${END}" \
  --data-urlencode "step=${STEP}" \
  | python3 -m json.tool
```

```bash
curl -fsG 'http://127.0.0.1:9090/api/v1/query_range' \
  --data-urlencode 'query=max by (namespace, pod, container) (kube_pod_container_status_last_terminated_reason{namespace=~"ticketing-.*",reason="OOMKilled",container!="",pod!=""})' \
  --data-urlencode "start=${START}" \
  --data-urlencode "end=${END}" \
  --data-urlencode "step=${STEP}" \
  | python3 -m json.tool
```

## 11. 시스템/Kubernetes 상태 패널 피드백

`10 System Kubernetes Overview`에서 전체 상태를 먼저 본다.

확인할 패널:

```text
Available Replica Ratio
Unavailable Replicas
Ready False Pods
Restart Increase 30m
OOMKilled Containers
Pressure Nodes
Deployment Replica Gap
Top CPU by Container
Top Memory Working Set
Node Pressure Conditions
```

`11 Pod Container Resources`에서 Pod/Container 상세를 본다.

```text
Containers Restarted 30m
OOMKilled Containers
High Throttling Containers
High Memory Limit Usage
CPU Usage Top 10
CPU Throttling Ratio Top 10
Memory Working Set Top 10
Memory Limit Usage Top 10
```

`12 Node Pressure Overview`에서 Node 상태를 본다.

```text
Not Ready Nodes
MemoryPressure Nodes
DiskPressure Nodes
PIDPressure Nodes
Node CPU Utilization
Node Memory Utilization
Filesystem Usage
Node Conditions
```

Prometheus에서 같은 값을 확인한다.

```bash
curl -fsG 'http://127.0.0.1:9090/api/v1/query' \
  --data-urlencode 'query=sum(kube_node_status_condition{condition=~"MemoryPressure|DiskPressure|PIDPressure",status="true"})' \
  | python3 -m json.tool
```

```bash
curl -fsG 'http://127.0.0.1:9090/api/v1/query' \
  --data-urlencode 'query=topk(10, sum by (namespace, pod, container) (container_memory_working_set_bytes{namespace=~"ticketing-.*|monitoring|observability",container!="",container!="POD",pod!="",image!=""}))' \
  | python3 -m json.tool
```

```bash
curl -fsG 'http://127.0.0.1:9090/api/v1/query' \
  --data-urlencode 'query=topk(10, sum by (namespace, pod, container) (rate(container_cpu_usage_seconds_total{namespace=~"ticketing-.*|monitoring|observability",container!="",container!="POD",pod!="",image!=""}[5m])))' \
  | python3 -m json.tool
```

## 12. 대시보드 피드백 기록

피드백 파일을 만든다.

```bash
cd /Users/danghamo/Documents/gituhb/medikong/workspace
mkdir -p docs/trouble/drafts
FEEDBACK_FILE="docs/trouble/drafts/$(date +%Y-%m-%d)-local-dashboard-feedback.md"
```

```bash
cat > "${FEEDBACK_FILE}" <<'EOF'
# 로컬 Grafana 대시보드 피드백

## 환경

- 날짜:
- gitops commit:
- service commit:
- 배포 명령:
- Grafana URL: http://127.0.0.1:3000
- Prometheus URL: http://127.0.0.1:9090

## 확인한 대시보드

- [ ] 00 Service Metrics Overview
- [ ] 01 Service Runtime Health
- [ ] 02 Service Runtime Detail
- [ ] 10 System Kubernetes Overview
- [ ] 11 Pod Container Resources
- [ ] 12 Node Pressure Overview
- [ ] Payment Service Metrics

## 현재 상태 패널 피드백

- Unavailable Pods:
- Ready False Pods:
- Restart Increase 30m:
- OOMKilled Containers:
- Pressure Nodes:

## 상세 차트 피드백

- 시간 범위:
- 이상이 보인 namespace/pod/container:
- 차트에서 읽기 어려운 패널:
- 추가하면 좋은 패널:
- 삭제해도 되는 패널:

## 조치 후보

- [ ] query 수정
- [ ] threshold 수정
- [ ] panel type 수정
- [ ] layout 수정
- [ ] alert rule 수정
EOF
```

커밋 해시를 채운다.

```bash
GITOPS_COMMIT="$(git -C /Users/danghamo/Documents/gituhb/medikong/gitops rev-parse --short HEAD)"
SERVICE_COMMIT="$(git -C /Users/danghamo/Documents/gituhb/medikong/service rev-parse --short HEAD)"
sed -i.bak "s/- gitops commit:/- gitops commit: ${GITOPS_COMMIT}/" "${FEEDBACK_FILE}"
sed -i.bak "s/- service commit:/- service commit: ${SERVICE_COMMIT}/" "${FEEDBACK_FILE}"
rm -f "${FEEDBACK_FILE}.bak"
```

작성한 파일을 연다.

```bash
echo "${FEEDBACK_FILE}"
```

## 13. 자주 보는 실패

Dashboard가 목록에 없다.

```bash
kubectl get configmap medikong-service-metrics-dashboards -n monitoring
kubectl describe pod -n monitoring -l app.kubernetes.io/name=grafana
kubectl logs -n monitoring -l app.kubernetes.io/name=grafana --all-containers --tail=200
```

Prometheus query가 비어 있다.

```bash
kubectl get servicemonitor --all-namespaces -l release=kube-prometheus-stack
kubectl get pods -A | grep -E "ticketing-|monitoring"
curl -fsG 'http://127.0.0.1:9090/api/v1/query' --data-urlencode 'query=up{namespace=~"ticketing-.*"}' | python3 -m json.tool
```

Grafana가 OOMKilled로 재시작한다.

```bash
kubectl describe pod -n monitoring -l app.kubernetes.io/name=grafana | grep -A8 -B4 OOMKilled
kubectl get events -n monitoring --sort-by=.lastTimestamp | tail -n 40
```

Pod 상태는 나쁜데 `kubectl top`이 안 된다.

```bash
kubectl describe pod -A | grep -E "Name:|Namespace:|Restart Count:|OOMKilled|Reason:|State:"
kubectl get events -A --sort-by=.lastTimestamp | tail -n 80
```

## 14. 일시 중지와 정리

다음 피드백을 이어서 할 때는 pause한다.

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
task dev:pause
```

완전히 정리할 때만 down한다.

```bash
task dev:down
```

monitoring stack만 올렸다면 monitoring만 내린다.

```bash
task --taskfile platform/monitoring/Taskfile.yml down
```

## 관련 문서

- `workspace/docs/runbooks/observability/local-metrics-verification.md`
- `workspace/docs/architecture/observability/metrics/system-metrics.md`
- `gitops/platform/monitoring/README.md`
- `gitops/platform/monitoring/dashboards/`
