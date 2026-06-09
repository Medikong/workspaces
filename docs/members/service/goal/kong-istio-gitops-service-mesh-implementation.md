# Kong과 Istio를 분리한 GitOps 기반 서비스 메시 적용 기록

## 요약

공연 티켓 서비스는 외부 요청 처리와 내부 서비스 간 통신 제어를 분리하는 구조로 정리했다.

- Kong Gateway: 외부 진입, JWT 인증, role 기반 인가, Rate Limit, Request ID 처리
- Istio Service Mesh: 내부 서비스 호출의 retry, timeout, canary routing, circuit breaker, 관측성 처리
- ArgoCD: GitHub `Medikong/gitops`의 선언 상태를 AWS dev Kubernetes 클러스터에 동기화
- Helm: 공통 서비스 배포 템플릿
- Kustomize: platform 리소스와 scenario manifest 조합

이 구조의 핵심은 Kong과 Istio를 경쟁 관계로 보지 않고, `외부 API 정책`과 `내부 서비스 메시 정책`으로 역할을 나누는 것이다.

```text
Client
  -> Kong Gateway
  -> Kubernetes Service
  -> Service Pod + Envoy Sidecar
  -> Istio traffic policy
  -> 내부 서비스 호출
```

## GitOps 배포 구조 확인

현재 AWS dev 배포는 ArgoCD가 GitHub의 `Medikong/gitops` 저장소를 바라보는 구조다.

```text
gitops/
  argo/applications/aws-dev/
    root.yaml
    platform/
    services/
  charts/medikong-service/
  platform/
    kong/
    istio/
    monitoring/
  values/
    env/aws-dev.yaml
    services/*.yaml
```

배포 흐름:

```text
GitHub main
  -> ArgoCD root application
  -> platform applications
  -> service applications
  -> Kubernetes resources
```

중요한 점은 EC2 서버 안의 `~/gitops` 폴더를 수정한다고 자동 배포되는 것이 아니라는 점이다. ArgoCD는 원격 GitHub 저장소의 `main`을 기준으로 동기화한다. EC2의 작업 사본은 상태 확인과 수동 검증에 사용한다.

## Istio 설치 방식

Istio는 수동 명령이 아니라 ArgoCD Application으로 설치한다.

```text
medikong-istio-platform
  -> istio-base
  -> istiod
  -> kiali
```

관련 파일:

```text
gitops/argo/applications/aws-dev/platform/istio.yaml
gitops/platform/istio/kustomization.yaml
gitops/platform/istio/argocd/istio-base.yaml
gitops/platform/istio/argocd/istiod.yaml
gitops/platform/istio/argocd/kiali.yaml
```

이 방식을 선택한 이유:

- 클러스터를 다시 만들더라도 Git에 있는 선언만으로 Istio 구성을 복구할 수 있다.
- 설치 리소스가 GitOps로 추적된다.
- `istio-base`, `istiod`, `kiali` 상태를 ArgoCD에서 각각 확인할 수 있다.

## Istio 설치와 트래픽 정책 분리

Istio 설치 리소스와 서비스 트래픽 정책은 별도 ArgoCD Application으로 분리했다.

```text
medikong-istio-platform
  -> Istio 설치와 Kiali 배포

reservation-canary-traffic
  -> reservation-service DestinationRule / VirtualService
```

분리한 이유:

- `VirtualService`, `DestinationRule`은 Istio CRD가 먼저 있어야 생성된다.
- 서비스별 트래픽 정책은 실제 서비스 namespace에 적용되어야 한다.
- Istio 설치 실패와 서비스 traffic policy 실패를 따로 볼 수 있어야 한다.

관련 파일:

```text
gitops/argo/applications/aws-dev/platform/istio-traffic-reservation.yaml
gitops/platform/istio/traffic/reservation/
```

이 결정은 ADR로 기록했다.

```text
workspace/docs/adr/0007-separate-istio-platform-and-traffic-policy-sync.md
```

## Sidecar Injection 적용

Istio는 각 서비스 Pod 옆에 Envoy sidecar를 붙여서 트래픽을 제어한다.

적용 방식:

```yaml
deployment:
  podAnnotations:
    sidecar.istio.io/inject: "true"
```

적용 대상:

```text
concert-service
reservation-service
reservation-service-v2 canary workload
```

`concert-service`는 sidecar injection 자체를 확인하기 위한 첫 대상이다. `reservation-service`는 canary routing과 circuit breaker 정책을 검증하기 위한 대상이다.

## 검증 명령 추가

반복 검증을 쉽게 하기 위해 `Taskfile.yml`에 명령을 추가했다.

| 명령 | 확인 내용 |
| --- | --- |
| `task dev:istio` | Istio platform manifest 렌더링과 ArgoCD Application 적용 흐름 |
| `task mesh-check` | Istio control plane, Kiali, CRD, sidecar injection 상태 |
| `task mesh-monitoring:render` | Istio/Envoy metric 수집용 PodMonitor 렌더링 |
| `task mesh-monitoring-check` | Prometheus, Grafana, Kiali, PodMonitor 상태 |
| `task canary:render` | reservation-service v1/v2 canary manifest 렌더링 |
| `task canary:check` | DestinationRule subset, VirtualService weight, v1/v2 label |
| `task circuit-breaker:render` | retry, timeout, outlierDetection, fault scenario 렌더링 |
| `task circuit-breaker:check` | Circuit breaker 정책과 검증 대상 리소스 상태 |

이 명령들은 실제 클러스터 적용 전 manifest가 깨지지 않았는지 확인하는 안전장치 역할을 한다.

## Kong Smoke Test 준비

Kong smoke test는 외부 요청이 Kong을 거쳐 서비스까지 도달하는지 확인하는 단계다.

확인하려던 흐름:

```text
Client
  -> Kong Proxy Service
  -> Kong Gateway
  -> Kong Plugin
  -> Service Ingress
  -> Kubernetes Service
  -> Pod
```

현재 AWS dev에서는 DB/Kafka가 준비되지 않아 `concert-service`, `reservation-service` Pod가 `CrashLoopBackOff` 상태다. 그래서 Kong 라우팅 manifest와 ArgoCD 리소스 상태는 확인했지만, 실제 API 응답 기반 smoke test는 보류했다.

보류 이유:

- 애플리케이션 Pod가 Running 상태가 아니면 Kong 경유 API 테스트가 의미 있는 결과를 주지 않는다.
- Istio sidecar 동작, Kiali topology, circuit breaker ejection도 Pod가 정상 기동된 뒤 검증해야 한다.

## Mesh Monitoring 구성

Istio를 설치한 뒤 운영 증거를 남기기 위해 Prometheus 수집 대상을 추가했다.

수집 대상:

```text
istiod
  -> /metrics

concert-service Envoy sidecar
  -> /stats/prometheus
```

관련 파일:

```text
gitops/platform/monitoring/manifests/istio-mesh-podmonitors.yaml
gitops/platform/monitoring/kustomization.yaml
```

확인할 수 있는 대표 지표:

```text
istio_requests_total
istio_request_duration_milliseconds_bucket
pilot_xds_pushes
```

Kiali와 Prometheus/Grafana는 함께 사용한다. Kiali는 서비스 간 연결과 에러 흐름을 시각적으로 보여주고, Prometheus/Grafana는 수치 기반 지표와 대시보드를 제공한다.

## Canary Routing 구성

Canary Routing은 새 버전을 한 번에 전체 트래픽으로 전환하지 않고 일부 비율만 먼저 보내는 방식이다.

적용 대상:

```text
reservation-service
```

기본 안정 상태:

```text
v1 100%
v2 0%
```

검증 시나리오:

```text
canary-20  -> v1 80%, v2 20%
canary-50  -> v1 50%, v2 50%
canary-100 -> v2 100%
rollback   -> v1 100%
```

관련 파일:

```text
gitops/platform/istio/traffic/reservation/destination-rule.yaml
gitops/platform/istio/traffic/reservation/virtual-service-stable.yaml
gitops/platform/istio/traffic/reservation/scenarios/
gitops/values/scenarios/istio/reservation-canary-v2.yaml
```

기본 GitOps 상태에는 안정 상태인 `v1 100%`만 포함한다. 비율 전환은 scenario manifest로 분리해 필요할 때만 적용한다.

## Circuit Breaker 구성

Circuit Breaker는 특정 서비스가 느려지거나 5xx를 반복할 때 장애가 다른 서비스로 전파되는 것을 줄이기 위한 정책이다.

적용 정책:

```text
connectionPool.tcp.maxConnections = 100
connectionPool.http.http1MaxPendingRequests = 100
connectionPool.http.maxRequestsPerConnection = 50
outlierDetection.consecutive5xxErrors = 5
outlierDetection.interval = 10s
outlierDetection.baseEjectionTime = 30s
outlierDetection.maxEjectionPercent = 50
timeout = 2s
retries.attempts = 2
retries.perTryTimeout = 1s
retries.retryOn = 5xx,connect-failure,refused-stream
```

의미:

- 동시에 너무 많은 연결이 몰리지 않도록 connection pool을 제한한다.
- 5xx를 반복하는 endpoint는 30초 동안 트래픽 대상에서 제외한다.
- 응답이 2초를 넘으면 실패로 판단한다.
- 일시적인 실패는 최대 2번 재시도한다.

관련 파일:

```text
gitops/platform/istio/traffic/reservation/destination-rule.yaml
gitops/platform/istio/traffic/reservation/virtual-service-stable.yaml
gitops/platform/istio/traffic/reservation/scenarios/fault-5xx/
gitops/platform/istio/traffic/reservation/scenarios/fault-delay/
```

이 결정은 ADR로 기록했다.

```text
workspace/docs/adr/0006-use-istio-outlierdetection-for-mesh-circuit-breaker.md
```

## AWS dev에서 확인된 상태

확인된 내용:

```text
virtualservices.networking.istio.io CRD 생성됨
destinationrules.networking.istio.io CRD 생성됨
istiod Running
kiali Running
reservation-canary-traffic Synced / Healthy
```

보류된 내용:

```text
concert-service CrashLoopBackOff
reservation-service CrashLoopBackOff
```

현재 판단:

- Istio/Kiali와 traffic policy 리소스는 클러스터에 반영됐다.
- 애플리케이션 Pod는 DB/Kafka 미준비로 정상 기동되지 않는다.
- 실제 API 호출, Kiali topology, canary weight, circuit breaker ejection 검증은 DB/Kafka 복구 이후 진행한다.

## 다음 확인 순서

DB/Kafka 복구 이후 다음 순서로 확인한다.

```text
1. concert-service Pod 2/2 Running 확인
2. reservation-service Pod 2/2 Running 확인
3. Pod 안에 istio-proxy container가 붙었는지 확인
4. Kong 경유 /concerts 호출 확인
5. Kiali topology에서 서비스 간 흐름 확인
6. reservation canary scenario 적용
7. fault-5xx / fault-delay scenario 적용
8. rollback scenario로 안정 상태 복구
```

확인 명령 예시:

```bash
kubectl get pods -n ticketing-concert
kubectl get pods -n ticketing-reservation
kubectl get destinationrule -n ticketing-reservation
kubectl get virtualservice -n ticketing-reservation
kubectl get svc -n istio-system kiali
kubectl get podmonitor -n monitoring
```

## 설명할 때 중요한 포인트

Kong과 Istio는 같은 문제를 중복으로 푸는 것이 아니다.

Kong은 사용자가 들어오는 입구에서 API 정책을 처리한다. Istio는 클러스터 내부에서 서비스끼리 호출할 때의 안정성과 관측성을 처리한다.

ArgoCD는 서버에서 명령을 실행하는 도구가 아니라 Git에 선언된 최종 상태를 클러스터에 맞추는 도구다.

Helm은 여러 서비스가 같은 Kubernetes 배포 구조를 공유하도록 돕는 템플릿 도구다.

Kustomize는 이미 작성된 YAML 리소스를 목적별로 묶고 조합하는 도구다.

Kiali는 mesh 구조를 눈으로 확인하는 도구이고, Prometheus/Grafana는 지표를 저장하고 대시보드로 보는 도구다.
