# NetworkPolicy 설계와 구현 계획

## 문서 목적

AWS dev에서 DB/Kafka 복구 전까지 Kong, Kiali, Canary, Circuit Breaker의 실제 런타임 검증은 어렵다. 그래서 먼저 Kubernetes NetworkPolicy를 어떻게 설계하고 어떤 순서로 적용할지 정리한다.

이 문서는 바로 적용할 YAML을 쓰기 전에, 어떤 통신을 허용하고 어떤 통신을 막아야 하는지 결정하기 위한 개인 계획 문서다.

## 현재 코드 기준 확인 결과

### NetworkPolicy는 이미 Helm chart에 있다

현재 `gitops`의 공통 서비스 chart에는 NetworkPolicy 템플릿이 있다.

관련 파일:

```text
gitops/charts/medikong-service/templates/networkpolicy.yaml
gitops/charts/medikong-service/values.yaml
gitops/values/base.yaml
gitops/values/services/*.yaml
```

현재 기본값:

```yaml
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
  ingress: []
```

의미:

- 현재 chart는 `Ingress` 제한만 지원한다.
- `Egress` 제한은 아직 지원하지 않는다.
- 즉 서비스 Pod로 들어오는 요청은 제한할 수 있지만, 서비스 Pod가 밖으로 나가는 요청은 아직 제한하지 않는다.

### Prometheus scrape 허용은 chart에 자동 보강되어 있다

`ServiceMonitor`가 켜진 서비스는 monitoring namespace의 Prometheus가 `/metrics`를 scrape할 수 있도록 NetworkPolicy에 ingress rule이 자동으로 추가된다.

관련 값:

```yaml
serviceMonitor:
  networkPolicy:
    enabled: true
    namespace: monitoring
```

의미:

- 서비스별 NetworkPolicy를 켜도 Prometheus scrape가 바로 막히지 않게 설계되어 있다.
- 다만 실제 서비스에서 `serviceMonitor.enabled`가 켜져 있어야 자동 rule이 들어간다.

### 현재 서비스별 ingress 허용은 Kong 중심이다

현재 서비스 values는 대부분 다음 형태다.

```yaml
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kong
      ports:
        - protocol: TCP
          port: <service-port>
```

현재 열려 있는 기본 경로:

```text
kong namespace -> 각 서비스 Pod
monitoring namespace -> /metrics, ServiceMonitor가 켜진 경우
```

아직 명시되지 않은 경로:

```text
서비스 -> 서비스 내부 호출
서비스 -> DB
서비스 -> Kafka
서비스 -> DNS
서비스 -> OTEL Collector
ticket-service -> S3
```

단, 현재는 `Egress`를 막지 않으므로 위 outbound 경로는 아직 NetworkPolicy로 차단되지 않는다.

### ServiceAccount와 RBAC 템플릿도 이미 있다

관련 파일:

```text
gitops/charts/medikong-service/templates/serviceaccount.yaml
gitops/charts/medikong-service/templates/role.yaml
gitops/charts/medikong-service/templates/rolebinding.yaml
```

현재 기본값:

```yaml
serviceAccount:
  create: true
  name: ""
  automountServiceAccountToken: false

rbac:
  create: true
  rules: []
```

의미:

- 서비스별 ServiceAccount는 이미 생성된다.
- 기본적으로 Kubernetes API token mount는 꺼져 있다.
- Role은 생성되지만 기본 rules는 비어 있다.
- 현재 서비스들이 Kubernetes API를 직접 호출하지 않는다면 이 구조는 최소 권한에 가깝다.

NetworkPolicy와 RBAC는 연결되어 있지만 역할은 다르다.

- NetworkPolicy: Pod 간 네트워크 통신을 제어한다.
- RBAC: Kubernetes API 접근 권한을 제어한다.

## 현재 서비스와 포트

| 서비스 | Namespace | App label | Service port | 주요 외부 진입 |
| --- | --- | --- | ---: | --- |
| auth-service | `ticketing-auth` | `app=auth-service` | 8080 | `/auth` |
| concert-service | `ticketing-concert` | `app=concert-service` | 8082 | `/concerts`, `/performances`, `/provider/*`, `/admin/*` |
| reservation-service | `ticketing-reservation` | `app=reservation-service` | 8083 | `/reservations`, `/provider/*`, `/admin/*` |
| payment-service | `ticketing-payment` | `app=payment-service` | 8080 | `/payments`, `/provider/*`, `/admin/*` |
| ticket-service | `ticketing-ticket` | `app=ticket-service` | 8085 | `/tickets` |
| notification-service | `ticketing-notification` | `app=notification-service` | 8084 | `/notifications` |
| dashboard | `ticketing-dashboard` | `app=dashboard` | 8080 | `/` |

## Data / Messaging 리소스

현재 `platform/data`에 정의된 리소스:

| 리소스 | Namespace | Service | Port | 접근 주체 |
| --- | --- | --- | ---: | --- |
| auth-db | `ticketing-auth` | `auth-db` | 5432 | auth-service |
| concert-db | `ticketing-concert` | `concert-db` | 5432 | concert-service |
| reservation-db | `ticketing-reservation` | `reservation-db` | 5432 | reservation-service |
| payment-db | `ticketing-payment` | `payment-db` | 5432 | payment-service |
| ticket-db | `ticketing-ticket` | `ticket-db` | 5432 | ticket-service |
| notification-db | `ticketing-notification` | `notification-db` | 27017 | notification-service |
| kafka | `ticketing-messaging` | `kafka` | 9092 | reservation, payment, ticket, notification |
| kafka-headless | `ticketing-messaging` | `kafka-headless` | 9092/9093 | kafka StatefulSet 내부 |

주의:

- `platform/data/README.md` 기준으로 이 디렉터리는 Docker Desktop dev loop의 런타임 의존성을 다루는 성격이 강하다.
- AWS dev에서 DB/Kafka를 ArgoCD가 `platform/data`로 관리하는지, 아니면 팀원이 별도 방식으로 배포하는지는 추가 확인이 필요하다.
- 따라서 DB/Kafka NetworkPolicy를 `platform/data`에 바로 넣기 전에 AWS dev의 실제 data layer 소유 위치를 확인해야 한다.

## 설계 원칙

### 원칙 1. 한 번에 default deny 전체 적용하지 않는다

NetworkPolicy는 적용 즉시 트래픽을 막을 수 있다. 특히 `Egress`까지 default deny로 켜면 DNS, DB, Kafka, OTEL, S3 같은 통신이 끊길 수 있다.

따라서 다음 순서로 적용한다.

```text
Ingress 제한 안정화
  -> Data/Messaging ingress 제한
  -> Egress 지원을 chart에 추가
  -> 서비스별 Egress allowlist 적용
```

### 원칙 2. 외부 진입은 Kong namespace만 허용한다

서비스 API Pod는 기본적으로 Kong에서 들어오는 요청만 받는다.

허용:

```text
kong namespace -> service Pod http port
```

차단:

```text
다른 application namespace -> service Pod http port
임의 Pod -> service Pod http port
```

예외:

- Istio mesh 내부 서비스 간 호출이 실제로 필요한 API는 별도 허용한다.
- Prometheus scrape는 ServiceMonitor가 켜진 경우 monitoring namespace만 허용한다.

### 원칙 3. DB는 같은 서비스 namespace의 app만 허용한다

각 서비스 DB는 해당 서비스 app만 접근해야 한다.

예시:

```text
auth-service -> auth-db:5432
concert-service -> concert-db:5432
reservation-service -> reservation-db:5432
payment-service -> payment-db:5432
ticket-service -> ticket-db:5432
notification-service -> notification-db:27017
```

차단:

```text
auth-service -> payment-db
concert-service -> reservation-db
임의 Pod -> 모든 DB
```

### 원칙 4. Kafka는 이벤트 생산자/소비자만 허용한다

Kafka 접근 허용 대상:

```text
reservation-service -> kafka:9092
payment-service -> kafka:9092
ticket-service -> kafka:9092
notification-service -> kafka:9092
kafka-create-topics Job -> kafka:9092
kafka StatefulSet 내부 -> kafka-headless:9093
```

Kafka 접근 차단 대상:

```text
auth-service
concert-service
dashboard
임의 Pod
```

단, `concert-service`가 나중에 `concert-approved`, `sale-policy-updated` 이벤트를 직접 publish하도록 구현되면 Kafka 허용 대상에 추가한다.

### 원칙 5. Istio control plane과 Envoy metric 흐름을 막지 않는다

Istio를 쓰는 서비스는 Envoy sidecar가 붙는다. NetworkPolicy를 강화할 때 다음 흐름을 고려해야 한다.

```text
istiod -> Envoy sidecar config/discovery
Envoy sidecar -> istiod
Prometheus -> Envoy /stats/prometheus
Kiali -> Prometheus/Istio API 조회
```

현재 chart는 `Ingress`만 제한하고 있으므로 Istio control plane 흐름은 크게 막히지 않을 가능성이 높다. 하지만 `Egress`를 켜는 순간 istiod, DNS, Prometheus 경로를 명시해야 한다.

### 원칙 6. DNS는 Egress default deny 전에 반드시 허용한다

Egress를 제한하려면 모든 서비스가 kube-dns로 나가는 요청을 허용해야 한다.

필수 허용:

```text
application Pod -> kube-system/kube-dns:53 UDP
application Pod -> kube-system/kube-dns:53 TCP
```

DNS를 막으면 서비스 이름 기반 연결이 전부 깨진다.

## 통신 매트릭스

### 외부 요청

| From | To | Port | 이유 | 현재 적용 |
| --- | --- | ---: | --- | --- |
| kong | auth-service | 8080 | 로그인/토큰 발급 | 적용됨 |
| kong | concert-service | 8082 | 공연/회차/좌석 API | 적용됨 |
| kong | reservation-service | 8083 | 예약 API | 적용됨 |
| kong | payment-service | 8080 | 결제 API | 적용됨 |
| kong | ticket-service | 8085 | 티켓 API | 적용됨 |
| kong | notification-service | 8084 | 알림 API | 적용됨 |
| kong | dashboard | 8080 | 프론트엔드 | 적용됨 |

### 관측성

| From | To | Port | 이유 | 현재 적용 |
| --- | --- | ---: | --- | --- |
| monitoring/Prometheus | service `/metrics` | serviceMonitor port | 서비스 metric scrape | ServiceMonitor 사용 시 자동 |
| monitoring/Prometheus | Envoy `/stats/prometheus` | 15090 후보 | Envoy metric scrape | PodMonitor 설계됨 |
| Kiali | Prometheus/Istio | service port | topology 조회 | 별도 확인 필요 |

### Data

| From | To | Port | 이유 | 현재 적용 |
| --- | --- | ---: | --- | --- |
| auth-service | auth-db | 5432 | 인증 DB | egress 미제한이라 허용됨 |
| concert-service | concert-db | 5432 | 공연 DB | egress 미제한이라 허용됨 |
| reservation-service | reservation-db | 5432 | 예약 DB | egress 미제한이라 허용됨 |
| payment-service | payment-db | 5432 | 결제 DB | egress 미제한이라 허용됨 |
| ticket-service | ticket-db | 5432 | 티켓 DB | egress 미제한이라 허용됨 |
| notification-service | notification-db | 27017 | 알림 DB | egress 미제한이라 허용됨 |

### Messaging

| From | To | Port | 이유 | 현재 적용 |
| --- | --- | ---: | --- | --- |
| reservation-service | kafka | 9092 | 예약 이벤트 publish | egress 미제한이라 허용됨 |
| payment-service | kafka | 9092 | 결제 이벤트 publish | egress 미제한이라 허용됨 |
| ticket-service | kafka | 9092 | 결제 이벤트 consume, 티켓 이벤트 publish | egress 미제한이라 허용됨 |
| notification-service | kafka | 9092 | 예약/결제/티켓 이벤트 consume | egress 미제한이라 허용됨 |

### 외부 클라우드

| From | To | Port | 이유 | 현재 적용 |
| --- | --- | ---: | --- | --- |
| ticket-service | AWS S3 | 443 | QR/PDF 저장 | egress 미제한이라 허용됨 |
| GitHub Actions | AWS ECR | 443 | 이미지 push | NetworkPolicy 대상 아님 |
| Kubernetes node | AWS ECR | 443 | 이미지 pull | NetworkPolicy 대상 아님 |

## 구현 전략

### 1단계. 현재 Ingress 정책을 정리한다

목표:

- 기존 서비스별 `networkPolicy.ingress`가 올바른지 확인한다.
- Kong namespace에서 들어오는 HTTP만 허용한다.
- ServiceMonitor가 필요한 서비스는 monitoring namespace scrape 허용이 유지되는지 확인한다.

변경 예상 파일:

```text
gitops/values/services/auth.yaml
gitops/values/services/concert.yaml
gitops/values/services/reservation.yaml
gitops/values/services/payment.yaml
gitops/values/services/ticket.yaml
gitops/values/services/notification.yaml
gitops/values/services/dashboard.yaml
```

검증:

```bash
task helm:template:all
task argo:validate
```

완료 기준:

- 모든 서비스 NetworkPolicy가 렌더링된다.
- Kong namespace만 서비스 app port로 접근 가능하도록 설계되어 있다.
- monitoring scrape 자동 rule이 필요한 서비스에서 유지된다.

### 2단계. Data/Messaging ingress 정책을 별도 platform policy로 추가한다

목표:

- DB와 Kafka로 들어오는 요청을 필요한 app만 허용한다.
- 이 단계에서는 app egress는 아직 막지 않는다.

이유:

- app egress를 막지 않아도 DB/Kafka ingress를 막으면 data layer 보호 효과가 생긴다.
- egress default deny보다 안전하게 시작할 수 있다.

변경 예상 파일:

```text
gitops/platform/data/networkpolicy-postgres.yaml
gitops/platform/data/networkpolicy-mongo.yaml
gitops/platform/data/networkpolicy-kafka.yaml
gitops/platform/data/kustomization.yaml
```

단, 이 파일 위치는 AWS dev에서 DB/Kafka를 `platform/data`가 실제로 관리한다는 것이 확인된 경우에만 확정한다. 만약 팀원이 DB/Kafka를 별도 Helm chart나 별도 ArgoCD Application으로 관리한다면, NetworkPolicy도 그 소유 위치에 맞춰 넣는다.

정책 방향:

```text
auth-db: auth-service만 허용
concert-db: concert-service만 허용
reservation-db: reservation-service만 허용
payment-db: payment-service만 허용
ticket-db: ticket-service만 허용
notification-db: notification-service만 허용
kafka: reservation/payment/ticket/notification + kafka-create-topics만 허용
```

검증:

```bash
kubectl kustomize platform/data
task argo:validate
```

완료 기준:

- Data/Messaging 리소스 NetworkPolicy가 렌더링된다.
- DB/Kafka에 불필요한 namespace 접근이 허용되지 않는다.

### 3단계. Helm chart에 Egress 지원을 추가한다

목표:

- 서비스별로 egress allowlist를 선언할 수 있게 한다.

현재 한계:

```text
networkpolicy.yaml은 ingress만 렌더링한다.
values.schema.json도 egress를 명확히 지원하지 않는다.
```

변경 예상 파일:

```text
gitops/charts/medikong-service/templates/networkpolicy.yaml
gitops/charts/medikong-service/values.yaml
gitops/charts/medikong-service/values.schema.json
gitops/values/base.yaml
```

추가할 값 형태:

```yaml
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
    - Egress
  ingress: []
  egress: []
```

주의:

- 처음부터 모든 서비스에 `Egress`를 켜지 않는다.
- chart가 egress를 지원하도록만 확장하고, 서비스별 적용은 별도 단계에서 한다.

검증:

```bash
task helm:template:all
task argo:validate
```

완료 기준:

- 기존 Ingress-only 서비스 렌더링 결과가 깨지지 않는다.
- egress 값을 넣은 테스트 values에서 Egress NetworkPolicy가 렌더링된다.

### 4단계. 서비스별 Egress allowlist를 단계 적용한다

목표:

- 서비스 Pod에서 필요한 대상만 나갈 수 있게 한다.

공통 egress:

```text
kube-dns:53 TCP/UDP
istiod:15012/15017 후보
otel-collector:4317/4318 후보
```

서비스별 egress:

```text
auth-service -> auth-db:5432
concert-service -> concert-db:5432
reservation-service -> reservation-db:5432, kafka:9092
payment-service -> payment-db:5432, kafka:9092
ticket-service -> ticket-db:5432, kafka:9092, S3:443
notification-service -> notification-db:27017, kafka:9092
dashboard -> Kong 또는 API endpoint, 실제 구조 확인 필요
```

주의:

- NetworkPolicy는 FQDN 기반 egress 제어가 기본 기능이 아니다.
- S3 같은 외부 FQDN은 표준 NetworkPolicy만으로 정교하게 제한하기 어렵다.
- S3 제한이 필요하면 CiliumNetworkPolicy 같은 CNI 확장 정책이 필요할 수 있다.

완료 기준:

- DNS가 유지된다.
- DB/Kafka 연결이 유지된다.
- 불필요한 namespace 접근이 차단된다.
- 서비스 API와 이벤트 흐름이 정상 동작한다.

## 적용 순서

추천 순서:

```text
1. 현재 Ingress 정책 렌더링 확인
2. Data/Messaging ingress NetworkPolicy 추가
3. AWS dev에서 DB/Kafka 복구 후 data 접근 확인
4. Helm chart egress 지원 추가
5. concert-service 같은 저위험 서비스에 egress 제한 실험
6. reservation-service에 egress 제한 적용
7. payment/ticket/notification 순서로 확대
8. auth-service는 마지막에 적용
```

auth-service를 마지막에 두는 이유:

- 인증 기준점이기 때문에 문제가 생기면 전체 API 테스트가 헷갈린다.
- 다른 서비스 정책이 안정화된 뒤 적용하는 것이 원인 분리에 유리하다.

## AWS dev에서 확인할 명령

### NetworkPolicy 리소스 확인

```bash
kubectl get networkpolicy -A
kubectl describe networkpolicy -n ticketing-concert
kubectl describe networkpolicy -n ticketing-messaging
```

### Pod label 확인

```bash
kubectl get pod -n ticketing-concert --show-labels
kubectl get pod -n ticketing-reservation --show-labels
kubectl get pod -n ticketing-messaging --show-labels
```

### 서비스 연결 확인

```bash
kubectl get svc -A
kubectl get endpoints -A
```

### 차단 테스트 후보

임시 debug Pod를 사용한다.

```bash
kubectl run netshoot -n ticketing-concert --rm -it --image=nicolaka/netshoot -- /bin/bash
```

테스트 예시:

```bash
curl -sS http://concert-service.ticketing-concert.svc.cluster.local:8082/health
nc -vz reservation-db.ticketing-reservation.svc.cluster.local 5432
nc -vz kafka.ticketing-messaging.svc.cluster.local 9092
```

주의:

- debug Pod 자체가 어떤 label을 갖는지에 따라 NetworkPolicy 결과가 달라질 수 있다.
- 차단 테스트용 Pod label을 명확히 지정해야 한다.

## 문서화할 evidence

남길 증거:

```text
NetworkPolicy manifest 렌더링 결과
kubectl get networkpolicy -A
허용되어야 하는 통신 성공 결과
차단되어야 하는 통신 실패 결과
Kong smoke test 영향 없음
Prometheus scrape 영향 없음
Kiali topology 영향 없음
```

실행 문서 위치:

```text
workspace/docs/personal/execution/network-policy-implementation-execution.md
```

팀 공유가 필요한 경우:

```text
workspace/docs/members/service/network-policy-design.md
```

## ADR 후보

다음 결정은 ADR로 남길 가치가 있다.

```text
NetworkPolicy는 Ingress-only에서 시작하고, Data/Messaging ingress 제한 후 Egress default deny로 단계 확장한다.
```

ADR로 남길 이유:

- 바로 default deny를 적용하지 않는 이유가 중요하다.
- DB/Kafka/DNS/Istio/Prometheus/Kiali/S3 같은 예외가 많다.
- 나중에 “왜 egress를 처음부터 안 막았는지” 설명해야 할 수 있다.

후보 제목:

```text
Kubernetes NetworkPolicy는 Ingress 제한부터 시작하고 Egress 제한은 단계적으로 적용한다
```

## 지금 바로 구현할 범위 제안

현재 DB/Kafka가 완전히 검증되지 않았으므로 바로 전체 default deny를 적용하지 않는다.

지금 구현하기 좋은 범위:

```text
1. platform/data DB/Kafka ingress NetworkPolicy 추가
2. chart egress 확장 설계만 문서화
3. 적용 전 렌더링 task 추가
4. AWS dev runtime 검증은 DB/Kafka 복구 후 진행
```

보류할 범위:

```text
서비스별 Egress default deny
mTLS STRICT와 결합한 예외 정책
S3 FQDN egress 제한
전체 namespace default deny
```

## 다음 작업

다음 작업은 manifest 구현 전에 한 번 더 다음 항목을 확인한다.

```text
1. AWS dev의 DB/Kafka가 platform/data, 별도 Helm chart, 수동 manifest 중 어디에서 관리되는지 확인
2. DB/Kafka 리소스가 AWS dev에서 생성되는 시점 확인
3. 현재 CNI가 NetworkPolicy를 실제로 enforcement하는지 확인
4. debug Pod를 사용할 수 있는지 확인
5. Kong namespace label이 `kubernetes.io/metadata.name=kong`으로 selector 가능한지 확인
6. service-to-service HTTP 호출이 실제 코드에 존재하는지 확인
```

이 확인 후 실제 data layer 소유 위치에 DB/Kafka ingress NetworkPolicy를 먼저 추가한다.

## 추가 확인 결과

코드에서 바로 확인한 내용:

```text
platform/data/kustomization.yaml
  - postgres.yaml
  - mongo.yaml
  - kafka.yaml

platform/data/README.md
  - Docker Desktop 로컬 개발에서 task dev가 먼저 배포하는 런타임 의존성이라고 설명한다.
```

따라서 AWS dev의 DB/Kafka가 현재 `platform/data`로 관리되는지는 아직 확정하지 않는다. AWS dev에 실제로 올라가는 DB/Kafka의 소유 위치를 확인한 뒤 NetworkPolicy manifest 위치를 정한다.

CNI 관련 단서:

```text
infra 쪽 verify-cluster playbook에는 calico-node 확인 흐름이 있다.
```

Calico를 쓰는 클러스터라면 Kubernetes NetworkPolicy enforcement가 가능하다. 다만 AWS dev 현재 클러스터에 Calico가 실제로 Running인지 `kubectl get pods -n kube-system | grep calico`로 확인해야 한다.
