---
id: TROUBLE-010
title: "부하테스트 중 auth login trace의 미계측 지연 구간"
status: in_progress
priority: p1
severity: medium
area: observability
repos:
  - service
  - gitops
  - workspace
owner: unassigned
created: 2026-06-16
updated: 2026-06-17
resolved: null
tags:
  - loadtest
  - auth-service
  - login
  - trace
  - latency
  - tempo
  - pbkdf2
  - pyroscope
  - postgres
  - connection-pool
related:
  - TROUBLE-009
  - docs/evidence/loadtest/reservation-journey-auth-bottleneck/README.md
  - service/services/auth-service/app/main.py
  - service/services/auth-service/app/security.py
links:
  - assets/2026-06-16-auth-login-trace-latency.png
  - assets/2026-06-17-auth-login-trace-flamegraph-too-many-clients.png
---

# 부하테스트 중 auth login trace의 미계측 지연 구간

## Context

`reservation-journey-load-test`로 auth-service 병목을 확인한 뒤 Tempo에서 느린 `/auth/login` trace를 확인했다.

기존 evidence에서는 50 VU 조건에서 auth-service가 CPU limit `500m` 근처까지 올라가고, `/auth/login` 응답 시간이 초 단위로 증가하며, readiness가 흔들린 뒤 Kong이 auth upstream target을 찾지 못하는 현상을 기록했다.

이번 기록은 그중 단일 `/auth/login` 요청의 trace를 더 자세히 본 것이다.

![auth login trace latency](assets/2026-06-16-auth-login-trace-latency.png)

![latency graph](assets/2026-06-16-auth-login-trace-latency-graphs.png)

Pyroscope span profile을 켠 뒤 확인한 trace에서는 root span 내부에 flame graph와 exception event가 함께 붙었다. 이 trace는 `auth-service: POST /auth/login` duration `817.55ms`였고, exception event에는 PostgreSQL이 새 연결을 거절한 메시지가 기록됐다.

![auth login trace flame graph and too many clients](assets/2026-06-17-auth-login-trace-flamegraph-too-many-clients.png)

## Symptoms

- 관찰된 현상:
  - Tempo trace `b9c41862c41e4bc4392e9475c662db71`에서 `auth-service: POST /auth/login` duration이 `795.59ms`로 보였다.
  - trace 시작 시각은 `2026-06-16 14:10:25.637 KST`다.
  - span은 `auth-service` 하나에만 있고 downstream service 호출은 없다.
  - root span 내부의 표시된 DB 관련 span 합계는 전체 duration보다 훨씬 작다.
  - 추가 trace `00123791ca668f6629179366416da37e`에서 `auth-service: POST /auth/login` duration이 `817.55ms`로 보였다.
  - 같은 trace의 exception event에는 `(psycopg.OperationalError) connection failed ... FATAL: sorry, too many clients already`가 기록됐다.
- 재현 조건:
  - 로컬 Kubernetes에서 `reservation-journey-load-test`를 실행한다.
  - 시나리오는 iteration마다 준비된 customer pool 계정으로 `/auth/login`을 호출한다.
  - 부하 조건에서 auth-service login 요청이 몰린다.
- 기대 동작:
  - `/auth/login` latency가 커질 경우 trace에서 주요 지연 구간이 DB, 비밀번호 검증, token 발급, audit 기록, connection 대기 중 어디인지 분리되어야 한다.
- 실제 동작:
  - 현재 trace만으로는 root duration 중 상당 부분이 어느 코드 구간에서 발생했는지 보이지 않는다.

## Impact

- 영향 범위:
  - `reservation-journey-load-test` 결과 해석.
  - auth-service scale/resource 실험의 병목 판단.
  - `/auth/login` 최적화 우선순위 선정.
- 우선 처리 이유:
  - 단순히 DB span만 보면 DB가 병목처럼 보이지 않는다.
  - 단순히 root span만 보면 auth-service 전체가 느리다는 사실만 보이고, 실제 조치 지점이 불명확해진다.
  - login이 앞단에서 막히면 reservation/payment/ticket 서비스의 한계치를 측정하기 어렵다.
- 우회 방법:
  - 예매 서비스 한계 측정이 목적이면 login token pre-warm 또는 login 제외 시나리오를 별도로 둔다.
  - auth-service 병목 측정이 목적이면 login 포함 시나리오를 유지하되, `/auth/login` 내부 구간별 span을 추가한 뒤 재실행한다.

## Investigation

| 시간 | 확인 내용 | 결과 |
| --- | --- | --- |
| 2026-06-16 14:10 KST | Tempo trace 확인 | `auth-service: POST /auth/login`, trace id `b9c41862c41e4bc4392e9475c662db71`, duration `795.59ms` |
| 2026-06-16 14:10 KST | trace span 구성 확인 | `connect 144.24ms`, `SELECT auth_db 9.29ms`, `INSERT auth_db 13.91ms`, `INSERT auth_db 34.73ms` |
| 2026-06-16 14:10 KST | root duration과 표시 span 합계 비교 | DB/connect span 합계는 약 `202.17ms`, 전체 `795.59ms`와 약 `593ms` 차이 |
| 2026-06-16 KST | login 코드 경로 확인 | `db.query(User) -> verify_password() -> issue_token_response() -> record_audit()` |
| 2026-06-16 KST | password hash 설정 확인 | `PBKDF2-SHA256`, 기본 `AUTH_PASSWORD_ITERATIONS=210000` |
| 2026-06-17 KST | Tempo trace와 span profile 확인 | trace id `00123791ca668f6629179366416da37e`, duration `817.55ms`, flame graph `360ms` |
| 2026-06-17 KST | exception event 확인 | `psycopg.OperationalError`, PostgreSQL `FATAL: sorry, too many clients already` |
| 2026-06-17 KST | flame graph stack 확인 | `app/main.py login`, `sqlalchemy.orm`, `sqlalchemy.pool`, `psycopg.connection connect/wait_conn` 경로가 관측됨 |
| 2026-06-17 KST | 연결 예산 확인 | `auth-db max_connections=20`, `auth-service replicas=3`, 기존 SQLAlchemy 기본 pool은 Pod당 최대 `5 + 10 overflow`까지 연결 가능 |

## Current Reading

초기 trace만으로는 DB span 합계와 root duration 사이에 빈 구간이 커서 `PBKDF2` 비밀번호 검증을 가장 강한 가설로 보았다. 이후 span profile과 exception event를 함께 확인하면서 판단이 바뀌었다.

현재 가장 직접적인 원인은 auth-service의 DB connection budget 초과다.

- DB query 자체는 단일 span 기준으로 `10~35ms` 수준이다.
- DB connection 관련 span은 `144.24ms`로 작지 않지만, 전체 `795.59ms`를 혼자 설명하지는 못한다.
- 새 trace에서는 connection 생성 과정에서 PostgreSQL이 `too many clients already`로 연결을 거절했다.
- flame graph는 `360ms`만 보여주며, 그중 `app/main.py login` 아래 SQLAlchemy/psycopg connection stack이 크게 보인다.
- `auth-db`의 `max_connections=20`에 비해 `auth-service replicas=3`과 SQLAlchemy 기본 pool 설정은 최대 `45`개 연결을 시도할 수 있었다.
- 따라서 단순히 DB query가 느린 문제가 아니라, 서비스 replica 수와 애플리케이션 pool 설정이 DB connection 한도를 초과할 수 있는 구조가 문제다.
- `PBKDF2` 비밀번호 검증은 여전히 CPU 부담 후보지만, 이번 exception evidence 기준으로는 1차 원인이 아니라 2차 확인 대상이다.

정리하면, 부하테스트에서 `/auth/login` 요청이 몰리면 auth-service Pod들이 각자 DB pool을 확장하고, auth-db의 connection limit에 먼저 도달한다. 이때 connection checkout/connect가 지연되거나 실패하고, 일부 요청은 `OperationalError`로 끝난다. 그 결과 login latency와 error가 증가하고 readiness/Kong 503으로 이어진다.

## What Not To Conclude Yet

- 이 trace 하나만으로 DB query 자체가 느리다고 결론내리지 않는다.
- 이 trace 하나만으로 PBKDF2만 원인이라고 결론내리지 않는다.
- auth-service replica/CPU 증설 효과는 별도 run에서 같은 조건으로 비교해야 한다.
- Tempo root span의 빈 구간은 실제 idle일 수도 있고, 계측이 빠진 코드 구간일 수도 있다.
- connection pool 제한 이후 같은 부하에서 `too many clients already`가 사라지는지 재검증해야 한다.

## Decision

- 이 현상은 `TROUBLE-010`으로 분리해 추적한다.
- 주요 원인은 auth-service와 auth-db 사이의 connection budget 불일치로 본다.
- 우선 조치는 SQLAlchemy pool을 명시적으로 제한해 `replicas * (pool_size + max_overflow)`가 DB `max_connections`보다 작게 유지되도록 만드는 것이다.
- trace는 요청 전체 지연과 DB span 차이를 찾는 용도로 쓰고, Pyroscope span profile은 실제 stack과 connection 대기 위치를 확인하는 보조 근거로 사용한다.
- 필요하면 `/auth/login` 내부 span을 추가해 root duration의 빈 구간을 줄인다.
- auth-service resource/replica 실험은 계속하되, 결과 해석 시 `/auth/login` p95/p99와 trace 내부 구간을 같이 본다.
- reservation/payment/ticket의 한계치를 보려는 실험은 login 포함 실험과 분리한다.

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | 느린 `/auth/login` trace id와 캡처 기록 | workspace | 이 문서 |
| done | 기존 auth bottleneck evidence와 연결 | workspace | `docs/evidence/loadtest/reservation-journey-auth-bottleneck/README.md` |
| done | Pyroscope server와 Grafana datasource를 관측성 스택에 추가 | gitops | `gitops/platform/observability` |
| done | Python 서비스 공용 Pyroscope SDK push 연동 추가 | service | `service/packages/observability` |
| done | Pyroscope span profile에서 `/auth/login` stack 확인 | workspace | `assets/2026-06-17-auth-login-trace-flamegraph-too-many-clients.png` |
| done | PostgreSQL connection limit error 확인 | workspace | trace `00123791ca668f6629179366416da37e` |
| done | SQLAlchemy pool 기본값을 bounded pool로 변경 | service/gitops | `server.sqlalchemy`, `charts/medikong-service` |
| todo | bounded pool 적용 후 `reservation-journey-load-test` 재실행 | gitops/workspace | `gitops/platform/loadtest` |
| todo | profile에서 `/auth/login` 잔여 CPU hotspot 확인: `verify_password()`, `_hashlib.pbkdf2_hmac`, token/audit 처리 구간 비교 | workspace | 이 문서 |
| todo | `/auth/login` 내부 span 추가: user lookup, password verify, token issue, refresh token insert, audit insert/commit | service | `service/services/auth-service/app/main.py` |
| todo | password verification duration을 metric 또는 structured log로 기록 | service | `service/services/auth-service/app/security.py` |
| todo | auth-service CPU/replica/pool 조합별 동일 부하 재실행 | gitops | `gitops/values/services/auth.yaml` |
| todo | login 포함 run과 login 제외 또는 token pre-warm run을 분리해 비교 | gitops | `gitops/platform/loadtest` |

## Resolution

미해결.

현상은 기록했고, 현재 1차 원인은 SQLAlchemy connection pool이 DB connection 한도보다 크게 확장될 수 있는 구조로 좁혀졌다. bounded pool 적용 후 동일 부하에서 `too many clients already`, `/auth/login` p95/p99, Kong 503, auth-service readiness 흔들림이 줄어드는지 확인한 뒤 닫는다.
