# 관측성 아키텍처

관련 문서:

- 지표 정의와 수집 기준: `metrics/README.md`
- Trace 수집 경로와 repo 책임: `tracing/README.md`
- 프로파일링 수집 설계: `profiling/README.md`
- Kafka producer trace wrapper 설계: `tracing/kafka-producer-wrapper.md`
- Tempo/Grafana 조회 기준: `tracing/tempo-grafana-query.md`
- Trace sampling과 retention 기준: `tracing/sampling-retention.md`
- 기술 스택과 구현 조사: `implementation/README.md`
- 구현 로드맵: `implementation/ROADMAP.md`
- 아키텍처 다이어그램 원본: `implementation/observability-architecture.aws.dac.yaml`

## 아키텍처 이미지

![관측성 아키텍처](implementation/assets/observability-architecture-imagegen-minimal-arrows.png)

## 아키텍처 설명

이 그림은 서비스에서 만들어진 로그, trace, metric이 Kubernetes 안에서 수집되고 Grafana에서 조회되는 구조를 보여준다.

## 전체 전달 경로

```text
1. Python/FastAPI 서비스가 로그, trace, metric을 만든다.
2. 로그는 stdout/stderr로 출력되고 Kubernetes container log로 남는다.
3. OTel Collector Agent가 container log를 읽어 Loki로 보낸다.
4. trace는 OTLP로 OTel Collector를 거쳐 Tempo로 보낸다.
5. metric은 Prometheus가 ServiceMonitor/PodMonitor 기준으로 scrape한다.
6. Grafana가 Prometheus, Loki, Tempo를 한 화면에서 조회한다.
7. Prometheus alert는 Alertmanager를 통해 알림 대상으로 전달된다.
```

## 데이터 종류별 설명

### Logs

```text
Python logging / structlog
-> stdout/stderr
-> Kubernetes container log
-> OTel Collector Agent
-> Loki
-> Grafana
```

Python 애플리케이션 로그와 Pod/container 로그는 stdout/stderr 기반으로 수집 경로를 맞춘다. 애플리케이션이 로그를 별도 backend로 직접 보내지 않고, Kubernetes에 남은 container log를 Collector가 읽어가는 구조다.

### Traces

```text
FastAPI / HTTP / Kafka span
-> OpenTelemetry context
-> OTel Collector
-> Tempo
-> Grafana
```

Trace는 서비스 간 호출 흐름을 이어 보기 위한 경로다. Grafana에서는 Tempo trace에서 같은 `trace_id`의 Loki log로 이동할 수 있게 연결한다.

### Metrics

```text
Service / Kubernetes metrics
-> ServiceMonitor / PodMonitor
-> Prometheus
-> Grafana
```

Metric은 로그 수집 경로와 분리한다. 서비스 metric과 Kubernetes metric은 Prometheus scrape 경로로 수집하고, Grafana는 Prometheus를 조회해 대시보드를 보여준다.

### Alerts

```text
Prometheus
-> PrometheusRule
-> Alertmanager
-> notification target
```

알림은 Grafana가 아니라 PrometheusRule과 Alertmanager를 기준으로 둔다.

## 그림에서 볼 경계

| 영역 | 역할 |
|---|---|
| Worker Node | 서비스 Pod, OTel Collector Agent, node-exporter가 위치한다. |
| Observability namespace | Prometheus, Alertmanager, Loki, Tempo, Grafana가 위치한다. |
| Optional backends | Mimir, Jaeger는 필요할 때 붙이는 확장 후보로 둔다. |

## 감사 로그와의 관계

고객 문의 대응, 업무 이력 조회, 특정 ID 기반 조건 검색은 감사 로그 아키텍처에서 다룬다.

- 감사 로그 아키텍처: `../audit-logs/README.md`

이 문서는 시스템 운용을 위한 metric, log, trace, alert만 다룬다.
