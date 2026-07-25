# Scenario 06 정량 결과표

## 업무 불변식

| 항목 | 값 | 판정 |
| --- | ---: | --- |
| 동시 worker | **5개** | PASS |
| 실제 synthetic 사용자 | **2명** | PASS |
| 시작 재고 | **42개** | PASS |
| worker당 주문 수량 | **10개** | PASS |
| 주문 201 | **4건** | PASS |
| 기대된 품절 409 | **1건** | PASS |
| 최초 예약량 | **40개** | PASS, 42 초과 없음 |
| 초과 판매 | **0개** | PASS |
| 실패 결제 | **1건**, `card_declined` | PASS |
| 실패 결제 재전달 | **201**, 같은 Payment | PASS |
| 해제 뒤 재주문 | **201**, 수량 10 | PASS |
| 최종 재고 | total 42 / reserved 40 / sold 0 | PASS |
| 최종 Order 상태 | `PAYMENT_FAILED` 1 / `PENDING_PAYMENT` 4 | PASS |
| 최종 Catalog 가용 재고 | **2개** | PASS |

## Istio·Kubernetes 수치

측정 창은 `2026-07-24 08:38:00Z ~ 08:41:00Z`이다. Prometheus의 증가량에는 배경 요청이
함께 포함될 수 있으므로, Scenario 06의 정확한 201/409 분포는 실행기의 barrier 결과를
사용하고 이 표의 지연·5xx는 운영 보조 지표로 해석한다.

| 지표 | 값 | 판정 |
| --- | ---: | --- |
| Order p95 | **7.79ms** | PASS |
| Payment p95 | **23.50ms** | PASS |
| Catalog p95 | **43.75ms** | PASS |
| Auth p95 | **64.11ms** | PASS |
| 대상 서비스 Istio 5xx 증가 | **0건** | PASS |
| Order primary Pod | **2 / 2 Ready** | PASS |
| Order Pod 재시작 | **0 / 0** | PASS |

## 측정 한계

| 항목 | 값 | 이유 |
| --- | --- | --- |
| E2E p50/p95 | UNMEASURED | 한 round뿐이어서 journey 분포 통계가 성립하지 않음 |
| Scenario 단독 RPS | UNMEASURED | Istio 메트릭이 run ID 기준으로 분리되지 않음 |
| Loki·Tempo 상관 | UNMEASURED | 이번 run의 correlation query·trace ID snapshot을 아직 수집하지 않음 |
| Grafana PNG | PENDING | 대시보드 화면 파일을 아직 보관하지 않음 |

> 실제 barrier 동시 실행에서 42개 재고에 40개만 예약됐고, 결제 실패로 풀린 10개를 다른
> 사용자로 다시 예약했다. 따라서 이 결과는 순차 요청이 아니라 동시 품절·재고 해제 불변식의
> 기능 기준선이다.
