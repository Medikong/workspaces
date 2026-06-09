# Kong + Istio 역할 분리 정리

이 문서는 공연 티켓 예매 서비스에서 Kong Gateway와 Istio를 함께 사용할 때의 책임 경계, 요청 흐름, 서비스 구현 관점의 작업 범위를 정리한다.

기준 결정은 [ADR-0003](../../adr/0003-separate-kong-edge-gateway-and-istio-service-mesh.md)이다.

## 결론

Kong과 Istio는 둘 다 L7 라우팅, 정책 적용, 관측성을 일부 처리할 수 있다. 그래서 둘을 같이 쓸 때는 "둘 다 가능하다"가 아니라 "어디까지 누구 책임인가"를 먼저 고정해야 한다.

이 프로젝트에서는 다음처럼 나눈다.

| 구분 | 담당 |
| --- | --- |
| 외부 사용자가 시스템에 들어오는 진입점 | Kong Gateway |
| 외부 API path routing | Kong Gateway |
| JWT 검증, Consumer 기반 인증 정책 | Kong Gateway |
| 외부 사용자/route 기준 Rate Limit | Kong Gateway |
| request id, gateway access log, gateway metric | Kong Gateway |
| 서비스 간 내부 통신 보안 | Istio |
| 서비스 간 retry, timeout, circuit breaker | Istio |
| v1/v2 Canary traffic split | Istio |
| mTLS, workload identity | Istio |
| Kiali topology, Envoy metric 기반 내부 관측성 | Istio |

한 줄로 정리하면, **Kong은 외부 API Gateway**, **Istio는 내부 Service Mesh**다.

## 전체 구조

```text
Client
  |
  v
Cloud Load Balancer
  |
  v
Kong Proxy Service
  |
  v
Kong Gateway
  - /api/auth -> auth-service
  - /api/concerts -> concert-service
  - /api/reservations -> reservation-service
  - /api/payments -> payment-service
  - /api/tickets -> ticket-service
  - JWT 검증
  - Rate Limit
  - Request ID / access log / gateway metric
  |
  v
Kubernetes ClusterIP Service
  |
  v
Application Pod + Istio Envoy Sidecar
  - auth
  - concert
  - reservation
  - payment
  - ticket
  - notification
  |
  v
Internal Service-to-Service Traffic
  - mTLS
  - retry / timeout
  - circuit breaker
  - canary routing
  - telemetry
```

Kafka 이벤트 흐름은 Kong의 대상이 아니다. `reservation-created`, `payment-approved`, `ticket-issued` 같은 이벤트는 Kafka topic과 consumer lag, 로그, 메트릭으로 관측한다.

## 요청 흐름

### 1. 일반 API 요청

```text
1. Client가 Authorization: Bearer <JWT>를 포함해 API 호출
2. Cloud Load Balancer가 Kong Proxy Service로 전달
3. Kong Gateway가 route를 매칭
4. Kong JWT plugin이 token을 검증
5. Kong Rate Limiting plugin이 사용자/route 기준 요청량을 제한
6. Kong이 request id 또는 correlation id를 유지/생성
7. Kong이 Kubernetes ClusterIP Service로 전달
8. Istio sidecar가 서비스 Pod로 들어오는 트래픽을 관측
9. 서비스 코드가 도메인 권한과 비즈니스 규칙을 최종 검증
10. 응답이 같은 경로로 Client에 반환
```

중요한 점은 JWT 검증이 Kong에서 끝났다고 서비스 권한 검사가 사라지는 것이 아니라는 점이다. Kong은 "토큰이 유효한가"를 먼저 차단하고, 서비스는 "이 사용자가 이 공연, 예약, 결제, 티켓에 접근할 수 있는가"를 확인한다.

### 2. 서비스 간 내부 호출

```text
reservation-service
  |
  | 내부 HTTP 호출
  v
payment-service

Istio 담당:
- service-to-service mTLS
- timeout
- retry
- circuit breaker
- outlier detection
- 내부 latency/error metric
```

내부 호출은 Kong을 다시 통과하지 않는다. 서비스 간 통신까지 Kong으로 돌리면 외부 API Gateway와 내부 mesh의 경계가 흐려지고, 장애 분석 지점이 늘어난다.

### 3. Canary 배포 흐름

```text
Client
  |
  v
Kong Gateway
  |
  v
reservation-service stable host
  |
  v
Istio VirtualService
  |
  +-- reservation v1: 80%
  |
  +-- reservation v2: 20%
```

Canary는 Istio에서 담당한다. Kong route는 같은 service host를 계속 바라보고, Istio가 `v1`, `v2` subset으로 트래픽 비율을 나눈다.

권장 전환 단계:

| 단계 | v1 | v2 | 확인 기준 |
| --- | ---: | ---: | --- |
| 시작 | 100% | 0% | 기존 버전 정상 |
| 1차 | 80% | 20% | 에러율, P99, 예약 성공률 |
| 2차 | 50% | 50% | 동일 부하에서 안정성 확인 |
| 완료 | 0% | 100% | 신규 버전 전환 |
| 롤백 | 100% | 0% | 장애 발생 시 즉시 복구 |

## Kong에서 맡을 작업

| 작업 | 구현 위치 | 완료 기준 |
| --- | --- | --- |
| 외부 API route 정의 | `gitops` Kong Ingress/route values | `/api/*` 경로가 각 서비스로 연결됨 |
| JWT 인증 정책 | KongPlugin, KongConsumer, secret | 토큰 없음/잘못된 토큰은 401 |
| Rate Limit | KongPlugin | 과도한 요청은 429 |
| Request ID | Kong plugin 또는 header policy | 서비스 로그와 gateway 로그에서 같은 id 추적 가능 |
| Gateway metric | Kong Prometheus plugin | Prometheus에서 Kong request/latency 확인 |
| Gateway access log | Kong 설정 또는 logging plugin | API 호출별 status/path/latency 확인 |

Kong의 강점은 외부 API 운영 정책을 플러그인으로 빠르게 붙일 수 있다는 점이다. JWT, Rate Limiting, Prometheus 같은 기능은 서비스 코드에 반복 구현하지 않고 gateway 계층에서 공통 처리할 수 있다.

## Istio에서 맡을 작업

| 작업 | 구현 위치 | 완료 기준 |
| --- | --- | --- |
| sidecar injection | namespace label 또는 deployment annotation | 서비스 Pod에 Envoy sidecar 주입 |
| mTLS | PeerAuthentication | 내부 서비스 간 통신 암호화 |
| 내부 라우팅 | VirtualService | v1/v2 traffic split 동작 |
| subset 정의 | DestinationRule | stable/canary subset 구분 |
| retry/timeout | VirtualService | 장애 또는 지연 시 정책대로 동작 |
| circuit breaker | DestinationRule connectionPool/outlierDetection | 장애 Pod 또는 과부하 대상 차단 |
| topology 확인 | Kiali | 서비스 간 호출 관계와 error rate 표시 |
| Envoy metric | Prometheus/Grafana | sidecar CPU/memory, request metric 확인 |

Istio의 강점은 서비스 코드 수정 없이 내부 서비스 간 통신 정책을 mesh 레벨에서 제어할 수 있다는 점이다. 특히 Canary, mTLS, retry, timeout, circuit breaker, topology 시각화는 심화 프로젝트 요구사항과 직접 연결된다.

## 서비스 코드에서 지켜야 할 기준

Kong과 Istio가 붙어도 서비스 코드가 가져야 할 책임은 남는다.

| 영역 | 서비스 코드 책임 |
| --- | --- |
| 인증 컨텍스트 | Kong이 전달한 사용자 id, role, request id header를 신뢰 가능한 방식으로 읽는다. |
| 도메인 권한 | 내 예약/내 결제/내 티켓 접근 여부는 서비스가 최종 판단한다. |
| health check | `/healthz`, `/readyz`를 유지한다. |
| metric | `/metrics`에서 서비스별 request count, latency, error count를 노출한다. |
| 로그 | `request_id`, `user_id`, `service`, `event_type`을 구조화 로그에 포함한다. |
| 장애 응답 | 의존 서비스 장애 시 5xx만 던지지 말고 가능한 경우 부분 응답 또는 명확한 에러 코드를 반환한다. |
| 이벤트 | Kafka event payload는 OpenAPI/event contract와 맞춘다. |

## 충돌하거나 헷갈리기 쉬운 지점

### JWT와 mTLS는 다르다

JWT는 외부 사용자의 API 호출 자격을 검증한다. mTLS는 서비스 workload 간 통신을 암호화하고 workload 신원을 검증한다.

따라서 `JWT가 있으니 mTLS가 필요 없다`도 아니고, `mTLS가 있으니 JWT가 필요 없다`도 아니다.

### Kong과 Istio에서 Canary를 동시에 하지 않는다

둘 다 traffic split을 할 수 있지만 이번 프로젝트에서는 Istio만 담당한다. Kong은 외부 route를 안정적으로 유지하고, Istio가 내부 subset 비율을 조정한다.

### 내부 서비스 호출은 Kong을 통과하지 않는다

Kong은 외부 API Gateway다. 서비스 간 내부 호출은 Kubernetes service DNS와 Istio sidecar를 통해 처리한다.

### mTLS STRICT 적용 전 Kong 경로를 검증한다

Istio `STRICT` mTLS를 켜면 mesh에 참여하지 않는 클라이언트의 요청이 막힐 수 있다. Kong에서 application service로 들어가는 경로가 막히지 않는지 먼저 확인해야 한다.

선택지는 다음 중 하나다.

| 선택지 | 설명 | 판단 |
| --- | --- | --- |
| Kong data plane도 mesh에 참여 | Kong Pod에도 sidecar를 주입하거나 mesh 통신을 맞춘다. | 목표 구조 |
| edge 구간만 PERMISSIVE | Kong -> service 경로는 예외로 두고 내부 service-to-service만 STRICT 적용 | 현실적인 백업 |
| Kong 뒤에 Istio IngressGateway 추가 | Kong -> Istio IngressGateway -> service 구조 | 현재 범위에서는 과함 |

## 검증 시나리오

### Kong 검증

| 시나리오 | 기대 결과 | 증거 |
| --- | --- | --- |
| JWT 없이 `/api/reservations` 호출 | 401 | curl 결과, Kong log |
| 잘못된 JWT로 호출 | 401 | curl 결과, Kong log |
| 정상 JWT로 호출 | 2xx 또는 도메인 에러 | curl 결과, service log |
| 짧은 시간에 과도한 요청 | 429 | curl/k6 결과, Kong metric |
| request id 포함 호출 | 서비스 로그까지 같은 id 전달 | gateway log + service log |

### Istio 검증

| 시나리오 | 기대 결과 | 증거 |
| --- | --- | --- |
| reservation v2 20% canary | 요청 일부만 v2로 전달 | Kiali, access log, Prometheus |
| v2 에러율 상승 | v1으로 rollback | VirtualService 변경 diff, metric |
| payment-service 지연 주입 | timeout/retry 동작 | curl/k6 결과, Istio metric |
| 장애 Pod 연속 5xx | outlierDetection 또는 circuit breaker 동작 | Kiali, Envoy metric |
| mTLS 적용 | 내부 통신 mTLS 표시 | Kiali security badge 또는 istioctl 결과 |

## 발표에서 설명할 문장

> Kong과 Istio는 기능이 일부 겹치지만, 이 프로젝트에서는 책임 경계를 분리했습니다. Kong은 외부 클라이언트가 들어오는 API Gateway로 두고 JWT, Rate Limit, 외부 route, gateway metric을 담당합니다. Istio는 서비스 내부 통신을 담당하며 mTLS, retry, timeout, circuit breaker, canary traffic split, Kiali topology를 제공합니다. 이렇게 나누면 외부 API 정책과 내부 복원력 정책의 증거를 각각 분리해서 제시할 수 있습니다.

## 구현 우선순위

| 순서 | 작업 | 의존성 |
| --- | --- | --- |
| 1 | Kong route/JWT/Rate Limit 현재 상태 확인 | 서비스 OpenAPI, GitOps values |
| 2 | request id가 gateway -> service log로 이어지는지 확인 | Kong plugin, 서비스 logging |
| 3 | Istio 설치와 namespace sidecar injection | GitOps platform 구성 |
| 4 | 한 서비스만 sidecar 주입 후 기본 API 호출 확인 | Kong -> service 경로 |
| 5 | 내부 service-to-service 호출에 timeout/retry 적용 | 서비스 간 HTTP 호출 |
| 6 | reservation v1/v2 Canary 예제 구성 | image tag, DestinationRule |
| 7 | mTLS PERMISSIVE -> STRICT 단계 검증 | Kong 경로 검증 |
| 8 | Kiali/Grafana/Prometheus 증거 캡처 | observability stack |

## 참고 문서

- [ADR-0003: Kong은 Edge API Gateway로, Istio는 내부 Service Mesh로 분리한다](../../adr/0003-separate-kong-edge-gateway-and-istio-service-mesh.md)
- [Kong Ingress Controller](https://developer.konghq.com/kubernetes-ingress-controller/)
- [Kong Ingress routing](https://developer.konghq.com/kubernetes-ingress-controller/ingress/)
- [Kong JWT plugin](https://developer.konghq.com/plugins/jwt/)
- [Kong Rate Limiting plugin](https://developer.konghq.com/plugins/rate-limiting/)
- [Kong Prometheus plugin](https://developer.konghq.com/plugins/prometheus/)
- [Istio Traffic Management](https://istio.io/latest/docs/concepts/traffic-management/)
- [Istio Security](https://istio.io/latest/docs/concepts/security/)
- [Istio Architecture](https://istio.io/latest/docs/ops/deployment/architecture/)
- [Istio Circuit Breaking](https://istio.io/latest/docs/tasks/traffic-management/circuit-breaking/)
