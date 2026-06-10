# Synthetic 실패 상태 처리 결정

결정일: 2026-06-10

열린 질문:

```text
full journey 실패 시 보상 동작을 넣을지, 실패 상태를 남겨 디버깅하기 쉽게 둘지 결정해야 한다.
```

## 결정

full journey가 중간에 실패하면 자동 보상 동작을 실행하지 않고, 성공한 단계까지의 업무 record와 실패 상태를 남긴다.

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

이 결정의 목적은 실패를 숨기지 않고, DB 상태와 trace/log/request id를 함께 확인할 수 있게 만드는 것이다.

## 실패의 의미

여기서 실패는 k6 synthetic full journey를 순서대로 실행하다가 중간 단계가 기대 조건을 만족하지 못한 경우를 뜻한다.

예시 flow:

```text
1. customer login
2. concert 조회
3. showtime 조회
4. seat 선택
5. reservation 생성
6. payment 승인
7. ticket 발급 확인
8. notification 확인
```

실패 예시:

```text
reservation 생성 성공
-> payment 승인 실패

payment 승인 성공
-> ticket 발급 polling timeout

ticket 발급 성공
-> notification 확인 timeout
```

## 보상 동작을 넣지 않는 이유

보상 동작은 데이터 정리에는 도움이 되지만 synthetic E2E의 목적과 충돌할 수 있다.

자동 보상 동작의 문제:

- 실패 원인이 되는 중간 상태를 지워버릴 수 있다.
- cancel/refund 자체가 실패하면 원인 분석이 더 복잡해진다.
- 실패 trace와 보상 trace가 섞여 실제 실패 지점을 흐릴 수 있다.
- synthetic의 목적이 cleanup 성공 여부로 바뀔 수 있다.

따라서 synthetic runner는 장애를 발견하면 상태를 되돌리기보다 실패 지점을 명확히 기록하고 종료한다.

## 남겨야 하는 정보

k6 runner는 실패 시 최소한 다음 정보를 남긴다.

```text
synthetic_run_id
scenario
step
target_base_url
http_status
error_message
X-Request-Id
X-Trace-Id 또는 traceparent에서 추출한 trace_id
reservation_id
payment_id
ticket_id
```

단, 동적 ID는 metric label로 사용하지 않는다. DB record, structured log, k6 summary 또는 Job log에서만 확인한다.

## Trace 확인 기준

실패 상태를 남기는 이유 중 하나는 trace 연결이 유의미하게 만들어졌는지 확인하기 위해서다.

확인 흐름:

```text
1. k6 Job log에서 실패 step 확인
2. X-Request-Id 또는 X-Trace-Id 확인
3. Tempo에서 trace 조회
4. 실패 전까지 생성된 service span 확인
5. DB에서 reservation/payment/ticket 상태 확인
```

예를 들어 `payment 승인 성공 -> ticket 발급 timeout`이라면, payment까지의 HTTP trace와 payment-approved 이후 consumer trace가 이어지는지 확인할 수 있어야 한다.

## 예외

실제 외부 비용이 발생하는 결제 provider를 호출하는 환경에서는 이 결정만으로 충분하지 않다.

해당 환경에서는 다음 중 하나를 반드시 선택한다.

```text
sandbox/fake payment만 사용
또는
refund/cancel 보상 정책을 별도 문서로 정의
```

현재 지속 synthetic E2E는 실제 비용이 발생하지 않는 결제 경로를 전제로 한다.

## 30일 정리와의 관계

실패 상태는 매 실행 직후 정리하지 않는다. 대신 synthetic 테스트 데이터 생성 결정에 따라 30일이 지난 synthetic 업무 record만 별도 retention job에서 정리한다.

관련 문서:

- [Synthetic 테스트 데이터 생성 결정](test-data-generation-decision.md)

## 최종 기준

```text
full journey 실패
-> 자동 cancel/refund/cleanup 실행하지 않음

성공한 단계의 업무 record
-> 그대로 남김

실패 원인 확인
-> k6 log, X-Request-Id, X-Trace-Id, traceparent, DB 상태로 추적

정리
-> 매 실행 cleanup 없음
-> 30일 retention job에서 synthetic 업무 데이터 정리
```
