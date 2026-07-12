### 1. 검증 목적

본 검증의 목적은 `reservation-service` Pod 1개가 강제로 종료되어도 사용자 요청이 중단되지 않고 정상 응답을 유지하는지 확인하는 것이다.

`reservation-service`는 예매 흐름의 진입점이므로, 단일 Pod 장애가 발생해도 다음 요소들이 정상 동작해야 한다.

```
1. Kubernetes Service의 정상 Pod 라우팅
2. Endpoint 갱신
3. Deployment self-healing
4. Istio sidecar 기반 내부 트래픽 처리
5. 사용자 관점의 트래픽 단절 방지
```

---

### 2. 검증 대상

```
namespace: ticketing-reservation
service: reservation-service
test client: kong namespace의 mesh-curl
endpoint: reservation-service.ticketing-reservation.svc.cluster.local:8083/health
```

검증 대상은 `reservation-service`이다.

해당 서비스는 예매 요청의 핵심 진입점이며, 기존 Istio `VirtualService`와 `DestinationRule`이 적용된 서비스이기 때문에 Pod 장애 및 Istio traffic routing 검증 대상으로 적합하다.

---

### 3. 검증 전 상태

검증 전 `reservation-service`는 정상 응답 상태였다.

```
reservation=200
```

또한 `reservation-service` Pod는 복수 replica로 동작 중이었다.

---

### 4. 검증 방식

mesh 내부 테스트 클라이언트인 `mesh-curl`에서 `reservation-service`로 지속 요청을 발생시켰다.

```bash
for i in $(seq 1 100); do
  ts=$(date '+%H:%M:%S')
  code=$(kubectl -n kong exec mesh-curl -c mesh-curl -- \
    curl -s -o /dev/null -w '%{http_code}' \
    --max-time 3 \
    http://reservation-service.ticketing-reservation.svc.cluster.local:8083/health || echo "000")
  echo "$ts reservation=$code"
  sleep 1
done
```

지속 요청이 수행되는 중간에 `reservation-service` Pod 1개를 강제로 삭제했다.

```bash
POD=$(kubectl -n ticketing-reservation get pod -l app=reservation-service \
  -o jsonpath='{.items[0].metadata.name}')

kubectl -n ticketing-reservation delete pod "$POD"
```

---

### 5. 지속 요청 결과

Pod 강제 삭제 중에도 `reservation-service`는 지속적으로 HTTP 200을 반환했다.

대표 결과는 다음과 같다.

```
06:07:29 reservation=200
06:07:30 reservation=200
06:07:32 reservation=200
06:07:33 reservation=200
06:07:35 reservation=200
...
06:09:32 reservation=200
06:09:34 reservation=200
06:09:35 reservation=200
06:09:36 reservation=200
```

검증 중 사용자 관점에서 `503`, `000`, timeout 응답은 확인되지 않았다.

따라서 Pod 1개가 강제로 종료되는 동안에도 `reservation-service` 요청은 정상적으로 처리되었다.

---

### 6. Pod 복구 결과

Pod 삭제 이후 Deployment가 새 Pod를 생성했고, 최종적으로 `reservation-service`는 정상 replica 상태로 복구되었다.

```
reservation-service-5bdcb48496-v2trk   2/2 Running
reservation-service-5bdcb48496-z62hc   2/2 Running
```

rollout 상태도 정상 완료되었다.

```
deployment "reservation-service" successfully rolled out
```

이를 통해 Kubernetes Deployment의 self-healing이 정상 동작함을 확인했다.

---

### 7. Istio / Prometheus metric 확인

Pod 강제 종료 이후 Prometheus에서 Istio request metric을 확인했다.

조회 쿼리는 다음과 같다.

```bash
kubectl -n monitoring run prom-curl --rm -i \
  --image=curlimages/curl \
  --restart=Never \
  -- sh -c '
curl -G -s "http://kube-prometheus-stack-prometheus:9090/api/v1/query" \
  --data-urlencode "query=sum by (destination_service_namespace,destination_service_name,response_code,response_flags)(increase(istio_requests_total{destination_service_namespace=\"ticketing-reservation\"}[10m]))"
'
```

조회 결과는 다음과 같았다.

```
reservation-service / response_code=200 / response_flags="-" / value=134.33
reservation-service / response_code=503 / response_flags="URX,UF" / value=0
```

해석은 다음과 같다.

```
1. reservation-service의 HTTP 200 응답은 정상적으로 증가했다.
2. HTTP 503 응답은 0으로 확인되었다.
3. URX, UF와 같은 upstream 실패 플래그도 0으로 확인되었다.
4. 사용자 요청 관점에서 트래픽 단절이나 upstream failure는 발생하지 않았다.
```

---

### 8. Istio Retry 해석

이번 검증에서 명확한 5xx 실패가 발생하지 않았기 때문에, Istio retry가 눈에 띄게 발생했다고 보기는 어렵다.

하지만 이는 실패가 아니라 긍정적인 결과로 해석할 수 있다.

Pod 삭제 시점에 Kubernetes Endpoint가 빠르게 갱신되었고, Istio sidecar는 남아 있는 정상 Pod로 트래픽을 전달했다. 그 결과 사용자 요청은 실패하지 않았고, Prometheus metric에서도 `503` 및 `URX,UF` 실패 플래그가 0으로 확인되었다.

즉, 실제 retry가 많이 발생할 상황까지 가지 않고도 서비스 라우팅이 정상 Pod로 유지되었다.

---

### 9. 최종 판정

```
판정: 성공
```

`reservation-service` Pod 1개를 강제 종료했지만, 지속 요청 중 모든 응답은 HTTP 200을 유지했다.

또한 Deployment는 새 Pod를 생성해 정상 replica 상태로 복구했고, Prometheus/Istio metric에서도 HTTP 503 및 upstream failure flag가 0으로 확인되었다.

따라서 단일 Pod 장애 상황에서 사용자 관점의 트래픽 단절은 발생하지 않았으며, Kubernetes self-healing과 Istio/Kubernetes 서비스 라우팅이 정상 동작함을 확인했다.

---

### 10. 검증 결과 요약

| 검증 항목                    | 결과 |
| ---------------------------- | ---- |
| 지속 요청 중 HTTP 200 유지   | 성공 |
| Pod 강제 삭제 수행           | 성공 |
| Deployment self-healing      | 성공 |
| 새 Pod 자동 생성             | 성공 |
| 최종 replica 정상화          | 성공 |
| Prometheus 200 metric 증가   | 성공 |
| 503 발생 여부                | 0    |
| URX/UF upstream failure flag | 0    |
| 사용자 관점 트래픽 단절      | 없음 |

---

### 11. 후속 보완 사항

이번 검증은 `health endpoint` 기준의 Pod 장애 검증이다.

추가로 보완하면 좋은 항목은 다음과 같다.

```
1. 실제 예약 생성 API에 대한 지속 요청 중 Pod 강제 종료 검증
2. 부하가 있는 상태에서 Pod 삭제 후 p95 latency 변화 확인
3. RollingUpdate 중 지속 요청과 비교
4. Pod 삭제 시점 전후의 Grafana 대시보드 캡처
5. response_flags, 5xx_rate, request duration metric을 함께 문서화
```
