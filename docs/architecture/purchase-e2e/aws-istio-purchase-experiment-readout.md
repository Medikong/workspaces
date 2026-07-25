# AWS Istio 구매 실험 발표용 readout 뼈대

이 문서는 AWS dev의 Istio 구매 실험을 발표 자료로 옮길 때 사용할 **빈 결과 서식**이다. 실행 전에는 목표·가설·판정 규칙만 채우고, 실행 후에는 run-ID 증거 디렉터리의 redacted 값과 링크만 옮긴다. 이 파일에는 실제 수치, Grafana 캡처, trace ID, credential 또는 성공 주장을 기록하지 않는다.

## Objectives and research questions

- 외부 AWS Istio ingress에서 실제 JWT 경계를 통과한 구매 API가 04·05·06의 업무 불변식을 지키는가?
- 기준 부하와 제한된 장애 구간에서 처리량·지연·오류·복구 신호를 같은 UTC 시간축으로 재현할 수 있는가?
- 애플리케이션 Pod 한 개의 교체가 상태 저장 계층과 분리되어 관측되는가?

발표의 단위는 한 번의 `aws-dev/<YYYY-MM-DD>-<run_id>/` 실행이다. 정적 manifest/render 검사는 live telemetry나 production readiness를 증명하지 않는다.

## Hypotheses

| 가설 | 확인할 관측 | 반증 또는 `BLOCKED` 조건 |
| --- | --- | --- |
| H1: 04 정상 구매는 주문·결제·알림 terminal state를 한 번씩 만든다. | API 상태, business event count, trace/log correlation | terminal state 누락·중복, 관측 signal 없음 |
| H2: 05 결제 거절은 주문 실패와 재고 해제로 이어지며 재시도에 안전하다. | decline status, released quantity, idempotency 결과, 5xx | false confirmation, 중복 해제, bounded poll timeout |
| H3: 06 동시 요청은 fixture stock을 넘겨 판매하지 않는다. | response distribution, successful quantity, conflict class | oversell, 동시성 미확인, fixture 경계 실패 |
| H4: L1/L2 및 단일-Pod C round의 변화는 측정 가능한 latency/error/resource 신호로 남는다. | p50/p95, 5xx, RPS, pod/restart, Kafka lag, RTO | missing/empty telemetry는 성공이 아니라 `OBSERVABILITY_BLOCKED` |

## Environment and boundaries

대상은 AWS **dev**의 외부 Istio ingress와 전용 synthetic fixture다. 실결제·운영 고객·공유 DB reset·service DNS·caller-supplied `X-User-*` 신뢰 헤더는 범위 밖이다. run-ID와 redacted request/correlation ID만 결과에 남긴다.

현재 웹은 page delivery·catalog 렌더링·auth/checkout unavailable 상태 표시까지만 확인한다. 브라우저에서 구매 완료를 판정하지 않으며, 구매 lifecycle은 API 시나리오 결과가 담당한다.

## Scenario matrix: 04 / 05 / 06

| 시나리오 | 입력과 의도 | 발표에 표시할 판정 |
| --- | --- | --- |
| 04 Happy purchase | 전용 customer/drop/product로 1 journey와 bounded poll 실행 | 주문 `PENDING_PAYMENT → APPROVED → CONFIRMED`, notification event 1회, inventory delta, HTTP/status 분포 |
| 05 Payment failure | decline 결제와 같은 idempotency key 재호출을 별도 fixture에서 실행 | `FAILED(card_declined) → PAYMENT_FAILED`, false confirmation 없음, 정확한 inventory release, 중복 terminal state 없음 |
| 06 Sold-out concurrency | 두 authenticated user가 barrier로 quantity 10 요청 5회를 동시에 실행 | expected response class(예: create/conflict), 성공 quantity ≤ fixture stock, 결제 실패 후 release와 두 번째 user 결과 |

각 행에는 기능 verdict(`PASS`/`FAIL`/`BLOCKED`)와 근거 artifact 경로를 함께 적는다. 빈 값은 성공으로 해석하지 않는다.

## Load and chaos test intent

- `F`: 1 iteration으로 계약과 fixture를 확인한다.
- `L1`: `R0=6 journeys/min`, 5분 기준선을 수집한다.
- `L2`: 안전 gate를 통과한 경우 `2R0`, 이후 `4R0`를 각각 5분 실행한다. 06은 worker `5 → 10 → 20` 및 독립 round를 사용한다.
- `C`: 새 run-ID/fixture에서 장애 전·중·후 window를 분리한다. 정확히 확인한 Order/Payment/Notification Pod 하나의 순차 recovery drill과, 승인된 경우 Order ingress 방향 30초 NetworkChaos를 별도 round로 남긴다.

카오스는 두 Pod·DB·Kafka·node를 동시에 장애 내지 않는다. abort threshold, fault 시각, replacement Ready 시각, cleanup 결과가 없으면 해당 round는 `FAIL` 또는 `BLOCKED`다.

## Measurement contract

### Request and business metrics

각 phase에서 목표/실제 요청 수와 최대 **RPS**, API/E2E latency **p50** 및 **p95**, 예상 밖 **5xx** 수·비율을 기록한다. Counter는 실행 UTC window의 `increase()` 또는 bounded delta로 계산하고 reset 여부를 표시한다. 04/05/06 business assertion과 response class는 `summary.csv`에서 별도 행으로 보관한다.

### Trace and logs

Ingress request의 trace ID에서 HTTP와 Kafka/outbox span의 시각·상태를 확인한다. Loki는 `run_id`/request ID를 JSON field로 검색한 redacted excerpt만 보관한다. trace·log가 없거나 query가 비어 있으면 `UNMEASURED`/`OBSERVABILITY_BLOCKED`를 표시한다.

### Pod, restart, and recovery

전·중·후 Kubernetes snapshot에는 Deployment/endpoint, Pod UID·readiness·node, container **restart** count, Event를 포함한다. **RTO (recovery time objective)** 필드는 fault/eviction 시각부터 replacement Pod Ready와 첫 정상 응답까지의 관측 초를 뜻하며, 이 실험의 관측값이지 SLA 주장이 아니다. 측정 불가 시 `UNMEASURED`로 둔다.

### Resource and async signals

CPU/memory saturation, replica/endpoint 수, PostgreSQL connection headroom, Kafka consumer lag와 async terminal-state 시각을 같은 UTC window로 연결한다. 신호가 없으면 그래프를 성공처럼 채우지 않는다.

## Verdict rules and presentation limits

기능·부하·복구 verdict를 분리해 `PASS`, `FAIL`, `BLOCKED`로 쓴다. 필요한 telemetry 하나라도 없으면 observability verdict를 `OBSERVABILITY_BLOCKED`로 낮춘다. 단일-Pod 교체는 애플리케이션 Pod recovery 관측일 뿐 전체 시스템 HA, retry 보장, 30일 SLO/Error Budget 달성의 증거가 아니다. Notification process-local 저장소의 stateful continuity도 이 readout에서 주장하지 않는다.

## Frontend boundary

브라우저 섹션에는 ingress page delivery, catalog 화면, auth/checkout unavailable 안내, request ID 상관관계만 적는다. checkout 완료나 주문 terminal state를 브라우저 캡처로 주장하지 않고 04/05/06 API evidence 링크를 사용한다.

## Redaction policy

다음 값은 Markdown·CSV·raw JSON·Grafana 화면에 저장하지 않는다: password, JWT/token, cookie, raw `Authorization` header, 개인 email, 운영 customer/order payload. Query 시간 범위·dashboard UID·panel 식별자와 redaction 여부는 남기되 비밀 값은 `<REDACTED>`로 대체한다. trace/order/request ID는 실행 전용 식별자이며 필요하면 부분 마스킹한다.

## Run-ID evidence contract

실행마다 [AWS dev run-ID/asset 안내](../../evidence/purchase-e2e/aws-dev/README.md)의 디렉터리 계약을 따른다. 최소 결과는 `README.md`, `summary.csv`, `raw/prometheus/`, `raw/loki/`, `raw/tempo/`, `raw/kubernetes/`, `grafana/`, `screenshots/grafana/`, `graphs/`, `assets/`다. 결과가 비어 있으면 파일을 지우지 말고 `UNMEASURED` 또는 `BLOCKED` 상태와 이유를 적는다.

발표자는 run-ID README를 먼저 열고, 이후 summary → 그래프 → 원문 query/trace/log/Kubernetes artifact 순서로 확인한다. 실행하지 않은 run-ID 디렉터리나 placeholder asset은 만들지 않는다.

## Relative asset-link example

아래는 실제 캡처를 포함하지 않는 링크 형식 예시다.

`[Grafana p95 panel](../../evidence/purchase-e2e/aws-dev/<YYYY-MM-DD>-<run_id>/screenshots/grafana/<dashboard-uid>-04-L1-<utc>.png)`

링크 대상은 해당 run-ID 폴더 안에 실제 redacted artifact가 있을 때만 유효한 것으로 표시한다.

## Empty-state note

이 skeleton을 추가한 것만으로 AWS 실행, Grafana 수집, 기능 PASS, recovery RTO 또는 frontend checkout 지원이 발생하지 않는다. 실제 실행 결과가 없을 때 발표 문구는 `NOT RUN` 또는 `BLOCKED`를 사용한다.
