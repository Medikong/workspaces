# 시나리오 05: 결제 실패와 재고 해제

## 목적

결제 거절이 결제 서비스에만 남지 않고 주문 상태, 재고 예약, 중복 처리 방지까지 일관되게 반영되는지 검증한다.

```text
주문 생성: PENDING_PAYMENT
-> 결제 거절: FAILED(card_declined)
-> 주문 반영: PAYMENT_FAILED
-> 예약 재고 해제
-> 동일 이벤트 또는 요청의 중복 처리 없음
```

## 사전 조건

시나리오 04의 공통 사전 조건을 모두 적용한다. 추가로 전용 fixture의 시작 재고 수량을 기록하고, 이번 실행에 사용할 주문 수량을 명시한다.

이 시나리오는 시나리오 04 결과에 의존하지 않는다. 별도의 `run_id`와 fixture 상태로 독립 실행한다.

## 입력과 실행 방식

| 항목 | 규칙 |
| --- | --- |
| 사용자 | 전용 synthetic customer A |
| 주문 수량 | 전용 fixture에서 명시적으로 정한 수량 |
| 실패 이유 | `card_declined` |
| 요청 ID | `purchase-05-<run_id>-<step>` |
| 멱등성 키 | 주문과 결제 실패 요청에 서로 다른 키 사용 |
| 결제 | mock/sandbox failure endpoint만 사용 |

## 절차와 기대 결과

| 순서 | 요청 또는 확인 | 기대 결과 |
| ---: | --- | --- |
| 1 | 주문 생성 | `201`, `PENDING_PAYMENT`, 예약 수량 증가 |
| 2 | 결제 실패 요청 | `201`, Payment `FAILED`, 이유 `card_declined` |
| 3 | 결제 조회 | Payment ID·주문 ID·실패 이유가 유지됨 |
| 4 | 주문 조회를 bounded polling | `PAYMENT_FAILED`, Payment ID 일치 |
| 5 | 재고 확인 | 예약된 수량이 정확히 해제됨 |
| 6 | 같은 멱등성 키 또는 동일 실패 이벤트 재전달 | Payment/Order의 terminal state와 재고가 한 번만 처리됨 |
| 7 | 확인 구매 시도 | 해제된 수량만큼 다시 주문 가능한지 확인 |

“실패 결제”인데 주문이 `CONFIRMED`가 되거나 재고가 중복 해제되면 즉시 `FAIL`이다.

## 관측성 증거

| 신호 | 확인 내용 |
| --- | --- |
| Prometheus | Payment 실패와 Order 실패에 해당하는 요청·오류·지연 delta |
| Loki | 동일 request ID 또는 correlation ID로 결제 실패, 주문 반영, 재고 해제 로그 추적 |
| Tempo | Payment 실패 HTTP span과 Kafka/outbox consumer span의 연결 여부 |
| Kubernetes | worker/consumer restart, consumer lag, Pod event 변화 |

비동기 반영이 지연되면 timeout만 기록하지 말고 현재 Order/Payment 상태와 소비자 lag를 함께 남긴다.

## 부하 테스트 설계

결제 실패 journey 한 번을 `주문 생성 → card_declined 발생 → PAYMENT_FAILED 확인 → 재고 해제 확인`으로 정의한다.

| 단계 | 트래픽 | 실행 시간 | 확인 항목 |
| --- | ---: | ---: | --- |
| F | 1 iteration | 완료할 때까지 | 실패 계약과 재고 해제 |
| L1 | 6 failure journeys/min | 5분 | 실패 처리 완료율, p95, 재고 해제 지연, consumer lag |
| L2-A | 12 failure journeys/min | 5분 | 중복 terminal state와 lag 증가 여부 |
| L2-B | 24 failure journeys/min | 5분 | abort 기준이 없을 때만 실행 |

이 테스트에서 `card_declined`는 의도한 업무 결과다. 따라서 Payment `FAILED` 응답을 시스템 오류율로 세지 않는다. 예상 밖 5xx, timeout, `CONFIRMED` 전이는 별도 실패로 집계한다.

### 멱등성 부하

전체 iteration의 일부에는 동일 idempotency key 재요청 또는 동일 실패 이벤트 재전달을 한 번 추가한다. 비율은 L1/L2 모두 10%로 고정하고, 중복 Payment/Order terminal record와 재고 과다 해제가 0건인지 확인한다.

## 카오스 테스트 설계

L1 failure traffic이 흐르는 동안 결제 실패를 비동기로 반영하는 정확한 Payment API 또는 worker Pod 하나를 지정해 삭제한다.

- 대상 Pod의 Deployment owner, 이름, UID를 먼저 기록한다.
- 대상이 단일 replica이면 이는 failure isolation이 아니라 recovery drill로 기록한다.
- Pod 역할을 식별할 수 없거나 결제 실패 이벤트가 어느 worker에서 처리되는지 확인할 수 없으면 카오스 단계는 `BLOCKED`로 둔다.
- 복구 후 미처리 이벤트가 bounded time 안에 처리되고, 각 주문이 정확히 한 번 `PAYMENT_FAILED`가 되는지 확인한다.

카오스 중 확인할 핵심 수치는 pending event 수, consumer lag, 재고 해제 지연, replacement Ready 시간, 중복 terminal record 수다.

## 통과와 실패 기준

- `PASS`: `FAILED → PAYMENT_FAILED → 정확한 재고 해제`가 한 번만 발생하고, 재시도·중복 전달 후에도 상태가 바뀌지 않는다.
- `FAIL`: false confirmation, 재고 미해제·과다 해제, 중복 terminal record, timeout 후 원인을 확인할 수 없는 경우.
- `BLOCKED`: 결제 failure fixture, 재고 조회 방법, 비동기 관측성 중 하나가 준비되지 않았다.
- `RECOVERY_PASS`: Payment Pod 장애 중 쌓인 작업이 복구 후 한 번씩 처리되고 lag와 재고 해제 지연이 정상 범위로 돌아왔다.

## 기존 테스트와의 관계

로컬 기능 확인은 `services/tests/e2e/scenarios/05-payment-failure-flow.postman_collection.json`과 payment failure idempotency 테스트가 담당한다. AWS 실행에서는 실제 JWT와 ingress를 사용하고 재고·비동기 증거를 추가한다.
