# 남은 검증과 후속 구현 계획

## 문서 목적

지금까지 Kong, Istio, Canary Routing, Mesh Monitoring, Circuit Breaker의 GitOps 구현은 상당 부분 진행됐다. 하지만 AWS dev의 DB/Kafka 미준비로 인해 실제 API 호출, Kiali traffic 확인, Prometheus metric 확인, 장애 주입 검증은 아직 끝나지 않았다.

이 문서는 나중에 빠뜨리지 않도록 남은 작업을 한곳에 모아두는 계획 문서다.

## 현재 완료된 기반

### Kong Gateway 기반 외부 진입 구조

현재까지 정리된 내용:

- Kong을 외부 API Gateway로 사용한다.
- Kong에서 JWT 인증을 수행한다.
- Role Guard plugin으로 고객, 공급자, 관리자 API 접근을 나눈다.
- Rate Limit, Request ID, Prometheus plugin을 Kong 레벨에 붙인다.
- 서비스별 Ingress를 public/customer/provider/admin 성격에 맞게 나눈다.
- 내부 서비스는 Kong이 전달한 `X-User-*`, `X-Provider-Id` 계열 헤더를 기준으로 사용자 문맥을 처리한다.

남은 확인:

- DB/Kafka 복구 후 Kong 경유 API smoke test를 다시 진행한다.
- 인증이 필요한 API와 필요 없는 API를 나눠서 확인한다.
- Role Guard가 잘못된 role 요청을 차단하는지 확인한다.
- Rate Limit이 실제로 동작하는지 확인한다.

확인 예시:

```text
GET /api/concerts
GET /api/concerts/provider/*
POST /api/reservations
POST /api/payments
```

### Istio 설치와 Kiali 구성

현재까지 정리된 내용:

- `medikong-istio-platform` ArgoCD Application을 추가했다.
- `istio-base`, `istiod`, `kiali`를 ArgoCD로 설치하는 구조를 만들었다.
- AWS dev에서 `istiod`, `kiali` Pod가 Running 상태임을 확인했다.
- `VirtualService`, `DestinationRule` CRD가 생성된 것을 확인했다.

남은 확인:

- Kiali UI에 접속해서 서비스 topology가 보이는지 확인한다.
- 실제 트래픽이 발생한 뒤 Kiali graph에 edge가 생성되는지 확인한다.
- mTLS 상태 표시가 어떻게 나오는지 확인한다.

현재 보류 이유:

- 서비스 Pod가 DB/Kafka 미준비로 CrashLoopBackOff 상태라 실제 트래픽 흐름을 만들 수 없다.

### Sidecar Injection

현재까지 정리된 내용:

- `concert-service`에 `sidecar.istio.io/inject: "true"`를 붙였다.
- `reservation-service`에도 sidecar injection annotation을 붙였다.
- `reservation-service` canary workload도 sidecar injection 대상에 포함했다.

남은 확인:

- 서비스 Pod가 정상 기동된 뒤 `2/2 Running`인지 확인한다.
- Pod container 목록에 app container와 `istio-proxy`가 함께 있는지 확인한다.
- sidecar 적용 후에도 기존 API 응답이 깨지지 않는지 확인한다.

확인 명령:

```bash
kubectl get pods -n ticketing-concert
kubectl get pods -n ticketing-reservation
kubectl get pod -n ticketing-concert -o jsonpath="{.items[*].spec.containers[*].name}"
kubectl get pod -n ticketing-reservation -o jsonpath="{.items[*].spec.containers[*].name}"
```

### Reservation Canary Routing

현재까지 정리된 내용:

- `reservation-service`를 canary routing 대상 서비스로 정했다.
- stable workload에는 `version: v1` label을 붙였다.
- canary workload는 optional Deployment로 구성했다.
- 기본 상태는 `v1 100%`로 유지한다.
- 20%, 50%, 100%, rollback scenario manifest를 추가했다.
- `reservation-canary-traffic` ArgoCD Application으로 traffic policy를 별도 sync하도록 분리했다.

남은 확인:

- `reservation-service` stable Pod가 Running인지 확인한다.
- canary v2 workload를 켰을 때 v1/v2 Pod가 함께 존재하는지 확인한다.
- `DestinationRule` subset이 v1/v2 Pod label과 정확히 매칭되는지 확인한다.
- 20% -> 50% -> 100% 전환이 실제 요청 비율에 반영되는지 확인한다.
- rollback scenario 적용 시 v1 100%로 즉시 돌아오는지 확인한다.

보류 이유:

- 현재 reservation-service가 DB/Kafka 미준비로 정상 기동되지 않는다.

### Mesh Monitoring

현재까지 정리된 내용:

- `istiod` metric 수집용 PodMonitor를 추가했다.
- `concert-service` Envoy sidecar metric 수집용 PodMonitor를 추가했다.
- Kiali, Prometheus, Grafana를 함께 쓰는 흐름을 정리했다.

남은 확인:

- PodMonitor가 AWS dev에 적용됐는지 확인한다.
- Prometheus target에 `istiod`와 Envoy sidecar가 잡히는지 확인한다.
- Prometheus에서 Istio metric query가 가능한지 확인한다.
- Grafana에서 서비스별 응답시간, 에러율, 처리량 패널로 연결한다.

확인할 metric:

```text
istio_requests_total
istio_request_duration_milliseconds_bucket
pilot_xds_pushes
```

### Circuit Breaker

현재까지 정리된 내용:

- `reservation-service` DestinationRule에 connectionPool을 설정했다.
- `outlierDetection`을 추가했다.
- VirtualService에 retry/timeout을 추가했다.
- `fault-5xx`, `fault-delay`, `rollback` scenario manifest를 추가했다.
- 관련 ADR을 작성했다.

남은 확인:

- 현재 `feat/istio-circuit-breaker` 브랜치 변경을 main에 반영한다.
- ArgoCD가 AWS dev에 `outlierDetection`, `retry`, `timeout`을 반영하는지 확인한다.
- DB/Kafka 복구 후 5xx 장애 주입을 수행한다.
- 연속 5xx 발생 시 비정상 endpoint가 ejection되는지 확인한다.
- 지연 장애 주입 시 timeout/retry가 의도대로 동작하는지 확인한다.
- rollback scenario로 안정 상태를 복구한다.

확인 명령:

```bash
kubectl get destinationrule reservation-service -n ticketing-reservation -o yaml
kubectl get virtualservice reservation-service -n ticketing-reservation -o yaml
kubectl describe destinationrule reservation-service -n ticketing-reservation
kubectl describe virtualservice reservation-service -n ticketing-reservation
```

## 지금 당장 해야 할 정리

### Workspace 문서 커밋

해야 할 일:

- 실행 정리 문서와 ADR을 커밋한다.
- 기존 로컬 변경인 `.gitignore`는 제외한다.

대상:

```text
workspace/docs/members/service/execution/kong-istio-gitops-service-mesh-implementation.md
workspace/docs/adr/0007-separate-istio-platform-and-traffic-policy-sync.md
workspace/docs/adr/README.md
```

주의:

- `docs/personal/`은 현재 Git에서 ignored 상태다.
- 개인 계획 문서는 로컬 보관용으로 둔다.
- 팀 공유가 필요한 내용은 `docs/members/service/` 아래에 둔다.

### Circuit Breaker 변경 main 반영

해야 할 일:

- `gitops`의 `feat/istio-circuit-breaker`를 최신 `main`과 비교한다.
- 문제가 없으면 `main`에 merge한다.
- `main` push 후 ArgoCD 반영 상태를 확인한다.

확인할 내용:

```text
DestinationRule에 outlierDetection이 들어갔는가
VirtualService에 timeout/retries가 들어갔는가
reservation-canary-traffic Application이 Healthy인가
```

주의:

- 실제 장애 주입은 DB/Kafka 복구 이후 진행한다.
- 지금은 GitOps manifest와 ArgoCD 반영까지만 완료 기준으로 둔다.

## DB/Kafka 복구 후 다시 해야 할 검증

### 서비스 정상 기동 확인

목표:

- 서비스 Pod가 정상 Running 상태가 되어야 Kong/Istio 검증이 의미 있다.

확인 대상:

```text
ticketing-auth
ticketing-concert
ticketing-reservation
ticketing-payment
ticketing-ticket
ticketing-notification
ticketing-messaging
```

확인 명령:

```bash
kubectl get pods -A
kubectl get svc -A
kubectl get endpoints -A
kubectl get applications -n argocd
```

완료 기준:

- 주요 서비스 Pod가 Running 상태다.
- DB/Kafka 관련 Service와 Endpoint가 존재한다.
- ArgoCD Application이 Synced 상태다.

### Kong API Smoke Test

목표:

- 외부 요청이 Kong을 거쳐 서비스까지 도달하는지 확인한다.

확인 범위:

- 공개 API
- 고객 인증 API
- 공급자 API
- 관리자 API
- 잘못된 role 요청 차단
- Rate Limit 동작
- Request ID 전달

확인할 내용:

```text
Kong -> Service Ingress -> ClusterIP Service -> Pod
JWT 검증
Role Guard
Rate Limit
Request ID propagation
```

완료 기준:

- 정상 요청은 서비스까지 도달한다.
- 권한 없는 요청은 Kong에서 차단된다.
- 서비스 로그에서 request id를 추적할 수 있다.

### Kiali Topology 확인

목표:

- Istio sidecar가 붙은 서비스가 Kiali topology에 표시되는지 확인한다.

확인할 내용:

- `concert-service` node 표시
- `reservation-service` node 표시
- 서비스 간 호출 edge 표시
- 에러율 표시
- mTLS 상태 표시

완료 기준:

- 실제 요청을 보낸 뒤 Kiali graph에 traffic 흐름이 표시된다.
- 캡처 또는 확인 결과를 실행 문서에 남긴다.

### Prometheus/Grafana Metric 확인

목표:

- Istio와 Envoy metric이 Prometheus에 수집되는지 확인한다.

확인할 query:

```text
istio_requests_total
istio_request_duration_milliseconds_bucket
pilot_xds_pushes
```

완료 기준:

- Prometheus에서 query가 결과를 반환한다.
- Grafana에서 서비스별 응답시간/에러율을 볼 수 있다.
- Mesh Monitoring 실행 문서에 evidence를 남긴다.

### Canary 실제 전환 검증

목표:

- `reservation-service` v1/v2 트래픽 분배가 실제로 동작하는지 확인한다.

진행 순서:

```text
1. stable 상태 확인: v1 100%
2. canary v2 workload 생성
3. canary-20 적용
4. canary-50 적용
5. canary-100 적용
6. rollback 적용
```

완료 기준:

- v1/v2 Pod가 subset label로 구분된다.
- 요청 비율이 설정한 weight에 가깝게 분배된다.
- rollback 후 v1 100%로 돌아온다.

### Circuit Breaker 실제 장애 주입 검증

목표:

- 5xx와 지연 장애 상황에서 retry, timeout, outlierDetection이 동작하는지 확인한다.

진행 순서:

```text
1. 정상 상태 baseline 확인
2. fault-5xx scenario 적용
3. consecutive 5xx 발생 확인
4. endpoint ejection 확인
5. rollback 적용
6. fault-delay scenario 적용
7. timeout/retry 확인
8. rollback 적용
```

완료 기준:

- 5xx 반복 endpoint가 일정 시간 ejection된다.
- 지연 요청은 timeout으로 제한된다.
- retry 횟수와 perTryTimeout이 설정대로 동작한다.
- 복구 절차가 문서화된다.

## 다음 구현으로 넘어갈 항목

### NetworkPolicy 설계

목표:

- 서비스 간 필요한 통신만 허용하고 나머지는 차단한다.

바로 default deny를 걸면 위험하므로 먼저 통신 매트릭스를 작성한다.

정리할 통신:

```text
Kong -> 서비스
서비스 -> DB
서비스 -> Kafka
Prometheus -> /metrics
Kiali/Istio control plane -> sidecar
Pod -> kube-dns
서비스 -> 외부 API가 필요한 경우
```

진행 순서:

```text
1. namespace별 ingress/egress 흐름 정리
2. DNS 허용 정책 작성
3. Prometheus scrape 허용 정책 작성
4. Kong ingress 허용 정책 작성
5. DB/Kafka 접근 허용 정책 작성
6. 서비스 간 필요한 통신만 허용
7. 의도하지 않은 통신 차단 테스트
```

완료 기준:

- 필요한 트래픽은 유지된다.
- 불필요한 namespace 간 직접 접근은 차단된다.
- 차단/허용 테스트 결과를 문서화한다.

### RBAC / ServiceAccount 정리

목표:

- 서비스별 ServiceAccount와 최소 권한 Role/RoleBinding을 정리한다.

진행 순서:

```text
1. 현재 서비스별 ServiceAccount 사용 여부 확인
2. default ServiceAccount 사용 여부 확인
3. 서비스별 ServiceAccount manifest 추가
4. 필요 권한만 Role로 정의
5. RoleBinding으로 namespace 범위 권한 연결
6. ClusterRole 사용이 필요한지 검토
```

완료 기준:

- 각 서비스가 전용 ServiceAccount를 사용한다.
- 불필요한 ClusterRole을 사용하지 않는다.
- 개발자/운영자/SRE 역할 기준 문서와 연결된다.

### mTLS STRICT 검토

목표:

- 서비스 간 통신 암호화 요구사항을 만족하기 위해 Istio mTLS STRICT 적용 가능성을 검토한다.

검토해야 할 점:

- Kong이 mesh 밖에 있을 때 Kong -> 서비스 진입 트래픽을 어떻게 허용할지
- 모든 서비스에 sidecar가 붙기 전 STRICT를 켜면 통신이 깨질 수 있는지
- DB/Kafka 같은 mesh 밖 리소스와의 통신은 어떻게 처리할지
- Kiali에서 mTLS 상태를 어떻게 증거로 남길지

권장 순서:

```text
1. PERMISSIVE 상태에서 sidecar 적용 범위 확대
2. 서비스 간 호출 흐름 확인
3. mesh 내부 서비스만 대상으로 STRICT 검토
4. Kong 진입 경로 예외 또는 mesh 포함 여부 결정
5. PeerAuthentication 적용
6. Kiali에서 mTLS 상태 확인
```

완료 기준:

- mTLS 적용 범위와 예외가 문서화된다.
- STRICT 적용 후 서비스 간 정상 호출이 유지된다.
- Kiali에서 mTLS 적용 상태를 확인한다.

### 전체 서비스 Sidecar 확대

목표:

- `concert-service`, `reservation-service` 이후 나머지 서비스에도 Istio sidecar를 단계적으로 붙인다.

권장 순서:

```text
1. concert-service
2. reservation-service
3. payment-service
4. ticket-service
5. notification-service
6. auth-service
```

주의:

- auth-service는 인증 기준점이므로 마지막에 적용한다.
- payment-service는 중요도가 높아 reservation 검증 후 적용한다.
- notification/ticket은 Kafka 흐름 정상화 후 적용한다.

완료 기준:

- 각 서비스 Pod가 `2/2 Running`이다.
- Kiali에서 서비스별 node가 보인다.
- API 응답과 내부 이벤트 흐름이 깨지지 않는다.

### 장애 복구 Runbook

목표:

- 실제 장애 시 어떤 순서로 확인하고 복구할지 문서화한다.

작성할 Runbook:

```text
Pod 강제 종료 복구
VirtualService rollback
Canary 중단
Circuit Breaker 장애 주입 후 복구
Kong 라우팅 문제 복구
ArgoCD OutOfSync 복구
```

완료 기준:

- 각 Runbook에 증상, 확인 명령, 조치, 복구 확인, 회고 항목이 있다.
- 5분 이내 복구 가능 여부를 검증한다.

## 내가 제공받아야 하는 것

다른 작업자가 준비해야 하는 항목:

```text
DB 배포와 Service/Endpoint
Kafka 배포와 Service/Endpoint
서비스별 환경변수와 Secret 정리
서비스 Pod CrashLoopBackOff 원인 해결
정상 API 흐름 확인 가능한 테스트 계정/JWT
Kong 외부 접근 주소
Prometheus/Grafana 접속 정보
Kiali 접속 정보
```

이 항목이 준비되지 않으면 보류되는 것:

```text
Kong smoke test
Kiali topology traffic 확인
Canary 실제 weight 검증
Circuit Breaker 실제 ejection 검증
Prometheus/Grafana metric 확인
E2E 기반 장애 복구 검증
```

## 내가 제공해야 하는 것

내가 다른 작업자에게 제공해야 하는 항목:

```text
Kong 라우팅/인증/인가 정책 구조
서비스가 기대하는 내부 인증 헤더 목록
Istio sidecar 적용 대상과 순서
VirtualService/DestinationRule 적용 위치
Canary scenario 사용 방법
Circuit Breaker scenario 사용 방법
NetworkPolicy 적용 전 필요한 통신 매트릭스
RBAC/ServiceAccount 기준
장애 복구 Runbook
검증 명령과 evidence 문서
```

## 나중에 ADR로 남길 후보

이미 작성한 ADR:

```text
ADR-0003: Kong은 Edge API Gateway로, Istio는 내부 Service Mesh로 분리한다
ADR-0006: 서비스 간 Circuit Breaker는 Istio outlierDetection으로 시작한다
ADR-0007: Istio 설치와 서비스 트래픽 정책은 ArgoCD Application으로 분리한다
```

추가 후보:

```text
Kong을 mesh 밖에 둘지, sidecar injection해서 mesh 안에 포함할지
mTLS STRICT 적용 범위와 예외 정책
NetworkPolicy default deny 도입 방식
ServiceAccount와 Role/RoleBinding 최소 권한 기준
Canary 운영 기본값과 rollback 기준
```

ADR로 남길 기준:

- 나중에 구조를 바꿀 때 다시 판단해야 하는 결정이면 ADR로 남긴다.
- 단순 명령 실행 결과나 일회성 장애는 실행 문서 또는 trouble 문서로 남긴다.

## 나중에 trouble 문서로 남길 후보

현재 문제가 명확한 항목:

```text
DB/Kafka 미준비로 인한 서비스 Pod CrashLoopBackOff
observability stack 일부 Degraded 또는 Pending
ArgoCD Application OutOfSync/Degraded 상태
Kong smoke test 보류
Kiali topology traffic 미확인
```

trouble 문서 작성 기준:

- 원인, 증상, 재현, 해결, 후속 조치가 필요한 문제는 `docs/trouble/`에 남긴다.
- 단순히 아직 준비되지 않은 작업은 plan에만 둔다.

## 추천 진행 순서

현재 추천 순서:

```text
1. workspace 문서 커밋
2. gitops feat/istio-circuit-breaker main 반영
3. AWS dev ArgoCD 반영 확인
4. DB/Kafka 복구 대기
5. 서비스 Pod Running 확인
6. Kong smoke test
7. Kiali topology 확인
8. Prometheus/Grafana metric 확인
9. Canary 실제 전환 검증
10. Circuit Breaker 장애 주입 검증
11. NetworkPolicy 설계와 manifest 구현
12. RBAC/ServiceAccount 구현
13. mTLS STRICT 적용 범위 결정
14. 장애 복구 Runbook 작성과 검증
```

지금 당장 런타임 테스트가 막혀 있으므로, DB/Kafka 복구 전까지는 GitOps manifest 정리, 문서화, NetworkPolicy/RBAC 설계를 먼저 진행하는 것이 좋다.
