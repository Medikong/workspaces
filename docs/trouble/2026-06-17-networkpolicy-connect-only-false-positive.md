---
id: TROUBLE-008
title: "NetworkPolicy runtime test에서 connect-only 검증이 Istio sidecar Pod에서 허용처럼 보이는 문제"
status: closed
priority: p1
severity: medium
area: security
repos:
  - workspace
  - gitops
owner: unassigned
created: 2026-06-17
updated: 2026-06-17
resolved: 2026-06-17
tags:
  - networkpolicy
  - istio
  - private-dev
  - runtime-test
  - false-positive
related:
  - workspace/docs/personal/terminal.md
  - workspace/docs/personal/gpt.md
  - workspace/docs/evidence/security/network-policy-block/README.md
  - workspace/docs/members/service/goal/2026-06-15-goal-review/goal-functional-equivalence-checklist-2026-06-15.md
links: []
---

# NetworkPolicy connect-only false positive

## Context

private-dev 클러스터에서 NetworkPolicy runtime test를 진행했다.

검증 목적은 다음이었다.

```text
debug namespace의 임의 Pod는 DB/Kafka에 접근하지 못해야 한다.
각 서비스는 자기 DB에만 접근해야 한다.
Kafka를 사용하는 서비스만 Kafka에 접근해야 한다.
서비스가 다른 서비스의 DB에 직접 접근하면 안 된다.
```

현재 GitOps에는 DB/Kafka ingress NetworkPolicy가 존재한다.

```text
gitops/platform/data-private-dev/networkpolicies.yaml
```

private-dev ArgoCD revision은 `fb83a48c73c6926587ada9c23a2542ad490fd8d4`이며, 이 revision은 NetworkPolicy 변경 commit `72502d3`를 포함한다.

## Symptoms

`workspace/docs/personal/terminal.md` 기준으로 초기 표에서는 다음처럼 보였다.

| 테스트 | 기대 | 실제 | 최초 판정 |
| --- | --- | --- | --- |
| debug -> auth-db | 차단 | timeout | 통과 |
| debug -> reservation-db | 차단 | timeout | 통과 |
| debug -> payment-db | 차단 | timeout | 통과 |
| debug -> kafka | 차단 | timeout | 통과 |
| debug -> notification-db | 차단 | timeout | 통과 |
| auth-service -> auth-db | 허용 | OK | 통과 |
| auth-service -> reservation-db | 차단 | FAIL | 통과 |
| auth-service -> kafka | 차단 | FAIL | 통과 |
| reservation-service -> reservation-db | 허용 | OK | 통과 |
| reservation-service -> kafka | 허용 | OK | 통과 |
| reservation-service -> payment-db | 차단 | OK | 실패처럼 보임 |
| reservation-service -> auth-db | 차단 | OK | 실패처럼 보임 |
| payment-service -> payment-db | 허용 | OK | 통과 |
| payment-service -> kafka | 허용 | OK | 통과 |
| payment-service -> reservation-db | 차단 | OK | 실패처럼 보임 |
| payment-service -> auth-db | 차단 | OK | 실패처럼 보임 |
| notification-service -> notification-db | 허용 | OK | 통과 |
| notification-service -> kafka | 허용 | OK | 통과 |
| notification-service -> auth-db | 차단 | OK | 실패처럼 보임 |
| notification-service -> payment-db | 차단 | OK | 실패처럼 보임 |

관찰된 패턴은 다음이다.

```text
debug namespace Pod -> DB/Kafka는 timeout으로 차단된다.
sidecar가 없는 auth-service -> 남의 DB/Kafka는 timeout으로 차단된다.
Istio sidecar가 있는 reservation/payment/notification Pod에서는 socket.connect()가 OK로 찍히는 항목이 있다.
```

이 때문에 처음에는 다음 가능성을 의심했다.

```text
1. DB NetworkPolicy source selector가 너무 넓게 해석되고 있다.
2. Istio sidecar가 NetworkPolicy를 우회하고 있다.
3. 서비스 egress 정책이 실제로 적용되지 않아 나가는 트래픽이 열려 있다.
```

## Impact

- NetworkPolicy가 실패한 것처럼 오해할 수 있다.
- 심화 보안 검증 체크리스트에서 실패 항목으로 잘못 기록될 수 있다.
- 반대로 실제 보안 실패를 connect-only 결과만 보고 놓칠 수도 있다.
- NetworkPolicy runtime evidence 표의 판정 기준을 다시 정해야 한다.

## Investigation

| 시간 | 확인 내용 | 결과 |
| --- | --- | --- |
| 2026-06-17 | `kubectl get networkpolicy -A` | DB/Kafka 관련 NetworkPolicy가 존재했다. |
| 2026-06-17 | `allow-auth-db-ingress`, `allow-reservation-db-ingress`, `allow-payment-db-ingress`, `allow-kafka-ingress` YAML 확인 | DB NetworkPolicy는 `policyTypes: [Ingress]`이고, 서비스별 source Pod label 또는 Kafka 사용 서비스 namespace/podSelector를 지정한다. |
| 2026-06-17 | 서비스 Pod label 확인 | `auth-service`는 `READY 1/1`로 sidecar 없음. `reservation`, `payment`, `ticket`, `notification`은 `READY 2/2`로 Istio sidecar 있음. |
| 2026-06-17 | `np-test` debug Pod에서 DB/Kafka `nc -vz -w 3` | auth-db, reservation-db, payment-db, kafka, notification-db 모두 timeout. |
| 2026-06-17 | `auth-service`에서 Python `socket.connect()` | auth-db는 OK, reservation-db와 kafka는 TimeoutError. |
| 2026-06-17 | `reservation-service`에서 Python `socket.connect()` | reservation-db와 kafka는 OK. payment-db와 auth-db도 OK로 표시되어 실패처럼 보였다. |
| 2026-06-17 | `reservation-service`에서 Postgres SSLRequest handshake 확인 | reservation-db는 `b'N'` 응답. payment-db와 auth-db는 TimeoutError. |

핵심 추가 확인:

```text
reservation-service -> reservation-db:5432
  PG SSLRequest 후 b'N' 응답
  실제 Postgres 서버까지 도달한 것으로 판단 가능

reservation-service -> payment-db:5432
  socket.connect()만 보면 OK처럼 보였으나
  PG SSLRequest 후 응답을 기다리면 TimeoutError
  실제 DB 서버까지 정상 도달했다고 보기 어려움

reservation-service -> auth-db:5432
  socket.connect()만 보면 OK처럼 보였으나
  PG SSLRequest 후 응답을 기다리면 TimeoutError
  실제 DB 서버까지 정상 도달했다고 보기 어려움
```

## Current Diagnosis

현재 가장 가능성이 높은 원인은 **NetworkPolicy 실패가 아니라 검증 방식의 false positive**다.

Istio sidecar가 있는 Pod에서는 애플리케이션 컨테이너의 outbound TCP가 Envoy sidecar로 먼저 캡처된다. 이때 단순 `socket.connect()`는 원격 DB까지 실제로 연결됐다는 뜻이 아니라, 로컬/sidecar 경로에서 TCP 연결이 성립한 것으로 보일 수 있다.

따라서 sidecar가 있는 Pod에서 다음 코드는 NetworkPolicy 통과 여부를 증명하기에 부족하다.

```python
s.connect((host, port))
print("OK")
```

올바른 검증은 최소한 다음 중 하나여야 한다.

```text
Postgres:
  SSLRequest 또는 startup packet을 보내고 서버 응답을 읽는다.
  허용이면 b'N' 또는 Postgres protocol 응답이 와야 한다.
  차단이면 timeout이어야 한다.

MongoDB:
  단순 TCP connect가 아니라 MongoDB hello/ping 수준의 응답을 확인한다.

Kafka:
  단순 TCP connect가 아니라 ApiVersions request 또는 kafka client metadata 요청 응답을 확인한다.
```

## Decision

초기 표의 `OK`는 다음처럼 재해석한다.

```text
sidecar 없는 Pod:
  socket.connect() OK/Timeout은 비교적 직접적인 L4 도달 판단으로 사용할 수 있다.

sidecar 있는 Pod:
  socket.connect() OK만으로는 허용 판정하지 않는다.
  반드시 protocol handshake/read까지 확인해야 한다.
```

따라서 초기 connect-only 표의 임시 판정은 다음이었다.

```text
debug namespace -> DB/Kafka 차단: 통과
auth-service -> own DB 허용: 통과
auth-service -> reservation-db/kafka 차단: 통과
reservation-service -> own DB 허용: 통과
reservation-service -> payment-db/auth-db 차단: connect-only 표에서는 실패처럼 보였지만, Postgres handshake 기준 timeout으로 차단 가능성이 높음
payment-service/notification-service의 남의 DB 접근: protocol handshake 방식으로 재검증 필요
```

이후 `workspace/docs/personal/gpt.md` 기준으로 sidecar 영향을 제거한 테스트 Pod를 만들어 재검증했다.

검증 방식:

```text
1. 임의 namespace np-test의 debug Pod로 DB/Kafka 직접 접근 차단 확인
2. 동일 namespace의 비인가 Pod로 DB/Kafka 접근 차단 확인
3. sidecar.istio.io/inject=false 테스트 Pod를 생성
4. 테스트 Pod에 실제 서비스 접근 제어 label 부여
5. reservation/payment/notification 역할별로 자기 DB/Kafka 허용, 타 DB 차단 확인
```

최종 판정:

```text
NetworkPolicy runtime 검증 결과: PASS
```

단, 이 PASS는 `socket.connect()` 단독 결과가 아니라, sidecar 영향을 분리한 label 기반 테스트 Pod 결과를 기준으로 한다.

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | `terminal.md`의 NetworkPolicy runtime test 결과를 기준으로 현상 정리 | Codex | `workspace/docs/personal/terminal.md` |
| done | connect-only 결과가 sidecar Pod에서 false positive일 수 있음을 trouble로 기록 | Codex | 이 문서 |
| done | sidecar 비활성 테스트 Pod로 reservation 역할 접근 제어 재검증 | user | `workspace/docs/personal/gpt.md` |
| done | sidecar 비활성 테스트 Pod로 payment 역할 접근 제어 재검증 | user | `workspace/docs/personal/gpt.md` |
| done | sidecar 비활성 테스트 Pod로 notification 역할 접근 제어 재검증 | user | `workspace/docs/personal/gpt.md` |
| done | 검증 결과를 `docs/evidence/security/network-policy-block/README.md`로 별도 evidence화 | Codex | `workspace/docs/evidence/security/network-policy-block/README.md` |
| todo | auth-service, ticket-service, concert-service까지 같은 방식으로 표 확장 | unassigned |  |
| todo | Kafka 차단/허용 테스트를 Kafka protocol 또는 CLI client 방식으로 추가 정밀화 | unassigned |  |
| todo | MongoDB 차단/허용 테스트를 MongoDB hello/ping 방식으로 추가 정밀화 | unassigned |  |

## Recommended Verification Commands

Postgres는 connect-only 대신 다음 방식으로 확인한다.

```bash
kubectl -n ticketing-reservation exec -i deploy/reservation-service -- python - <<'PY'
import socket

targets = [
    ("reservation-db", 5432, "ALLOW"),
    ("payment-db.ticketing-payment.svc.cluster.local", 5432, "DENY"),
    ("auth-db.ticketing-auth.svc.cluster.local", 5432, "DENY"),
]

msg = bytes.fromhex("0000000804d2162f")  # PostgreSQL SSLRequest

for host, port, expected in targets:
    s = socket.socket()
    s.settimeout(4)
    try:
        s.connect((host, port))
        s.sendall(msg)
        data = s.recv(1)
        print("PG_SSL_REPLY", host, port, data, "expected", expected)
    except Exception as e:
        print("PG_FAIL", host, port, type(e).__name__, str(e), "expected", expected)
    finally:
        s.close()
PY
```

기대값:

```text
허용 대상:
  PG_SSL_REPLY ... b'N' ...

차단 대상:
  PG_FAIL ... TimeoutError ...
```

## Resolution

최종 원인은 **NetworkPolicy 정책 실패가 아니라 Istio sidecar가 있는 실제 서비스 Pod에서 connect-only 방식으로 검증한 데 따른 false positive**로 정리한다.

`workspace/docs/personal/gpt.md`의 후속 검증에서는 `sidecar.istio.io/inject=false` 테스트 Pod를 사용하고 실제 서비스와 동일한 접근 제어 label을 부여했다.

그 결과 다음 항목이 통과했다.

```text
임의 namespace -> DB/Kafka 차단
동일 namespace 비인가 Pod -> DB/Kafka 차단
reservation 역할 Pod -> reservation-db/Kafka 허용
reservation 역할 Pod -> payment-db/auth-db 차단
payment 역할 Pod -> payment-db/Kafka 허용
payment 역할 Pod -> reservation-db/auth-db 차단
notification 역할 Pod -> notification-db/Kafka 허용
notification 역할 Pod -> auth-db/payment-db 차단
```

따라서 private-dev의 DB/Kafka 접근 제어 NetworkPolicy는 현재 검증 범위에서 의도대로 동작한다고 판단한다.

재발 방지 기준:

```text
Istio sidecar가 있는 Pod에서 socket.connect()만으로 NetworkPolicy 허용/차단을 판정하지 않는다.
connect-only 결과는 참고 신호로만 사용한다.
NetworkPolicy 자체 검증은 sidecar 비활성 테스트 Pod 또는 protocol handshake/read 방식으로 수행한다.
검증 결과는 trouble이 아니라 docs/evidence/security/network-policy-block/README.md에 보존한다.
```
