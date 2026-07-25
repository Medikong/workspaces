# 구매 생명주기 E2E 검증 설계

이 폴더는 DropMong 구매 서비스에서 맡은 세 시나리오를 팀원이 같은 기준으로 이해하고 실행하기 위한 문서다.

대상은 다음 세 가지다.

| 시나리오 | 검증 질문 | 상세 문서 |
| --- | --- | --- |
| 04 정상 구매 | 주문, 결제 승인, 주문 확정, 알림이 한 번씩 정확히 완료되는가 | [04-happy-purchase.md](04-happy-purchase.md) |
| 05 결제 실패 | 결제 거절이 주문 실패와 재고 해제로 정확히 이어지고 중복 처리되지 않는가 | [05-payment-failure.md](05-payment-failure.md) |
| 06 동시 품절 | 여러 사용자가 동시에 주문할 때 재고보다 많이 판매되지 않고, 실패 결제 재고가 다시 풀리는가 | [06-sold-out-concurrency.md](06-sold-out-concurrency.md) |

AWS dev에서 위 기능·부하·복구·카오스 실험을 발표용으로 같은 기준으로 설계하려면
[공통 목적·증거 설계](aws-purchase-experiment-objectives-evidence.md)를 먼저 읽는다.
이 문서는 Order v1/v2 토폴로지, phase별 판정, Grafana/Prometheus/Loki/Tempo/
Kubernetes artifact, redaction 및 Manual-QA opening path를 정의한다.

실행 전 점검, 관측성 확인, Order Pod 복구 드릴, 결과 보관 규칙은 [aws-istio-experiment-runbook.md](aws-istio-experiment-runbook.md)에 둔다.

## 시나리오 안의 부하·카오스 단계

세 시나리오는 기능 요청을 한 번 호출하는 것으로 끝내지 않는다. 같은 업무 흐름을 다음 네 단계로 실행한다.

| 단계 | 목적 | 기본 실행 |
| --- | --- | --- |
| F 기능 smoke | API 계약과 테스트 데이터 확인 | 사용자 1명, 1 iteration |
| L1 기준 부하 | 정상 조건의 처리량·지연 기준선 확보 | `R0=6 journeys/min`, 5분 |
| L2 단계 부하 | 부하 증가에 따른 오류·지연·자원 변화 확인 | `2R0`, 5분 후 안전하면 `4R0`, 5분 |
| C 카오스·복구 | 지정 Pod 하나의 복구 또는 bounded NetworkChaos 영향·복귀 측정 | Order recovery: `R0`, fault→Ready 관찰; NetworkChaos: pre 1분 → **최대 30초 fault** → cleanup/post 2분 |

`R0`는 작은 AWS dev 자원을 고려한 최초 기본값이다. Preflight에서 자원 부족이 확인되면 낮출 수 있다. 근거 없이 높이지 않으며, 실제 적용 값과 변경 이유를 결과 문서에 적는다.

04와 05는 전체 구매 journey 완료 수를 rate로 사용한다. 06은 고정 stock에 대한 동시 burst가 핵심이므로, journeys/min 대신 동시 worker 수와 반복 round 수를 부하 축으로 사용한다.

## 이 문서가 검증하는 환경

검증 대상은 **AWS dev의 실제 Istio ingress 경로**다.

```text
test runner
-> AWS Istio ingress gateway
-> auth ext_authz
-> catalog / order / payment / notification
-> PostgreSQL / Kafka
```

따라서 기존 Docker Compose용 Postman collection은 로컬 내부 회귀 테스트로 유지하되, AWS 결과의 근거로 사용하지 않는다. AWS 검증은 실제 로그인으로 발급한 JWT와 외부 ingress URL을 사용한다.

## 공통 원칙

- `Authorization: Bearer <JWT>`만 사용자 신뢰 근거로 사용한다.
- 요청자가 보낸 `X-User-Id`, `X-User-Role` 같은 신뢰 헤더는 보내지 않는다.
- 운영 고객, 실결제, 공유 DB 초기화는 사용하지 않는다.
- 테스트 전용 고객 두 명과 전용 상품·재고 fixture를 사용한다.
- 모든 실행은 `run_id`를 만들고, request ID와 idempotency key에 포함한다.
- `run_id`, 사용자 ID, 주문 ID, trace ID는 Prometheus label로 쓰지 않고 로그와 결과 파일에서만 찾는다.
- 결과는 `PASS`, `FAIL`, `BLOCKED` 중 하나로 기록한다. 필요한 관측성 신호가 없으면 성공으로 처리하지 않고 `BLOCKED`로 기록한다.
- 정상 부하 결과와 카오스 결과를 별도로 판정한다. 카오스 중 발생한 오류를 정상 기능 실패율에 섞지 않는다.

## 결과를 해석하는 방법

짧은 실험은 “이 실행 구간에서 기능·부하 반응·복구를 확인했다”는 근거다. 30일 SLO 달성, Error Budget, 고가용성 보장은 이 문서의 결과만으로 주장하지 않는다.

특히 현재 Order 서비스가 단일 replica이면 Pod 삭제는 무중단 검증이 아니라 **복구 시간 드릴**이다. 장애 중 요청 실패가 발생하면 실패 수와 복구 시간을 함께 기록한다.

## 문서와 결과의 분리

이 폴더는 설계와 실행 방법을 보관한다. 실제 측정값, Grafana 캡처, Prometheus query 결과, Loki/Tempo 링크, Kubernetes 이벤트는 [evidence/purchase-e2e](../../evidence/purchase-e2e/README.md)에 실행일과 `run_id` 기준으로 보관한다.
