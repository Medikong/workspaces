# private-dev NetworkPolicy Runtime 검증 결과

작성일: 2026-06-17

## 1. 목적

이 문서는 private-dev Kubernetes 클러스터에서 DB/Kafka 접근 제어 NetworkPolicy가 의도대로 동작하는지 검증한 evidence다.

검증 기준은 다음이다.

```text
임의 namespace의 Pod는 DB/Kafka에 직접 접근할 수 없어야 한다.
서비스 역할을 가진 Pod는 자기 DB에만 접근할 수 있어야 한다.
Kafka를 사용하는 서비스만 Kafka에 접근할 수 있어야 한다.
다른 서비스의 DB 직접 접근은 차단되어야 한다.
```

관련 trouble:

```text
workspace/docs/trouble/2026-06-17-networkpolicy-connect-only-false-positive.md
```

원본 터미널 정리:

```text
workspace/docs/personal/gpt.md
workspace/docs/personal/terminal.md
```

## 2. 환경

```text
환경: private-dev Kubernetes cluster
Kubernetes: v1.34.9
ArgoCD revision: fb83a48c73c6926587ada9c23a2542ad490fd8d4
NetworkPolicy source: gitops/platform/data-private-dev/networkpolicies.yaml
```

`fb83a48`는 NetworkPolicy 변경 commit `72502d3 feat: add network and mesh gitops readiness` 이후의 commit이며, 해당 변경을 포함한다.

## 3. 적용된 NetworkPolicy

private-dev 클러스터에는 다음 DB/Kafka 접근 제어 NetworkPolicy가 적용되어 있었다.

```text
ticketing-auth           allow-auth-db-ingress
ticketing-concert        allow-concert-db-ingress
ticketing-messaging      allow-kafka-ingress
ticketing-notification   allow-notification-db-ingress
ticketing-payment        allow-payment-db-ingress
ticketing-payment        allow-pgadmin-runtime
ticketing-reservation    allow-reservation-db-ingress
ticketing-ticket         allow-ticket-db-ingress
```

서비스별 NetworkPolicy는 별도로 각 서비스 앱 포트와 egress allowlist를 관리한다.

## 4. 검증상 주의점

초기 검증에서는 실제 서비스 Pod 내부에서 Python `socket.connect()`만 수행했다.

Istio sidecar가 주입된 Pod에서는 이 방식이 false positive를 만들 수 있다.

```text
reservation-service: READY 2/2, Istio sidecar 있음
payment-service: READY 2/2, Istio sidecar 있음
notification-service: READY 2/2, Istio sidecar 있음
```

sidecar가 있는 Pod에서는 애플리케이션 컨테이너의 outbound TCP가 Envoy로 리다이렉트될 수 있다. 따라서 `socket.connect()` 성공은 실제 upstream DB 연결 성공과 같지 않을 수 있다.

이 문제를 피하기 위해 최종 검증은 다음 방식으로 수행했다.

```text
sidecar.istio.io/inject=false 테스트 Pod를 생성한다.
테스트 Pod에 실제 서비스와 동일한 접근 제어 label을 부여한다.
NetworkPolicy 자체의 ingress/egress 동작을 sidecar 없이 확인한다.
```

## 5. 임의 namespace 접근 차단

`np-test` namespace에 임의 debug Pod를 생성하여 DB/Kafka 접근을 확인했다.

| Source | Target | Port | 기대 | 실제 결과 | 판정 |
| --- | --- | ---: | --- | --- | --- |
| np-test/np-debug | auth-db | 5432 | 차단 | Connection timed out | 통과 |
| np-test/np-debug | reservation-db | 5432 | 차단 | Connection timed out | 통과 |
| np-test/np-debug | payment-db | 5432 | 차단 | Connection timed out | 통과 |
| np-test/np-debug | kafka | 9092 | 차단 | Connection timed out | 통과 |
| np-test/np-debug | notification-db | 27017 | 차단 | Connection timed out | 통과 |

판단:

```text
임의 namespace의 비인가 Pod는 서비스 DB와 Kafka에 직접 접근할 수 없다.
```

## 6. 동일 namespace 비인가 Pod 접근 차단

`ticketing-reservation` namespace에 서비스 접근 제어 label이 없는 `deny-test` Pod를 생성했다.

| Source | Target | Port | 기대 | 실제 결과 | 판정 |
| --- | --- | ---: | --- | --- | --- |
| ticketing-reservation/deny-test | auth-db | 5432 | 차단 | Connection timed out | 통과 |
| ticketing-reservation/deny-test | payment-db | 5432 | 차단 | Connection timed out | 통과 |
| ticketing-reservation/deny-test | kafka | 9092 | 차단 | Connection timed out | 통과 |

판단:

```text
같은 ticketing namespace 안에 있어도 올바른 service label이 없으면 DB/Kafka 접근이 차단된다.
```

## 7. reservation 역할 Pod 검증

테스트 Pod 조건:

```text
namespace: ticketing-reservation
labels:
  app=reservation-service
  ticketing.io/service=reservation
  ticketing.io/tier=api
annotations:
  sidecar.istio.io/inject=false
```

| Source | Target | Port | 기대 | 실제 결과 | 판정 |
| --- | --- | ---: | --- | --- | --- |
| reservation-label Pod | reservation-db | 5432 | 허용 | open | 통과 |
| reservation-label Pod | kafka | 9092 | 허용 | open | 통과 |
| reservation-label Pod | payment-db | 5432 | 차단 | Connection timed out | 통과 |
| reservation-label Pod | auth-db | 5432 | 차단 | Connection timed out | 통과 |

판단:

```text
reservation 역할 Pod는 reservation-db와 Kafka에만 접근 가능하다.
```

## 8. payment 역할 Pod 검증

테스트 Pod 조건:

```text
namespace: ticketing-payment
labels:
  app=payment-service
  ticketing.io/service=payment
  ticketing.io/tier=api
annotations:
  sidecar.istio.io/inject=false
```

| Source | Target | Port | 기대 | 실제 결과 | 판정 |
| --- | --- | ---: | --- | --- | --- |
| payment-label Pod | payment-db | 5432 | 허용 | open | 통과 |
| payment-label Pod | kafka | 9092 | 허용 | open | 통과 |
| payment-label Pod | reservation-db | 5432 | 차단 | Connection timed out | 통과 |
| payment-label Pod | auth-db | 5432 | 차단 | Connection timed out | 통과 |

판단:

```text
payment 역할 Pod는 payment-db와 Kafka에만 접근 가능하다.
```

## 9. notification 역할 Pod 검증

테스트 Pod 조건:

```text
namespace: ticketing-notification
labels:
  app=notification-service
  ticketing.io/service=notification
  ticketing.io/tier=api
annotations:
  sidecar.istio.io/inject=false
```

| Source | Target | Port | 기대 | 실제 결과 | 판정 |
| --- | --- | ---: | --- | --- | --- |
| notification-label Pod | notification-db | 27017 | 허용 | open | 통과 |
| notification-label Pod | kafka | 9092 | 허용 | open | 통과 |
| notification-label Pod | auth-db | 5432 | 차단 | Connection timed out | 통과 |
| notification-label Pod | payment-db | 5432 | 차단 | Connection timed out | 통과 |

판단:

```text
notification 역할 Pod는 notification-db와 Kafka에만 접근 가능하다.
```

## 10. 최종 결과

| 항목 | 결과 |
| --- | --- |
| NetworkPolicy 리소스 존재 | 통과 |
| DB/Kafka Pod selector 일치 | 통과 |
| 임의 namespace -> DB/Kafka 차단 | 통과 |
| 동일 namespace 비인가 Pod -> DB/Kafka 차단 | 통과 |
| reservation 역할 Pod -> reservation-db/Kafka 허용 | 통과 |
| reservation 역할 Pod -> 타 DB 차단 | 통과 |
| payment 역할 Pod -> payment-db/Kafka 허용 | 통과 |
| payment 역할 Pod -> 타 DB 차단 | 통과 |
| notification 역할 Pod -> notification-db/Kafka 허용 | 통과 |
| notification 역할 Pod -> 타 DB 차단 | 통과 |

최종 판단:

```text
private-dev DB/Kafka 접근 제어 NetworkPolicy runtime 검증 결과: PASS
```

## 11. 과제 기준 반영

다음 요구사항은 현재 검증 범위에서 기능 충족으로 판단할 수 있다.

```text
NetworkPolicy로 서비스 간 접근 제어 정책을 구현한다.
의도하지 않은 통신이 차단됨을 runtime test로 검증한다.
```

단, 이 문서의 검증 범위는 DB/Kafka 접근 제어 중심이다.

추가 보강 후보:

```text
auth-service label Pod 기준 auth-db 허용, Kafka/타 DB 차단 재검증
ticket-service label Pod 기준 ticket-db/Kafka 허용, 타 DB 차단 검증
concert-service label Pod 기준 concert-db 허용, Kafka/타 DB 차단 검증
Kafka는 connect-only 외에 Kafka protocol 기반 응답 확인으로 정밀화
MongoDB는 connect-only 외에 hello/ping 응답 확인으로 정밀화
```
