### 1. 도입 배경

본 프로젝트는 단순히 API를 배포하는 것이 아니라, Kubernetes 환경에서 서비스 장애, 배포, 트래픽 제어, 관측성을 검증하는 것을 목표로 한다.

MediKong 서비스는 다음과 같은 마이크로서비스로 구성되어 있다.

```
auth-service
concert-service
reservation-service
payment-service
ticket-service
notification-service
```

이 중 `reservation-service`, `payment-service`, `ticket-service`, `notification-service`는 예매 흐름에서 서로 연결된다.

```
reservation-service
→ payment-service
→ ticket-service
→ notification-service
```

따라서 단순히 Kubernetes Service만으로 트래픽을 전달하는 것보다, 서비스 간 통신을 세밀하게 제어하고 관측할 수 있는 Service Mesh가 필요했다.

이를 위해 Istio를 도입했다.

---

### 2. Kong과 Istio의 역할 분리

본 프로젝트에서는 Kong과 Istio를 함께 사용한다.

두 도구의 역할은 다르다.

| 구분        | Kong Gateway                            | Istio                                                                |
| ----------- | --------------------------------------- | -------------------------------------------------------------------- |
| 주요 위치   | 클러스터 외부 진입점                    | 클러스터 내부 서비스 간 통신                                         |
| 주요 역할   | 외부 요청 라우팅, JWT 인증, API Gateway | 내부 트래픽 제어, Canary, Retry, Timeout, Fault Injection, Telemetry |
| 적용 대상   | Client → Service                        | Service → Service                                                    |
| 검증 포인트 | 인증, 라우팅, API Gateway 정책          | 장애 격리, 무중단 배포, 트래픽 분산, 관측성                          |

즉 Kong은 외부 사용자가 들어오는 입구를 담당하고, Istio는 클러스터 내부에서 서비스끼리 통신할 때의 안정성과 관측성을 담당한다.

```
Client
→ Kong Gateway
→ Kubernetes Service
→ Istio Sidecar
→ 내부 Microservice
```

---

### 3. Istio를 사용한 핵심 이유

### 3.1 Canary 배포와 Traffic Split 검증

Istio를 사용한 가장 큰 이유 중 하나는 서비스 버전 간 트래픽 비율을 제어하기 위해서다.

`reservation-service`는 예매 흐름의 진입점이므로 새 버전을 배포할 때 전체 트래픽을 한 번에 전환하면 위험하다.

따라서 Istio `VirtualService`와 `DestinationRule`을 사용해 다음과 같은 Canary 시나리오를 검증했다.

```
stable: v1 100%
canary-20: v1 80%, v2 20%
rollback: v1 100%
```

이를 통해 새 버전 배포 시 일부 트래픽만 v2로 보내고, 문제가 발생하면 다시 v1으로 rollback할 수 있는 구조를 검증했다.

---

### 3.2 RollingUpdate / Rollback 중 트래픽 단절 검증

Istio는 서비스 간 요청 지표를 Prometheus로 수집할 수 있기 때문에, RollingUpdate와 rollback 중 실제 요청이 실패했는지 확인할 수 있었다.

검증 결과는 다음과 같다.

```
RollingUpdate time: 65초
Rollback time: 66초

Istio metric:
reservation-service 200 증가
reservation-service 503 = 0
URX/UF upstream failure = 0
```

따라서 RollingUpdate와 rollback 중 사용자 관점의 트래픽 단절은 발생하지 않은 것으로 판정했다.

---

### 3.3 장애 격리 및 Graceful Degradation 검증

Istio를 사용하면 특정 서비스에만 장애를 주입할 수 있다.

본 프로젝트에서는 `notification-service`에 Istio fault injection을 적용하여 100% HTTP 503 장애를 재현했다.

검증 결과는 다음과 같다.

```
notification=503

reservation=200
payment=200
ticket=200
```

즉 notification-service는 장애 상태였지만, 핵심 서비스인 reservation-service, payment-service, ticket-service는 정상 응답을 유지했다.

이를 통해 notification 장애가 핵심 예매/결제/티켓 서비스의 기본 health 응답에는 전파되지 않음을 확인했다.

---

### 3.4 Circuit Breaker 성격의 Outlier Detection 적용

Istio `DestinationRule`을 통해 connectionPool과 outlierDetection 정책을 적용할 수 있다.

본 프로젝트에서는 reservation-service와 notification-service에 다음 성격의 정책을 사용했다.

```
connectionPool:
- 동시 연결 수 제한
- pending request 제한
- connection당 request 수 제한

outlierDetection:
- 반복적으로 5xx를 반환하는 endpoint를 일정 시간 트래픽 대상에서 제외
```

이 정책은 특정 Pod 또는 endpoint가 비정상 응답을 반복할 때, 해당 endpoint로 트래픽이 계속 몰리지 않도록 하는 Circuit Breaker 성격의 보호 장치다.

특히 notification-service는 후속 처리 서비스이므로, 장애가 발생해도 핵심 예매 흐름에 영향을 최소화해야 한다.

---

### 3.5 Pod 장애 시 트래픽 유지 확인

Istio와 Kubernetes Service를 함께 사용하면 Pod 단일 장애 상황에서 정상 endpoint로 트래픽이 우회되는지 확인할 수 있다.

검증에서는 `reservation-service` Pod 1개를 강제로 삭제하면서 지속 요청을 발생시켰다.

결과는 다음과 같다.

```
지속 요청 결과:
reservation=200 유지

Prometheus metric:
reservation-service 200 증가
reservation-service 503 = 0
URX/UF upstream failure = 0
```

이를 통해 Pod 단일 장애 상황에서도 사용자 관점의 트래픽 단절이 발생하지 않음을 확인했다.

---

### 3.6 서비스 간 Telemetry 확보

Istio sidecar는 서비스 간 요청에 대한 지표를 자동으로 수집한다.

본 프로젝트에서는 Prometheus와 Grafana를 통해 다음 지표를 확인했다.

```
1. 서비스별 request count
2. response_code별 요청 수
3. 5xx error count
4. response_flags
5. p95 latency
6. destination_service 기준 트래픽 흐름
```

이를 통해 장애 검증, RollingUpdate, rollback, Pod 강제 종료 시나리오에서 실제 트래픽이 어떻게 처리되었는지 수치로 확인할 수 있었다.

---

### 4. Kubernetes Service만으로 부족했던 이유

Kubernetes Service만으로도 Pod 간 로드밸런싱은 가능하다.

하지만 본 프로젝트의 검증 목표를 달성하기에는 부족하다.

| 요구사항            | Kubernetes Service만 사용         | Istio 사용 시                         |
| ------------------- | --------------------------------- | ------------------------------------- |
| 버전별 트래픽 분산  | 제한적                            | VirtualService로 v1/v2 비율 제어 가능 |
| Canary 배포         | 직접 구현 필요                    | 트래픽 weight 기반으로 가능           |
| 장애 주입           | 별도 도구 필요                    | fault injection 가능                  |
| Retry / Timeout     | 앱 코드 또는 클라이언트 구현 필요 | mesh 정책으로 적용 가능               |
| Circuit Breaker     | 직접 구현 필요                    | outlierDetection으로 일부 구현 가능   |
| 서비스 간 metric    | 별도 instrumentation 필요         | sidecar 기반 자동 수집                |
| response_flags 확인 | 어려움                            | URX, UF 등 Envoy flag 확인 가능       |

따라서 단순 배포가 아니라 운영 검증을 목표로 하는 본 프로젝트에서는 Istio가 필요했다.

---

### 5. Istio를 통해 실제로 검증한 항목

본 프로젝트에서 Istio를 통해 검증한 항목은 다음과 같다.

| 검증 항목              | 결과                                       |
| ---------------------- | ------------------------------------------ |
| Canary traffic split   | v1/v2 트래픽 분산 확인                     |
| Rollback               | v1 100% 복귀 확인                          |
| Notification 장애 주입 | notification=503 재현                      |
| Graceful degradation   | notification 장애 중 core service 200 유지 |
| Pod 강제 종료          | 지속 요청 중 200 유지                      |
| RollingUpdate          | 배포 중 5xx 없음                           |
| Rollback time 측정     | rollback 66초                              |
| Traffic metric         | Prometheus에서 200/503/response_flags 확인 |

---

### 6. Istio 도입 효과

Istio 도입 효과는 다음과 같다.

```
1. 배포 안정성 검증 가능
2. Canary와 rollback을 수치로 검증 가능
3. 특정 서비스 장애를 안전하게 재현 가능
4. 장애가 다른 서비스로 전파되는지 확인 가능
5. Pod 장애와 RollingUpdate 중 트래픽 단절 여부 확인 가능
6. Prometheus/Grafana를 통한 서비스 간 통신 관측 가능
```

즉 Istio는 본 프로젝트에서 단순한 부가 기술이 아니라, 클라우드 네이티브 운영 검증을 가능하게 하는 핵심 인프라 구성 요소로 사용되었다.

---

### 7. 한계와 주의점

Istio를 사용한다고 모든 장애 격리가 자동으로 해결되는 것은 아니다.

이번 검증 과정에서 다음과 같은 주의점도 확인했다.

```
1. 잘못된 fault injection은 전체 검증 흐름을 왜곡할 수 있다.
2. DestinationRule과 VirtualService는 상시 정책과 테스트 시나리오를 분리해야 한다.
3. fault injection VirtualService를 GitOps 상시 경로에 넣으면 서비스가 계속 장애 상태가 된다.
4. imagePullSecret, nodeSelector, endpoint readiness 같은 Kubernetes 기본 상태가 깨지면 Istio는 no healthy upstream을 반환한다.
5. 따라서 Istio 검증 전 Kubernetes 기본 상태가 정상인지 먼저 확인해야 한다.
```

---

### 8. 최종 결론

본 프로젝트에서 Istio를 사용한 이유는 내부 서비스 간 통신을 안정적으로 제어하고, 장애와 배포 시나리오를 실제로 검증하기 위해서다.

Kong Gateway가 외부 요청의 진입점과 인증을 담당한다면, Istio는 내부 마이크로서비스 간 트래픽 제어와 관측성을 담당한다.

Istio를 통해 Canary, rollback, fault injection, 장애 격리, Pod 장애 검증, RollingUpdate 무중단 검증, Prometheus 기반 metric 확인을 수행할 수 있었다.

따라서 Istio는 본 프로젝트의 클라우드 네이티브 운영 검증 목표를 달성하기 위한 핵심 기술로 사용되었다.
