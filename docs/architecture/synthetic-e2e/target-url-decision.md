# Synthetic 대상 URL 결정

결정일: 2026-06-10

열린 질문:

```text
배포 환경 synthetic 대상 URL을 내부 Kong DNS로 둘지, 외부 Ingress DNS로 둘지 결정해야 한다.
```

## 결정

배포 환경의 기본 synthetic E2E는 클러스터 내부의 CronJob에서 실행하되, 요청 대상은 외부 Ingress DNS로 둔다.

```text
synthetic CronJob
-> external Ingress DNS
-> AWS Load Balancer / Ingress
-> Kong
-> service
-> database / kafka
```

다만 내부 Kong DNS 경로도 별도 smoke 시나리오로 유지한다.

```text
synthetic CronJob
-> internal Kong DNS
-> Kong
-> service
```

즉, 하나만 고르지 않고 두 경로를 목적별로 나눈다.

- `internal-smoke`: 빠른 원인 분리와 개발 피드백
- `external-journey`: 실제 사용자 진입 경로와 관측성 흐름 검증

## 비교

| 기준 | 내부 Kong DNS | 외부 Ingress DNS |
|---|---|---|
| 예시 | `http://kong-kong-proxy.kong.svc.cluster.local` | `http://medikong-default-kong-nlb-c17a54e23efd293c.elb.ap-northeast-2.amazonaws.com:32407` |
| 검증 범위 | Kong route, service 연결, backend 의존성 | DNS, TLS, AWS LB/Ingress, Kong, service, backend 의존성 |
| 실제 트래픽 유사성 | 낮음 | 높음 |
| trace/log 시뮬레이션 | 내부 호출 기준으로 가능 | 실제 진입 경로 기준으로 더 자연스러움 |
| 실패 원인 분리 | 쉬움 | 넓게 봐야 함 |
| 로컬 개발 피드백 | 적합 | 환경 의존성이 큼 |
| 배포 환경 검증 | 보조 확인에 적합 | 기본 검증에 적합 |
| TLS/인증서 검증 | 불가 | 가능 |
| 외부 DNS/LB 문제 탐지 | 불가 | 가능 |
| 네트워크 구성 리스크 | 낮음 | hairpin, NAT, 보안그룹, DNS 정책 확인 필요 |

## 내부 Kong DNS의 장점

내부 Kong DNS는 테스트 실행 위치가 Kubernetes 내부일 때 가장 단순한 경로다.

```text
synthetic pod
-> kong service DNS
-> backend services
```

장점은 실패 원인 분리가 쉽다는 점이다. 외부 DNS, TLS, AWS Load Balancer, Ingress 설정이 개입하지 않으므로 서비스 자체, Kong route, backend 연결 문제를 빠르게 확인할 수 있다.

적합한 용도:

- 로컬 개발 환경에서 1분 주기로 빠르게 피드백 받기
- 배포 환경에서 외부 경로 실패 시 내부 경로가 살아 있는지 비교하기
- Kong route와 service 연결 상태를 좁은 범위로 확인하기
- 예약/결제 full journey를 붙이기 전 smoke check로 사용하기

한계도 명확하다. 외부 DNS, TLS 인증서, AWS Load Balancer, Ingress 설정이 깨져도 내부 Kong DNS 시나리오는 성공할 수 있다. 따라서 사용자 관점의 배포 검증으로는 부족하다.

## 외부 Ingress DNS의 장점

외부 Ingress DNS는 실제 사용자가 들어오는 경로에 더 가깝다.

```text
synthetic pod
-> external Ingress DNS
-> AWS Load Balancer / Ingress
-> Kong
-> backend services
```

이 방식은 클러스터 내부에 synthetic runner를 두면서도 외부 진입 경로를 호출한다. 따라서 실제 트래픽과 비슷한 요청 경로를 만들 수 있고, trace와 log도 사용자 요청에 가까운 형태로 남는다.

적합한 용도:

- 배포 후 실제 진입 경로가 살아 있는지 확인하기
- DNS, TLS, Load Balancer, Ingress, Kong, service 연결을 한 번에 검증하기
- trace/log/metric이 실제 요청처럼 이어지는지 확인하기
- route, 인증, 헤더, gateway 설정의 보강 지점을 찾기
- 배포 직후나 장시간 반복 실행에서 사용자 관점의 실패를 찾기

단점은 실패 원인 범위가 넓다는 점이다. 실패했을 때 바로 서비스 문제라고 단정할 수 없고, DNS, 인증서, Load Balancer, Ingress, Kong, service를 순서대로 좁혀야 한다.

또한 클러스터 내부에서 외부 DNS를 다시 호출하는 구조이므로 aws-dev 네트워크에서 이 경로가 가능한지 확인해야 한다.

확인할 항목:

- synthetic namespace에서 외부 Ingress DNS가 resolve 되는가?
- Pod에서 외부 Ingress endpoint로 나갈 수 있는가?
- TLS 인증서 검증이 통과하는가?
- Load Balancer 보안그룹 또는 네트워크 정책이 내부 호출을 막지 않는가?
- 요청이 Kong과 backend service까지 도달하고 trace/log가 남는가?

## 운영 방식

1차 운영은 다음처럼 나눈다.

| 시나리오 | 대상 URL | 목적 | 권장 주기 |
|---|---|---|---|
| `internal-smoke` | 내부 Kong DNS | 빠른 생존 확인, 원인 분리 | local 1분, aws-dev 선택 |
| `external-smoke` | 외부 Ingress DNS | 사용자 진입 경로 생존 확인 | aws-dev 5-10분 |
| `external-journey` | 외부 Ingress DNS | 예약/결제/티켓까지 핵심 흐름 검증 | aws-dev 5-10분 또는 배포 직후 |

로컬 개발 환경은 내부 Kong DNS를 기본으로 둔다.

```text
values/local.yaml
-> SYNTHETIC_BASE_URL=http://kong-kong-proxy.kong.svc.cluster.local
-> schedule="* * * * *"
```

aws-dev 같은 배포 환경은 외부 Ingress DNS를 기본으로 둔다.

```text
values/aws-dev.yaml
-> SYNTHETIC_BASE_URL=http://medikong-default-kong-nlb-c17a54e23efd293c.elb.ap-northeast-2.amazonaws.com:32407
-> schedule="*/5 * * * *" 또는 "*/10 * * * *"
```

현재 aws-dev synthetic E2E의 확정 외부 대상은 다음 값이다.

```text
http://medikong-default-kong-nlb-c17a54e23efd293c.elb.ap-northeast-2.amazonaws.com:32407
```

## 로그와 Trace 기준

외부 Ingress DNS를 기본 경로로 둘 때 synthetic 요청은 실제 사용자 요청과 구분되어야 한다.

trace 전파 방식은 프론트엔드 계약과 동일하게 둔다.

```text
첫 요청
-> traceparent 없이 호출
-> 서버 또는 gateway가 trace 생성
-> 응답 traceparent 저장

후속 요청
-> 저장한 traceparent를 릴레이
-> 서버가 유효성 검증 후 관측성 상관관계 목적으로만 이어받음
```

관련 문서:

- [Frontend traceparent 처리 가이드](../observability/tracing/frontend-traceparent.md)

권장 헤더:

```text
X-Synthetic-Traffic: true
X-Request-Id: synthetic-<run-id>
```

권장 k6 tag:

```text
scenario=external-journey
step=reservation.create
```

주의할 점:

- `traceparent`는 인증, 권한, 감사 로그 판단에 사용하지 않는다.
- 사용자 신뢰는 JWT를 기준으로 한다.
- 서버의 sampling 정책은 클라이언트가 보낸 `traceparent`의 sampled flag보다 우선한다.
- `tracestate`는 1차 synthetic 시나리오에서 보내지 않는다.
- `run_id`, `reservation_id`, `user_id`처럼 매번 달라지는 값은 metric label로 넣지 않는다.
- 동적 식별자는 request header나 structured log에 남긴다.
- trace 검색은 `X-Request-Id` 또는 trace id를 기준으로 한다.

## 장애 해석

두 경로를 함께 쓰면 실패 원인을 더 빠르게 좁힐 수 있다.

```text
external 실패, internal 성공
-> DNS / TLS / Load Balancer / Ingress / 외부 Kong route 문제 후보

external 실패, internal 실패
-> Kong route / service / database / kafka / 공통 의존성 문제 후보

external 성공, internal 실패
-> 내부 DNS, namespace network policy, internal Kong service 경로 문제 후보
```

따라서 외부 Ingress DNS를 기본으로 쓰더라도 내부 Kong DNS smoke를 제거하지 않는다. 두 결과를 비교할 때 aws-dev의 문제 범위가 훨씬 빠르게 좁혀진다.

## 최종 기준

```text
빠른 피드백과 원인 분리
-> 내부 Kong DNS

실제 트래픽에 가까운 배포 검증과 trace/log 시뮬레이션
-> 외부 Ingress DNS

배포 환경 기본 synthetic E2E
-> 클러스터 내부 CronJob에서 외부 Ingress DNS 호출
```
