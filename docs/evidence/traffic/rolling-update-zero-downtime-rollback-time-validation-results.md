### 1. 검증 목적

본 검증의 목적은 `reservation-service` RollingUpdate 및 rollback 과정에서 사용자 요청이 중단되지 않는지 확인하는 것이다.

`reservation-service`는 예매 흐름의 핵심 진입점이므로, 배포 중에도 다음 조건을 만족해야 한다.

```
1. RollingUpdate 중 HTTP 200 응답 유지
2. 5xx 또는 upstream failure 미발생
3. 배포 완료 시간 측정
4. rollback 완료 시간 측정
5. 최종 Pod 상태 정상화
```

---

### 2. 검증 대상

```
namespace: ticketing-reservation
deployment: reservation-service
service: reservation-service
endpoint: reservation-service.ticketing-reservation.svc.cluster.local:8083/health
test client: kong namespace의 mesh-curl
```

---

### 3. RollingUpdate 전략

검증 당시 `reservation-service`의 Deployment strategy는 다음과 같았다.

```json
{
  "type": "RollingUpdate",
  "rollingUpdate": {
    "maxSurge": 0,
    "maxUnavailable": 1
  }
}
```

이는 replica 2개 기준으로 한 번에 최대 1개 Pod까지 unavailable 상태를 허용하며 순차 교체하는 방식이다.

현재 private-dev 환경에서는 이 전략으로도 무중단 응답이 유지되었지만, 운영 안정성을 더 높이려면 다음 전략도 고려할 수 있다.

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

---

### 4. 검증 전 상태

검증 전 `reservation-service` Pod는 정상 상태였다.

```
reservation-service Pod 2개 Running
reservation-service-v2 Pod 1개 Running
```

기본 health 응답은 정상으로 확인되었다.

```
reservation=200
```

---

### 5. RollingUpdate 수행 및 시간 측정

RollingUpdate는 `rollout restart`로 수행했다.

```bash
START=$(date +%s)

kubectl -n ticketing-reservation rollout restart deploy/reservation-service
kubectl -n ticketing-reservation rollout status deploy/reservation-service --timeout=300s

END=$(date +%s)
echo "rolling_update_time_seconds=$((END-START))"
```

측정 결과는 다음과 같다.

```
rolling_update_time_seconds=65
```

RollingUpdate 이후 새 Pod가 정상 생성되었다.

```
reservation-service-74cdc847f5-m8tn5   2/2 Running
reservation-service-74cdc847f5-tfv45   2/2 Running
```

---

### 6. Rollback 수행 및 시간 측정

Rollback은 `rollout undo`로 수행했다.

```bash
START=$(date +%s)

kubectl -n ticketing-reservation rollout undo deploy/reservation-service
kubectl -n ticketing-reservation rollout status deploy/reservation-service --timeout=300s

END=$(date +%s)
echo "rollback_time_seconds=$((END-START))"
```

측정 결과는 다음과 같다.

```
rollback_time_seconds=66
```

Rollback 이후 Pod도 정상 생성 및 Running 상태로 복구되었다.

```
reservation-service-5bdcb48496-ng65z   2/2 Running
reservation-service-5bdcb48496-sz4d7   2/2 Running
```

---

### 7. 지속 요청 결과

RollingUpdate 및 rollback 검증 중 `mesh-curl`을 통해 `reservation-service`에 지속 요청을 보냈다.

대표 결과는 다음과 같다.

```
06:32:17 reservation=200
06:32:19 reservation=200
06:32:20 reservation=200
...
06:35:13 reservation=200
06:35:14 reservation=200
06:35:15 reservation=200
06:35:17 reservation=200
06:35:18 reservation=200
```

검증 구간에서 사용자 관점의 `503`, `000`, timeout 응답은 확인되지 않았다.

---

### 8. Istio / Prometheus Metric 확인

RollingUpdate 및 rollback 이후 Prometheus에서 Istio request metric을 확인했다.

조회 쿼리는 다음과 같다.

```bash
kubectl -n monitoring run prom-curl --rm -i \
  --image=curlimages/curl \
  --restart=Never \
  -- sh -c '
curl -G -s "http://kube-prometheus-stack-prometheus:9090/api/v1/query" \
  --data-urlencode "query=sum by (destination_service_namespace,destination_service_name,response_code,response_flags)(increase(istio_requests_total{destination_service_namespace=\"ticketing-reservation\"}[15m]))"
'
```

조회 결과는 다음과 같다.

```
reservation-service / response_code=200 / response_flags="-" / value=388.77
reservation-service / response_code=503 / response_flags="URX,UF" / value=0
```

해석은 다음과 같다.

```
1. RollingUpdate/rollback 구간에서 reservation-service의 HTTP 200 응답이 정상적으로 증가했다.
2. HTTP 503 응답은 0으로 확인되었다.
3. URX, UF와 같은 upstream failure flag도 0으로 확인되었다.
4. 따라서 Istio 관측 기준으로도 배포 중 트래픽 단절이나 upstream 장애는 발생하지 않았다.
```

---

### 9. 최종 판정

```
판정: 성공
```

`reservation-service` RollingUpdate와 rollback을 수행한 결과, 배포 및 rollback 중 사용자 요청은 HTTP 200을 유지했고, Prometheus/Istio metric에서도 503 및 upstream failure가 0으로 확인되었다.

RollingUpdate 완료 시간은 65초, rollback 완료 시간은 66초로 측정되었다.

따라서 reservation-service 배포 및 rollback 과정에서 사용자 관점의 트래픽 단절은 발생하지 않은 것으로 판정한다.

---

### 10. 검증 결과 요약

| 검증 항목               | 결과        |
| ----------------------- | ----------- |
| RollingUpdate 수행      | 성공        |
| RollingUpdate 시간      | 65초        |
| Rollback 수행           | 성공        |
| Rollback 시간           | 66초        |
| 지속 요청 HTTP 200 유지 | 성공        |
| HTTP 503 발생           | 0           |
| URX/UF upstream failure | 0           |
| 최종 Pod 상태           | 2/2 Running |
| 사용자 관점 트래픽 단절 | 없음        |

---

### 11. 후속 개선 사항

현재 private-dev 환경에서는 `maxSurge=0`, `maxUnavailable=1` 전략으로도 무중단 응답이 유지되었다.

다만 운영 안정성을 더 높이기 위해서는 다음 개선을 고려할 수 있다.

```
1. maxUnavailable=0, maxSurge=1 전략 적용 검토
2. health endpoint가 아닌 실제 reservation API 기준 무중단 검증
3. 더 높은 요청량에서 p95/p99 latency 변화 확인
4. Grafana 대시보드 캡처를 통한 시각 자료 확보
5. rollback trigger 조건과 runbook 절차 문서화
```
