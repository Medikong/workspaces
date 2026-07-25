# AWS 구매 L2-A 부하 실험

## 판정

`PASS (L2-A functional and asynchronous delivery gate)`

L1을 통과한 뒤 AWS dev의 실제 Istio ingress에서 도착률을 두 배로 높여 5분간 정상 구매 여정을 실행했다. production SLO나 최대 용량을 주장하지 않는 개발 환경의 제한된 비교 실험이다.

## 프로파일과 결과

| 항목 | L1 | L2-A |
| --- | ---: | ---: |
| Run ID | `aws-l1-purchase-20260725T150734Z` | `aws-l2a-purchase-20260725T151613Z` |
| 시작 시각 (UTC) | `2026-07-25T15:07:34Z` | `2026-07-25T15:16:13Z` |
| 목표 속도 | 분당 6건 | 분당 12건 |
| 요청 여정 | 30 | 60 |
| 실행 시간 | 292초 | 297초 |
| 주문 생성 성공 | 30 / 30 | 60 / 60 |
| 결제 승인 성공 | 30 / 30 | 60 / 60 |
| 결제 409 / 기타 오류 | 0 / 0 | 0 / 0 |
| 주문 확정 | 30 / 30 | 60 / 60 |
| 미확정 주문 | 0 | 0 |
| 전체 여정 p50 | 2,199ms | 2,203ms |
| 전체 여정 p95 | 2,257ms | 2,253ms |
| Payment 투영 대기 재시도 | 28 | 54 |

L2-A에서 p95는 L1 대비 4ms 낮았으며, 이 정도 짧은 표본 차이는 성능 개선 주장으로 해석하지 않는다. 두 실험 모두 최종 오류와 미확정 주문이 0건이었음을 확인하는 것이 이 단계의 핵심 결과다.

## 실행 직후 비동기·인프라 증거

| 신호 | 관측값 | 판정 |
| --- | ---: | --- |
| Order v1 Pod | 2 / 2 Ready, restart 0 | PASS |
| Order v2 Pod | 2 / 2 Ready, restart 0 | PASS |
| Payment Pod | 2 / 2 Ready, restart 0 | PASS |
| `order.created` outbox | 60 / 60 published, pending 0 | PASS |
| `inventory.changed` outbox | 120 / 120 published, pending 0 | PASS |
| `notification.requested` outbox | 60 / 60 published, pending 0 | PASS |
| Payment `known_orders` | 60건 생성 | PASS |
| Payment `order.created` consumer lag | 0 | PASS |
| Order DB active connections | 15 | 관측 |
| Payment DB active connections | 18 | 관측 |

Order v1/v2와 Payment Pod는 worker-app-1~4에 분산된 상태로 유지됐다. DB connection은 각 실험 직후 스냅샷이며, 최대 사용량이나 connection pool 포화로 확대 해석하지 않는다.

## 관측성·발표 활용

- Grafana 영상은 `2026-07-25 15:16:13Z`부터 약 5분 범위를 사용한다.
- 화면에는 Istio RPS·5xx·p95, Kubernetes CPU·메모리·restart를 보여 주고, 이 문서의 async 표를 보조 증거로 쓴다.
- 이 run의 자동 Grafana 스크린샷은 아직 수집하지 않았으므로 `UNMEASURED`다. 캡처가 없다는 사실을 수치 추정으로 대체하지 않는다.

## 다음 진입 조건

L2-B(분당 24건, 5분)는 별도 Run ID로 동일한 async gate를 통과해야 한다. 그 다음에만 단일 Pod recovery drill과 30초 NetworkChaos를 실행한다.
