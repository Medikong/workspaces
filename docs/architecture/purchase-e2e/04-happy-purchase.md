# 시나리오 04: 정상 구매

## 목적

고객 한 명이 실제 Istio ingress를 통과해 주문을 만들고, mock 또는 sandbox 결제를 승인한 뒤 주문 확정과 알림까지 정상적으로 완료되는지 검증한다.

이 시나리오는 “HTTP 201을 한 번 받았다”가 아니라 다음 구매 생명주기가 끝까지 이어지는지 확인한다.

```text
상품 조회
-> 주문 생성: PENDING_PAYMENT
-> 결제 승인: APPROVED
-> 주문 확정: CONFIRMED
-> ORDER_CONFIRMED 알림 1건
```

## 사전 조건

- AWS dev Argo CD 애플리케이션과 Istio ingress gateway가 Healthy 상태다.
- 전용 synthetic customer 계정과 유효한 JWT를 준비했다.
- 전용 drop/product 재고가 있고, 해당 `run_id`의 활성 주문이 없다.
- Catalog, Order, Payment, Notification의 readiness와 Kafka/PostgreSQL 상태를 기록했다.
- Prometheus, Loki, Tempo 조회 경로가 동작하는지 확인했다.

사전 조건 하나라도 만족하지 않으면 API 호출을 진행하지 않고 `BLOCKED`로 기록한다.

## 입력과 실행 방식

| 항목 | 규칙 |
| --- | --- |
| 진입 URL | 확인된 AWS Istio ingress URL 하나만 사용 |
| 인증 | 매 실행 로그인으로 발급한 Bearer JWT |
| 사용자 | 전용 synthetic customer A |
| 요청 ID | `purchase-04-<run_id>-<step>` |
| 멱등성 키 | `purchase-04-<run_id>-order`, `purchase-04-<run_id>-payment` |
| 결제 수단 | 실제 비용이 발생하지 않는 mock/sandbox 경로 |

실행기는 Docker service DNS와 caller-supplied `X-User-*` 헤더를 사용하면 안 된다.

## 절차와 기대 결과

| 순서 | 요청 또는 확인 | 기대 결과 |
| ---: | --- | --- |
| 1 | 상품 목록과 선택 상품 조회 | `200`, 전용 fixture의 drop/product/price 확보 |
| 2 | 주문 생성 | `201`, 주문 상태 `PENDING_PAYMENT`, 주문 ID 확보 |
| 3 | mock/sandbox 결제 승인 | `201`, 결제 상태 `APPROVED`, 주문 ID·금액 일치 |
| 4 | 주문 조회를 bounded polling | 제한 시간 안에 `CONFIRMED` |
| 5 | 알림 조회 또는 이벤트 확인 | 같은 주문 ID의 `ORDER_CONFIRMED`가 정확히 1건 |
| 6 | 동일 멱등성 키 재호출 | 새 주문·새 결제·새 알림이 추가 생성되지 않음 |

Polling은 무한 반복하지 않는다. 제한 시간을 넘기면 `FAIL`로 끝내고, 현재 주문·결제·알림 상태와 request ID를 남긴다.

## 관측성 증거

| 신호 | 확인 내용 |
| --- | --- |
| Prometheus | 실행 시간 창의 Order/Payment/Notification 요청 수, 5xx 증가량, p95 지연 |
| Loki | `run_id` 또는 request ID로 주문·결제·알림 완료 로그 연결 |
| Tempo | ingress → Order → Payment 및 비동기 처리 span 연결 |
| Kubernetes | 관련 Pod restart, readiness, event 변화 없음 또는 기록된 변화 |

각 증거는 UTC 시작·종료 시각과 query 원문을 함께 결과 문서에 남긴다.

## 부하 테스트 설계

정상 구매 journey 한 번을 `상품 조회 → 주문 생성 → 결제 승인 → 주문 확정 → 알림 확인`으로 정의한다.

| 단계 | 트래픽 | 실행 시간 | 확인 항목 |
| --- | ---: | ---: | --- |
| F | 1 iteration | 완료할 때까지 | 기능 계약과 JWT/ingress 경로 |
| L1 | 6 journeys/min | 5분 | 성공률, E2E p50/p95, 단계별 p95, 5xx, 자원 사용량 |
| L2-A | 12 journeys/min | 5분 | L1 대비 p95·오류율·Kafka lag 변화 |
| L2-B | 24 journeys/min | 5분 | abort 기준이 없을 때만 실행 |

각 iteration은 고유 `run_id` 하위의 request ID와 idempotency key를 사용한다. 부하 결과는 단순 HTTP 성공뿐 아니라 `CONFIRMED`와 정확히 한 건의 `ORDER_CONFIRMED` 알림까지 완료된 iteration 비율로 계산한다.

### 부하 통과 기준

- 예상 밖 5xx와 timeout이 없고, terminal state 중복이 없다.
- 완료된 iteration의 주문·결제·알림 수가 일치한다.
- 각 단계의 raw count, p50, p95, 최대 RPS를 산출할 수 있다.
- p95 1초 같은 목표값은 사전에 임의로 합격 기준으로 만들지 않는다. L1을 기준선으로 두고 L2의 증가율을 결과로 기록한다.

## 카오스 테스트 설계

L1과 동일한 6 journeys/min 트래픽을 유지한 상태에서 정확히 확인한 Order Pod 하나를 삭제한다.

```text
1분 정상 부하
-> Order Pod 이름·UID 확인 후 1개 삭제
-> replacement Pod Ready까지 계속 요청
-> Ready 후 2분 추가 요청
```

현재 Order가 단일 replica이면 장애 중 5xx/timeout은 발생할 수 있다. 이 단계의 핵심 판정은 무중단이 아니라 다음이다.

- 장애 전·중·후 요청 성공/실패 수가 구분되어 기록됐는가
- replacement Pod가 제한 시간 안에 Ready가 됐는가
- 클라이언트 실패와 무관하게 oversell 또는 중복 주문·결제·알림이 생기지 않았는가
- 복구 후 정상 journey가 다시 완료되는가

정상 부하 PASS와 카오스 복구 PASS는 별도 결과로 기록한다.

## 통과와 실패 기준

- `PASS`: 기능 smoke와 정상 부하에서 모든 business 상태가 충족되고, 알림이 정확히 한 건이며, 네 가지 관측성 증거를 수집했다.
- `FAIL`: 주문/결제/알림 상태가 기대와 다르거나 중복 terminal state가 생겼다.
- `BLOCKED`: JWT 발급, ingress, fixture, Prometheus/Loki/Tempo 중 하나가 준비되지 않았다.
- `RECOVERY_PASS`: 카오스 중 영향이 수치로 기록되고 Order가 제한 시간 안에 복구됐으며 데이터 불변식이 유지됐다.

## 기존 테스트와의 관계

로컬 기준 구현은 `services/tests/e2e/scenarios/04-customer-drop-purchase-happy-path.postman_collection.json`에 있다. 이 문서는 그 기능 기대값을 AWS Istio 환경에서 검증하기 위한 운영 기준이다.
