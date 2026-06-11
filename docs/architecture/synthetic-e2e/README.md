# 지속 E2E 검증 아키텍처

지속 E2E 검증은 로컬 또는 배포 환경의 서비스가 장시간 동안 계속 정상 동작하는지 확인하기 위한 synthetic test다.

목표는 부하를 만드는 것이 아니라, 실제 사용자가 거치는 진입 경로와 핵심 예매 흐름이 계속 살아 있는지 반복해서 확인하는 것이다. 실행 도구는 k6를 사용하고, Kubernetes CronJob으로 주기 실행한다.

관련 이슈:

- 상위 이슈: Medikong/workspace#29
- GitOps 실행 범위: Medikong/gitops#23

관련 문서:

- k6 조사와 적용 방향: [k6-research.md](k6-research.md)
- k6 아키텍처 구조와 코드 샘플: [k6-architecture.md](k6-architecture.md)
- 대상 URL 결정: [target-url-decision.md](target-url-decision.md)
- 계정과 credential 결정: [credential-source-decision.md](credential-source-decision.md)
- 테스트 데이터 생성 결정: [test-data-generation-decision.md](test-data-generation-decision.md)
- 실패 상태 처리 결정: [failure-state-decision.md](failure-state-decision.md)
- 실행 결과 수집 결정: [result-collection-decision.md](result-collection-decision.md)
- Frontend traceparent 처리 기준: [frontend-traceparent.md](../observability/tracing/frontend-traceparent.md)

## 목적

로컬과 aws-dev 모두에서 단순히 프로세스나 Pod가 살아 있는지만 보는 것으로는 실제 서비스 흐름이 정상인지 알기 어렵다.

지속 E2E 검증은 다음 질문에 답하기 위한 장치다.

```text
Ingress 또는 Kong 경로로 들어온 요청이 서비스까지 도달하는가?
공연, 좌석, 예약, 결제, 티켓 흐름이 한 사이클로 이어지는가?
DB, Kafka 같은 런타임 의존성 문제가 실제 요청에서 드러나는가?
traceparent, request id, 로그가 실패 지점 추적에 충분한가?
반복 실행 중 특정 시간대나 배포 직후에 실패가 몰리는가?
```

## 현재 결정 요약

| 주제 | 결정 |
|---|---|
| 실행 도구 | k6 |
| 실행 위치 | Kubernetes `synthetic` namespace의 CronJob |
| aws-dev 기본 대상 | 외부 Ingress DNS |
| local 기본 대상 | 내부 Kong DNS 또는 로컬 Ingress |
| 보조 대상 | 내부 Kong DNS smoke |
| 인증 | Kubernetes Secret의 계정으로 매 실행마다 login 후 JWT 발급 |
| trace | 첫 요청은 `traceparent` 없이 호출, 응답 `traceparent`를 후속 요청에 릴레이 |
| 테스트 데이터 | `task dev:synthetic`과 `task dev:synthetic:run`이 내부 fixture setup을 먼저 실행하고, 예약/결제/티켓/알림 record는 매 실행 생성 |
| 실패 처리 | 자동 cancel/refund/cleanup 없이 실패 상태를 남김 |
| 실행 결과 | 1차는 Job 상태와 k6 JSON line 로그, Collector `filelog` -> Loki 조회로 확인 |
| k6 metric remote write | 1차에서는 제외, 2차 검토 |

## 실행 구조

배포 환경의 기본 실행 경로는 클러스터 내부 CronJob에서 외부 Ingress DNS를 호출하는 구조다.

```text
synthetic CronJob
-> external Ingress DNS
-> AWS Load Balancer / Ingress
-> Kong
-> service
-> database / kafka
```

이 경로는 실제 사용자 요청과 가장 가깝다. DNS, TLS, Load Balancer, Ingress, Kong route, 서비스 연결, 런타임 의존성을 함께 확인할 수 있다.

내부 Kong DNS 경로는 보조 smoke로 유지한다.

```text
synthetic CronJob
-> internal Kong DNS
-> Kong
-> service
```

두 경로를 함께 두면 실패 원인을 더 빠르게 좁힐 수 있다.

```text
external 실패, internal 성공
-> DNS / TLS / Load Balancer / Ingress / 외부 Kong route 문제 후보

external 실패, internal 실패
-> Kong route / service / database / kafka / 공통 의존성 문제 후보
```

## 시나리오

1차 시나리오는 smoke와 full journey를 나눈다.

```text
internal-smoke
-> 내부 Kong DNS 기준 생존 확인

external-smoke
-> 외부 Ingress DNS 기준 진입 경로 생존 확인

external-journey
-> 외부 Ingress DNS 기준 로그인부터 예매 완료까지 확인
```

full journey는 한 번의 k6 실행 안에서 순차적으로 진행한다.

```text
customer login
-> concert 조회
-> showtime 조회
-> available seat 분산 선택
-> reservation 생성
-> payment 승인
-> ticket 발급 확인
-> notification 확인
```

k6의 `options.scenarios`는 부하 패턴이 필요할 때 사용한다. 사용자 여정을 한 번에 따라가는 1차 synthetic E2E는 `default()` 안에서 `group()` 단위로 순차 호출하는 구성이 더 단순하다.

## 인증과 계정

배포 환경의 credential source는 Kubernetes Secret이다.

```text
synthetic CronJob
-> Secret에서 synthetic customer email/password 읽기
-> POST /auth/login
-> JWT 발급
-> JWT로 예약/결제/티켓 flow 실행
```

기준:

- 사용자 신뢰와 권한 판단은 JWT를 기준으로 한다.
- access token은 Secret에 저장하지 않고 매 실행마다 login으로 발급한다.
- `/auth/demo-accounts`는 계정 discovery와 seed smoke check 용도로만 사용한다.
- demo account endpoint를 password/token source로 사용하지 않는다.
- 반복 CronJob은 customer 계정을 기본으로 사용한다.
- provider/admin은 fixture setup 또는 별도 시나리오가 필요할 때만 사용한다.

## Trace

현재는 BFF가 없으므로 서버 생성 trace를 클라이언트와 k6가 릴레이하는 방식으로 간다.

```text
첫 요청
-> traceparent 없이 호출
-> 서버 또는 gateway가 trace 생성
-> 응답 traceparent 저장

후속 요청
-> 저장한 traceparent를 릴레이
-> 서버가 유효성 검증 후 관측성 상관관계 목적으로만 이어받음
```

보안 기준:

- `traceparent`는 인증, 권한, 감사 로그 판단에 사용하지 않는다.
- 사용자 신뢰는 JWT를 기준으로 한다.
- 서버의 sampling 정책은 클라이언트가 보낸 sampled flag보다 우선한다.
- `tracestate`는 1차 계약에서 사용하지 않는다.
- `X-Trace-Id`, `X-Request-Id`는 화면 오류 신고와 로그 검색을 돕는 보조 ID로만 사용한다.

synthetic 요청에는 다음 헤더를 남긴다.

```text
X-Synthetic-Traffic: true
X-Request-Id: synthetic-<run-id>
```

## 테스트 데이터

테스트 데이터는 모두 고정하거나 매번 정리하지 않는다. 고정할 것, 주기적으로 만들 것, 매 실행마다 쌓을 것을 나눈다.

```text
고정
-> synthetic provider/customer 계정
-> synthetic venue
-> synthetic concert template

주기적 생성
-> synthetic showtime
-> showtime별 synthetic seats

매 실행 생성 후 누적
-> reservation
-> payment
-> ticket
-> notification 업무 record
```

로컬 개발 진입점은 별도 사용자용 fixture task를 노출하지 않는다. `task dev:synthetic`은 CronJob 배포 후 내부 `setup-fixture` k6 Job을 한 번 실행하고, `task dev:synthetic:run`도 수동 full journey Job을 만들기 전에 같은 fixture 준비를 먼저 실행한다.

fixture setup은 provider/admin/customer credential Secret을 사용해 기존 API surface로 데이터를 만든다.

```text
provider/admin/customer login
-> provider venue 생성
-> provider concert 생성
-> provider showtime 생성
-> provider seat-map 업로드
-> provider sale-policy 제출
-> admin sale-policy 승인
-> admin open schedule 설정
-> admin sales start
-> public performances/seats 조회로 확인
```

좌석 선택은 synthetic 전용 target API를 만들지 않고, k6가 실제 사용자와 같은 공개 조회 API를 이용한다.

```text
1. synthetic concert 조회
2. active synthetic showtime 목록 조회
3. synthetic_run_id hash로 showtime index 선택
4. 선택한 showtime의 available seat 목록 조회
5. synthetic_run_id hash로 seat candidate 선택
6. 예약 실패 시 같은 showtime 안에서 다음 seat 후보로 제한적으로 retry
```

매 실행 cleanup은 하지 않는다. 30일이 지난 synthetic 업무 데이터만 별도 retention job에서 정리한다.

이 문서는 서비스 DB 업무 record의 생성과 정리만 다룬다. audit/event/log/trace/metric 보존 정책은 관측성 또는 감사 로그 아키텍처에서 다룬다.

## 실패 처리

full journey가 중간에 실패하면 자동 보상 동작을 실행하지 않는다. 성공한 단계까지의 업무 record와 실패 상태를 남긴다.

```text
reservation 생성 성공
-> payment 실패
-> reservation 상태를 남김
-> 자동 cancel 호출하지 않음

payment 승인 성공
-> ticket 발급 timeout
-> payment 상태를 남김
-> 자동 refund/cancel 호출하지 않음
```

실패 상태를 남기는 이유는 DB 상태, trace, request id, k6 로그를 함께 보고 실패 지점을 추적하기 위해서다.

실패 시 남겨야 하는 정보:

```text
synthetic_run_id
scenario
step
target_base_url
http_status
error_message
X-Request-Id
X-Trace-Id 또는 trace_id
reservation_id
payment_id
ticket_id
```

동적 ID는 metric label로 사용하지 않는다. DB record, structured log, k6 summary 또는 Job log에서만 확인한다.

## 실행 결과 확인

1차 구현에서는 k6 metric을 Prometheus로 직접 보내지 않는다.

```text
k6
-> process exit code
-> Kubernetes Job succeeded/failed
-> Pod log
-> OpenTelemetry Collector
-> Loki
```

k6 시나리오는 `check()`와 `thresholds`를 함께 사용해 실패 시 non-zero exit code로 종료한다.

```javascript
export const options = {
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};
```

운영 확인 흐름:

```text
1. CronJob schedule 확인
2. Job succeeded/failed 확인
3. 실패한 Pod log 확인
4. 실패 step과 request id 확인
5. Tempo/Loki/DB에서 같은 요청 흐름 추적
```

k6 Job 로그와 애플리케이션 로그는 stdout/stderr로 출력하고, OpenTelemetry Collector가 Kubernetes container log를 수집해 Loki로 보낸다. 서비스는 Loki를 직접 알지 않는다.

k6 Prometheus remote write는 시나리오 구조, 단계 이름, label 정책이 안정된 뒤 2차로 검토한다. 서비스 metric은 서비스가 직접 노출하는 Prometheus metric으로 별도 관리한다.

## 실행 주기

로컬 개발 환경은 빠른 피드백을 위해 1분 주기를 사용한다.

```text
values/local.yaml
-> schedule="* * * * *"
-> 내부 Kong DNS 또는 로컬 Ingress 대상
```

배포 환경은 외부 Ingress DNS를 기본 대상으로 하며 5-10분 주기를 후보로 둔다.

```text
values/aws-dev.yaml
-> schedule="*/5 * * * *" 또는 "*/10 * * * *"
-> 외부 Ingress DNS 대상
```

CronJob은 `concurrencyPolicy: Forbid`를 사용한다. 이전 실행이 끝나기 전에 다음 실행이 겹치면 실패 해석과 테스트 데이터 상태가 흐려질 수 있다.

## Repo별 책임

```text
workspace
-> 목적, 검증 범위, 성공 기준, 운영 판단 기준 문서화

gitops
-> k6 시나리오, 실행 이미지, Helm chart, CronJob, values, Taskfile 관리

service
-> synthetic 계정, fixture, API 계약이 필요할 때만 지원

infra
-> 별도 실행 노드나 네트워크 기반이 필요해질 때만 관여
```

현재 1차 범위는 `workspace`, `gitops`에 둔다. 서비스 변경은 synthetic 계정이나 fixture API가 필요해질 때 별도로 다룬다.

## 완료 기준

1차 설계의 완료 기준은 다음과 같다.

- k6 기반 synthetic CronJob이 GitOps로 배포된다.
- local에서는 1분 주기로 빠르게 feedback을 볼 수 있다.
- 배포 환경에서는 외부 Ingress DNS 기준 smoke 또는 full journey가 반복 실행된다.
- 내부 Kong DNS smoke로 원인 분리용 보조 경로를 확인할 수 있다.
- 매 실행마다 JWT를 발급받아 실제 사용자 flow에 가까운 요청을 보낸다.
- traceparent 릴레이, `X-Request-Id`, `X-Trace-Id`로 실패 요청을 추적할 수 있다.
- showtime/seats는 주기적으로 준비되고, reservation/payment/ticket/notification record는 실행마다 생성된다.
- 실패 시 자동 cleanup 없이 실패 상태가 남는다.
- 실행 결과는 Kubernetes Job 상태와 Collector를 거친 k6/Loki 로그로 확인할 수 있다.
