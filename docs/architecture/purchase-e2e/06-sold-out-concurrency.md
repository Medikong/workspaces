# 시나리오 06: 동시 품절과 실패 결제 후 재고 해제

## 목적

여러 고객이 같은 상품을 동시에 주문할 때 재고보다 많이 판매되지 않는지, 그리고 결제 실패로 해제된 재고를 다른 고객이 다시 구매할 수 있는지 검증한다.

이 문서에서 말하는 동시성은 순차 Postman 요청이 아니라 barrier로 동시에 시작한 여러 HTTP 요청이다.

```text
42개 재고
-> customer A/B가 포함된 병렬 주문 5개 × 수량 10
-> 성공 4건, 품절 1건
-> 성공 주문 하나의 결제 실패
-> 정확히 10개 재고 해제
-> 다른 고객이 해제 재고를 주문
```

## 사전 조건

- 전용 drop/product에 **정확히 42개**의 예약 가능한 재고가 있다.
- customer A와 customer B 모두 실제 로그인으로 JWT를 얻을 수 있다.
- 테스트 시작 전 활성 reservation/order가 없고, 시작 수량을 결과 파일에 기록했다.
- 동시 요청을 지원하는 실행기와 barrier가 준비됐다.

재고가 42개가 아니거나 이전 실행의 상태가 남아 있으면 공유 DB를 초기화하지 않는다. 해당 fixture를 새로 준비하거나 `BLOCKED`로 기록한다.

## 입력과 실행 방식

| 항목 | 값 또는 규칙 |
| --- | --- |
| 시작 재고 | 42 |
| 동시 요청 수 | 5 |
| 요청당 수량 | 10 |
| 기대 분포 | `201 × 4`, `409 × 1` |
| 사용자 | customer A/B에 요청을 분산 |
| 멱등성 키 | 모든 worker마다 고유 |
| 요청 ID | `purchase-06-<run_id>-worker-<n>` |

동시성 실행기 자체가 순차 동작하면 결과는 무효다. 모든 worker가 준비된 뒤 같은 barrier release 시점에서 요청을 시작했는지 실행 로그에 남긴다.

## 절차와 기대 결과

| 순서 | 요청 또는 확인 | 기대 결과 |
| ---: | --- | --- |
| 1 | 5개 worker 준비 | 각 worker의 사용자·request ID·멱등성 키가 고유 |
| 2 | barrier release 후 주문 생성 | `201` 네 건, `409` 한 건 |
| 3 | 성공 주문 집계 | 성공 수량 합계가 40이고 42를 넘지 않음 |
| 4 | 품절 응답 확인 | `409`, 서비스가 정의한 sold-out 오류 계약 |
| 5 | 성공 주문 하나의 결제 실패 | Payment `FAILED`, Order `PAYMENT_FAILED` |
| 6 | 재고 재확인 | 정확히 10개 해제 |
| 7 | 반대 사용자로 추가 주문 | 해제된 재고 범위 안에서 주문 성공 |

## 관측성 증거

| 신호 | 확인 내용 |
| --- | --- |
| Prometheus | Order endpoint의 RPS, 2xx/4xx/5xx 분포, p95 변화 |
| Loki | worker별 request ID와 sold-out/재고 해제 로그 연결 |
| Tempo | 경쟁 요청의 trace와 결제 실패 이후 비동기 span 확인 |
| Kubernetes | Order Pod restart·readiness·이벤트, DB/Kafka 이상 유무 |

`409`는 이 시나리오에서 기대되는 business 결과다. 이를 일반 5xx 장애와 섞어 실패율로 해석하지 않는다.

## 부하 테스트 설계

06은 지속 journeys/min보다 한 순간에 몇 명이 같은 재고를 경쟁하는지가 중요하다. 모든 round는 새로운 42-unit fixture 또는 완전히 격리된 fixture에서 실행한다.

| 단계 | 동시 worker | 반복 round | 42개 재고의 기대 결과 |
| --- | ---: | ---: | --- |
| F | 5 | 1 | `201 × 4`, `409 × 1` |
| L1 | 5 | 3 | 매 round 성공 수량 ≤42, oversell 0 |
| L2-A | 10 | 3 | 매 round `201 × 4`, 나머지는 기대된 품절 |
| L2-B | 20 | 3 | abort 기준이 없을 때만 실행, oversell 0 |

Round 사이에 공유 DB를 초기화하지 않는다. 전용 fixture를 새로 만들거나 안전한 provisioning 절차로 동일한 시작 상태를 보장한다. fixture를 되돌릴 수 없으면 다음 round를 실행하지 않고 `BLOCKED`로 기록한다.

부하 결과에는 worker 시작 시각 분포, 응답 코드 분포, 성공 수량 합계, DB 최종 예약 수량, p50/p95, lock/DB 오류, 5xx를 포함한다.

## 카오스 테스트 설계

카오스 round는 정상 4/1 분포를 증명하기 위한 round와 분리한다.

```text
5개 worker barrier 준비
-> barrier release 직후 확인한 Order Pod 하나 삭제
-> 클라이언트 응답과 DB 최종 상태 저장
-> replacement Ready 확인
-> 새로운 fixture로 정상 5-worker round 재실행
```

단일 replica이면 모든 in-flight 요청이 실패할 수도 있으므로 카오스 round에서 `201 × 4`, `409 × 1`을 강제하지 않는다. 대신 다음 불변식을 검증한다.

- 클라이언트가 응답을 잃었더라도 실제 성공 수량은 stock을 넘지 않는다.
- 동일 idempotency key로 재확인했을 때 중복 주문이 생기지 않는다.
- replacement Ready 후 새 fixture의 정상 round가 다시 기대 분포를 만든다.
- 장애 시점, endpoint 제거, Ready 복구, 첫 정상 응답 시간을 각각 기록한다.

## 통과와 실패 기준

- `PASS`: 성공 수량이 재고를 넘지 않고 정확히 `201 × 4`, `409 × 1`이 발생하며, 결제 실패 후 정확한 수량이 해제되고 다른 사용자가 이를 주문한다.
- `FAIL`: 재고 초과 판매, 예상 밖 5xx, worker별 ID 중복, 순차 실행, 재고 과다/미해제, 서로 다른 사용자의 상태 혼합.
- `BLOCKED`: 두 JWT 사용자, 42-unit fixture, 실제 병렬 실행기, 재고 확인 방법 중 하나가 없다.
- `RECOVERY_PASS`: 카오스 round에서도 oversell과 중복 주문이 없고, Order 복구 후 정상 round가 다시 통과한다.

## 기존 테스트와의 관계

`services/tests/e2e/scenarios/06-sold-out-concurrency-flow.postman_collection.json`은 재고 소진과 결제 실패 후 해제를 순차적으로 검증한다. 실제 동시성의 출발점은 `services/tests/e2e/scripts/purchase-concurrency-smoke.py`이며, AWS용 실행기는 JWT·ingress·두 사용자·결과 증거를 추가해야 한다.
