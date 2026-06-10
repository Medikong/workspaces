# 시스템/Kubernetes 메트릭 수집 기준

관련 문서:

- `README.md`: 지표 정의와 수집 기준
- `service-metrics.md`: 서비스 공통/서비스별 애플리케이션 메트릭 구현 기준
- `dashboard-authoring-options.md`: Grafana 대시보드 코드화 방식 검토 기록
- `../implementation/README.md`: 관측성 구현 진입점
- `../../../adr/0004-observability-signal-routing-and-trace.md`: 관측 신호 라우팅 결정

이 문서는 Pod, Container, Node, Kubernetes 객체 상태처럼 플랫폼이 이미 제공하는 시스템 메트릭을 어떻게 수집하고 해석할지 정한다. 서비스 코드는 이 값을 직접 만들지 않는다. Medikong은 `kube-prometheus-stack`을 통해 `kubelet/cAdvisor`, `kube-state-metrics`, `node-exporter`가 노출하는 지표를 Prometheus로 scrape하고 Grafana와 Alertmanager에서 사용한다.

## 책임 경계

시스템 메트릭은 애플리케이션 로직이 아니라 실행 환경에서 만들어진다. 따라서 구현 책임도 `service` repo보다 `gitops` repo에 가깝다.

| 범위 | 생성/수집 주체 | 대표 지표 | Medikong 책임 |
|---|---|---|---|
| Container 자원 | kubelet/cAdvisor | CPU, memory, network, filesystem | Prometheus scrape와 대시보드/알림 구성 |
| Pod/Deployment 상태 | kube-state-metrics | ready, phase, restart, replica, HPA | 문제 판별용 PromQL, Grafana 패널, PrometheusRule 구성 |
| Node 자원 | node-exporter | node CPU, memory, disk, network | Node 압박과 Pod 문제의 상관 분석 |
| Control Plane | kube-apiserver, etcd, Prometheus stack | apiserver latency/error, scrape 실패 | 관측성 스택 자체 장애 감지 |
| 서비스 내부 | FastAPI `/metrics` | HTTP latency, 5xx, domain result | `service-metrics.md` 기준에 따라 서비스 코드에서 구현 |

서비스 코드가 시스템 메트릭을 재구현하지 않는다. 예를 들어 `OOMKilled`, Pod restart, Deployment available replica, Node `MemoryPressure`는 Kubernetes와 exporter가 이미 제공한다. 서비스 코드는 이 값 대신 사용자 요청, 도메인 결과, DB/외부 호출 지연처럼 애플리케이션만 알 수 있는 지표를 노출한다.

## 장애 원인 파악

문제가 생겼을 때 바로 특정 Pod부터 보지 않는다. Pod 이름은 배포와 재시작에 따라 바뀌고, 한 Pod에서 보이는 현상이 서비스 전체 문제의 결과일 수 있기 때문이다.

```text
서비스 영향
  - request rate
  - HTTP 5xx rate
  - p95/p99 latency
  - business failure/rejection

워크로드 상태
  - Deployment desired/available replica
  - Pod ready=false
  - Pod phase Pending/Failed
  - restart 증가

Pod/Container 자원
  - CPU usage/request/limit
  - CPU throttling
  - memory working set/limit
  - OOMKilled
  - network RX/TX

Node/Cluster 상태
  - Node Ready
  - MemoryPressure/DiskPressure
  - scheduling failure
  - apiserver 또는 scrape 장애
```

대시보드는 이 순서로 내려갈 수 있어야 한다. 첫 화면은 서비스와 Deployment 단위로 보고, 이상이 보이면 Pod, Container, Node label로 좁힌다.

## 수집 컴포넌트

### kubelet/cAdvisor

kubelet/cAdvisor는 Container 단위 자원 사용량을 제공한다. CPU, 메모리, 네트워크처럼 "얼마나 쓰고 있는가"를 볼 때 우선 사용한다.

| 목적 | 대표 지표 | 해석 |
|---|---|---|
| CPU 사용량 | `container_cpu_usage_seconds_total` | `rate(...[5m])`로 초당 CPU 사용량을 계산한다. |
| CPU throttling | `container_cpu_cfs_throttled_seconds_total`, `container_cpu_cfs_periods_total` | limit 때문에 실행 시간이 밀리는지 본다. |
| CPU pressure | `container_pressure_cpu_waiting_seconds_total` | CPU를 기다린 시간을 Pod cgroup 우선으로 보고, 필요하면 container series를 Pod 단위로 합산한다. |
| 메모리 사용량 | `container_memory_working_set_bytes` | limit 대비 실제 working set 비율을 본다. |
| 메모리 RSS | `container_memory_rss` | reclaim이 어려운 메모리 압박을 볼 때 참고한다. |
| 메모리 cache | `container_memory_cache` | 파일 캐시성 메모리와 working set을 구분할 때 참고한다. |
| 네트워크 | `container_network_receive_bytes_total`, `container_network_transmit_bytes_total` | Pod/Container의 RX/TX 증가율을 본다. |

`container=""`, `pod=""`, pause container처럼 분석에 의미 없는 series는 Grafana query에서 제외한다.

### kube-state-metrics

kube-state-metrics는 Kubernetes API 객체 상태를 Prometheus 지표로 바꾼다. "현재 사용량"보다 "Kubernetes가 이 객체를 어떤 상태로 보고 있는가"를 확인할 때 쓴다.

| 목적 | 대표 지표 | 해석 |
|---|---|---|
| restart | `kube_pod_container_status_restarts_total` | 5분/30분/1시간 증가량을 본다. |
| OOMKilled | `kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}` | 마지막 종료 사유가 OOMKilled인지 확인한다. |
| Container ready | `kube_pod_container_status_ready` | 특정 container readiness 실패를 본다. |
| Pod ready | `kube_pod_status_ready` | Pod Ready condition이 false로 지속되는지 본다. |
| Pod phase | `kube_pod_status_phase` | Pending, Running, Failed 같은 phase를 본다. |
| Deployment replica | `kube_deployment_spec_replicas`, `kube_deployment_status_replicas_available` | desired 대비 available 부족 여부를 본다. |
| HPA replica | `kube_horizontalpodautoscaler_status_current_replicas`, `kube_horizontalpodautoscaler_status_desired_replicas` | 오토스케일링이 따라붙는지 본다. |
| Node condition | `kube_node_status_condition` | Ready, MemoryPressure, DiskPressure 상태를 본다. |
| Resource request/limit | `kube_pod_container_resource_requests`, `kube_pod_container_resource_limits` | 사용량을 request/limit과 비교한다. |

Resource request/limit 지표는 kube-state-metrics 버전과 chart 설정에 따라 label shape가 다를 수 있다. 실제 대시보드와 알림을 만들 때는 운영 Prometheus에서 metric name, `resource`, `unit`, `namespace`, `pod`, `container` label을 먼저 확인한다.

### node-exporter

node-exporter는 Node 단위 자원을 제공한다. 특정 Pod만 문제가 있는지, 같은 Node에 올라간 Pod들이 같이 나빠졌는지 확인할 때 필요하다.

| 목적 | 대표 지표 | 해석 |
|---|---|---|
| Node CPU | `node_cpu_seconds_total` | node 전체 CPU 사용률과 iowait를 본다. |
| Node memory | `node_memory_MemAvailable_bytes`, `node_memory_MemTotal_bytes` | 전체 메모리 여유를 본다. |
| Node disk | `node_filesystem_avail_bytes`, `node_filesystem_size_bytes` | 디스크 부족과 log 폭증을 본다. |
| Node network | `node_network_receive_bytes_total`, `node_network_transmit_bytes_total` | Node 단위 네트워크 병목을 본다. |

Node 지표는 Pod 문제의 직접 원인이라기보다 배치, 스케줄링, 노드 압박을 확인하는 보조 증거다.

## OOMKilled 분석 기준

OOMKilled는 "메모리를 많이 썼다" 하나로 끝나지 않는다. 다음 값을 같이 본다.

| 질문 | 확인 지표 | 판단 |
|---|---|---|
| 정말 OOMKilled였나? | `kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}` | 마지막 종료 사유를 확인한다. |
| 재시작이 늘었나? | `increase(kube_pod_container_status_restarts_total[30m])` | OOM 이후 재시작 반복 여부를 본다. |
| limit에 가까웠나? | `container_memory_working_set_bytes` / `kube_pod_container_resource_limits` | limit 대비 working set 비율을 본다. |
| 특정 Pod만 높았나? | `sum by (namespace, pod, container)` | 같은 Deployment 안에서 특정 Pod만 튀는지 본다. |
| Node 압박도 있었나? | `kube_node_status_condition{condition="MemoryPressure"}` | Node 전체 메모리 압박을 확인한다. |
| cache 때문인가? | `container_memory_cache`, `container_memory_rss` | cache와 RSS를 나눠서 본다. |

OOMKilled는 kube-state-metrics로 종료 사유를 보고, cAdvisor로 종료 직전의 메모리 추세를 본다. 원인이 애플리케이션 객체 누수인지, 요청 폭증인지, limit이 너무 낮은지는 시스템 메트릭만으로 확정하지 않는다. 그 단계에서는 애플리케이션 런타임 메트릭, 로그, trace, heap/profile 데이터가 추가로 필요하다.

## 기본 PromQL 예시

실제 namespace와 service label은 GitOps values와 ServiceMonitor 기준에 맞춘다. 아래 query는 Grafana 패널을 만들 때의 기준 형태다.

### Pod별 메모리 상위

```promql
topk(
  15,
  sum by (namespace, pod, container) (
    container_memory_working_set_bytes{
      namespace=~"medical-platform|monitoring|observability",
      container!="",
      pod!=""
    }
  )
)
```

### Memory limit 대비 사용률

```promql
sum by (namespace, pod, container) (
  container_memory_working_set_bytes{container!="", pod!=""}
)
/
sum by (namespace, pod, container) (
  kube_pod_container_resource_limits{resource="memory", unit="byte"}
)
```

### OOMKilled Pod/Container

```promql
max by (namespace, pod, container) (
  kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}
)
```

### 30분 내 restart 증가

```promql
sum by (namespace, pod, container) (
  increase(kube_pod_container_status_restarts_total[30m])
)
```

### CPU 사용량

```promql
sum by (namespace, pod, container) (
  rate(container_cpu_usage_seconds_total{container!="", pod!=""}[5m])
)
```

### CPU throttling ratio

```promql
sum by (namespace, pod, container) (
  rate(container_cpu_cfs_throttled_seconds_total{container!="", pod!=""}[5m])
)
/
sum by (namespace, pod, container) (
  rate(container_cpu_cfs_periods_total{container!="", pod!=""}[5m])
)
```

### Pod CPU pressure

```promql
sum by (namespace, pod) (
  rate(container_pressure_cpu_waiting_seconds_total{container="", image="", pod!=""}[5m])
)
or
sum by (namespace, pod) (
  rate(container_pressure_cpu_waiting_seconds_total{container!="", container!="POD", pod!=""}[5m])
)
```

이 지표는 kubelet/cAdvisor의 PSI metric이다. Linux PSI, cgroup v2, kubelet의 PSI 수집이 켜져 있어야 값이 나온다.

### Deployment available ratio

```promql
sum by (namespace, deployment) (
  kube_deployment_status_replicas_available
)
/
sum by (namespace, deployment) (
  kube_deployment_spec_replicas
)
```

### Ready false Pod

```promql
sum by (namespace, pod) (
  kube_pod_status_ready{condition="false"}
)
```

### Node MemoryPressure

```promql
max by (node) (
  kube_node_status_condition{condition="MemoryPressure", status="true"}
)
```

## 대시보드 구현 기준

Grafana dashboard는 `ConfigMap + dashboard JSON`으로 관리한다. UI에서 수동으로 만든 dashboard는 운영 기준으로 삼지 않는다. 수동 수정은 재현이 어렵고, 로컬/dev/aws-dev 환경 사이에서 drift가 생기기 때문이다.

현재 `kube-prometheus-stack` values는 Grafana dashboard sidecar를 켜고 `grafana_dashboard=1` label이 붙은 ConfigMap을 읽도록 되어 있다. `allowUiUpdates: false`도 설정되어 있으므로, Git에 있는 dashboard JSON이 기준이다.

구현 규칙:

- dashboard JSON과 이를 담는 ConfigMap manifest를 함께 Git에 둔다.
- ConfigMap에는 `grafana_dashboard: "1"` label을 붙인다.
- ConfigMap namespace는 Grafana sidecar가 검색하는 `monitoring`으로 둔다.
- dashboard JSON에는 고정 `uid`를 둔다.
- datasource는 이름보다 UID를 우선 사용한다.
- UI에서 수정한 dashboard는 Git으로 역반영하기 전까지 운영 기준이 아니다.

권장 위치:

```text
gitops/platform/monitoring/dashboards/
  system/
    kubernetes-workload-overview.dashboard.json
    kubernetes-workload-overview.configmap.yaml
  service/
    medikong-service-sli.dashboard.json
    medikong-service-sli.configmap.yaml
```

ConfigMap 형태:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-kubernetes-workload-overview
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  kubernetes-workload-overview.json: |
    {
      "uid": "medikong-kubernetes-workload-overview",
      "title": "Medikong Kubernetes Workload Overview",
      "timezone": "browser",
      "schemaVersion": 39,
      "version": 1,
      "panels": []
    }
```

대시보드 JSON에는 datasource 이름보다 datasource UID를 우선 사용한다. Prometheus, Loki, Tempo datasource UID를 고정해야 환경이 바뀌어도 query가 흔들리지 않는다.

## Grafana 대시보드 기준

시스템 메트릭 대시보드는 "클러스터 예쁜 그림"보다 장애 조사 순서를 따라야 한다.

| 섹션 | 패널 | 기본 그룹 |
|---|---|---|
| 워크로드 개요 | Deployment available ratio | `namespace`, `deployment` |
| 워크로드 개요 | Ready false Pod | `namespace`, `pod` |
| 재시작/종료 | Restart increase | `namespace`, `pod`, `container` |
| 재시작/종료 | OOMKilled | `namespace`, `pod`, `container` |
| CPU | CPU usage | `namespace`, `pod`, `container` |
| CPU | CPU throttling ratio | `namespace`, `pod`, `container` |
| CPU | Pod CPU pressure | `namespace`, `pod` |
| Memory | Working set by Pod | `namespace`, `pod`, `container` |
| Memory | Working set / limit | `namespace`, `pod`, `container` |
| Node | Node MemoryPressure/DiskPressure | `node` |
| 수집 상태 | Prometheus target `up` | `job`, `instance` |

대시보드 변수는 `namespace`, `deployment`, `pod`, `container`, `node` 순서로 둔다. 첫 화면에서 Pod 이름을 필수 선택하게 만들지 않는다.

## 알림 기준

시스템 메트릭 알림은 순간 spike보다 지속 조건을 우선한다. Kubernetes는 rollout, image pull, autoscaling 중 짧은 변동이 자주 생기기 때문이다.

| 알림 | 기준 예시 | 우선순위 |
|---|---|---|
| Deployment available 부족 | desired 대비 available 100% 미만이 5분 이상 지속 | 높음 |
| Pod restart 반복 | 30분 내 restart 증가가 1 이상이고 계속 증가 | 높음 |
| OOMKilled 발생 | OOMKilled reason이 1이고 restart 증가가 동반 | 높음 |
| Memory limit 근접 | working set / limit 90% 이상이 10분 지속 | 중간 |
| CPU throttling 지속 | throttling ratio가 20% 이상 10분 지속 | 중간 |
| Pod ready=false | ready=false가 5분 이상 지속 | 중간 |
| Node MemoryPressure | MemoryPressure true가 5분 이상 지속 | 높음 |
| Prometheus scrape 실패 | `up == 0`이 5분 이상 지속 | 높음 |

OOMKilled는 단독 알림보다 restart 증가, memory limit 근접, Node MemoryPressure와 같이 보이게 만든다. 그래야 "앱 limit 문제", "노드 압박", "rollout 중 일시 현상"을 구분할 수 있다.

## Label 정책

시스템 메트릭은 exporter가 제공하는 label을 그대로 쓰되, Grafana와 알림에서는 낮은 cardinality label 중심으로 집계한다.

사용하는 label:

- `namespace`
- `deployment`
- `pod`
- `container`
- `node`
- `job`
- `instance`
- `resource`
- `unit`

주의할 label:

- `pod`: 드릴다운에는 필요하지만 장기 SLO 집계 기준으로 쓰지 않는다.
- `container_id`, `image_id`: 디버깅에는 유용하지만 대시보드 기본 그룹으로 쓰지 않는다.
- `uid`: Kubernetes 객체 재생성마다 바뀌므로 알림 group key로 쓰지 않는다.

서비스 요청 ID, trace ID, 사용자 ID, 예약/결제 ID는 시스템 메트릭 label에도 넣지 않는다. 그런 값은 log와 trace에서 찾는다.

## 수집 검증

시스템 메트릭 수집이 된다고 가정하지 않는다. GitOps 배포 후에는 Prometheus에서 다음을 확인한다.

```promql
up{job=~".*kube-state-metrics.*"}
up{job=~".*node-exporter.*"}
up{job=~".*kubelet.*|.*cadvisor.*"}
container_memory_working_set_bytes
kube_pod_container_status_restarts_total
kube_pod_container_status_ready
kube_deployment_status_replicas_available
kube_node_status_condition
```

Grafana 대시보드가 비어 있으면 애플리케이션 장애로 보기 전에 Prometheus target `up`, scrape error, ServiceMonitor/PodMonitor selector, namespace selector, RBAC를 먼저 확인한다.

## 구현 위치

```text
workspace
  - 이 문서
  - 대시보드/알림 기준
  - 장애 조사 순서와 운영 Runbook

gitops
  - kube-prometheus-stack
  - kube-state-metrics
  - prometheus-node-exporter
  - ServiceMonitor/PodMonitor
  - PrometheusRule
  - Grafana dashboard provisioning

service
  - 시스템 메트릭 구현 없음
  - /metrics 애플리케이션 지표만 담당

infra
  - Node group, storage, IAM/RBAC, network 같은 cluster 기반 조건
```

Medikong에서 시스템 메트릭 작업의 완료 기준은 "지표가 존재한다"가 아니라 "문제가 생겼을 때 서비스 -> Deployment -> Pod/Container -> Node로 원인 후보를 좁힐 수 있다"이다.
