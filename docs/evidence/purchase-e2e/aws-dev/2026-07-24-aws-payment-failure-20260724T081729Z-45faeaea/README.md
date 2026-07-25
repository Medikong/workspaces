# AWS dev Scenario 05 실행 결과

## 판정

- 기능: `PASS`
- 실행 ID: `aws-payment-failure-20260724T081729Z-45faeaea`
- 대상: AWS dev, Istio ingress 경유
- 업무 실패: `card_declined`는 의도한 결과이며 시스템 5xx와 구분한다.

## 결과

결제 거절 요청은 `201`으로 처리됐고 Payment는 `FAILED(card_declined)`, Order는
`PAYMENT_FAILED`가 됐다. 같은 order/payment idempotency key를 재전송해도 각각
`201`과 같은 식별자의 terminal state를 유지했다. Catalog 재고는 주문 전후 모두 41로
돌아와 수량 1이 정확히 해제됐음을 확인했다.

## 한계

이번 run은 API assertion·Catalog read-back과 Prometheus p95·5xx를 기록했다. 다만
DB read-back, Loki, Tempo snapshot은 수집하지 못했다. 이 run은 기능 `PASS`이며,
Prometheus 수치는 단일 journey가 아닌 3분 운영 창의 보조 지표다.

- [발표용 정량 결과표](quantitative-summary.md)
- [수치 요약](summary.csv)
- [Prometheus 원문](raw/prometheus/scenario-05-window-20260724T082000Z.json)
