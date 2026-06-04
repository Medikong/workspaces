# 관측성 구현 진입점

이 문서는 관측성 구현 기준을 직접 반복하지 않고, 구현자가 읽어야 할 결정 문서와 기준 문서를 연결한다.

## 기준 문서

```text
전체 아키텍처
  - ../README.md

기술적 결정
  - ../../../adr/0004-observability-signal-routing-and-trace.md

메트릭 기준
  - ../metrics/README.md

Trace 기준
  - ../tracing/README.md
  - ../tracing/tempo-grafana-query.md
  - ../tracing/sampling-retention.md

감사 로그 기준
  - ../../audit-logs/README.md

구현 순서
  - ROADMAP.md

아키텍처 다이어그램
  - observability-architecture.aws.dac.yaml
  - observability-architecture.png
```

## 구현 원칙

```text
시스템 메트릭
  - node-exporter
  - kube-state-metrics
  - kubelet/cAdvisor
  - Prometheus scrape
  - Grafana 조회

애플리케이션 메트릭
  - FastAPI /metrics
  - ServiceMonitor
  - Prometheus scrape
  - Grafana 조회

Trace
  - FastAPI OpenTelemetry instrumentation
  - OTLP
  - upstream OpenTelemetry Collector
  - Tempo
  - Grafana 조회

애플리케이션 로그
  - stdout/stderr JSON
  - Kubernetes container log
  - OpenTelemetry Collector filelog receiver
  - Loki
  - Grafana 조회

시스템 로그
  - node/pod/container log
  - OpenTelemetry Collector DaemonSet filelog receiver
  - Loki
  - Grafana 조회

사용자 감사 로그
  - 업무 이벤트 또는 outbox
  - 시스템 관측성과 별도 경로
  - Elasticsearch/Kibana 계열 저장소
```

## Collector 기준

```text
기본 구현체
  - upstream OpenTelemetry Collector

대안
  - Grafana Alloy
  - Grafana LGTM 통합 운영 편의가 필요할 때 검토

적용 기준
  - ADR-0004를 우선한다.
  - Trace pipeline은 OTLP receiver -> processor -> Tempo exporter로 둔다.
  - Log pipeline은 filelog receiver -> processor -> Loki exporter로 둔다.
  - Metric은 Prometheus scrape 경로를 기본으로 둔다.
```

## Repo별 구현 책임

```text
workspace
  - ADR
  - 아키텍처 문서
  - 구현 기준 문서
  - 이슈 분해

service
  - FastAPI instrumentation
  - /metrics endpoint
  - trace context 전파
  - stdout/stderr JSON log
  - 감사 이벤트 생성

gitops
  - kube-prometheus-stack
  - ServiceMonitor/PodMonitor
  - PrometheusRule
  - OpenTelemetry Collector
  - Tempo
  - Loki
  - Grafana datasource/dashboard

infra
  - cluster 기반 리소스
  - storage
  - network
  - secret/권한 경계
  - 장기 보존 저장소 후보
```

## 남은 결정

```text
Trace
  - prod 안정화 이후 정상 요청 sampling 비율
  - dev/staging/prod retention 최종값
  - Kafka publish/consume context propagation 방식

로그
  - 애플리케이션 로그 수집 상세 기준
  - 시스템 로그 수집 상세 기준
  - Loki label/structured metadata 최종 매핑

감사 로그
  - Kafka, Logstash, Beats, Vector 중 전송 구현체 선택
  - Elasticsearch와 OpenSearch 중 저장소 선택
  - 보관 기간과 접근 제어 기준

대시보드/알림
  - Grafana dashboard JSON 관리 위치
  - PrometheusRule query 기준
  - Alertmanager notification target
```

## 관련 이슈

```text
workspace
  - workspace#7: 관측성 스택 parent
  - workspace#8: 시스템 metric
  - workspace#9: 애플리케이션/시스템 로그
  - workspace#13: 대시보드/알림
  - workspace#21: 사용자 감사 로그
  - workspace#24: trace 수집과 처리
  - workspace#25: trace 수집 기준과 조회 기준 ADR

service
  - service#14: FastAPI OpenTelemetry trace instrumentation

gitops
  - gitops#18: OpenTelemetry Collector OTLP receiver와 Tempo exporter
  - gitops#19: Tempo backend와 Grafana datasource
```

## 외부 레퍼런스

```text
OpenTelemetry
  - https://opentelemetry.io/docs/concepts/signals/
  - https://opentelemetry.io/docs/platforms/kubernetes/helm/collector/
  - https://opentelemetry.io/docs/zero-code/python/

Prometheus / Kubernetes metrics
  - https://prometheus-operator.dev/docs/developer/getting-started/
  - https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack
  - https://kubernetes.io/docs/concepts/cluster-administration/kube-state-metrics/
  - https://prometheus.io/docs/prometheus/latest/storage/

Loki / Grafana / Tempo
  - https://grafana.com/docs/loki/latest/get-started/labels/bp-labels/
  - https://grafana.com/docs/grafana/latest/administration/provisioning/
  - https://grafana.com/docs/grafana/latest/datasources/tempo/configure-tempo-data-source/configure-trace-to-logs/
  - https://grafana.com/docs/alloy/latest/introduction/

Kubernetes logs / audit
  - https://kubernetes.io/docs/concepts/cluster-administration/logging/
  - https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/

Python logging
  - https://docs.python.org/3/library/logging.html
  - https://www.structlog.org/en/stable/index.html
  - https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/logging/logging.html
  - https://github.com/snok/asgi-correlation-id
```
