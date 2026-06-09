# 장애 복구 Runbook

## 목적

Kong, Istio, ArgoCD, NetworkPolicy, RBAC가 함께 적용된 상태에서 장애가 발생했을 때 원인 확인과 복구 순서를 정리한다.

현재 DB/Kafka 미준비로 실제 장애 주입 검증은 보류한다. 이 문서는 복구 절차를 먼저 고정하고, AWS dev 런타임이 준비되면 실행 결과를 evidence로 채운다.

## 공통 확인 순서

장애가 발생하면 먼저 다음 순서로 범위를 좁힌다.

```bash
kubectl get nodes
kubectl get applications -n argocd
kubectl get pods -A
kubectl get svc -A
kubectl get events -A --sort-by=.lastTimestamp
```

판단 기준:

```text
ArgoCD 문제인가
Pod 기동 문제인가
Kong ingress 문제인가
Istio sidecar/traffic policy 문제인가
NetworkPolicy 차단인가
RBAC 권한 문제인가
DB/Kafka 의존성 문제인가
```

## ArgoCD OutOfSync / Degraded

증상:

```text
Application OutOfSync
Application Degraded
새 GitOps manifest가 클러스터에 반영되지 않음
```

확인:

```bash
kubectl get applications -n argocd
kubectl describe application <app-name> -n argocd
```

복구:

```bash
kubectl annotate application <app-name> \
  -n argocd \
  argocd.argoproj.io/refresh=hard \
  --overwrite
```

추가 확인:

```bash
kubectl get applications -n argocd
kubectl describe application <app-name> -n argocd
```

성공 기준:

```text
Application이 Synced 상태로 돌아온다.
Health가 Healthy 또는 Progressing으로 개선된다.
```

## Service Pod CrashLoopBackOff

증상:

```text
Pod가 CrashLoopBackOff
Kong 경유 API가 5xx
Kiali topology에 service traffic이 나타나지 않음
```

확인:

```bash
kubectl get pods -n <namespace>
kubectl describe pod -n <namespace> <pod-name>
kubectl logs -n <namespace> <pod-name> --previous
kubectl get svc,endpoints -n <namespace>
```

주요 원인:

```text
DB 연결 실패
Kafka 연결 실패
환경변수 오류
이미지 태그 오류
Secret 누락
Readiness/Liveness probe 실패
```

복구:

```bash
kubectl rollout restart deployment/<deployment-name> -n <namespace>
kubectl rollout status deployment/<deployment-name> -n <namespace> --timeout=180s
```

성공 기준:

```text
Pod가 Running 상태다.
READY가 sidecar 포함 기준으로 2/2 또는 기대 container 수와 일치한다.
Service Endpoint가 생성된다.
```

## Kong 경유 API 장애

증상:

```text
외부 API 호출 실패
Kong에서 401/403/404/429/5xx 반환
Pod는 Running 상태
```

확인:

```bash
kubectl get ingress -A
kubectl describe ingress -n <namespace> <ingress-name>
kubectl get kongplugin -A
kubectl get svc -n kong
kubectl logs -n kong deploy/kong-gateway
```

상태 코드별 판단:

| 상태 | 가능성 |
| --- | --- |
| 401 | JWT 누락 또는 검증 실패 |
| 403 | Role Guard 차단 |
| 404 | Ingress path 또는 Kong route 불일치 |
| 429 | Rate Limit 동작 |
| 5xx | upstream service, endpoint, sidecar, app 장애 |

복구:

```bash
kubectl get endpoints -n <namespace> <service-name>
kubectl rollout restart deployment/<service-name> -n <namespace>
```

성공 기준:

```text
Kong 경유 API가 기대 status code를 반환한다.
서비스 로그에 request id가 남는다.
```

## Istio Sidecar Injection 장애

증상:

```text
Pod가 1/1 Running으로 뜸
istio-proxy가 붙지 않음
Kiali graph에 service가 나타나지 않음
```

확인:

```bash
kubectl get pods -n <namespace>
kubectl get pod -n <namespace> <pod-name> -o jsonpath="{.spec.containers[*].name}"
kubectl get deployment -n <namespace> <deployment-name> -o yaml | grep sidecar.istio.io/inject
kubectl get pods -n istio-system
```

복구:

```bash
kubectl rollout restart deployment/<deployment-name> -n <namespace>
kubectl rollout status deployment/<deployment-name> -n <namespace> --timeout=180s
```

성공 기준:

```text
Pod가 2/2 Running이다.
container 목록에 istio-proxy가 있다.
Kiali에서 service node가 보인다.
```

## Canary Routing 장애

증상:

```text
v2 배포 이후 5xx 증가
특정 비율에서 응답 지연 증가
신규 버전 Pod만 실패
```

확인:

```bash
kubectl get destinationrule -n ticketing-reservation reservation-service -o yaml
kubectl get virtualservice -n ticketing-reservation reservation-service -o yaml
kubectl get pods -n ticketing-reservation --show-labels
```

즉시 rollback:

```bash
kubectl apply -k platform/istio/traffic/reservation/scenarios/rollback
```

성공 기준:

```text
VirtualService route가 v1 100%로 돌아간다.
5xx 또는 latency가 안정화된다.
```

## Circuit Breaker / Fault Injection 복구

증상:

```text
fault-5xx 또는 fault-delay scenario 적용 후 API 실패 지속
timeout/retry 설정으로 응답 지연
```

확인:

```bash
kubectl get virtualservice -n ticketing-reservation reservation-service -o yaml
kubectl get destinationrule -n ticketing-reservation reservation-service -o yaml
```

복구:

```bash
kubectl apply -k platform/istio/traffic/reservation/scenarios/rollback
kubectl apply -k platform/istio/traffic/reservation
```

성공 기준:

```text
fault injection 설정이 제거된다.
stable route가 v1 100%다.
DestinationRule의 기본 circuit breaker 정책은 유지된다.
```

## NetworkPolicy 차단

증상:

```text
Pod는 Running이지만 서비스 간 연결 실패
DB/Kafka 연결 timeout
Prometheus scrape 실패
Kong 5xx
```

확인:

```bash
kubectl get networkpolicy -A
kubectl describe networkpolicy -n <namespace>
kubectl get pod -n <namespace> --show-labels
kubectl get svc,endpoints -n <namespace>
```

복구 기준:

```text
먼저 새로 추가한 NetworkPolicy를 확인한다.
무작정 전체 정책을 삭제하지 않고, 필요한 namespaceSelector/podSelector/port를 추가한다.
```

긴급 복구:

```bash
kubectl delete networkpolicy <policy-name> -n <namespace>
```

성공 기준:

```text
필요한 통신만 다시 열린다.
차단해야 하는 통신은 계속 차단된다.
```

## RBAC 권한 문제

증상:

```text
kubectl 명령이 Forbidden
ArgoCD는 정상이지만 사용자가 리소스를 조회/수정하지 못함
```

확인:

```bash
kubectl auth can-i get pods -n ticketing-payment --as=<user> --as-group=medikong:developers
kubectl auth can-i patch deployment/payment-service -n ticketing-payment --as=<user> --as-group=medikong:operators
kubectl get role,rolebinding -n ticketing-payment
```

복구:

```text
사용자의 group 매핑을 확인한다.
RoleBinding subject의 group 이름이 실제 인증 group claim과 일치하는지 확인한다.
```

성공 기준:

```text
developers는 조회 가능
operators는 Deployment 수정 가능
sres는 namespace 내부 관리 가능
cluster-wide 권한은 부여되지 않음
```

## mTLS STRICT 적용 장애

증상:

```text
STRICT 적용 후 Kong -> service 요청 실패
sidecar 없는 Pod와 통신 실패
Kiali에서 mTLS 오류 또는 5xx 증가
```

확인:

```bash
kubectl get peerauthentication -A
kubectl get pods -A | grep -v '2/2'
kubectl get pod -n <namespace> <pod-name> -o jsonpath="{.spec.containers[*].name}"
```

복구:

```bash
kubectl delete peerauthentication <name> -n <namespace>
```

또는 PERMISSIVE로 되돌린다.

성공 기준:

```text
Kong 경유 API가 복구된다.
mesh 내부 서비스 호출이 복구된다.
Kiali topology가 정상 표시된다.
```

## 검증 대기 항목

DB/Kafka 복구 이후 다음을 실제로 검증한다.

```text
Pod kill 후 자동 복구
Canary rollback 5분 이내 복구
Circuit Breaker fault scenario 후 rollback
NetworkPolicy 차단/허용 테스트
RBAC auth can-i 테스트
mTLS PERMISSIVE -> STRICT 단계 전환 테스트
```
