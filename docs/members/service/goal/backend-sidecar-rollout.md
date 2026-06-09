# Backend Sidecar Rollout

## 목적

Istio Service Mesh 검증 범위를 `concert-service`, `reservation-service`에서 나머지 backend 흐름으로 확장한다.

이번 적용은 Pod 수를 늘리는 작업이 아니다. 각 Pod 안에 `istio-proxy` 컨테이너가 하나 더 붙는 방식이다.

```text
sidecar 적용 전
  payment-service Pod
    - payment-service container

sidecar 적용 후
  payment-service Pod
    - payment-service container
    - istio-proxy container
```

## 적용 대상

이번에 sidecar injection을 추가하는 서비스:

```text
payment-service
ticket-service
notification-service
```

이미 적용되어 있던 서비스:

```text
concert-service
reservation-service
reservation-service v2 canary workload
```

이번에 제외하는 서비스:

```text
auth-service
dashboard
```

## auth-service를 제외하는 이유

`auth-service`는 JWT 발급과 인증 기준점이다.

`auth-service`에 sidecar를 먼저 붙였다가 문제가 생기면 다음 원인을 구분하기 어렵다.

```text
JWT 발급 문제인지
Kong JWT plugin 문제인지
sidecar injection 문제인지
서비스 자체 문제인지
```

따라서 `auth-service`는 backend mesh 흐름이 안정화된 뒤 마지막에 적용한다.

## dashboard를 제외하는 이유

`dashboard`는 frontend 성격의 workload다. 첫 mesh 검증 목적은 내부 backend 흐름을 보는 것이므로 dashboard는 이번 적용에서 제외한다.

## 기대되는 구조

현재 backend sidecar 대상:

```text
concert-service
reservation-service
payment-service
ticket-service
notification-service
```

남은 대상:

```text
auth-service
dashboard
```

## 변경 위치

변경 파일:

```text
gitops/values/services/payment.yaml
gitops/values/services/ticket.yaml
gitops/values/services/notification.yaml
```

추가한 설정:

```yaml
deployment:
  podLabels:
    sidecar.istio.io/inject: "true"
  podAnnotations:
    sidecar.istio.io/inject: "true"
    sidecar.istio.io/proxyCPU: 25m
    sidecar.istio.io/proxyMemory: 64Mi
    sidecar.istio.io/proxyCPULimit: 200m
    sidecar.istio.io/proxyMemoryLimit: 256Mi
```

`podLabels`는 Istio sidecar injector webhook의 `objectSelector`가 실제로 매칭하기 위해 필요하다. `podAnnotations`는 webhook이 호출된 뒤 injector에게 주는 명시적인 opt-in 의도다.

proxy resource annotation은 AWS dev 클러스터에서 rollout이 CPU request 부족으로 멈추지 않도록 낮게 잡은 값이다. 운영 기준값은 Envoy CPU/메모리 metric을 보고 별도로 재산정해야 한다.

`ticket-service`는 Kafka consumer와 sidecar가 함께 올라가면서 작은 AWS dev 클러스터에서 두 번째 replica가 CPU request 부족으로 Pending이 될 수 있어, dev 검증용으로 app CPU request와 proxy CPU request를 더 낮게 둔다.

## 검증 명령

렌더링 검증:

```bash
task sidecar:render
```

AWS dev 반영 후 확인:

```bash
task sidecar:check
```

직접 확인:

```bash
kubectl get pods -n ticketing-payment
kubectl get pods -n ticketing-ticket
kubectl get pods -n ticketing-notification
```

기대 결과:

```text
payment-service-...        2/2 Running
ticket-service-...         2/2 Running
notification-service-...   2/2 Running
```

`2/2`는 Pod가 2개라는 뜻이 아니라, 한 Pod 안의 app container와 `istio-proxy` container가 모두 Ready라는 뜻이다.

## 보류되는 실제 검증

현재 DB/Kafka가 완전히 준비되지 않았으므로 다음은 나중에 확인한다.

```text
payment-service 2/2 Running
ticket-service 2/2 Running
notification-service 2/2 Running
Kiali topology에서 backend 흐름 확인
Prometheus에서 Istio/Envoy metric 확인
Kafka 이벤트 흐름과 sidecar 공존 확인
```

## 이후 적용 순서

남은 서비스 적용 권장 순서:

```text
1. auth-service
2. dashboard
```

단, `auth-service`는 Kong JWT smoke test가 안정화된 뒤 적용한다.
