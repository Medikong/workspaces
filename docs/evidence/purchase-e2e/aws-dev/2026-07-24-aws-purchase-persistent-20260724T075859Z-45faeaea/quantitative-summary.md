# Scenario 04 정량 결과표

## 실행 단위

| 항목 | 값 | 측정 방식 |
| --- | ---: | --- |
| 실행 ID | `aws-purchase-persistent-20260724T075859Z-45faeaea` | AWS SSM 실행 결과 |
| 주문 생성 시각 | 2026-07-24 07:58:59.810Z | Order DB read-back |
| 주문 확정 시각 | 2026-07-24 07:59:02.953Z | Order DB read-back |
| 주문 생성→확정 | **3.143초** | 두 DB timestamp 차이 |
| 정상 journey 수 | **1건** | 실행기 결과 |
| HTTP 계약 assertion | **9 / 9 PASS** | intent, login, order, replay, payment, payment get, notification 2회, catalog |
| 생성 Order 수 | **1건** | Order DB read-back |
| 승인 Payment 수 | **1건** | Payment DB read-back |
| `ORDER_CONFIRMED` 알림 | **1건** | API를 연속 두 번 조회 |
| 재고 | **42 → 41** | Catalog API·Order DB read-back |
| 재고 증감 | **-1개** | 시작·종료 비교 |
| 재고 예약 잔량 | **0개** | Order DB read-back |
| 중복 Order 생성 | **0건** | 같은 idempotency key 재요청 결과 |
| 중복 Payment 생성 | **0건** | 같은 idempotency key 재요청 결과 |

## Istio·Prometheus 수치

측정 창은 `2026-07-24 07:59:00Z ~ 08:02:00Z`이다. 이 창에는 서비스의 헬스체크와
다른 배경 요청이 함께 포함될 수 있으므로, 아래 요청 수를 Scenario 04만의 처리량으로
해석하지 않는다. 지연·5xx가 없는지 확인하는 운영 지표로 사용한다.

| 대상 서비스 | p95 지연 | 5xx 증가량 | 관측된 2xx 증가량 | 판정 |
| --- | ---: | ---: | ---: | --- |
| Auth | 4.20ms | 0 | 2.4 | PASS |
| Order | 10.00ms | 0 | 24.0 | PASS |
| Payment | 19.75ms | 0 | 6.0 | PASS |
| Notification | 4.80ms | 0 | 6.0 | PASS |
| Catalog | 20.50ms | 0 | 6.0 | PASS |

## Kubernetes 수치

| 대상 | Ready | 재시작 수 | 판정 |
| --- | ---: | ---: | --- |
| Order primary Pods | **2 / 2** | **0 / 0** | PASS |
| Payment Pod | **1 / 1** | 1 | 재시작 시점의 pre/post baseline이 없어 Scenario 04 원인으로 귀속하지 않음 |

## 측정 한계

| 항목 | 값 | 이유 |
| --- | --- | --- |
| E2E p50/p95 | `UNMEASURED` | journey가 1건뿐이므로 분포 통계가 성립하지 않음 |
| Scenario 단독 RPS | `UNMEASURED` | Istio 메트릭 라벨에 run ID가 없어 배경 요청과 분리 불가 |
| Loki run ID 로그 | **0건** | 실행 ID 검색 결과 없음 |
| Tempo trace 상관 | `UNMEASURED` | 실행기가 trace ID를 evidence로 보존하지 않음 |
| Grafana PNG | `PENDING` | 대시보드 화면 파일을 아직 보관하지 않음 |

## 발표용 한 문장

> Scenario 04는 AWS Istio ingress에서 1건의 구매 journey를 3.143초 안에 완료했고,
> 재고를 정확히 1개만 판매했으며, Order·Payment·Notification·Catalog 대상의 Istio
> 5xx 증가는 0이었다. 단, 단일 실행이므로 RPS·분위수 E2E 지연·로그/trace 상관은
> 후속 부하 및 관측성 보강 실험에서 측정한다.
