# private-dev NetworkPolicy Runtime 검증 문서

## 1. 문서 목적

이 문서는 `private-dev` Kubernetes 클러스터에서 서비스 간 접근 제어를 담당하는 `NetworkPolicy`가 실제로 의도대로 동작하는지 검증한 결과를 정리한 문서이다.

이번 검증의 핵심 목적은 다음과 같다.

```
1. 아무 Pod나 DB/Kafka에 직접 접근할 수 없는지 확인한다.
2. 각 서비스가 자기 DB에만 접근 가능한지 확인한다.
3. Kafka를 사용하는 서비스만 Kafka에 접근 가능한지 확인한다.
4. 다른 서비스의 DB 접근이 차단되는지 확인한다.
5. Istio sidecar가 붙은 환경에서 단순 TCP 테스트가 왜곡될 수 있음을 확인하고, sidecar를 끈 테스트 Pod로 재검증한다.
```

최종적으로 이 검증은 심화 프로젝트의 다음 요구사항을 만족하는지 확인하기 위한 것이다.

```
NetworkPolicy로 서비스 간 접근 제어 정책을 구현하고,
의도하지 않은 통신이 차단됨을 테스트로 검증한다.
```

---

## 2. 검증 환경

| 항목               | 내용                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cluster            | private-dev Kubernetes Cluster                                                                                                                           |
| Kubernetes Context | `kubernetes-admin@kubernetes`                                                                                                                            |
| Node 구성          | control-plane 1대 + worker 5대                                                                                                                           |
| 주요 Namespace     | `ticketing-auth`, `ticketing-concert`, `ticketing-reservation`, `ticketing-payment`, `ticketing-ticket`, `ticketing-notification`, `ticketing-messaging` |
| Gateway            | Kong                                                                                                                                                     |
| Service Mesh       | Istio                                                                                                                                                    |
| Messaging          | Kafka                                                                                                                                                    |
| DB                 | PostgreSQL, MongoDB                                                                                                                                      |
| 검증일             | 2026-06-17                                                                                                                                               |

---

## 3. 사전 확인: 클러스터 기본 상태

### 사용 명령어

```bash
hostname
whoami
date
kubectl config current-context
kubectl cluster-info
kubectl get nodes -o wide
kubectl get ns
```

### 명령어 의미

| 명령어                           | 의미                                               |
| -------------------------------- | -------------------------------------------------- |
| `hostname`                       | 현재 SSH로 접속한 서버 이름 확인                   |
| `whoami`                         | 현재 리눅스 사용자 확인                            |
| `date`                           | 서버 시간 확인                                     |
| `kubectl config current-context` | 현재 kubectl이 바라보는 Kubernetes context 확인    |
| `kubectl cluster-info`           | Kubernetes API Server와 CoreDNS 상태 확인          |
| `kubectl get nodes -o wide`      | 클러스터 노드 상태, IP, 역할, Kubernetes 버전 확인 |
| `kubectl get ns`                 | Kubernetes namespace 목록 확인                     |

### 확인 결과

```
- node-1은 control-plane 노드로 확인됨
- 전체 노드 6개가 모두 Ready 상태
- Kubernetes API Server 정상 접근 가능
- CoreDNS 정상
- argocd, kong, istio-system, monitoring, observability namespace 존재
- ticketing-* 서비스 namespace 존재
```

### 결과 의미

클러스터 자체는 정상 동작 중이며, NetworkPolicy 검증을 진행할 수 있는 기본 상태로 판단했다.

---

## 4. ArgoCD Application 상태 확인

### 사용 명령어

```bash
kubectl -n argocd get applications \
  -o custom-columns='NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REVISION:.status.sync.revision'
```

### 명령어 의미

ArgoCD Application별로 다음 정보를 확인한다.

| 컬럼       | 의미                                             |
| ---------- | ------------------------------------------------ |
| `NAME`     | ArgoCD Application 이름                          |
| `SYNC`     | Git 상태와 클러스터 상태가 일치하는지            |
| `HEALTH`   | 실제 리소스가 정상인지                           |
| `REVISION` | ArgoCD가 보고 있는 Git commit 또는 chart version |

### 주요 확인 결과

```
auth-private-dev                         Synced      Healthy
concert-private-dev                      Synced      Healthy
reservation-private-dev                  Synced      Healthy
payment-private-dev                      Synced      Healthy
ticket-private-dev                       Synced      Healthy
notification-private-dev                 Synced      Healthy

data-private-dev                         OutOfSync   Healthy
kong-shared-resources-private-dev        Synced      Healthy
reservation-canary-traffic-private-dev   Synced      Healthy
```

### 결과 의미

핵심 서비스 Application은 대부분 `Synced / Healthy` 상태였다.

`data-private-dev`는 `OutOfSync / Healthy`였지만, 이후 확인 결과 DB/Kafka NetworkPolicy 리소스는 실제 클러스터에 적용되어 있었고, `OutOfSync`의 주요 원인은 DB/Kafka StatefulSet drift로 판단했다.

따라서 NetworkPolicy runtime 검증은 진행 가능한 상태로 판단했다.

---

## 5. GitOps Revision 확인

### 확인 내용

초기에는 ArgoCD가 `72502d3` commit을 보지 않는 것처럼 보였지만, 이후 GitHub main branch의 최신 HEAD가 `fb83a48`임을 확인했다.

commit 흐름은 다음과 같았다.

```
72502d3 feat: add network and mesh gitops readiness
   ↓
ce31911 ci: build synthetic image for arm64 and amd64
   ↓
fb83a48 chore: update synthetic image tag to ce31911c...
```

### 결과 의미

`fb83a48`은 `72502d3` 이후의 commit이므로, `72502d3`의 NetworkPolicy / mesh readiness 변경을 포함하고 있다.

따라서 ArgoCD가 `fb83a48`을 보고 있는 것은 정상 상태로 판단했다.

---

## 6. NetworkPolicy 리소스 존재 확인

### 사용 명령어

```bash
kubectl get networkpolicy -A | grep -E 'allow-.*db|allow-kafka|pgadmin|dashboard' || true
```

### 명령어 의미

전체 namespace에서 DB/Kafka/pgAdmin/dashboard 관련 NetworkPolicy가 실제 클러스터에 존재하는지 확인한다.

### 확인 결과

```
ticketing-auth           allow-auth-db-ingress
ticketing-concert        allow-concert-db-ingress
ticketing-dashboard      allow-dashboard-ingress
ticketing-messaging      allow-kafka-ingress
ticketing-notification   allow-notification-db-ingress
ticketing-payment        allow-payment-db-ingress
ticketing-payment        allow-pgadmin-runtime
ticketing-reservation    allow-reservation-db-ingress
ticketing-ticket         allow-ticket-db-ingress
```

### 결과 의미

서비스별 DB와 Kafka 접근 제어를 위한 NetworkPolicy가 실제 클러스터에 존재함을 확인했다.

---

## 7. Kafka NetworkPolicy 상세 확인

### 사용 명령어

```bash
kubectl -n ticketing-messaging get networkpolicy allow-kafka-ingress -o yaml
```

### 명령어 의미

Kafka Pod로 들어오는 트래픽을 어떤 source에서 허용하는지 확인한다.

### 주요 설정

```yaml
podSelector:
  matchLabels:
    app.kubernetes.io/name: kafka

policyTypes:
  - Ingress

ingress:
  - from:
      - namespaceSelector:
          matchExpressions:
            - key: kubernetes.io/metadata.name
              operator: In
              values:
                - ticketing-reservation
                - ticketing-payment
                - ticketing-ticket
                - ticketing-notification
        podSelector:
          matchExpressions:
            - key: ticketing.io/service
              operator: In
              values:
                - reservation
                - payment
                - ticket
                - notification
```

### 설정 의미

Kafka는 다음 서비스에서만 접근 가능하도록 설정되어 있다.

```
- reservation-service
- payment-service
- ticket-service
- notification-service
```

반대로 다음 접근은 차단되어야 한다.

```
- auth-service → kafka
- concert-service → kafka
- 임의 debug pod → kafka
```

---

## 8. DB NetworkPolicy 상세 확인

### 사용 명령어

```bash
kubectl -n ticketing-auth get networkpolicy allow-auth-db-ingress -o yaml
kubectl -n ticketing-reservation get networkpolicy allow-reservation-db-ingress -o yaml
kubectl -n ticketing-payment get networkpolicy allow-payment-db-ingress -o yaml
```

### 명령어 의미

각 DB Pod로 들어오는 트래픽이 어떤 source Pod에서 허용되는지 확인한다.

### auth-db 정책 의미

```
허용:
- auth-service → auth-db
- pgAdmin → auth-db

차단 기대:
- reservation-service → auth-db
- payment-service → auth-db
- notification-service → auth-db
- 임의 debug pod → auth-db
```

### reservation-db 정책 의미

```
허용:
- reservation-service → reservation-db
- pgAdmin → reservation-db

차단 기대:
- auth-service → reservation-db
- payment-service → reservation-db
- notification-service → reservation-db
- 임의 debug pod → reservation-db
```

### payment-db 정책 의미

```
허용:
- payment-service → payment-db
- pgAdmin → payment-db

차단 기대:
- auth-service → payment-db
- reservation-service → payment-db
- notification-service → payment-db
- 임의 debug pod → payment-db
```

---

## 9. DB Pod Label 확인

### 사용 명령어

```bash
kubectl -n ticketing-auth get pod --show-labels | grep auth-db
kubectl -n ticketing-reservation get pod --show-labels | grep reservation-db
kubectl -n ticketing-payment get pod --show-labels | grep payment-db
kubectl -n ticketing-notification get pod --show-labels | grep notification-db
```

### 명령어 의미

NetworkPolicy의 `podSelector`가 실제 DB Pod label과 일치하는지 확인한다.

### 확인 결과

```
auth-db-0:
  app.kubernetes.io/name=auth-db

reservation-db-0:
  app.kubernetes.io/name=reservation-db

payment-db-0:
  app.kubernetes.io/name=payment-db

notification-db-0:
  app.kubernetes.io/name=notification-db
```

### 결과 의미

DB NetworkPolicy의 대상 selector가 실제 DB Pod를 정확히 선택하고 있음을 확인했다.

즉 NetworkPolicy가 대상 DB Pod를 못 잡아서 무효화되는 상황은 아니었다.

---

## 10. 서비스 Pod Label 확인

### 사용 명령어

```bash
kubectl -n ticketing-auth get pod -l app=auth-service --show-labels
kubectl -n ticketing-reservation get pod -l app=reservation-service --show-labels
kubectl -n ticketing-payment get pod -l app=payment-service --show-labels
kubectl -n ticketing-ticket get pod -l app=ticket-service --show-labels
kubectl -n ticketing-notification get pod -l app=notification-service --show-labels
kubectl -n ticketing-messaging get pod -l app.kubernetes.io/name=kafka --show-labels
```

### 명령어 의미

서비스 Pod가 NetworkPolicy source selector에 필요한 label을 가지고 있는지 확인한다.

### 확인 결과

```
auth-service:
  app=auth-service
  ticketing.io/service=auth
  ticketing.io/tier=api

reservation-service:
  app=reservation-service
  ticketing.io/service=reservation
  ticketing.io/tier=api
  sidecar.istio.io/inject=true
  version=v1

reservation-service-v2:
  app=reservation-service
  ticketing.io/service=reservation
  ticketing.io/tier=api
  sidecar.istio.io/inject=true
  version=v2

payment-service:
  app=payment-service
  ticketing.io/service=payment
  ticketing.io/tier=api

ticket-service:
  app=ticket-service
  ticketing.io/service=ticket
  ticketing.io/tier=api

notification-service:
  app=notification-service
  ticketing.io/service=notification
  ticketing.io/tier=api

kafka:
  app.kubernetes.io/name=kafka
```

### 결과 의미

서비스 Pod와 Kafka Pod가 NetworkPolicy selector에 필요한 label을 가지고 있음을 확인했다.

특히 Kafka 접근 허용 조건에 필요한 `ticketing.io/service` label이 reservation, payment, ticket, notification 서비스에 존재했다.

---

## 11. 임의 namespace debug Pod 접근 차단 검증

### 테스트 목적

아무 namespace에서 생성한 임의 Pod가 DB/Kafka에 직접 접근할 수 없는지 확인한다.

### 사용 명령어

```bash
kubectl create ns np-test --dry-run=client -o yaml | kubectl apply -f -

kubectl run np-debug -n np-test -it --rm \
  --image=busybox:1.36 \
  --restart=Never \
  -- sh
```

### 명령어 의미

| 명령어                                              | 의미                                        |
| --------------------------------------------------- | ------------------------------------------- | ----------------------- |
| `kubectl create ns np-test --dry-run=client -o yaml | kubectl apply -f -`                         | 테스트용 namespace 생성 |
| `kubectl run np-debug ...`                          | `np-test` namespace에 임시 busybox Pod 생성 |
| `--rm`                                              | 테스트 종료 후 Pod 자동 삭제                |
| `-it`                                               | 컨테이너 shell에 직접 접속                  |
| `--restart=Never`                                   | Deployment가 아니라 단일 Pod로 생성         |

### Pod 내부에서 실행한 명령어

```bash
nc -vz -w 3 auth-db.ticketing-auth.svc.cluster.local 5432
nc -vz -w 3 reservation-db.ticketing-reservation.svc.cluster.local 5432
nc -vz -w 3 payment-db.ticketing-payment.svc.cluster.local 5432
nc -vz -w 3 kafka.ticketing-messaging.svc.cluster.local 9092
nc -vz -w 3 notification-db.ticketing-notification.svc.cluster.local 27017
```

### 명령어 의미

| 명령어      | 의미                                       |
| ----------- | ------------------------------------------ |
| `nc`        | TCP 연결 테스트                            |
| `-v`        | verbose 출력                               |
| `-z`        | 데이터를 보내지 않고 포트 open 여부만 확인 |
| `-w 3`      | 3초 timeout                                |
| `host port` | 대상 서비스 DNS와 포트                     |

### 테스트 결과

| Source           | Target          | Port  | 기대 | 실제 결과            | 판정 |
| ---------------- | --------------- | ----- | ---- | -------------------- | ---- |
| np-test/np-debug | auth-db         | 5432  | 차단 | Connection timed out | 통과 |
| np-test/np-debug | reservation-db  | 5432  | 차단 | Connection timed out | 통과 |
| np-test/np-debug | payment-db      | 5432  | 차단 | Connection timed out | 통과 |
| np-test/np-debug | kafka           | 9092  | 차단 | Connection timed out | 통과 |
| np-test/np-debug | notification-db | 27017 | 차단 | Connection timed out | 통과 |

### 결과 의미

임의 namespace의 Pod는 DB/Kafka에 직접 접근할 수 없었다.

따라서 외부 또는 비인가 Pod의 DB/Kafka 접근 차단은 정상 동작한다.

---

## 12. 동일 namespace 비인가 Pod 접근 차단 검증

### 테스트 목적

같은 `ticketing-reservation` namespace 안에 있더라도, 올바른 서비스 label이 없는 Pod는 DB/Kafka에 접근할 수 없는지 확인한다.

### 사용 명령어

```bash
kubectl run deny-test -n ticketing-reservation -it --rm \
  --image=busybox:1.36 \
  --restart=Never \
  --labels=app=deny-test,ticketing.io/service=deny-test \
  -- sh
```

### 명령어 의미

`ticketing-reservation` namespace에 `deny-test`라는 임시 Pod를 생성한다.

이 Pod는 reservation-service와 같은 namespace에 있지만, 다음처럼 실제 서비스 label을 갖지 않는다.

```
app=deny-test
ticketing.io/service=deny-test
```

즉 reservation-service로 인정되지 않는 Pod이다.

### Pod 내부에서 실행한 명령어

```bash
nc -vz -w 3 auth-db.ticketing-auth.svc.cluster.local 5432
nc -vz -w 3 payment-db.ticketing-payment.svc.cluster.local 5432
nc -vz -w 3 kafka.ticketing-messaging.svc.cluster.local 9092
```

### 테스트 결과

| Source                          | Target     | Port | 기대 | 실제 결과            | 판정 |
| ------------------------------- | ---------- | ---- | ---- | -------------------- | ---- |
| ticketing-reservation/deny-test | auth-db    | 5432 | 차단 | Connection timed out | 통과 |
| ticketing-reservation/deny-test | payment-db | 5432 | 차단 | Connection timed out | 통과 |
| ticketing-reservation/deny-test | kafka      | 9092 | 차단 | Connection timed out | 통과 |

### 결과 의미

같은 서비스 namespace 내부에 있더라도, 올바른 서비스 label이 없는 Pod는 DB/Kafka에 접근할 수 없었다.

따라서 NetworkPolicy는 단순 namespace 단위 허용이 아니라, Pod label 기반으로 접근을 제한하고 있음을 확인했다.

---

## 13. 실제 서비스 Pod TCP 테스트에서 발생한 주의점

초기에는 실제 reservation-service, payment-service, notification-service Pod 내부에서 Python `socket.connect()`를 실행했다.

그 결과 일부 차단 대상 DB에 대해 `OK expected DENY`가 출력되었다.

예시:

```
reservation-service → payment-db: OK expected DENY
payment-service → auth-db: OK expected DENY
notification-service → payment-db: OK expected DENY
```

하지만 해당 서비스 Pod들은 Istio sidecar가 주입되어 있었다.

```
reservation-service: 2/2
payment-service: 2/2
notification-service: 2/2
```

`READY 2/2`는 애플리케이션 컨테이너와 `istio-proxy` sidecar가 함께 실행 중이라는 의미이다.

Istio sidecar가 있는 Pod에서는 애플리케이션의 TCP 연결이 Envoy proxy로 리다이렉트될 수 있다.

따라서 단순 TCP socket connect 성공이 실제 upstream DB 연결 성공을 의미하지 않을 수 있다.

이 문제를 피하기 위해 이후 검증은 다음 방식으로 다시 수행했다.

```
1. 실제 서비스와 같은 label을 가진 임시 busybox Pod 생성
2. sidecar.istio.io/inject=false annotation 적용
3. 해당 Pod에서 nc로 DB/Kafka 접근 확인
```

이 방식은 Istio sidecar에 의한 TCP 테스트 왜곡을 제거하고, Kubernetes NetworkPolicy 자체의 동작을 확인하기 위한 목적이다.

---

## 14. 서비스별 Egress NetworkPolicy 확인

### 사용 명령어

```bash
kubectl -n ticketing-auth get networkpolicy allow-auth-service-ingress -o yaml | grep -A20 'policyTypes'
kubectl -n ticketing-reservation get networkpolicy allow-reservation-service-ingress -o yaml | grep -A40 'policyTypes'
kubectl -n ticketing-payment get networkpolicy allow-payment-service-ingress -o yaml | grep -A40 'policyTypes'
kubectl -n ticketing-notification get networkpolicy allow-notification-service-ingress -o yaml | grep -A40 'policyTypes'
```

### 명령어 의미

서비스 Pod에 적용된 NetworkPolicy가 Ingress뿐 아니라 Egress도 제한하는지 확인한다.

### 확인 결과

각 서비스 정책은 다음을 포함하고 있었다.

```yaml
policyTypes:
  - Ingress
  - Egress
```

또한 서비스별 egress allowlist가 정의되어 있었다.

### auth-service egress 허용 대상

```
- kube-dns: 53/TCP, 53/UDP
- auth-db: 5432/TCP
- OpenTelemetry Collector: 4317/TCP, 4318/TCP
```

### reservation-service egress 허용 대상

```
- kube-dns: 53/TCP, 53/UDP
- reservation-db: 5432/TCP
- Kafka: 9092/TCP
- OpenTelemetry Collector: 4317/TCP, 4318/TCP
- istiod: 15012/TCP, 15010/TCP, 443/TCP
```

### payment-service egress 허용 대상

```
- kube-dns: 53/TCP, 53/UDP
- payment-db: 5432/TCP
- Kafka: 9092/TCP
- OpenTelemetry Collector: 4317/TCP, 4318/TCP
- istiod: 15012/TCP, 15010/TCP, 443/TCP
```

### notification-service egress 허용 대상

```
- kube-dns: 53/TCP, 53/UDP
- notification-db: 27017/TCP
- Kafka: 9092/TCP
- OpenTelemetry Collector: 4317/TCP, 4318/TCP
- istiod: 15012/TCP, 15010/TCP, 443/TCP
```

### 결과 의미

서비스 Pod는 아무 곳으로나 egress할 수 없고, 서비스별로 필요한 대상만 allowlist 방식으로 허용되어 있다.

---

## 15. reservation-service 라벨 Pod 접근 검증

### 테스트 목적

reservation-service 역할을 가진 Pod가 `reservation-db`와 `Kafka`에는 접근 가능하고, 다른 DB에는 접근할 수 없는지 확인한다.

### 사용 명령어

```bash
kubectl run np-reservation-allow -n ticketing-reservation -it --rm \
  --image=busybox:1.36 \
  --restart=Never \
  --labels=app=reservation-service,ticketing.io/service=reservation,ticketing.io/tier=api \
  --overrides='
{
  "metadata": {
    "annotations": {
      "sidecar.istio.io/inject": "false"
    }
  }
}
' \
  -- sh
```

### 명령어 의미

| 옵션                                   | 의미                                            |
| -------------------------------------- | ----------------------------------------------- |
| `np-reservation-allow`                 | 테스트 Pod 이름                                 |
| `-n ticketing-reservation`             | reservation namespace에 생성                    |
| `--labels=app=reservation-service,...` | reservation-service와 같은 접근 제어 label 부여 |
| `sidecar.istio.io/inject=false`        | Istio sidecar 주입 비활성화                     |
| `--rm`                                 | 종료 시 Pod 삭제                                |

### Pod 내부에서 실행한 명령어

```bash
nc -vz -w 3 reservation-db 5432
nc -vz -w 3 kafka.ticketing-messaging.svc.cluster.local 9092
nc -vz -w 3 payment-db.ticketing-payment.svc.cluster.local 5432
nc -vz -w 3 auth-db.ticketing-auth.svc.cluster.local 5432
```

### 테스트 결과

| Source                | Target         | Port | 기대 | 실제 결과            | 판정 |
| --------------------- | -------------- | ---- | ---- | -------------------- | ---- |
| reservation-label Pod | reservation-db | 5432 | 허용 | open                 | 통과 |
| reservation-label Pod | kafka          | 9092 | 허용 | open                 | 통과 |
| reservation-label Pod | payment-db     | 5432 | 차단 | Connection timed out | 통과 |
| reservation-label Pod | auth-db        | 5432 | 차단 | Connection timed out | 통과 |

### 결과 의미

reservation-service 역할을 가진 Pod는 자기 DB인 reservation-db와 Kafka에만 접근 가능했다.

다른 서비스의 DB인 payment-db와 auth-db 접근은 차단되었다.

---

## 16. payment-service 라벨 Pod 접근 검증

### 테스트 목적

payment-service 역할을 가진 Pod가 `payment-db`와 `Kafka`에는 접근 가능하고, 다른 DB에는 접근할 수 없는지 확인한다.

### 사용 명령어

```bash
kubectl run np-payment-allow -n ticketing-payment -it --rm \
  --image=busybox:1.36 \
  --restart=Never \
  --labels=app=payment-service,ticketing.io/service=payment,ticketing.io/tier=api \
  --overrides='
{
  "metadata": {
    "annotations": {
      "sidecar.istio.io/inject": "false"
    }
  }
}
' \
  -- sh
```

### Pod 내부에서 실행한 명령어

```bash
nc -vz -w 3 payment-db 5432
nc -vz -w 3 kafka.ticketing-messaging.svc.cluster.local 9092
nc -vz -w 3 reservation-db.ticketing-reservation.svc.cluster.local 5432
nc -vz -w 3 auth-db.ticketing-auth.svc.cluster.local 5432
```

### 테스트 결과

| Source            | Target         | Port | 기대 | 실제 결과            | 판정 |
| ----------------- | -------------- | ---- | ---- | -------------------- | ---- |
| payment-label Pod | payment-db     | 5432 | 허용 | open                 | 통과 |
| payment-label Pod | kafka          | 9092 | 허용 | open                 | 통과 |
| payment-label Pod | reservation-db | 5432 | 차단 | Connection timed out | 통과 |
| payment-label Pod | auth-db        | 5432 | 차단 | Connection timed out | 통과 |

### 결과 의미

payment-service 역할을 가진 Pod는 payment-db와 Kafka에만 접근 가능했다.

reservation-db와 auth-db 접근은 차단되었다.

---

## 17. notification-service 라벨 Pod 접근 검증

### 테스트 목적

notification-service 역할을 가진 Pod가 `notification-db`와 `Kafka`에는 접근 가능하고, 다른 DB에는 접근할 수 없는지 확인한다.

### 사용 명령어

```bash
kubectl run np-notification-allow -n ticketing-notification -it --rm \
  --image=busybox:1.36 \
  --restart=Never \
  --labels=app=notification-service,ticketing.io/service=notification,ticketing.io/tier=api \
  --overrides='
{
  "metadata": {
    "annotations": {
      "sidecar.istio.io/inject": "false"
    }
  }
}
' \
  -- sh
```

### Pod 내부에서 실행한 명령어

```bash
nc -vz -w 3 notification-db 27017
nc -vz -w 3 kafka.ticketing-messaging.svc.cluster.local 9092
nc -vz -w 3 auth-db.ticketing-auth.svc.cluster.local 5432
nc -vz -w 3 payment-db.ticketing-payment.svc.cluster.local 5432
```

### 테스트 결과

| Source                 | Target          | Port  | 기대 | 실제 결과            | 판정 |
| ---------------------- | --------------- | ----- | ---- | -------------------- | ---- |
| notification-label Pod | notification-db | 27017 | 허용 | open                 | 통과 |
| notification-label Pod | kafka           | 9092  | 허용 | open                 | 통과 |
| notification-label Pod | auth-db         | 5432  | 차단 | Connection timed out | 통과 |
| notification-label Pod | payment-db      | 5432  | 차단 | Connection timed out | 통과 |

### 결과 의미

notification-service 역할을 가진 Pod는 notification-db와 Kafka에만 접근 가능했다.

auth-db와 payment-db 접근은 차단되었다.

---

## 18. 최종 검증 결과 요약

| 검증 항목                                          | 결과 |
| -------------------------------------------------- | ---- |
| NetworkPolicy 리소스 존재                          | 통과 |
| DB/Kafka Pod selector 일치                         | 통과 |
| 서비스 Pod label 확인                              | 통과 |
| 임의 namespace Pod → DB/Kafka 차단                 | 통과 |
| 동일 namespace 비인가 Pod → DB/Kafka 차단          | 통과 |
| reservation 역할 Pod → reservation-db/Kafka 허용   | 통과 |
| reservation 역할 Pod → 타 DB 차단                  | 통과 |
| payment 역할 Pod → payment-db/Kafka 허용           | 통과 |
| payment 역할 Pod → 타 DB 차단                      | 통과 |
| notification 역할 Pod → notification-db/Kafka 허용 | 통과 |
| notification 역할 Pod → 타 DB 차단                 | 통과 |
| 서비스별 Egress allowlist 존재                     | 통과 |

---

## 19. 최종 결론

private-dev 클러스터에서 DB/Kafka 접근 제어 NetworkPolicy는 의도대로 동작함을 확인했다.

검증 결과, 임의 namespace의 Pod와 올바른 서비스 label이 없는 Pod는 DB/Kafka에 접근할 수 없었다.

또한 서비스 역할 label을 가진 Pod는 자기 DB와 필요한 Kafka에만 접근할 수 있었고, 다른 서비스의 DB 접근은 timeout으로 차단되었다.

따라서 다음 심화 프로젝트 요구사항은 private-dev runtime 기준으로 충족한다고 판단한다.

```
NetworkPolicy로 서비스 간 접근 제어 정책을 구현하고,
의도하지 않은 통신이 차단됨을 테스트로 검증한다.
```

최종 판정:

```
NetworkPolicy Runtime 검증: PASS
```

---

## 20. 체크리스트 반영

기존 상태:

```
NetworkPolicy 구성 자체는 GitOps와 private-dev 리소스 관점에서 완료에 가깝다.
하지만 최신 정책 기준 runtime 허용/차단 테스트는 아직 남아 있다.
```

검증 후 상태:

```
NetworkPolicy 구성과 private-dev runtime 허용/차단 테스트를 완료했다.
DB/Kafka 접근 제어는 의도대로 동작함을 확인했다.
```

따라서 체크리스트에서는 다음 항목을 완료로 갱신할 수 있다.

```
[x] NetworkPolicy가 의도하지 않은 통신을 실제로 차단하는지 검증한다.
[x] DB/Kafka 접근 제어 NetworkPolicy를 구성하고 runtime 검증한다.
```

---

## 21. 남은 보강 항목

이번 검증은 DB/Kafka 접근 제어 중심이다.

추가 완성도를 높이려면 다음 검증을 이어서 수행할 수 있다.

```
1. auth-service label Pod 기준 auth-db 허용, Kafka/타 DB 차단 재검증
2. ticket-service label Pod 기준 ticket-db/Kafka 허용, 타 DB 차단 검증
3. concert-service label Pod 기준 concert-db 허용, Kafka/타 DB 차단 검증
4. NetworkPolicy 검증 결과를 GitOps evidence 문서로 commit
5. Tempo CrashLoopBackOff 해결 후 trace 기반 관측성 검증
6. Canary traffic split 검증
7. mTLS STRICT 검증
8. HPA/k6 scale-out 검증
```
