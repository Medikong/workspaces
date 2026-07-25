# AWS 구매 L2-B 부하 실험

## 판정

`PASS (L2-B functional and asynchronous delivery gate)`

AWS dev의 실제 Istio ingress에서 2.5초 간격으로 120개 정상 구매 여정을 실행했다. 이는 이번 실험 설계에서 가장 높은 L2 도착률이며, 결과는 개발 환경의 짧은 관측값이다. production 부하 한계나 SLO 달성을 뜻하지 않는다.

## 부하 비교

| 항목 | L1 | L2-A | L2-B |
| --- | ---: | ---: | ---: |
| Run ID | `...150734Z` | `...151613Z` | `aws-l2b-purchase-20260725T152325Z` |
| 시작 시각 (UTC) | 15:07:34 | 15:16:13 | 15:23:25 |
| 도착률 | 6/min | 12/min | 24/min |
| 요청 여정 | 30 | 60 | 120 |
| 주문 생성 성공 | 30 / 30 | 60 / 60 | 120 / 120 |
| 결제 승인 성공 | 30 / 30 | 60 / 60 | 120 / 120 |
| 결제 409 / 기타 오류 | 0 / 0 | 0 / 0 | 0 / 0 |
| 주문 확정 | 30 / 30 | 60 / 60 | 120 / 120 |
| 미확정 주문 | 0 | 0 | 0 |
| 전체 여정 p50 | 2,199ms | 2,203ms | 2,196ms |
| 전체 여정 p95 | 2,257ms | 2,253ms | 2,224ms |
| Payment 투영 대기 재시도 | 28 | 54 | 107 |

세 단계 모두 최종 주문·결제 오류가 0건이고, p95가 2.3초 이내였다. 표본 수와 실행 시간이 제한적이므로 p95의 수 ms 차이를 성능 개선 또는 회귀로 주장하지 않는다.

## L2-B 사후 async·인프라 증거

| 신호 | 관측값 | 판정 |
| --- | ---: | --- |
| Order v1 Pod | 2 / 2 Ready, restart 0 | PASS |
| Order v2 Pod | 2 / 2 Ready, restart 0 | PASS |
| Payment Pod | 2 / 2 Ready, restart 0 | PASS |
| `order.created` outbox | 120 / 120 published, pending 0 | PASS |
| `inventory.changed` outbox | 240 / 240 published, pending 0 | PASS |
| `notification.requested` outbox | 120 / 120 published, pending 0 | PASS |
| Payment `known_orders` | 120건 생성 | PASS |
| Payment `order.created` consumer lag | 0 | PASS |
| Order DB active connections | 15 | 관측 |
| Payment DB active connections | 18 | 관측 |

Order v1/v2와 Payment는 worker-app-1~4에 분산되어 있었고, 실행 전·중·후 컨테이너 restart는 0이었다.

## 관측성·발표 활용

- Grafana에서 UTC `2026-07-25 15:23:25Z`부터 5분을 선택하면 L2-B 영상 구간이 된다.
- 부하 비교 슬라이드에는 위 표를 정적 결과로 사용하고, 영상에는 Istio RPS·5xx·p95와 Kubernetes CPU·메모리를 보여 준다.
- 자동 Grafana screenshot은 이 run에서 수집하지 않았으므로 `UNMEASURED`다. 캡처가 없는 signal은 발표 수치로 쓰지 않는다.

## 다음 단계

부하 단계는 통과했다. 다음 실험은 성능 비교가 아니라 **단일 Order Pod recovery drill**이다. eviction 시각, replacement Ready 시각, 첫 정상 구매 시각, outbox pending·Kafka lag를 별도 Run ID로 기록한다. 그 결과를 통과한 경우에만 30초 Order NetworkChaos를 진행한다.
