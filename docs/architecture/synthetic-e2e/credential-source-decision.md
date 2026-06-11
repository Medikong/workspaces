# Synthetic 계정과 Credential 결정

결정일: 2026-06-10

열린 질문:

```text
고객/공급자/관리자 계정은 Secret으로 둘지, demo account endpoint에서 매번 조회할지 결정해야 한다.
```

## 결정

지속 synthetic E2E는 Kubernetes Secret을 credential source로 사용한다.

`/auth/demo-accounts` 같은 demo account endpoint는 계정 discovery와 seed 확인용으로만 사용하고, 비밀번호나 access token의 source of truth로 사용하지 않는다.

```text
synthetic CronJob
-> Kubernetes Secret에서 synthetic 계정 email/password 읽기
-> auth login 호출
-> 매 실행마다 JWT 발급
-> JWT로 예약/결제/티켓 flow 실행
```

핵심 기준은 다음과 같다.

- 사용자 신뢰와 권한 판단은 JWT를 기준으로 한다.
- email/password는 Kubernetes Secret에 둔다.
- access token은 Secret에 저장하지 않고 매 실행마다 login으로 발급한다.
- demo account endpoint는 로컬 편의와 seed smoke check에만 사용한다.
- 반복 CronJob에는 필요한 최소 권한의 계정만 주입한다.

## 비교

| 기준 | Kubernetes Secret | demo account endpoint |
|---|---|---|
| 주요 용도 | credential 보관과 주입 | 계정 discovery, seed 확인 |
| 보안 경계 | Kubernetes secret/RBAC 경계 안에 있음 | API로 노출되므로 범위 제한 필요 |
| aws-dev 지속 실행 | 적합 | credential source로는 부적합 |
| 로컬 개발 편의 | 별도 secret 준비 필요 | 편리함 |
| 계정 변경 대응 | secret 갱신 필요 | endpoint가 최신 계정 목록을 줄 수 있음 |
| 비밀번호 반환 | 가능하지만 secret에만 저장 | 반환하지 않는 방향 권장 |
| access token 반환 | 저장하지 않음 | 반환하지 않음 |
| 장애 원인 | secret 누락, login 실패 | auth demo API 의존성 증가 |

## 역할별 계정 정책

반복 synthetic flow는 customer credential로 실행한다. 다만 로컬 `task dev:synthetic`과 `task dev:synthetic:run`은 full journey 전에 내부 fixture setup Job을 실행하므로, 같은 Secret에 provider/admin credential도 함께 있어야 한다. 값이 없으면 fixture setup은 빠르게 실패한다.

| 역할 | 반복 CronJob 사용 | 권장 용도 |
|---|---|---|
| customer | 기본 사용 | 공연 조회, 예약 생성, 결제 요청, 티켓 조회 |
| provider | 필요할 때만 사용 | fixture 공연/좌석 준비, 공급자 API smoke |
| admin | 반복 CronJob에는 기본 제외 | 초기 setup, 수동 검증, 운영자 API smoke |

1차 full journey는 customer 계정 중심으로 구성한다. provider/admin 권한이 필요한 작업은 fixture setup Job 또는 수동 task로 분리한다.

```text
반복 synthetic CronJob
-> customer credential로 full journey 실행

로컬 내부 setup-fixture Job
-> provider/admin credential로 fixture 준비
```

이렇게 하면 반복 실행 Job의 권한 범위를 줄일 수 있고, synthetic flow가 실제 고객 행동에 더 가까워진다.

## Secret에 둘 값

Secret에는 장기 credential만 둔다.

```text
SYNTHETIC_CUSTOMER_EMAIL
SYNTHETIC_CUSTOMER_PASSWORD
SYNTHETIC_PROVIDER_EMAIL
SYNTHETIC_PROVIDER_PASSWORD
SYNTHETIC_ADMIN_EMAIL
SYNTHETIC_ADMIN_PASSWORD
```

단, provider/admin 값은 해당 시나리오가 필요할 때만 주입한다.

Secret에 두지 않을 값:

```text
access_token
refresh_token
traceparent
X-Request-Id
reservation_id
payment_id
ticket_id
```

token과 업무 객체 ID는 매 실행마다 새로 만들거나 응답에서 얻은 뒤 메모리 안에서만 사용한다.

## demo account endpoint의 역할

demo account endpoint는 유지할 수 있다. 다만 역할을 좁힌다.

좋은 용도:

- 로컬 개발자가 사용 가능한 demo 계정 목록을 확인한다.
- seed job이 기대한 계정을 만들었는지 smoke check한다.
- synthetic customer/provider/admin의 email 또는 role metadata를 확인한다.

피할 용도:

- password 반환
- access token 반환
- admin credential 반환
- aws-dev CronJob이 매 실행마다 credential discovery를 위해 의존

권장 응답은 credential이 아니라 metadata 중심이다.

```json
{
  "accounts": [
    {
      "role": "customer",
      "email": "synthetic.customer@example.com",
      "purpose": "synthetic journey"
    }
  ]
}
```

## k6 실행 흐름

k6 full journey는 매 실행마다 로그인한다.

```text
1. Secret env에서 customer email/password 읽기
2. POST /auth/login
3. access token 획득
4. GET /concerts
5. POST /reservations
6. POST /payments
7. GET /tickets/me 또는 ticket 상태 확인
```

이때 JWT는 사용자 신뢰와 권한 판단의 기준이다. `traceparent`, `X-Trace-Id`, `X-Request-Id`는 관측성과 로그 검색을 위한 보조 ID로만 사용한다.

## 로컬 환경

로컬 개발 환경은 편의성을 조금 더 허용한다.

```text
local
-> demo account endpoint로 계정 목록 확인 가능
-> 로컬 Secret 또는 env 파일로 password 주입
-> 매 실행마다 login으로 JWT 발급
```

로컬에서도 token을 고정값으로 저장하지 않는다. 개발 편의가 필요하면 local-only secret 또는 `.env`를 사용하되, repo에는 실제 credential을 커밋하지 않는다.

## GitOps 적용 메모

Helm chart는 Secret 이름만 참조한다.

```text
syntheticCredentialsSecretName: synthetic-traffic-credentials
```

Secret 생성 방식은 환경별로 분리한다.

```text
local
-> 개발자가 직접 생성하거나 task helper로 생성

aws-dev
-> External Secrets, sealed secret, 수동 kubectl 중 하나로 별도 관리
-> plain Secret manifest를 Git에 직접 커밋하지 않는다.
```

CronJob template은 Secret env를 optional로 두지 않는다. 필요한 credential이 없으면 synthetic run은 빠르게 실패해야 한다.

## 장애 해석

credential 문제는 서비스 장애와 분리해 해석한다.

```text
Secret 없음
-> 배포/환경 설정 문제

login 401
-> secret 값 불일치, seed 계정 누락, auth 정책 변경 후보

login 성공, 예약 실패
-> service flow 또는 fixture 문제 후보

demo account endpoint 실패
-> discovery/smoke 문제
-> Secret 기반 full journey 실패와는 분리해서 본다.
```

## 최종 기준

```text
배포 환경 credential source
-> Kubernetes Secret

access token
-> 매 실행마다 login으로 발급

demo account endpoint
-> 계정 discovery와 seed smoke check
-> password/token source로 사용하지 않음

반복 CronJob 기본 권한
-> customer 중심
-> provider/admin은 fixture setup 또는 별도 시나리오로 분리
```
