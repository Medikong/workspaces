# AWS dev Scenario 06 실행 결과

## 판정

- 기능: `PASS`
- 실행 ID: `aws-sold-out-20260724T083820Z-45faeaea`
- 대상: AWS dev, Istio ingress, synthetic customer A/B
- fixture: `opaque-product-s06-45faeaea`, 시작 재고 42

## 결과

5개 worker가 barrier에서 동시에 수량 10의 주문을 보냈다. 결과는 주문 생성 201 네 건,
기대된 business conflict 409 한 건이다. 따라서 최초 예약 수량은 40으로 42를 넘지 않았다.

성공 주문 하나는 `card_declined`로 결제 실패 처리했고, Payment 재전달도 한 번만 처리됐다.
해제된 수량 10은 반대 synthetic 사용자로 재주문해 다시 예약했다. 최종 Order DB 재고는
`total=42`, `reserved=40`, `sold=0`이며, `PAYMENT_FAILED=1`, `PENDING_PAYMENT=4`다.

- [발표용 정량 결과표](quantitative-summary.md)
- [수치 요약](summary.csv)
- [Prometheus 원문](raw/prometheus/scenario-06-window-20260724T084100Z.json)
