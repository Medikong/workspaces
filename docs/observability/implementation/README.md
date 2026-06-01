# 관측성 기술 스택과 구현 조사

관련 문서:

- 지표 수집 기준: `../metrics/README.md`
- workspace#8: https://github.com/Medikong/workspace/issues/8
- workspace#13: https://github.com/Medikong/workspace/issues/13
- gitops#4: https://github.com/Medikong/gitops/issues/4

## 조사 목적

이 문서는 `docs/observability/metrics/README.md`에서 정의한 수집 기준을 실제 Kubernetes 환경에서 만족시키기 위한 기술 스택 후보와 적합성을 정리한다. 목표는 도구 설치 절차를 설계하는 것이 아니라, 장애가 지나간 뒤에도 metric, log, trace, event를 근거로 원인 후보를 줄일 수 있는 기술 선택지를 파악하는 것이다.

## 기술 스택 결론

- Metrics: `kube-prometheus-stack`, Prometheus Operator, Prometheus, Alertmanager, Grafana
- Application instrumentation: OpenTelemetry SDK/Instrumentation, Prometheus client 또는 OTel custom metrics
- Python application logging: `stdlib logging`, `structlog`, `opentelemetry-instrumentation-logging`, `asgi-correlation-id`
- Logs pipeline: 애플리케이션 로그는 stdout/stderr로 출력하고, Pod/container stdout/stderr 로그를 Collector filelog receiver가 수집해 OpenTelemetry logs pipeline으로 일원화한다. 기본 backend는 Loki로 두고, Elastic/Kibana는 서비스별 에러 로그 필터와 `request_id` 검색 요구가 유지될 때 같은 log signal을 병행 export하는 선택지로 둔다.
- Traces backend: Tempo, OpenTelemetry Collector OTLP receiver
- Kubernetes/Infrastructure metrics: kube-state-metrics, kubelet/cAdvisor, node-exporter, Kubernetes Events
- Alternative/parallel candidates: Jaeger, Mimir 또는 Prometheus remote write
- Label policy: `trace_id`, `request_id`, `tenant_id`, 주문/결제 ID는 수집 대상이지만 metric label 또는 Loki label 대상은 아니다. Elastic/Kibana에서는 정확 조회가 필요한 필드만 index template으로 별도 관리한다.

## 기준 요구사항

| 요구사항 | 구현에서 필요한 것 |
|---|---|
| 서비스 SLI 수집 | OpenTelemetry HTTP metric 또는 Prometheus metric endpoint |
| 비즈니스 지표 수집 | 서비스 코드에서 `orders_total`, `payments_total`, `business_outcomes_total`, 중복 주문 지표 노출 |
| Pod/Container 지표 | kubelet/cAdvisor, kube-state-metrics, node-exporter |
| Kubernetes 상태 지표 | kube-state-metrics |
| 로그 조회 | 구조화 로그 수집, Loki 또는 Kibana 조회 경로 |
| Trace 조회 | OpenTelemetry trace context 전파, Tempo 또는 Jaeger backend |
| 요청/도메인 추적 | `trace_id`, `span_id`, `request_id`, `correlation_id`, `event_id`, `aggregate_id` 로그 필드 |
| Alert | PrometheusRule 또는 Grafana Alerting/Alertmanager |
| 대시보드 | Grafana dashboard provisioning |

## 기술 스택 후보와 적합성

이 절은 구현 순서나 MVP 범위를 정하지 않는다. `../metrics/README.md`에서 정의한 수집 기준을 만족하려면 어떤 기술 영역이 필요하고, 각 후보를 왜 검토할 만한지 정리한다.

### 애플리케이션 계측

| 항목 | 내용 |
|---|---|
| 수집 요구 | HTTP 요청량, 에러율, 응답시간을 표준 이름과 attribute로 수집한다.<br>서비스 간 호출 흐름을 `trace_id`, `span_id`로 연결한다.<br>`service.name`, `service.version`, `http.route`, `k8s.*` 같은 공통 context를 남긴다. |
| 기술 후보 | OpenTelemetry SDK/Instrumentation<br>Prometheus client 또는 OTel metrics export<br>structured log attributes |
| 적합성 근거 | OpenTelemetry는 HTTP metric과 trace의 semantic conventions를 제공하므로 서비스별 계측 이름을 제각각 만들 위험을 줄인다.<br>Prometheus client는 `orders_total`, `payments_total`, `duplicate_order_committed_total`처럼 서비스 코드가 직접 만들어야 하는 비즈니스 metric에 적합하다.<br>구조화된 log attribute는 `trace_id`, `request_id`, `correlation_id`, `tenant_id`, `k8s.*` 같은 장애 분석 context를 보존하기 쉽다. |
| 검토 포인트 | FastAPI 자동 계측으로 충분한지, middleware에서 직접 metric을 만들지 확인한다.<br>`/metrics` endpoint를 노출할지, OTLP metrics export를 사용할지 결정해야 한다.<br>Kafka publish/consume trace context 전파가 자동으로 되는지, 수동 span이 필요한지 확인한다.<br>수집 대상과 metric/Loki label 대상을 분리해야 한다. |

### Python 애플리케이션 로깅

Python/FastAPI 서비스의 애플리케이션 로깅 기술 스택은 다음 조합으로 정한다. Loki와 Elastic/Kibana 중 어떤 로그 백엔드를 쓰더라도 애플리케이션 로깅 스택은 동일하게 유지하고, Collector에서 backend/vendor별 export와 필드 매핑만 분기한다.

```text
stdlib logging 기반 설정
+ structlog
+ opentelemetry-instrumentation-logging
+ asgi-correlation-id
```

| 구성 요소 | 역할 | 적합성 근거 |
|---|---|---|
| `stdlib logging` 기반 설정 | Python 프로세스의 기본 logging 설정을 담당한다. | Python 표준 logging은 애플리케이션 코드와 third-party library 로그가 같은 logging 체계에 참여할 수 있어, FastAPI/Uvicorn/라이브러리 로그를 한 파이프라인으로 모으기 쉽다. |
| `structlog` | JSON structured log와 context binding을 담당한다. | `request_id`, `trace_id`, `span_id`, `correlation_id`, `tenant_id`, `service.name`, `kubernetes.pod.name` 같은 분석 context를 key-value 필드로 남기기 적합하다. `contextvars` 기반 context 전파를 쓸 수 있어 async FastAPI 요청 처리와도 잘 맞는다. |
| `opentelemetry-instrumentation-logging` | Python logging record에 trace/span context를 주입한다. | stdout/stderr로 출력되는 구조화 로그에 `trace_id`, `span_id`, `service.name`을 붙여 trace-log correlation을 가능하게 한다. 같은 장애를 Tempo trace와 Loki/Elastic log에서 `trace_id`, `span_id` 기준으로 이어볼 수 있다. |
| `asgi-correlation-id` | ASGI 요청 단위의 correlation/request ID를 생성하고 전파한다. | Gateway/API 경계에서 `request_id`를 만들거나 이어받아 같은 HTTP 요청의 로그를 묶을 수 있다. OpenTelemetry의 `trace_id`가 기술적 호출 흐름이라면, `request_id`는 운영자가 요청 로그를 빠르게 찾는 진입점으로 쓴다. |

이 조합의 핵심은 로그 생성, 요청 식별자, trace context, 백엔드 전달 경로를 한 라이브러리에 몰아넣지 않는 것이다. `structlog`는 사람이 조회할 구조화 필드를 만들고, `asgi-correlation-id`는 요청 경계의 ID를 관리하며, `opentelemetry-instrumentation-logging`은 Python logging과 OpenTelemetry logs/trace context를 연결한다.

백엔드별 결론은 다음과 같다.

- Loki/Grafana를 기본 로그 조회 경로로 둔다. LGTM 구성에서 Tempo trace-to-logs 연결이 자연스럽고, container log file 수신과 backend export도 Collector로 통합하기 쉽다.
- 애플리케이션 로그는 구조화된 JSON 한 줄 로그로 stdout/stderr에 출력한다.
- Pod/container stdout/stderr 로그는 Collector의 filelog receiver와 Kubernetes attributes processor를 통해 같은 logs pipeline으로 수집한다.
- Elastic/Kibana를 병행할 경우 애플리케이션 코드를 별도로 갈라지게 만들지 않는다. 같은 OpenTelemetry log signal을 Collector에서 export하되 `service.*`, `trace.id`, `span.id`, `http.*`, `error.*`, `kubernetes.*`처럼 ECS와 충돌이 적은 필드명을 우선 사용한다.
- Elastic/Kibana 전용 formatter를 애플리케이션 코드의 기본 로깅 구조로 고정하지 않는다. Kibana 요구는 수집/가공 단계에서 ECS 호환 매핑을 적용하는 쪽이 Loki와 병행하기 쉽다.

수집 기준은 다음과 같다.

- `trace_id`, `span_id`는 OpenTelemetry trace context에서 가져온다.
- `request_id`는 Gateway/API 경계에서 받은 값이 있으면 이어받고, 없으면 ASGI middleware에서 생성한다.
- `correlation_id`, `command_id`, `event_id`, `aggregate_id`는 도메인 이벤트 로그에서만 남긴다.
- `trace_id`, `request_id`, `correlation_id`, `tenant_id`, 주문/결제 ID는 로그 필드로 수집하지만 metric label 또는 Loki label로 올리지 않는다.
- Elastic/Kibana를 병행할 때는 `request_id`, `trace_id`처럼 정확 조회가 필요한 필드만 keyword 매핑 대상으로 관리한다.

주의 및 개선:

| 주의점 | 개선 기준 |
|---|---|
| multiline stack trace, pretty JSON은 line 단위 수집에서 깨질 수 있다. | 모든 로그는 한 줄 JSON으로 출력하고, stack trace는 JSON field 안에 escape된 문자열 또는 배열로 넣는다. |
| stdout/stderr는 severity가 아니다. | `level` 또는 `severity_text` 필드를 반드시 넣고, `stderr` 여부만으로 에러를 판단하지 않는다. |
| node-local container log는 영구 저장소가 아니다. | Collector exporter의 retry/queue와 backend 전송 상태 alert를 둔다. kubelet log rotation 전에 수집되도록 Collector 용량을 잡는다. |
| trace/span 연결은 애플리케이션 context가 있어야 가능하다. | `opentelemetry-instrumentation-logging`과 structlog context binding으로 `trace_id`, `span_id`, `request_id`를 로그 필드에 주입한다. |
| stdout/stderr 수집과 OTLP logs exporter를 동시에 켜면 중복 로그가 생길 수 있다. | 기본은 stdout/stderr + filelog receiver로 고정하고, OTLP logs exporter는 예외적으로만 사용한다. |
| Pod/Node metadata가 없으면 실행 환경 분석이 약해진다. | Collector의 Kubernetes attributes processor로 namespace, pod, container, node 정보를 보강한다. |

### Metrics 수집과 저장

| 항목 | 내용 |
|---|---|
| 수집 요구 | 서비스 SLI, 비즈니스 SLI, Pod/Container, Kubernetes 상태 지표를 PromQL로 조회한다.<br>`ServiceMonitor`/`PodMonitor`처럼 scrape 대상을 GitOps로 선언할 수 있어야 한다.<br>단기 운영 대시보드와 alert에 필요한 시계열을 안정적으로 보관한다. |
| 기술 후보 | Prometheus<br>Prometheus Operator<br>kube-prometheus-stack<br>Mimir 또는 Prometheus remote write 대상 |
| 적합성 근거 | Prometheus는 Kubernetes와 애플리케이션 metric 수집의 표준 선택지에 가깝고, Grafana 대시보드와 PromQL 기반 alert에 바로 연결된다.<br>Prometheus Operator는 `Prometheus`, `Alertmanager`, `ServiceMonitor`, `PodMonitor`, `PrometheusRule`을 Kubernetes 리소스로 관리할 수 있어 GitOps와 잘 맞는다.<br>`kube-prometheus-stack`은 Prometheus Operator, Prometheus, Alertmanager, Grafana, kube-state-metrics, node-exporter를 함께 다루는 출발점으로 적합하다.<br>Mimir/remote write는 장기 보존과 확장 요구가 생길 때 Prometheus 뒤에 붙일 수 있는 후보라 후속 검토 대상으로 둔다. |
| 검토 포인트 | Prometheus 단기 보존 기간으로 발표/운영 검증 요구를 충족하는지 확인한다.<br>Prometheus Operator와 Collector의 metric 수집 역할이 겹치지 않게 경계를 정해야 한다.<br>OpenTelemetry metric이 Prometheus로 export될 때 실제 metric 이름이 어떻게 변환되는지 확인해야 한다. |

### Kubernetes와 인프라 지표

| 항목 | 내용 |
|---|---|
| 수집 요구 | 특정 Pod, Node, Deployment, HPA 상태에 문제가 몰리는지 확인한다.<br>CPU, memory, restart, Ready, OOMKilled, network를 서비스 지표와 함께 본다.<br>재현이 어려운 장애에서 실행 환경 쏠림을 추적한다. |
| 기술 후보 | kube-state-metrics<br>kubelet/cAdvisor<br>node-exporter<br>Kubernetes Events |
| 적합성 근거 | kube-state-metrics는 Pod Ready, Deployment replica, HPA, Node condition처럼 Kubernetes API object의 desired/current state를 metric으로 제공한다.<br>kubelet/cAdvisor는 container CPU, memory, network 같은 실제 실행 자원 사용량을 보는 데 필요하다.<br>node-exporter는 Node 수준 CPU, memory, disk, filesystem, network 상태를 보는 데 적합하다.<br>Kubernetes Events는 image pull 실패, scheduling 실패, probe 실패, OOM 같은 순간 사건을 metric만으로 놓치지 않게 한다. |
| 검토 포인트 | kube-state-metrics는 실제 리소스 사용량이 아니라 Kubernetes 객체 상태를 나타낸다는 점을 구분해야 한다.<br>cAdvisor와 node-exporter 지표가 겹쳐 보일 수 있으므로 대시보드에서 목적을 분리한다.<br>Pod/Node 이름은 원인 분석에는 필요하지만 장기 집계 label로 남발하지 않는다. |

### 로그 수집과 조회

| 항목 | 내용 |
|---|---|
| 수집 요구 | `trace_id`, `request_id`, `correlation_id`로 실패/지연 요청의 로그를 찾는다.<br>서비스, Pod, Node, version, tenant context를 함께 남긴다.<br>request ID나 주문/결제 ID는 수집하되 metric/Loki label로 올리지 않는다. |
| 기술 후보 | stdout/stderr structured logging<br>OpenTelemetry Collector<br>filelog receiver, Kubernetes attributes processor<br>Loki<br>Kibana/Elastic |
| 적합성 근거 | Kubernetes 컨테이너 로그의 기본 방식인 stdout/stderr를 사용하면 애플리케이션 로그와 Pod/container 로그의 수집 경로를 하나로 단순화할 수 있다.<br>Collector filelog receiver가 container log file을 읽어 OpenTelemetry logs pipeline으로 넘기면 Loki/Elastic 같은 backend 차이는 Collector 이후로 분리할 수 있다.<br>Loki는 Grafana와 자연스럽게 연결되고, Tempo trace-to-logs 구성이 쉬워 LGTM 구성의 기본 로그 백엔드로 적합하다.<br>Kibana/Elastic은 서비스별 에러 로그 필터, request_id 기반 조회, ECS 기반 검색 요구가 명확할 때 Collector에서 병행 export하는 후보로 둔다. |
| 검토 포인트 | Loki label은 `service.name`, `namespace`, `environment`, `level`처럼 bounded 값으로 제한한다.<br>`trace_id`, `request_id`, `tenant_id`, `order_id`, `payment_id`는 structured metadata 또는 log field로 두고 metric/Loki label 대상에서 제외한다.<br>Elastic/Kibana를 병행할 경우 Collector에서 ECS 호환 필드로 매핑하되, 정확 조회가 필요한 필드만 index template에서 keyword로 관리한다.<br>애플리케이션 로깅 코드는 Loki 전용/Elastic 전용으로 갈라지지 않게 한다. |

### Trace 수집과 조회

| 항목 | 내용 |
|---|---|
| 수집 요구 | Gateway -> reservation -> payment -> ticket 흐름을 하나의 trace로 볼 수 있어야 한다.<br>trace에서 같은 `trace_id`의 로그로 이동할 수 있어야 한다.<br>Kafka publish/consume 같은 비동기 구간도 흐름에서 끊기지 않게 한다. |
| 기술 후보 | OpenTelemetry trace instrumentation<br>OpenTelemetry Collector OTLP receiver<br>Tempo<br>Jaeger |
| 적합성 근거 | OpenTelemetry는 trace context 전파와 span 생성의 표준 선택지다.<br>Collector는 OTLP trace를 받아 Tempo 또는 Jaeger 같은 backend로 전달할 수 있어 수집 계층을 단순화한다.<br>Tempo는 Grafana와 붙여 trace 조회, trace-to-logs 연결을 구성하기 쉽다.<br>Jaeger는 trace 확인용 대안이지만 LGTM 생태계와 한 화면으로 묶는 관점에서는 Tempo가 더 자연스럽다. |
| 검토 포인트 | trace sampling 정책을 정해야 한다.<br>Kafka publish/consume에서 `trace_id`와 `correlation_id`를 어떻게 전파할지 확인해야 한다.<br>trace 저장 비용과 보존 기간을 정해야 한다. |

### Dashboard와 Alert

| 항목 | 내용 |
|---|---|
| 수집 요구 | 요청량, 에러율, 응답시간, 주문 처리량, 결제 성공률, 중복 주문, CPU/Memory, Ready/Restart를 한 화면에서 본다.<br>임계치 초과 시 패널 색상과 alert가 바뀐다.<br>alert rule이 코드 또는 manifest로 관리되어야 한다. |
| 기술 후보 | Grafana<br>Alertmanager<br>PrometheusRule<br>Grafana Alerting |
| 적합성 근거 | Grafana는 Prometheus, Loki, Tempo datasource를 한 화면에서 연결할 수 있어 metric/log/trace drilldown에 적합하다.<br>Alertmanager는 PrometheusRule 기반 alert와 잘 맞고 Kubernetes 운영 사례가 많다.<br>Grafana Alerting은 dashboard와 alert를 같은 UI에서 관리할 수 있지만 GitOps 관리 방식은 별도 검토가 필요하다. |
| 검토 포인트 | alert rule 위치를 PrometheusRule로 둘지 Grafana Alerting으로 둘지 정해야 한다.<br>dashboard provisioning과 datasource 설정을 GitOps로 관리할 수 있는지 확인한다.<br>비즈니스 지표 alert는 장애성 실패와 의도된 거절을 섞지 않도록 `result`, `failure_kind`, `expected` 기준을 명확히 해야 한다. |

## 스택 조합 관점

```text
Application services
  ├─ HTTP metrics/traces: OpenTelemetry instrumentation
  ├─ Business metrics: /metrics or OTLP metrics
  └─ stdout/stderr JSON logs: trace_id, request_id, correlation_id, service, k8s context

Kubernetes
  ├─ kubelet/cAdvisor: container CPU/memory/network
  ├─ kube-state-metrics: Pod/Deployment/HPA/Node 상태
  ├─ container stdout/stderr logs: Collector filelog receiver
  └─ Kubernetes Events: scheduling, image pull, probe, OOM

Collectors
  ├─ kube-prometheus-stack: Prometheus Operator, Prometheus, Alertmanager, Grafana
  └─ OpenTelemetry Collector: filelog logs, OTLP traces, optional OTLP metrics

Backends
  ├─ Prometheus: metrics
  ├─ Loki: logs
  └─ Tempo: traces

Grafana
  ├─ 서비스 SLI 대시보드
  ├─ 비즈니스 SLI 대시보드
  ├─ Kubernetes 상태 대시보드
  └─ trace_id 기반 log/trace drilldown
```

## Repo별 검토 경계

| Repo | 책임 |
|---|---|
| `workspace` | 기준 문서, 조사, 이슈 분해, 대시보드/알림 요구사항 정리 |
| `service` | 애플리케이션 계측, `/metrics`, OpenTelemetry trace context, structured log 필드 |
| `gitops` | Helm chart values, ServiceMonitor/PodMonitor, Collector/Loki/Tempo/Grafana 배포 선언 |
| `infra` | 클러스터/스토리지/IAM/OIDC/네트워크 기반, 장기 보존 스토리지 후보 |

## 기술 영역별 확인 항목

### Metrics baseline

목표:

- Prometheus가 서비스와 Kubernetes 지표를 수집한다.
- Grafana에서 요청량, 에러율, 응답시간, CPU, 메모리, Ready, Restart를 볼 수 있다.

작업:

- `kube-prometheus-stack` 설치 후보를 gitops repo에 선언한다.
- Prometheus Operator CRD를 사용해 `ServiceMonitor` 또는 `PodMonitor`를 만든다.
- 각 서비스가 `/metrics` 또는 OTLP metrics export를 제공하는지 확인한다.
- kube-state-metrics와 cAdvisor 지표가 조회되는지 확인한다.

확인 query 후보:

```promql
up
rate(http_server_request_duration_seconds_count[5m])
histogram_quantile(0.95, sum by (le, service_name) (rate(http_server_request_duration_seconds_bucket[5m])))
increase(kube_pod_container_status_restarts_total[1h])
kube_pod_container_status_ready
container_memory_working_set_bytes
rate(container_cpu_usage_seconds_total[5m])
```

OpenTelemetry의 논리 metric 이름은 `http.server.request.duration`이지만, Prometheus export에서는 backend 설정에 따라 `http_server_request_duration_seconds_count`, `http_server_request_duration_seconds_bucket`처럼 변환될 수 있다. 실제 query는 배포 후 Prometheus에서 노출되는 이름을 확인하고 고정한다.

### Business metrics

목표:

- 주문/결제 성공 기준과 중복 주문 0건을 지표로 확인한다.

작업:

- 서비스 코드에 아래 counter/histogram을 추가한다.
- `result`, `error_code`, `failure_kind`는 고정 목록으로 관리한다.
- 주문/결제/사용자 ID는 metric label로 넣지 않고 로그 필드로만 남긴다.

지표 후보:

```text
orders_total{result="created|completed|failed"}
payments_total{result="attempted|succeeded|failed"}
business_outcomes_total{result="success|failure|rejection"}
duplicate_order_detected_total
duplicate_order_committed_total
idempotency_conflict_total
payment_request_duration_seconds_bucket
payment_provider_duration_seconds_bucket
```

### Logs

목표:

- 실패/지연 요청 1건을 `trace_id`, `request_id`, `correlation_id`로 찾을 수 있다.

작업:

- 서비스 로그를 한 줄 JSON 구조화 로그로 통일하고 stdout/stderr에 출력한다.
- Python logging/structlog에 trace/span/request context를 주입한다.
- Pod/container stdout/stderr 로그를 Collector filelog receiver로 수집한다.
- Collector가 기본 경로로 Loki에 export하고, Kibana 요구가 유지되면 Elastic에도 병행 export한다.
- Elastic/Kibana 병행 시 Collector 또는 ingest 단계에서 ECS 호환 이름으로 매핑한다.

로그 필드 기준:

| 로그 주제 | 필드 | 기준 |
|---|---|---|
| 공통 서비스 로그 | `timestamp`, `level`, `message`, `service.name`, `service.version`, `service.environment` | 모든 애플리케이션 로그에 기본으로 남긴다. |
| 실행 환경 로그 | `kubernetes.namespace`, `kubernetes.pod.name`, `kubernetes.node.name`, `cloud.region`, `cloud.availability_zone` | Kubernetes 환경에서 수집 가능한 경우 남긴다. 특정 Pod/Node/Zone 쏠림 분석에 사용한다. |
| HTTP 요청 로그 | `request_id`, `trace_id`, `span_id`, `http.method`, `http.route`, `http.status_code`, `duration_ms` | HTTP inbound/outbound 요청 로그에 남긴다. `trace_id`/`span_id`는 tracing이 활성화된 경우 필수에 가깝다. |
| 에러 로그 | `error.type`, `error_code`, `failure_kind`, `expected`, `retryable` | 예외, 실패, 거절 결과가 있는 로그에 남긴다. 원본 에러 메시지는 log body에 두고 metric label로 올리지 않는다. |
| 도메인 이벤트 로그 | `correlation_id`, `command_id`, `event_id`, `event_type`, `aggregate_id` | 예약 생성, 결제 승인, 티켓 발급처럼 도메인 이벤트를 기록할 때 남긴다. 일반 HTTP access log에는 없을 수 있다. |
| 멀티테넌트/사용자 영향 | `tenant_id`, `user_id` | 도메인에 tenant/user 개념이 있고 접근 정책상 기록 가능할 때 남긴다. metric/Loki label 대상은 아니다. |

주의:

- `trace_id`, `request_id`, `span_id`, `correlation_id`, `tenant_id`, `order_id`, `payment_id`, `user_id`는 수집 대상이다.
- 그러나 metric label 또는 Loki label 대상은 아니다.
- Elastic/Kibana 병행 시 정확 조회가 필요한 일부 필드만 index template에서 별도로 관리한다.
- Loki label은 `service.name`, `namespace`, `environment`, `level`처럼 bounded 값 중심으로 제한한다.

### Traces

목표:

- Gateway -> reservation -> payment -> ticket 흐름을 trace로 확인한다.
- trace에서 관련 Loki log로 이동할 수 있다.

작업:

- OpenTelemetry instrumentation으로 HTTP inbound/outbound span을 만든다.
- Kafka publish/consume 구간은 수동 span 또는 instrumentation을 검토한다.
- Collector가 OTLP trace를 받아 Tempo로 전달한다.
- Grafana Tempo datasource에서 trace-to-logs를 설정한다.

필수 context:

```text
trace_id: 기술적 전체 호출 흐름
span_id: 처리 단위
request_id: Gateway/API 경계 요청
correlation_id: 도메인 이벤트 체인
```

### Alerts and dashboards

목표:

- 목표 지표를 단일 운영 화면에서 확인한다.
- 임계치 초과 시 패널 색상과 alert가 바뀐다.

패널 후보:

| 패널 | 기준 |
|---|---|
| Request Rate | `rate(http_server_request_duration_seconds_count[5m])`, 실제 export 이름 확인 후 고정 |
| HTTP 5xx Error Rate | 5xx / total |
| p95/p99 Latency | HTTP duration histogram |
| 주문 처리량 | `orders_total{result="completed"}` |
| 결제 성공률 | `payments_total{result="succeeded"}` / `payments_total{result="attempted"}` |
| 중복 주문 | `duplicate_order_committed_total`은 0 유지 |
| CPU/Memory | cAdvisor + request/limit |
| Ready/Restart | kube-state-metrics |
| Consumer lag/DLQ | Kafka exporter 또는 앱 metric |

Alert 후보:

| Alert | 기준 |
|---|---|
| HTTP 5xx error rate | 5분 동안 5% 초과 |
| p95 latency | 5분 동안 SLO 초과 |
| 결제 성공률 | 5분 동안 95% 미만 |
| 중복 주문 확정 | `duplicate_order_committed_total` 증가 시 즉시 확인 |
| Pod restart | 10분 동안 증가 |
| Ready false | 5분 이상 지속 |
| Prometheus scrape error | target down 또는 scrape 실패 지속 |

## 기술 선택 시 확인할 기준

| 검토 축 | 확인할 내용 |
|---|---|
| 수집 기준 충족 | `../metrics/README.md`의 서비스 SLI, 비즈니스 SLI, Pod/Container, Kubernetes 상태, 로그/trace 필드를 수집할 수 있는가 |
| 표준성 | OpenTelemetry semantic conventions, Prometheus/Kubernetes 표준 지표, kube-state-metrics 기본 지표와 잘 맞는가 |
| GitOps 적합성 | Helm chart, CRD, dashboard/alert provisioning을 manifest로 관리하기 쉬운가 |
| 운영 복잡도 | Loki와 Kibana, Prometheus와 Collector처럼 역할이 겹치는 도구를 병행할 때 운영 부담이 늘어나지 않는가 |
| 비용 통제 | `trace_id`, `request_id`, `tenant_id`, 주문/결제 ID를 수집하되 metric/Loki label로 올리지 않는 정책을 지킬 수 있는가 |
| 장애 분석 적합성 | 재현이 어려운 장애에서 서비스, Pod, Node, version, tenant, trace, business event를 함께 좁혀볼 수 있는가 |
| 확장성 | 장기 metric 보존, trace sampling, log retention, remote write 같은 확장 요구가 생겼을 때 자연스럽게 이어지는가 |

## 기술 선택 전에 확인할 질문

- 서비스 repo가 현재 Prometheus text endpoint를 노출하는가, OTLP metrics export를 쓸 것인가?
- FastAPI 서비스에서 OpenTelemetry auto-instrumentation을 쓸 것인가, middleware로 직접 metric을 만들 것인가?
- Kafka consumer lag은 Kafka exporter로 볼 것인가, 앱 metric으로 볼 것인가?
- Collector -> Loki 경로를 바로 도입할 수 있는가, Sprint 2에서는 `kubectl logs` 대체 경로가 필요한가?
- Tempo trace context를 Gateway, HTTP client, Kafka publish/consume까지 전파할 수 있는가?
- tenant가 실제 도메인에 있는가, 없다면 `tenant_id`는 후순위 optional field로 둘 것인가?
- `duplicate_order_committed_total`의 검출 기준은 DB unique constraint 위반인가, 사후 정합성 검사인가?

## 참고 자료

- Prometheus Operator ServiceMonitor/PodMonitor API: https://prometheus-operator.dev/docs/api-reference/api/
- prometheus-community kube-prometheus-stack chart: https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack
- kube-state-metrics pod metrics: https://github.com/kubernetes/kube-state-metrics/blob/main/docs/metrics/workload/pod-metrics.md
- OpenTelemetry HTTP metrics semantic conventions: https://opentelemetry.io/docs/specs/semconv/http/http-metrics/
- OpenTelemetry Python instrumentation: https://opentelemetry.io/docs/zero-code/python/
- Kubernetes logging architecture: https://kubernetes.io/docs/concepts/cluster-administration/logging/
- OpenTelemetry Collector Helm chart for Kubernetes: https://opentelemetry.io/docs/platforms/kubernetes/helm/collector/
- OpenTelemetry Collector Kubernetes components: https://opentelemetry.io/docs/platforms/kubernetes/collector/components/
- Grafana Loki Helm install: https://grafana.com/docs/loki/latest/setup/install/helm/
- Grafana Tempo Helm chart: https://grafana.com/docs/tempo/latest/setup/helm-chart/
- Grafana Tempo trace-to-logs: https://grafana.com/docs/grafana/latest/datasources/tempo/configure-tempo-data-source/configure-trace-to-logs/
- Grafana Mimir remote write: https://grafana.com/docs/mimir/latest/configure/configure-prometheus-remote-write/
- Elastic ECS tracing fields: https://www.elastic.co/guide/en/ecs/current/ecs-tracing.html
- Python logging standard library: https://docs.python.org/3/library/logging.html
- structlog documentation: https://www.structlog.org/en/stable/index.html
- python-json-logger package: https://pypi.org/project/python-json-logger/
- Loguru documentation: https://loguru.readthedocs.io/en/stable/overview.html
- OpenTelemetry Python logging instrumentation: https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/logging/logging.html
- OpenTelemetry Python logs auto-instrumentation example: https://opentelemetry.io/docs/zero-code/python/logs-example/
- Elastic ECS Logging Python: https://www.elastic.co/docs/reference/ecs/logging/python
- asgi-correlation-id middleware: https://github.com/snok/asgi-correlation-id
