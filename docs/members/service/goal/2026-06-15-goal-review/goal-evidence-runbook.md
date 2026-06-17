# 목표 충족 증거 수집 Runbook

작성일: 2026-06-15

## 목적

`00-GOAL.md`의 목표를 "구현했다"에서 끝내지 않고, 실제 서비스와 GitOps 환경에 적용됐다는 증거까지 남기기 위한 실행 순서다.

이 문서는 ADR 없이 현재 선택된 스택을 기준으로 진행한다.

```text
Gateway: Kong
Service runtime: Python/FastAPI
Test: pytest
Registry: AWS ECR
Metrics: Prometheus
Dashboard: Grafana
Logs: Loki
Traces: Tempo
Trace/log pipeline: OpenTelemetry Collector
Mesh: Istio
```

## 완료 기준

각 항목은 다음 중 하나 이상의 증거를 남겨야 완료로 본다.

```text
명령 실행 결과
Prometheus query 결과
Grafana API 응답
Loki LogQL 결과
Tempo trace 검색 결과
Kiali topology 확인 결과
Kubernetes resource 상태
테스트 실행 로그
스크린샷 또는 캡처 파일
```

## Phase 1. 현재 배포 상태 확인

### 1.1 Argo CD Application 상태

목적:

```text
platform과 service Application이 Synced/Healthy인지 확인한다.
```

명령:

```bash
argocd app list --core
```

확인할 대상:

```text
kong-aws-dev
monitoring-aws-dev
tempo-aws-dev
loki-aws-dev
opentelemetry-collector-aws-dev
istio-base
istiod
kiali
auth-aws-dev
concert-aws-dev
reservation-aws-dev
payment-aws-dev
ticket-aws-dev
notification-aws-dev
```

완료 증거:

```text
각 Application의 Sync Status와 Health Status를 표로 남긴다.
```

### 1.2 Pod 상태

명령:

```bash
kubectl get pods -A
```

확인 기준:

```text
ticketing-* 서비스 Pod가 Running
Istio sidecar 대상 서비스는 2/2 Running
monitoring namespace의 Prometheus/Grafana가 Running
observability namespace의 Collector/Loki/Tempo가 Running
kong namespace의 Kong Pod가 Running
```

## Phase 2. Kong Gateway 증거

### 2.1 Kong Service 확인

명령:

```bash
kubectl get svc -n kong kong-kong-proxy -o wide
```

확인 기준:

```text
aws-dev에서는 NodePort 32407
local에서는 LoadBalancer 또는 port-forward fallback
```

### 2.2 인증 없는 route smoke

명령:

```bash
curl -i "$KONG_URL/auth/demo-accounts"
```

완료 기준:

```text
HTTP 200
Kong 응답 header 확인
```

### 2.3 JWT 로그인

명령:

```bash
TOKEN="$(
  curl -fsS -X POST "$KONG_URL/auth/login" \
    -H 'content-type: application/json' \
    -d '{"email":"customer@example.com","password":"customer1234"}' \
  | jq -r '.accessToken'
)"
```

완료 기준:

```text
TOKEN 값이 null 또는 빈 문자열이 아니다.
```

### 2.4 Role guard 확인

CUSTOMER token으로 customer API 호출:

```bash
curl -i "$KONG_URL/reservations" \
  -H "Authorization: Bearer $TOKEN"
```

잘못된 role로 provider/admin API를 호출:

```bash
curl -i "$KONG_URL/~/admin/concerts/demo/sales" \
  -H "Authorization: Bearer $TOKEN"
```

완료 기준:

```text
허용 route는 2xx 또는 서비스 정책에 맞는 응답
권한 없는 route는 403
```

### 2.5 Rate limit 확인

명령:

```bash
for i in $(seq 1 130); do
  curl -s -o /dev/null -w "%{http_code}\n" "$KONG_URL/reservations" \
    -H "Authorization: Bearer $TOKEN"
done | sort | uniq -c
```

완료 기준:

```text
429가 1회 이상 발생한다.
Kong local policy 특성상 Pod 수와 함께 결과를 기록한다.
```

## Phase 3. Prometheus 증거

### 3.1 ServiceMonitor / PodMonitor 확인

명령:

```bash
kubectl get servicemonitor --all-namespaces -l release=kube-prometheus-stack
kubectl get podmonitor --all-namespaces -l release=kube-prometheus-stack
```

확인 대상:

```text
서비스별 ServiceMonitor
kong-gateway ServiceMonitor
ticketing-envoy-sidecars PodMonitor
istiod PodMonitor
opentelemetry-collector ServiceMonitor
```

### 3.2 서비스 metric query

Prometheus API 예:

```bash
curl -G "$PROM_URL/api/v1/query" \
  --data-urlencode 'query=sum by (service_name) (rate(http_server_request_duration_seconds_count[5m]))'
```

완료 기준:

```text
auth-service
concert-service
reservation-service
payment-service
ticket-service
notification-service
중 하나 이상에서 요청 metric이 나온다.
```

### 3.3 Kong metric query

```promql
sum(up{job="kong-kong-proxy"})
count(kong_bandwidth_bytes)
rate(kong_http_requests_total[5m])
```

완료 기준:

```text
Kong status target과 cmetrics target이 up
kong_* metric이 존재
```

### 3.4 Istio sidecar metric query

```promql
sum(up{job="monitoring/ticketing-envoy-sidecars"})
count({__name__=~"istio_requests_total|envoy_.*"})
```

완료 기준:

```text
sidecar 대상 서비스 5개 target이 up
istio/envoy metric이 존재
```

### 3.5 SLO alert rule 확인

명령:

```bash
kubectl get prometheusrule -n monitoring service-slo-alerts -o yaml
```

Prometheus rule 확인:

```bash
curl "$PROM_URL/api/v1/rules" | jq '.data.groups[] | select(.name=="medikong.service.slo")'
```

완료 기준:

```text
MedikongServiceHigh5xxErrorRate
MedikongServiceP99LatencyHigh
MedikongServiceNoTraffic
가 Prometheus rule API에 보인다.
```

## Phase 4. Grafana 증거

### 4.1 Gateway/Mesh dashboard 확인

명령:

```bash
curl -u "$GRAFANA_USER:$GRAFANA_PASS" \
  "$GRAFANA_URL/api/dashboards/uid/medikong-gateway-mesh-metrics"
```

완료 기준:

```text
title = 03 Gateway and Mesh Metrics
panel 수 확인
```

### 4.2 Logs dashboard 확인

확인할 dashboard:

```text
Logs 10 - Overview
Logs 20 - Services and Requests
Logs 25 - Service Log Search
Logs 30 - Service Errors
Logs 40 - Drilldown
Logs 50 - Synthetic
Logs 60 - Business Flow
Logs 70 - Platform
Logs 80 - Service Trace Detail
```

완료 기준:

```text
Grafana API 또는 UI에서 dashboard가 로드된다.
```

## Phase 5. Loki 로그 증거

### 5.1 서비스 로그 검색

LogQL:

```logql
{service_name="reservation-service"} | json | event="http.request.completed"
```

완료 기준:

```text
request_id
trace_id
service.name
service.environment
http.status_code
duration_ms
log.policy
가 확인된다.
```

### 5.2 trace_id 기반 검색

LogQL:

```logql
{service_name="reservation-service"} | json | trace_id="<trace_id>"
```

완료 기준:

```text
같은 trace_id의 로그를 찾을 수 있다.
```

## Phase 6. Tempo trace 증거

### 6.1 trace 검색

Grafana 또는 Tempo API에서 다음 기준으로 검색한다.

```text
service.name
trace_id
request_id
```

완료 기준:

```text
대표 API 요청의 trace가 Tempo에서 조회된다.
Loki 로그에서 Tempo trace로 이동할 수 있다.
```

## Phase 7. Kafka 이벤트 증거

### 7.1 topic 확인

명령:

```bash
kubectl exec -n ticketing-messaging deploy/kafka -- \
  /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka:9092 \
  --list
```

확인할 topic:

```text
reservation-created
reservation-expired
payment-approved
payment-failed
ticket-issued
```

### 7.2 consumer group 확인

명령:

```bash
kubectl exec -n ticketing-messaging deploy/kafka -- \
  /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --list
```

완료 기준:

```text
ticket-service와 notification-service consumer group이 확인된다.
```

### 7.3 end-to-end 이벤트 흐름

목표 흐름:

```text
reservation 생성
-> reservation-created
-> payment 승인
-> payment-approved
-> ticket-service 소비
-> ticket-issued
-> notification-service 소비
```

완료 기준:

```text
API 응답
Kafka topic/consumer group 상태
서비스 로그
Tempo trace
Loki 로그
중 2개 이상으로 같은 흐름을 확인한다.
```

## Phase 8. Istio / Kiali / Canary 증거

### 8.1 Kiali topology

명령 또는 UI:

```bash
kubectl port-forward -n istio-system svc/kiali 20001:20001
```

완료 기준:

```text
sidecar 대상 서비스가 topology에 보인다.
요청 발생 후 service edge가 생긴다.
```

### 8.2 Canary 20 / 50 / 100

대상:

```text
platform/istio/traffic/reservation/scenarios/canary-20
platform/istio/traffic/reservation/scenarios/canary-50
platform/istio/traffic/reservation/scenarios/canary-100
```

완료 기준:

```text
VirtualService weight가 적용된다.
v1/v2 요청 비율이 Prometheus 또는 로그로 확인된다.
rollback이 가능하다.
```

### 8.3 Fault / timeout / retry

대상:

```text
fault-delay
fault-5xx
```

완료 기준:

```text
timeout 또는 5xx가 의도적으로 발생한다.
Prometheus에서 error/latency 변화가 확인된다.
```

## Phase 9. HPA / 성능 증거

### 9.1 baseline

수집할 값:

```text
P99 latency
request rate
error rate
CPU usage
memory usage
replica count
```

### 9.2 HPA scale-out

명령:

```bash
kubectl get hpa --all-namespaces
kubectl get deploy -n ticketing-reservation reservation-service -w
```

완료 기준:

```text
부하 증가 후 replica가 증가한다.
부하 종료 후 replica가 감소한다.
```

## Phase 10. 최종 보고

최종 보고서에는 다음을 넣는다.

```text
목표 항목
구현 근거 파일
실행 증거
남은 리스크
대체한 스택
추가 작업
```

완료 판단:

```text
구현 기반 있음
운영 증거 있음
목표 문서와 스택 불일치가 해소됨
```
