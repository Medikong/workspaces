## 1. 검증 목적

이번 검증의 목적은 `reservation-service`의 트래픽 전환을 수동 `kubectl patch` 방식이 아니라, **GitOps 저장소 변경 → ArgoCD Sync → Istio VirtualService 반영 → Prometheus 지표 확인** 흐름으로 검증하는 것이다.

즉, 운영에 가까운 방식으로 다음을 확인한다.

```
1. GitOps 저장소에 선언된 canary-20 트래픽 정책이 ArgoCD를 통해 private-dev 클러스터에 반영되는가?
2. Istio VirtualService가 reservation-service 요청을 v1/v2로 80:20 비율에 가깝게 분배하는가?
3. Prometheus의 istio_requests_total 지표로 실제 트래픽 분배 결과를 확인할 수 있는가?
```

---

## 2. 검증 대상

| 항목               | 내용                                     |
| ------------------ | ---------------------------------------- |
| 대상 서비스        | reservation-service                      |
| Namespace          | ticketing-reservation                    |
| GitOps Repository  | Medikong/gitops                          |
| ArgoCD Application | reservation-canary-traffic-private-dev   |
| 대상 클러스터      | private-dev                              |
| 적용 커밋          | 9bd0fdc0bf18b7e94fa44848848e29187af15221 |
| 트래픽 정책        | canary-20                                |
| 기대 비율          | v1 = 80%, v2 = 20%                       |
| 검증 클라이언트    | kong namespace의 mesh-curl Pod           |
| 관측 지표          | Prometheus `istio_requests_total`        |

---

## 3. GitOps 변경 내용

### 3-1. kustomization.yaml 변경

기존에는 공통 traffic path가 stable VirtualService를 참조하고 있었다.

```yaml
resources:
  - destination-rule.yaml
  - virtual-service-stable.yaml
```

이번 변경으로 stable 파일 대신 canary-20 VirtualService를 참조하도록 변경했다.

```yaml
resources:
  - destination-rule.yaml
  - scenarios/canary-20/virtual-service.yaml
```

### 의미

이 변경은 클러스터에 직접 `kubectl patch`를 수행하는 것이 아니라, **GitOps repo의 desired state 자체를 canary-20으로 변경**한 것이다.

따라서 이 path를 바라보는 ArgoCD Application은 sync 시점에 아래 상태를 클러스터에 반영한다.

```
reservation-service VirtualService
v1 subset weight = 80
v2 subset weight = 20
```

---

## 4. canary-20 VirtualService 보강 내용

canary-20 VirtualService에는 stable 상태와 동일한 timeout/retry 정책도 추가했다.

```yaml
timeout: 2s
retries:
  attempts: 2
  perTryTimeout: 1s
  retryOn: 5xx,connect-failure,refused-stream
```

### 의미

canary 전환 시 트래픽 비율만 바꾸고 timeout/retry 정책이 빠지면, stable 상태와 canary 상태의 네트워크 안정성 조건이 달라질 수 있다.

따라서 canary-20에서도 stable과 동일하게 다음 정책을 유지한다.

| 항목                | 의미                                                   |
| ------------------- | ------------------------------------------------------ |
| `timeout: 2s`       | reservation-service 응답이 2초를 초과하면 timeout 처리 |
| `attempts: 2`       | 실패 시 최대 2회 시도                                  |
| `perTryTimeout: 1s` | 각 재시도 요청당 timeout 1초                           |
| `retryOn`           | 5xx, 연결 실패, refused-stream 발생 시 retry           |

---

## 5. ArgoCD 적용 상태 확인

### 실행 명령어

```bash
echo "===== ARGO APP STATUS ====="
kubectl -n argocd get application reservation-canary-traffic-private-dev \
  -o custom-columns='NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REVISION:.status.sync.revision'
```

### 실제 결과

```
===== ARGO APP STATUS =====
NAME                                     SYNC     HEALTH    REVISION
reservation-canary-traffic-private-dev   Synced   Healthy   9bd0fdc0bf18b7e94fa44848848e29187af15221
```

### 결과 해석

| 항목     | 결과       | 의미                                                       |
| -------- | ---------- | ---------------------------------------------------------- |
| SYNC     | Synced     | GitOps repo의 desired state와 클러스터 live state가 일치함 |
| HEALTH   | Healthy    | ArgoCD 기준 리소스 상태가 정상임                           |
| REVISION | 9bd0fdc... | canary-20 변경 커밋이 private-dev에 반영됨                 |

### 판정

```
ArgoCD가 canary-20 GitOps 커밋을 정상적으로 인식하고 private-dev 클러스터에 반영했다.
```

---

## 6. VirtualService 적용 상태 확인

### 6-1. v1/v2 weight 확인

### 실행 명령어

```bash
echo "===== VS WEIGHT ====="
kubectl -n ticketing-reservation get virtualservice reservation-service \
  -o jsonpath='{range .spec.http[*].route[*]}{.destination.subset}{"="}{.weight}{"\n"}{end}'
```

### 실제 결과

```
===== VS WEIGHT =====
v1=80
v2=20
```

### 결과 해석

현재 클러스터의 live VirtualService가 다음과 같이 설정되어 있다.

```
reservation-service 요청 중 80%는 v1 subset으로 전달
reservation-service 요청 중 20%는 v2 subset으로 전달
```

이는 GitOps repo에 선언한 canary-20 정책과 일치한다.

---

### 6-2. traffic-policy label 확인

### 실행 명령어

```bash
echo "===== VS POLICY LABEL ====="
kubectl -n ticketing-reservation get virtualservice reservation-service \
  -o jsonpath='{.metadata.labels.medikong\.io/traffic-policy}{"\n"}'
```

### 실제 결과

```
===== VS POLICY LABEL =====
canary-20
```

### 결과 해석

VirtualService의 traffic policy label도 `canary-20`으로 반영되어 있다.

즉, 클러스터의 live resource가 stable이 아니라 canary-20 상태임을 확인했다.

---

### 6-3. timeout/retry 확인

### 실행 명령어

```bash
echo "===== VS TIMEOUT RETRIES ====="
kubectl -n ticketing-reservation get virtualservice reservation-service -o yaml | sed -n '/http:/,/route:/p'
```

### 실제 결과

```yaml
http:
  - name: reservation-canary-20
    retries:
      attempts: 2
      perTryTimeout: 1s
      retryOn: 5xx,connect-failure,refused-stream
    route:
```

### 결과 해석

live VirtualService에 retry 정책이 반영되어 있음을 확인했다.

추가로 timeout 값은 다음 명령어로 별도 확인할 수 있다.

```bash
echo "===== TIMEOUT ====="
kubectl -n ticketing-reservation get virtualservice reservation-service \
  -o jsonpath='{.spec.http[0].timeout}{"\n"}'

echo "===== RETRIES ====="
kubectl -n ticketing-reservation get virtualservice reservation-service \
  -o jsonpath='{.spec.http[0].retries.attempts}{" "}{.spec.http[0].retries.perTryTimeout}{" "}{.spec.http[0].retries.retryOn}{"\n"}'
```

기대 결과는 다음과 같다.

```
2s
2 1s 5xx,connect-failure,refused-stream
```

---

## 7. 테스트 클라이언트 mesh-curl 재생성

기존 `mesh-curl` Pod는 종료 상태였다.

이전 오류:

```
error: cannot exec into a container in a completed pod; current phase is Succeeded
```

### 의미

`mesh-curl` Pod가 이미 완료 상태이므로, 해당 Pod 내부에서 curl 명령을 실행할 수 없다는 뜻이다.

따라서 canary traffic 검증을 위해 `mesh-curl` Pod를 새로 생성했다.

---

### 7-1. 기존 mesh-curl 삭제 및 재생성

### 실행 명령어

```bash
echo "===== DELETE OLD MESH CURL ====="
kubectl -n kong delete pod mesh-curl --ignore-not-found

echo "===== CREATE NEW MESH CURL ====="
kubectl run mesh-curl -n kong \
  --image=curlimages/curl \
  --restart=Never \
  --labels=app=mesh-curl \
  --command -- sleep 86400

echo "===== WAIT READY ====="
kubectl -n kong wait --for=condition=Ready pod/mesh-curl --timeout=120s

echo "===== CHECK SIDECAR ====="
kubectl -n kong get pod mesh-curl
kubectl -n kong describe pod mesh-curl | grep -E 'istio-proxy|istio-init|Ready|State:' -A2
```

### 실제 결과

```
===== DELETE OLD MESH CURL =====
pod "mesh-curl" deleted from kong namespace

===== CREATE NEW MESH CURL =====
pod/mesh-curl created

===== WAIT READY =====
pod/mesh-curl condition met

===== CHECK SIDECAR =====
NAME        READY   STATUS    RESTARTS   AGE
mesh-curl   2/2     Running   0          6s
```

추가 확인 결과:

```
istio-init:
  State: Terminated
  Reason: Completed
  Ready: True

istio-proxy:
  State: Running
  Ready: True
```

### 결과 해석

`mesh-curl` Pod가 `2/2 Running` 상태로 생성되었다.

이는 다음 두 컨테이너가 정상 실행 중이라는 뜻이다.

```
1. mesh-curl 컨테이너
2. istio-proxy sidecar 컨테이너
```

`istio-proxy`가 붙어 있어야 Istio VirtualService의 traffic routing 정책을 실제로 검증할 수 있다.

만약 `mesh-curl`이 `1/1 Running`이었다면 Istio sidecar가 없는 상태이므로, 요청이 VirtualService를 타지 않고 Kubernetes Service endpoint로 직접 분산될 수 있다.

이번 검증에서는 `2/2 Running`이므로 Istio mesh 내부 테스트 클라이언트로 사용할 수 있다.

---

## 8. reservation-service health check

### 실행 명령어

```bash
echo "===== HEALTH CHECK ====="
kubectl -n kong exec -it mesh-curl -c mesh-curl -- \
  curl -s -o /dev/null -w '%{http_code}\n' \
  http://reservation-service.ticketing-reservation.svc.cluster.local:8083/health
```

### 실제 결과

```
===== HEALTH CHECK =====
200
```

### 결과 해석

`mesh-curl` Pod에서 `reservation-service`의 `/health` endpoint를 정상 호출했다.

HTTP status code `200`은 reservation-service가 정상 응답했음을 의미한다.

```
mesh-curl
→ istio-proxy sidecar
→ reservation-service
→ /health 200 응답
```

따라서 traffic split 검증을 진행할 수 있는 상태이다.

---

## 9. 기존 metric window 비우기

### 실행 명령어

```bash
echo "===== WAIT OLD METRIC WINDOW ====="
sleep 70
```

### 의미

Prometheus의 `increase(...[2m])` 쿼리는 특정 시간 window 안의 counter 증가량을 계산한다.

이전 테스트 트래픽이 섞이면 v1/v2 비율이 부정확하게 보일 수 있으므로, 새 테스트를 시작하기 전에 일정 시간 대기했다.

---

## 10. canary traffic 발생

### 실행 명령어

```bash
echo "===== SEND 500 REQUESTS ====="
kubectl -n kong exec -it mesh-curl -c mesh-curl -- sh -c '
for i in $(seq 1 500); do
  curl -s -o /dev/null http://reservation-service.ticketing-reservation.svc.cluster.local:8083/health || true
done
'
```

### 명령어 의미

`mesh-curl` Pod 내부에서 `reservation-service`의 `/health` endpoint로 500회 요청을 보낸다.

세부 의미는 다음과 같다.

| 구문                    | 의미                                           |
| ----------------------- | ---------------------------------------------- |
| `kubectl -n kong exec`  | kong namespace의 Pod 안에서 명령 실행          |
| `mesh-curl`             | 테스트용 curl Pod                              |
| `-c mesh-curl`          | istio-proxy가 아닌 curl 컨테이너에서 명령 실행 |
| `for i in $(seq 1 500)` | 1부터 500까지 반복                             |
| `curl -s -o /dev/null`  | 응답 body는 출력하지 않고 요청만 전송          |
| `                       |                                                |

### 왜 500회를 보내는가?

canary는 비율 검증이기 때문에 요청 수가 너무 적으면 결과가 우연에 크게 흔들릴 수 있다.

예를 들어 10회 요청만 보내면 v2가 1~3회만 나와도 비율이 크게 흔들린다.

500회 정도 요청을 보내면 `80:20`에 가까운 분배 결과를 관측하기에 더 적합하다.

---

## 11. Prometheus scrape 대기

### 실행 명령어

```bash
echo "===== WAIT PROMETHEUS SCRAPE ====="
sleep 40
```

### 의미

Prometheus는 요청이 발생하는 즉시 실시간으로 값을 반영하는 것이 아니라, 일정 주기로 metric을 수집한다.

따라서 요청을 보낸 직후 바로 조회하면 metric이 아직 반영되지 않을 수 있다.

이를 방지하기 위해 40초 대기 후 Prometheus를 조회했다.

---

## 12. Prometheus로 traffic split 확인

### 실행 명령어

```bash
echo "===== CHECK TRAFFIC SPLIT ====="
kubectl -n monitoring run prom-curl --rm -i \
  --image=curlimages/curl \
  --restart=Never \
  -- sh -c '
curl -G -s "http://kube-prometheus-stack-prometheus:9090/api/v1/query" \
  --data-urlencode "query=sum by (source_workload,source_workload_namespace,destination_workload,destination_version,response_code)(increase(istio_requests_total{source_workload=\"mesh-curl\",source_workload_namespace=\"kong\",destination_service_name=\"reservation-service\",destination_service_namespace=\"ticketing-reservation\"}[2m]))"
'
```

### 명령어 의미

이 명령은 Prometheus에 직접 PromQL 쿼리를 보내 traffic split 결과를 확인한다.

---

### PromQL

```
sum by (
  source_workload,
  source_workload_namespace,
  destination_workload,
  destination_version,
  response_code
)(
  increase(
    istio_requests_total{
      source_workload="mesh-curl",
      source_workload_namespace="kong",
      destination_service_name="reservation-service",
      destination_service_namespace="ticketing-reservation"
    }[2m]
  )
)
```

### PromQL 세부 설명

| 항목                                                    | 의미                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `istio_requests_total`                                  | Istio가 수집하는 HTTP 요청 누적 counter                      |
| `source_workload="mesh-curl"`                           | mesh-curl에서 보낸 요청만 필터링                             |
| `source_workload_namespace="kong"`                      | kong namespace의 mesh-curl 요청만 필터링                     |
| `destination_service_name="reservation-service"`        | reservation-service로 간 요청만 필터링                       |
| `destination_service_namespace="ticketing-reservation"` | ticketing-reservation namespace의 reservation-service만 대상 |
| `[2m]`                                                  | 최근 2분 동안의 metric 변화를 계산                           |
| `increase(...)`                                         | 해당 시간 동안 counter가 얼마나 증가했는지 계산              |
| `sum by (...)`                                          | destination version, response code 기준으로 결과를 묶음      |

---

## 13. Prometheus 조회 결과

### 실제 결과

```json
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {
          "destination_version": "v1",
          "destination_workload": "reservation-service",
          "response_code": "200",
          "source_workload": "mesh-curl",
          "source_workload_namespace": "kong"
        },
        "value": [1781752470.584, "536"]
      },
      {
        "metric": {
          "destination_version": "v2",
          "destination_workload": "reservation-service-v2",
          "response_code": "200",
          "source_workload": "mesh-curl",
          "source_workload_namespace": "kong"
        },
        "value": [1781752470.584, "109.48396666666667"]
      }
    ]
  }
}
```

### 핵심 결과

```
v1 = 536
v2 = 109.48396666666667
```

---

## 14. traffic split 비율 계산

### 계산

```
total = 536 + 109.48396666666667
total = 645.4839666666667
```

```
v1 ratio = 536 / 645.4839666666667 * 100
v1 ratio ≈ 83.0%
```

```
v2 ratio = 109.48396666666667 / 645.4839666666667 * 100
v2 ratio ≈ 17.0%
```

### 결과 요약

| Destination | Workload               | 측정값 | 비율     |
| ----------- | ---------------------- | ------ | -------- |
| v1          | reservation-service    | 536    | 약 83.0% |
| v2          | reservation-service-v2 | 109.48 | 약 17.0% |

---

## 15. 왜 정확히 500이 아니고 645.48인가?

Prometheus의 `increase()`는 단순히 curl 요청 횟수를 그대로 세는 방식이 아니다.

`istio_requests_total`은 누적 counter이고, `increase(metric[2m])`는 최근 2분 window 안에서 Prometheus scrape sample을 기반으로 증가량을 계산한다.

따라서 다음 이유로 실제 curl 요청 수와 결과값이 정확히 일치하지 않을 수 있다.

```
1. Prometheus scrape 시점과 요청 발생 시점이 정확히 맞지 않음
2. increase()가 range window 양끝 값을 보간해서 계산함
3. health check 요청이나 직전 테스트 요청 일부가 window에 포함될 수 있음
4. counter 기반 계산이므로 결과가 소수 또는 보정값으로 나올 수 있음
```

따라서 이번 검증에서 중요한 것은 총합이 정확히 500인지가 아니라, **v1과 v2가 설정한 80:20 비율에 근접하게 분산되었는지**이다.

---

## 16. 검증 판정

GitOps에 선언된 기대값은 다음과 같다.

```
v1 = 80%
v2 = 20%
```

Prometheus 측정 결과는 다음과 같다.

```
v1 ≈ 83.0%
v2 ≈ 17.0%
```

이는 설정값인 `80:20`에 충분히 근접한 결과이다.

또한 모든 응답의 `response_code`가 `200`으로 기록되었다.

```
v1 response_code = 200
v2 response_code = 200
```

따라서 canary-20 traffic split은 정상 동작한 것으로 판단한다.

---

## 17. 최종 판정

| 검증 항목                | 결과                             | 판정 |
| ------------------------ | -------------------------------- | ---- |
| GitOps commit 반영       | ArgoCD revision 9bd0fdc          | 통과 |
| ArgoCD sync 상태         | Synced                           | 통과 |
| ArgoCD health 상태       | Healthy                          | 통과 |
| VirtualService weight    | v1=80, v2=20                     | 통과 |
| traffic-policy label     | canary-20                        | 통과 |
| mesh-curl sidecar        | 2/2 Running, istio-proxy Running | 통과 |
| reservation health check | HTTP 200                         | 통과 |
| Prometheus v1 traffic    | 약 83%                           | 통과 |
| Prometheus v2 traffic    | 약 17%                           | 통과 |
| 응답 코드                | v1/v2 모두 200                   | 통과 |

---

## 18. 결론

이번 검증을 통해 `reservation-service`의 canary-20 traffic policy가 GitOps 방식으로 private-dev 클러스터에 정상 반영되었고, 실제 Istio mesh 내부 요청에서도 v1/v2 트래픽이 설정값에 근접하게 분산됨을 확인했다.

최종 결론은 다음과 같다.

```
GitOps 기반 reservation-service canary-20 적용 및 traffic split 검증 성공
```

---

## 19. 문서용 요약 문장

```
reservation-service의 traffic policy를 GitOps 저장소에서 canary-20으로 변경하고, ArgoCD sync를 통해 private-dev 클러스터에 반영했다. 이후 Istio sidecar가 주입된 mesh-curl 테스트 클라이언트에서 reservation-service로 500회 요청을 발생시켰고, Prometheus의 istio_requests_total 지표를 통해 v1 약 83%, v2 약 17%의 트래픽 분배를 확인했다. 이는 설정값인 v1 80%, v2 20%에 근접한 결과로, GitOps 기반 Istio Canary traffic split이 정상 동작함을 검증했다.
```

---

## 20. 후속 조치

현재 공통 traffic path가 canary-20을 바라보도록 변경되어 있으므로, 같은 path를 사용하는 다른 환경도 canary-20 대상이 될 수 있다.

따라서 검증 후 안정 상태로 되돌릴 필요가 있다면 GitOps 방식으로 stable rollback을 수행해야 한다.

예상 rollback 방식은 다음과 같다.

```yaml
resources:
  - destination-rule.yaml
  - virtual-service-stable.yaml
```

즉, `platform/istio/traffic/reservation/kustomization.yaml`을 다시 stable VirtualService를 바라보도록 변경하고 commit/push한 뒤 ArgoCD sync를 수행한다.

중요한 점은 rollback 역시 클러스터에 직접 `kubectl patch`를 수행하는 것이 아니라, GitOps repo 변경을 통해 수행해야 한다는 것이다.
