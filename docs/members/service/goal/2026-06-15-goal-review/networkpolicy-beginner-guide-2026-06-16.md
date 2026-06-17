# NetworkPolicy 초보자 설명과 현재 설계 정리

작성일: 2026-06-16

## 1. 이 문서의 목적

이 문서는 현재 Medikong 프로젝트의 NetworkPolicy 설계를 초보자 관점에서 이해하기 위해 작성했다.

핵심 질문은 다음이다.

```text
NetworkPolicy가 무엇을 막는가?
ingress와 egress는 무엇인가?
왜 DNS, OTel, DB, Kafka, Istio는 열어야 하는가?
현재 서비스별로 어떤 통신은 허용하고 어떤 통신은 차단하려는가?
```

## 2. NetworkPolicy를 한 문장으로 이해하기

NetworkPolicy는 Kubernetes 안에서 pod 간 통신을 제어하는 방화벽 규칙이다.

쉽게 말하면 다음과 같다.

```text
어떤 pod가
어떤 pod로
어떤 port를 통해
들어오거나 나갈 수 있는지
정하는 규칙
```

예를 들어 `reservation-service`에 대해 다음처럼 정할 수 있다.

```text
Kong -> reservation-service:8083
  허용

임의 debug pod -> reservation-service:8083
  차단

reservation-service -> reservation-db:5432
  허용

reservation-service -> payment-db:5432
  차단
```

## 3. Ingress와 Egress

### 3.1 Ingress

Ingress는 대상 pod로 들어오는 통신이다.

예를 들어 다음은 `reservation-service` 입장에서 ingress다.

```text
Kong -> reservation-service
```

즉 누군가가 `reservation-service`로 요청을 보내는 것이다.

현재 서비스 ingress 설계는 다음과 같다.

```text
Kong namespace에서 서비스 앱 포트로 들어오는 요청만 허용한다.
monitoring namespace에서 metrics 포트로 들어오는 요청은 허용한다.
그 외 namespace나 debug pod에서 직접 들어오는 요청은 차단한다.
```

### 3.2 Egress

Egress는 pod에서 밖으로 나가는 통신이다.

예를 들어 다음은 `reservation-service` 입장에서 egress다.

```text
reservation-service -> reservation-db
reservation-service -> kafka
reservation-service -> opentelemetry-collector
reservation-service -> coredns
reservation-service -> istiod
```

즉 `reservation-service`가 먼저 다른 대상에 연결하는 것이다.

현재 egress 설계는 다음과 같다.

```text
서비스 pod가 아무 데나 나가지 못하게 한다.
서비스 운영에 꼭 필요한 DNS, OTel, 자기 DB, Kafka, Istio만 허용한다.
```

## 4. 왜 Egress를 제한해야 하는가?

기존에는 서비스 NetworkPolicy가 주로 ingress만 제한했다.

즉 다음은 막을 수 있었다.

```text
임의 pod -> reservation-service 직접 접근
```

하지만 다음은 막지 못했다.

```text
reservation-service -> 아무 DB
reservation-service -> 아무 서비스
임의 pod -> Kafka
임의 pod -> DB
```

egress를 제한하면 서비스가 실수로 잘못된 DB에 붙거나, 공격자가 탈취한 pod에서 내부 자원으로 자유롭게 이동하는 것을 줄일 수 있다.

이걸 보통 다음처럼 표현한다.

```text
기본 차단
필요한 통신만 허용
```

## 5. 왜 DNS는 열어야 하는가?

Kubernetes 서비스는 보통 IP가 아니라 이름으로 접근한다.

예:

```text
reservation-db.ticketing-reservation.svc.cluster.local
kafka.ticketing-messaging.svc.cluster.local
opentelemetry-collector.observability.svc.cluster.local
```

pod는 이 이름을 바로 IP로 알지 못한다.

그래서 CoreDNS에게 물어본다.

```text
reservation-service:
  reservation-db 주소가 뭐야?

CoreDNS:
  10.104.139.51이야.
```

이때 사용하는 포트가 DNS `53`이다.

따라서 DNS egress를 막으면 이런 문제가 생긴다.

```text
DB 주소를 찾지 못함
Kafka 주소를 찾지 못함
OTel Collector 주소를 찾지 못함
서비스가 시작은 되지만 외부 의존성 연결에 실패함
```

현재 설계:

```text
모든 서비스 -> kube-system/CoreDNS UDP 53 허용
모든 서비스 -> kube-system/CoreDNS TCP 53 허용
```

## 6. 왜 OTel은 열어야 하는가?

OTel은 OpenTelemetry의 줄임말이다.

현재 프로젝트에서는 서비스의 trace와 관측성 데이터를 OpenTelemetry Collector로 보낸다.

흐름:

```text
서비스
-> OpenTelemetry Collector
-> Tempo / Loki / Grafana
```

서비스가 요청을 처리하면 다음 같은 정보가 생긴다.

```text
trace_id
span_id
request_id
어떤 API가 호출됐는지
얼마나 걸렸는지
어느 서비스까지 이어졌는지
```

이 데이터를 Collector로 보내야 Grafana/Tempo/Loki에서 요청 흐름을 볼 수 있다.

현재 설계:

```text
서비스 -> opentelemetry-collector:4317 허용
서비스 -> opentelemetry-collector:4318 허용
```

포트 의미:

```text
4317: OTLP gRPC
4318: OTLP HTTP
```

주의:

```text
OTel을 막아도 서비스 API 자체는 일부 동작할 수 있다.
하지만 trace/log 연결이 깨져서 운영 관측성이 나빠진다.
```

## 7. 왜 DB는 자기 DB만 열어야 하는가?

MSA에서는 서비스가 자기 데이터베이스를 소유한다.

현재 프로젝트의 DB 소유 구조는 다음과 같다.

| 서비스 | 소유 DB | 포트 |
| --- | --- | --- |
| `auth-service` | `auth-db` | `5432` |
| `concert-service` | `concert-db` | `5432` |
| `reservation-service` | `reservation-db` | `5432` |
| `payment-service` | `payment-db` | `5432` |
| `ticket-service` | `ticket-db` | `5432` |
| `notification-service` | `notification-db` | `27017` |

허용 예:

```text
reservation-service -> reservation-db
payment-service -> payment-db
notification-service -> notification-db
```

차단 예:

```text
reservation-service -> payment-db
auth-service -> ticket-db
임의 debug pod -> reservation-db
```

이렇게 해야 하는 이유:

```text
서비스 경계가 지켜진다.
다른 서비스의 DB schema에 직접 의존하지 않는다.
데이터 변경 경로가 명확해진다.
장애나 보안 사고가 다른 DB로 번지는 것을 줄인다.
```

다른 서비스 데이터가 필요할 때는 DB를 직접 보면 안 된다.

대신 다음 중 하나를 사용해야 한다.

```text
API 호출
Kafka 이벤트
읽기 모델
```

## 8. 왜 Kafka는 일부 서비스만 열어야 하는가?

Kafka는 이벤트를 주고받는 메시징 시스템이다.

현재 프로젝트에서 Kafka를 쓰는 핵심 흐름은 다음이다.

```text
reservation-service
  reservation-created 이벤트 발행

payment-service
  payment-approved 이벤트 발행

ticket-service
  payment-approved 이벤트 consume
  ticket-issued 이벤트 발행

notification-service
  reservation-created / payment-approved / ticket-issued 이벤트 consume
```

따라서 Kafka 접근은 이벤트를 실제로 사용하는 서비스에만 필요하다.

허용:

```text
reservation-service -> kafka:9092
payment-service -> kafka:9092
ticket-service -> kafka:9092
notification-service -> kafka:9092
```

차단:

```text
auth-service -> kafka:9092
concert-service -> kafka:9092
dashboard -> kafka:9092
임의 debug pod -> kafka:9092
```

Kafka 내부 동작을 위해 다음도 허용했다.

```text
kafka -> kafka:9092
kafka -> kafka:9093
kafka-create-topics -> kafka:9092
```

포트 의미:

```text
9092: 애플리케이션이 Kafka broker와 통신하는 포트
9093: 현재 단일 Kafka의 controller 내부 통신 포트
```

## 9. 왜 Istio는 열어야 하는가?

Istio가 붙은 서비스 pod에는 보통 컨테이너가 2개 있다.

예:

```text
reservation-service pod
  reservation-service 컨테이너
  istio-proxy 컨테이너
```

`istio-proxy`는 Istio control plane인 `istiod`와 통신해야 한다.

흐름:

```text
istio-proxy -> istiod
```

이 통신이 필요한 이유:

```text
Envoy 설정 수신
service mesh routing
DestinationRule / VirtualService 반영
mTLS 관련 설정
metric / telemetry 동작
circuit breaker / retry 같은 mesh 정책 반영
```

현재 Istio sidecar가 붙은 서비스:

```text
concert-service
reservation-service
payment-service
ticket-service
notification-service
```

현재 설계:

```text
Istio sidecar 서비스 -> istiod:15012 허용
Istio sidecar 서비스 -> istiod:15010 허용
Istio sidecar 서비스 -> istiod:443 허용
```

주의:

```text
Istio 통신을 막으면 애플리케이션 자체보다 sidecar 설정이 먼저 문제를 일으킬 수 있다.
그래서 sidecar가 있는 서비스만 istiod egress를 열었다.
```

## 10. 현재 서비스별 출입증으로 이해하기

NetworkPolicy를 pod별 출입증이라고 생각하면 쉽다.

### 10.1 reservation-service 출입증

```text
들어오는 통신:
  Kong -> reservation-service:8083 허용
  monitoring -> metrics/envoy metrics 허용
  그 외 직접 접근 차단

나가는 통신:
  DNS 허용
  OTel Collector 허용
  reservation-db 허용
  Kafka 허용
  Istio 허용

차단:
  payment-db 직접 접근
  ticket-db 직접 접근
  다른 서비스 HTTP 직접 호출
  임의 인터넷 egress
```

### 10.2 payment-service 출입증

```text
들어오는 통신:
  Kong -> payment-service:8080 허용
  monitoring -> metrics/envoy metrics 허용
  그 외 직접 접근 차단

나가는 통신:
  DNS 허용
  OTel Collector 허용
  payment-db 허용
  Kafka 허용
  Istio 허용

차단:
  reservation-db 직접 접근
  ticket-db 직접 접근
  임의 debug pod와 직접 통신
```

### 10.3 auth-service 출입증

```text
들어오는 통신:
  Kong -> auth-service:8080 허용
  monitoring -> metrics 허용

나가는 통신:
  DNS 허용
  OTel Collector 허용
  auth-db 허용

차단:
  Kafka 접근
  다른 DB 접근
  다른 서비스 직접 호출
```

### 10.4 ticket-service 출입증

```text
들어오는 통신:
  Kong -> ticket-service:8085 허용
  monitoring -> metrics/envoy metrics 허용

나가는 통신:
  DNS 허용
  OTel Collector 허용
  ticket-db 허용
  Kafka 허용
  Istio 허용

아직 열지 않은 것:
  S3 443 egress
```

S3는 ticket artifact 검증 단계에서 필요하면 별도로 열어야 한다.

지금 미리 `0.0.0.0/0:443`을 열지 않은 이유는 NetworkPolicy의 의미가 약해지기 때문이다.

### 10.5 notification-service 출입증

```text
들어오는 통신:
  Kong -> notification-service:8084 허용
  monitoring -> metrics/envoy metrics 허용

나가는 통신:
  DNS 허용
  OTel Collector 허용
  notification-db 허용
  Kafka 허용
  Istio 허용
```

### 10.6 concert-service 출입증

```text
들어오는 통신:
  Kong -> concert-service:8082 허용
  monitoring -> metrics/envoy metrics 허용

나가는 통신:
  DNS 허용
  OTel Collector 허용
  concert-db 허용
  Istio 허용

차단:
  Kafka 접근
  다른 DB 접근
```

### 10.7 dashboard 출입증

```text
들어오는 통신:
  Kong -> dashboard:8080 허용

나가는 통신:
  DNS 허용

차단:
  DB 접근
  Kafka 접근
  서비스 앱 포트 직접 접근
```

## 11. pgAdmin 예외

pgAdmin은 일반 서비스가 아니라 DB 확인용 관리 도구다.

그래서 일반 서비스와 다르게 예외를 둔다.

허용:

```text
Kong -> pgAdmin:80
pgAdmin -> PostgreSQL DB들:5432
pgAdmin -> DNS:53
```

차단:

```text
pgAdmin -> Kafka
pgAdmin -> MongoDB
pgAdmin -> 임의 서비스 앱 포트
pgAdmin -> 임의 인터넷
```

이렇게 하면 pgAdmin을 남겨두더라도 이동 범위를 PostgreSQL 확인 용도로 제한할 수 있다.

## 12. 지금 일부러 열지 않은 것

현재 설계에서 일부러 열지 않은 구간은 다음이다.

```text
서비스 간 직접 HTTP 호출
임의 인터넷 egress
S3 443 egress
모든 namespace에서 DB 접근
모든 namespace에서 Kafka 접근
Kafka 미사용 서비스의 Kafka 접근
서비스의 남의 DB 접근
```

이유:

```text
필요한 통신만 열어야 정책이 의미가 있다.
나중에 필요한 통신이 생기면 그때 서비스별로 최소 범위만 추가한다.
```

## 13. 적용 후 확인해야 하는 테스트

NetworkPolicy는 manifest만 보고 끝내면 안 된다.

반드시 runtime 통신 테스트를 해야 한다.

### 13.1 허용되어야 하는 테스트

```text
Kong pod -> auth-service:8080
Kong pod -> concert-service:8082
Kong pod -> reservation-service:8083
Kong pod -> payment-service:8080
Kong pod -> ticket-service:8085
Kong pod -> notification-service:8084

reservation-service -> reservation-db:5432
payment-service -> payment-db:5432
ticket-service -> ticket-db:5432
notification-service -> notification-db:27017

reservation-service -> kafka:9092
payment-service -> kafka:9092
ticket-service -> kafka:9092
notification-service -> kafka:9092

서비스 -> opentelemetry-collector:4317
Istio sidecar 서비스 -> istiod:15012
```

### 13.2 차단되어야 하는 테스트

```text
default namespace debug pod -> reservation-service:8083
synthetic namespace debug pod -> payment-service:8080
auth-service -> kafka:9092
concert-service -> kafka:9092
reservation-service -> payment-db:5432
payment-service -> reservation-db:5432
debug pod -> kafka:9092
debug pod -> reservation-db:5432
```

## 14. 현재 작업 상태

현재 상태:

```text
NetworkPolicy 설계 완료
GitOps manifest 반영 완료
Kustomize render 확인 완료
Kubernetes server dry-run 확인 완료
서비스 Helm render server dry-run 확인 완료
```

아직 남은 것:

```text
Git push
ArgoCD sync
AWS dev 실제 적용
debug pod 기반 runtime 통신 테스트
Kong E2E 재검증
Kafka lag 재검증
Prometheus target 재검증
Tempo trace 재검증
```

따라서 지금은 다음처럼 판단한다.

```text
설계와 manifest는 준비됨.
실제 서비스에 적용되어 동작한다고 체크하려면 ArgoCD 반영 후 runtime test가 필요함.
```
