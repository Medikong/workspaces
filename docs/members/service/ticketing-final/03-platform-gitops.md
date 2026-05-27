# 03. 플랫폼과 GitOps

## 책임 범위

`infra-gitops`는 서비스 코드를 직접 소유하지 않고, 준비된 image를 Kubernetes에 배포하는 선언을 관리한다. 이 문서는 service HTML의 배포 구조와 infra-gitops README의 GitOps/운영 검증 관점을 병합한다.

| 영역 | 책임 |
| --- | --- |
| service repo | FastAPI 서비스 코드, dashboard, Dockerfile, test, image build/push |
| infra-gitops | Helm chart/values, Kubernetes namespace, data platform, Kong, Istio, Argo CD, observability manifest |
| infra | AWS VPC/Subnet, EC2 또는 cluster node, RDS/S3 후보, Ansible bootstrap |

## Namespace 구조

| Namespace | 포함 리소스 |
| --- | --- |
| `ticketing-auth` | `auth-service`, `auth-db` |
| `ticketing-concert` | `concert-service`, `concert-db` |
| `ticketing-reservation` | `reservation-service`, `reservation-db`, Redis 후보 |
| `ticketing-payment` | `payment-service`, `payment-db` |
| `ticketing-ticket` | `ticket-service`, `ticket-db` |
| `ticketing-notification` | `notification-service`, `notification-db` |
| `ticketing-messaging` | Kafka |
| `ticketing-dashboard` | dashboard |
| `kong` | Kong Gateway |
| `istio-system` | Istio control plane |
| `observability` | Prometheus, Grafana, Loki, Tempo, Alertmanager |

## 배포 검증 흐름

```text
service repo 코드 push
  -> GitHub Actions build/test/image push
  -> infra-gitops Helm values image tag 반영
  -> task validate 또는 CI render 검증
  -> Argo CD sync
  -> Kubernetes pod Running 확인
  -> Kong Gateway API 200 응답 확인
```

이 흐름은 infra-gitops README의 정상 배포 검증 시나리오를 공연 티켓 도메인에 맞춘 것이다.

## Kong Gateway

Kong은 외부 진입점과 공통 API 정책을 담당한다.

- JWT 인증: protected API는 role claim이 있는 JWT를 요구한다.
- Correlation ID: gateway에서 `correlationId`를 생성하거나 전달한다.
- Rate Limiting: 단일 사용자 과호출은 429로 제한한다.
- Prometheus plugin: gateway 요청 수, latency, 4xx/5xx를 수집한다.

권장 route는 다음이다.

| Prefix | Upstream |
| --- | --- |
| `/auth` | `auth-service` |
| `/concerts` | `concert-service` |
| `/reservations` | `reservation-service` |
| `/payments` | `payment-service` |
| `/tickets` | `ticket-service` |
| `/notifications` | `notification-service` |

## Istio와 Service Mesh

Istio는 심화 검증 항목이다. 1차 배포가 안정화된 뒤 적용한다.

- Sidecar injection 대상 namespace 확정
- PeerAuthentication으로 mTLS 적용
- DestinationRule/VirtualService로 `reservation-service` 또는 `ticket-service` v1/v2 traffic split
- proxy-status, tls-check, traffic ratio를 증거로 남김

## 데이터와 스토리지

| 리소스 | 목적 |
| --- | --- |
| PostgreSQL | auth, concert, reservation, payment, ticket의 상태 저장 |
| MongoDB | notification과 event 처리 기록 저장 |
| Kafka | 예약/결제/티켓 이벤트 기반 후속 처리 |
| Redis 후보 | 좌석 lock, 만료 처리, 피크 상황 cache |
| S3 | 티켓 QR/PDF artifact 저장 |
| RDS 후보 | AWS 환경의 PostgreSQL 운영형 저장소 |

티켓 artifact는 pod 내부가 아니라 S3에 저장한다. AWS 환경에서는 VPC Endpoint와 bucket policy까지 검증 대상에 포함한다.

## 장애 복구와 롤백

### Pod 장애 복구

```text
핵심 서비스 Pod 강제 종료
  -> ReplicaSet 자동 재시작 확인
  -> Kafka 메시지 유실 없음 확인
  -> Grafana/Alertmanager 알림 확인
```

측정 지표는 `MTTR`, pod restart count, 장애 구간 5xx rate, core flow success rate다.

### GitOps 롤백

```text
broken image 의도적 배포
  -> Argo CD에서 이전 revision rollback
  -> 서비스 정상 복구 확인
```

측정 지표는 rollback time, canary error delta, 복구 후 예매 성공률이다.

## 보안과 정책

- Secret은 평문 yaml에 두지 않는다.
- Sealed Secrets 또는 AWS Secrets Manager 적용을 검토한다.
- NetworkPolicy로 허용된 서비스 간 통신만 가능하게 한다.
- ServiceAccount/RBAC로 서비스 권한을 분리한다.
- Trivy scan에서 Critical 취약점이 있는 image는 배포 후보에서 제외한다.

## infra-gitops 산출물

- ticketing namespace manifest
- service별 Helm values
- PostgreSQL, MongoDB, Kafka, Redis 후보 manifest
- Kong route/JWT/rate limit/correlation id 설정
- Istio mTLS/traffic split manifest
- ServiceMonitor/PodMonitor, Grafana dashboard, alert rule
- Argo CD Application
- rollback runbook과 장애 복구 runbook
