# Scenario 05 정량 결과표

| 항목 | 값 | 판정 |
| --- | ---: | --- |
| failure journey 수 | 1건 | PASS |
| HTTP 계약 assertion | 9 / 9 PASS | PASS |
| 주문 생성 | 201 | PASS |
| 같은 주문 재요청 | 201, 같은 Order | PASS |
| 결제 실패 요청 | 201 | PASS |
| 결제 상태 | `FAILED` | PASS |
| 실패 이유 | `card_declined` | PASS |
| 같은 결제 재요청 | 201, 같은 Payment | PASS |
| 주문 상태 | `PAYMENT_FAILED` | PASS |
| 재고 | 41 → 41 | PASS |
| 재고 해제량 | +1 예약 해제, 최종 판매 변화 0 | PASS |
| false confirmation | 0건 | PASS |
| 중복 terminal 처리 | 0건 | PASS |

## Istio·Prometheus 수치

측정 창은 `2026-07-24 08:17:00Z ~ 08:20:00Z`이다. 다른 배경 요청이 함께 포함될 수
있으므로, 지연·5xx의 운영 보조 지표로만 사용한다.

| 지표 | 값 | 판정 |
| --- | ---: | --- |
| Order p95 | **24.40ms** | PASS |
| Payment p95 | **22.00ms** | PASS |
| Catalog p95 | **22.37ms** | PASS |
| Auth p95 | **5.95ms** | PASS |
| 대상 서비스 Istio 5xx 증가 | **0건** | PASS |

## 측정 한계

| 항목 | 값 | 이유 |
| --- | --- | --- |
| E2E 실행시간 | UNMEASURED | 실행기 결과에 시작·종료 monotonic time을 저장하지 않음 |
| E2E p50/p95 | UNMEASURED | 한 journey이므로 journey 분포 통계가 성립하지 않음 |
| Pod restart·Kafka lag | UNMEASURED | 실행 직후 Kubernetes/Kafka snapshot 미수집 |
| Loki·Tempo 상관 | UNMEASURED | 실행 ID/trace snapshot 미수집 |

> 이 결과는 결제 실패 업무 불변식의 기능 기준선이다. 성능·복원력 비교는 L1/L2 부하와
> 카오스 실험에서 별도 수치로 측정한다.
