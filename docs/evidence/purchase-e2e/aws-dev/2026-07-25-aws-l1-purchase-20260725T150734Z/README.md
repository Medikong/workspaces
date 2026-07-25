# AWS 구매 L1 부하 실험

## 판정

`PASS (L1 functional and asynchronous delivery gate)`

AWS dev의 실제 Istio ingress를 통해 5분 동안 30개의 정상 구매 여정을 실행했다. 각 여정은 실제 테스트 계정 로그인, 주문 생성, Kafka를 통한 Payment 주문 투영, mock 결제 승인, Order 확정 순서로 수행했다. 이 결과는 짧은 개발 환경 실험의 관측값이며, 30일 SLO나 production 용량 보장을 뜻하지 않는다.

## 목표와 부하 프로파일

| 항목 | 값 |
| --- | ---: |
| Run ID | `aws-l1-purchase-20260725T150734Z` |
| 시작 시각 (UTC) | `2026-07-25T15:07:34Z` |
| 실행 시간 | 292초 |
| 요청 여정 | 30건 |
| 목표 속도 | 분당 6건, 10초 간격 |
| 경로 | Istio ingress → Auth → Order → Kafka → Payment → Order |
| 테스트 데이터 | 전용 synthetic product, 수량 1 |

## 사용자 여정 결과

| 측정 항목 | 결과 | 판정 |
| --- | ---: | --- |
| 인증 intent | 201 | PASS |
| 이메일 로그인 | 200 | PASS |
| 주문 생성 | 30 / 30 (100%) | PASS |
| 결제 승인 | 30 / 30 (100%) | PASS |
| 결제 409 | 0 | PASS |
| 주문 확정 | 30 / 30 (100%) | PASS |
| 미확정 주문 | 0 | PASS |
| 결제 투영 대기 재시도 | 28회 | 관측 |
| 전체 여정 p50 | 2,199ms | 관측 |
| 전체 여정 p95 | 2,257ms | 관측 |

`payment_retries=28`은 Payment가 `order.created` Kafka 투영을 기다리는 정상적인 짧은 대기였다. 최종 결제 409, 기타 결제 오류, 미확정 주문은 모두 0건이었다.

## 비동기·인프라 증거

실행 직후 AWS SSM을 통해 Kubernetes, PostgreSQL, Kafka를 읽기 전용으로 재수집했다.

| 신호 | 관측값 | 의미 |
| --- | ---: | --- |
| Order v1 Pod | 2 / 2 Ready, restart 0 | 다중 replica 정상 |
| Order v2 Pod | 2 / 2 Ready, restart 0 | 다중 replica 정상 |
| Payment Pod | 2 / 2 Ready, restart 0 | 다중 replica 정상 |
| Order `order.created` outbox | 30 / 30 published, pending 0 | Payment 투영 입력 전달 완료 |
| Order `inventory.changed` outbox | 60 / 60 published, pending 0 | 예약·판매 재고 투영 전달 완료 |
| Order `notification.requested` outbox | 30 / 30 published, pending 0 | 구매 알림 이벤트 전달 완료 |
| Payment `known_orders` | 30건 생성 | Payment가 30 주문 모두 인지 |
| Payment `order.created` consumer lag | 0 | Kafka 소비가 추적 시점에 따라잡음 |
| Order DB active connections | 13 | 기준선 11 대비 +2 |
| Payment DB active connections | 18 | 기준선 19 이하 |

Pod는 worker-app-1~4에 분산된 상태로 관측됐다. 이 표는 실행이 끝난 직후의 스냅샷이며, 피크 CPU·메모리와 HTTP p95 시계열은 Grafana 화면에서 같은 UTC 구간으로 별도 캡처해야 한다.

## 실행 전 복구 이력

첫 스모크에서 Payment 409가 발생해 L1 실행을 중단했다. 조사 결과, 과거 AWS dev 테스트 주문 22건이 만료됐지만 해당 재고 예약 수가 부족해 expiry worker가 `reservedQuantity=-10` 검증 오류로 중단됐다. 그 결과 Order outbox가 발행되지 않아 Payment가 새 주문을 알지 못했다.

현재 결제 대기 주문이 0건인 것을 확인한 뒤, 해당 과거 만료 주문 22건을 `EXPIRED`로 정리하고 연결된 미발행 outbox 44건을 dead-letter 처리했다. 영향 재고 2행의 예약 수를 0으로 정합화했다. 이후 Order v1/v2를 GitOps commit `3236a06`으로 재시작하고, 정상 구매 스모크와 이 L1을 통과했다.

이는 AWS dev 테스트 데이터 정리이며 production 복구 절차나 내구성 보장을 의미하지 않는다. expiry worker가 예약 불일치 데이터를 어떻게 격리할지에 대한 코드 수준 개선은 별도 후속 항목이다.

## 관측성과 발표 자료 사용

- Grafana는 `2026-07-25 15:07:34Z`부터 약 5분 범위로 맞춘다.
- 발표 영상에는 Gateway/Mesh의 RPS·5xx·p95와 Kubernetes의 Pod CPU·메모리·재시작을 실시간으로 녹화한다.
- 이 문서의 DB·Kafka 표는 영상과 겹치지 않는 정적 증거로 사용한다.
- 자동 Grafana 스크린샷은 이 run에서 수집하지 못했으므로 `UNMEASURED`다. 수치를 문서에 추정해 채우지 않는다.

## 다음 진입 조건

1. L2 동시성 또는 확장 부하를 별도 Run ID로 실행하고 같은 outbox·lag gate를 통과한다.
2. 그 뒤 단일 Order Pod eviction의 복구시간 드릴과 30초 NetworkChaos를 실행한다.
3. 각 장애 실험에서 5xx, outbox pending, Kafka lag, 미확정 주문이 지속되면 즉시 다음 단계로 넘어가지 않는다.
