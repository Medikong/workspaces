# AWS 구매 실험 공통 목적·증거 설계

> 이 문서는 AWS dev 구매 실험의 **발표용 설계 계약**이다. 04·05·06 기능 실험,
> L1/L2 부하, Order Pod 복구, 제한된 Chaos Mesh `NetworkChaos`를 같은 판정·증거
> 언어로 실행하기 위한 문서이며 실행 결과나 측정값을 대신하지 않는다.

근거 문서는 [과정 목표](../../GOAL.md), [AWS Istio 발표 readout 뼈대](aws-istio-purchase-experiment-readout.md),
[AWS runbook](aws-istio-experiment-runbook.md), [run-ID evidence contract](../../evidence/purchase-e2e/README.md)다.

## 1. 범위와 토폴로지

대상은 외부 AWS dev Istio ingress를 실제로 통과하는 synthetic 구매 경로다.
운영 고객·실결제·공유 DB 초기화·caller가 보낸 `X-User-*` 신뢰 헤더는 범위 밖이다.
기능 계약은 [04 정상 구매](04-happy-purchase.md), [05 결제 실패](05-payment-failure.md),
[06 동시 품절](06-sold-out-concurrency.md)를 따른다.

이번 실험의 Order 배치는 다음과 같이 고정한다. 실행 전후 Kubernetes snapshot에서
값을 확인하고, 실제 렌더링된 label key가 다르면 README에 그 key를 남긴다. 확인할 수
없으면 요청을 시작하지 않고 `BLOCKED`로 기록한다.

| 항목 | 실험 계약 | 관측·안전 규칙 |
| --- | --- | --- |
| Order v1 | replica 2 | 모든 Order metric/log/trace/Kubernetes 행에 `version=v1`을 보존한다. |
| Order v2 | replica 2 | 모든 Order metric/log/trace/Kubernetes 행에 `version=v2`를 보존한다. |
| 버전 라우팅 | 실행된 route/weight와 실제 요청 분포를 기록 | 버전별 분포를 확인하지 못하면 비교 주장을 하지 않는다. |
| PDB | v1, v2에 각각 `minAvailable=1` | 두 PDB의 이름·selector·현재 disruptionsAllowed를 전후 snapshot에 저장한다. |
| 용량 영향 | Order 총 4 replica, 버전별 정상 용량은 2개 | CPU/memory, endpoint, restart, pending/queue를 v1·v2와 합계로 따로 표시한다. 한 Pod 장애 시 대상 버전의 가용 replica는 1개가 기준이다. |
| NetworkChaos 대상 | 정확히 이름과 UID를 확인한 Order Pod **1개** | Pod 이름·UID·`version`을 target으로 고정한다. broad selector, 두 Pod 동시 장애, DB/Kafka/node 장애는 금지한다. |
| 동일 버전 제어군 | target과 같은 `version`의 다른 Ready Order Pod 1개 이상 | 제어군에는 NetworkChaos를 적용하지 않는다. 같은 버전에 다른 Ready Pod가 없으면 NetworkChaos round를 `BLOCKED`로 둔다. 다른 버전은 별도 비교군이며 failover를 가정하지 않는다. |

v1/v2를 한 계열로 합친 값만으로 “버전이 동일하게 동작했다”고 말하지 않는다. 모든
그래프와 표는 가능하면 `version`별 행과 합계 행을 함께 갖고, label이 누락된 신호는
`UNMEASURED`로 남긴다.

## 2. 과정 목표와 발표에 연결할 과목 목표

`GOAL.md`의 모든 항목을 재현하려는 문서가 아니다. 이번 구매 실험에서 실제로
증명할 수 있는 목표만 다음처럼 연결한다.

| 과정 목표 | 이번 실험에서 보여 줄 수 있는 범위 | 발표 근거 |
| --- | --- | --- |
| 서비스 메시 | Istio ingress, route/weight, mTLS·trace 경계와 장애 구간의 요청 흐름 | Gateway/VirtualService snapshot, Istio request metric, Tempo span |
| Observability 3축 | 같은 UTC 창의 Prometheus·Loki·Tempo 상관과 Kubernetes 상태 | Grafana panel, redacted query 결과, Pod/Event snapshot |
| SLI/SLO 측정 방법 | API p95, E2E p95, 예상 밖 5xx, RTO를 계산하는 방법과 한계 | `summary.csv`, query 원문, 계산 window |
| 부하 | F → L1 → 안전한 경우 L2의 rate/worker 증가와 포화 신호 | RPS·latency·error·CPU/memory/lag 그래프 |
| 복구·카오스 | 단일 Order Pod 복구와 한정된 단일-Pod NetworkChaos의 영향·복귀 | fault/Ready/first-normal timeline, PDB·version evidence |
| GitOps/케이스 스터디 | 실행 revision, preflight, rollback/cleanup, 기능→관측→판정 연결 | run README와 발표용 asset manifest |

이 문서의 `p95 ≤ 1s`(API), `p95 ≤ 10s`(전체 E2E), `RTO ≤ 120s`는 **이번 AWS
dev 실험의 gate**다. production SLO/SLA, 30일 Error Budget, HA 보장 또는 용량
약속으로 해석하지 않는다. 표본이나 telemetry가 부족하면 gate를 통과한 것으로
간주하지 않는다.

## 3. 연구 질문과 가설

### 3.1 연구 질문

1. 외부 Istio ingress와 실제 JWT 경계를 통과한 04·05·06 구매 흐름이 업무 불변식을
   유지하는가?
2. Order v1/v2의 요청 분포, latency, error, resource, async lag를 같은 UTC 시간축에서
   분리해 관측할 수 있는가?
3. L1에서 L2로 올릴 때 API/E2E 실험 gate와 자원·queue 신호가 어떻게 변하는가?
4. 정확히 한 Order Pod의 제거 또는 네트워크 격리 후 대상 버전과 같은 버전 제어군이
   구분되어 보이고, 120초 안에 복구·첫 정상 응답을 측정할 수 있는가?
5. 기능 판정과 관측성 판정을 분리해, 빈 신호를 성공으로 포장하지 않고 발표할 수 있는가?

### 3.2 가설·반증 규칙

| ID | 가설 | PASS에 필요한 관측 | 반증 또는 `FAIL` | `BLOCKED`/관측성 판정 |
| --- | --- | --- | --- | --- |
| H1 | 04 정상 구매는 주문·결제·알림 terminal state를 각각 정확히 한 번 만든다. | 주문 `CONFIRMED`, 결제 승인, 알림 1건, 재고 delta, idempotency replay, API/E2E 지연 | terminal 누락·중복, 잘못된 재고, 예상 밖 5xx/timeout | fixture/JWT/ingress 또는 business·trace/log 신호가 없으면 `BLOCKED`/`OBSERVABILITY_BLOCKED` |
| H2 | 05 `card_declined`는 주문 실패와 정확한 재고 해제로 끝나며 재전달에 안전하다. | Payment `FAILED`, Order `PAYMENT_FAILED`, release 수량 일치, false confirmation 0, 중복 terminal 0 | `CONFIRMED`, 미·과다 해제, 중복 record, bounded poll timeout | failure fixture, inventory read, async query 중 하나가 없으면 `BLOCKED`/`OBSERVABILITY_BLOCKED` |
| H3 | 06 barrier 동시성은 fixture stock보다 많이 판매하지 않는다. | worker barrier 시각, 201/409 분포, 성공 수량 ≤ 시작 stock, 실패 결제 후 release와 재구매 | oversell, 순차 실행, worker ID 충돌, 기대하지 않은 5xx | 두 JWT·격리 fixture·병렬 실행기·재고 확인이 없으면 `BLOCKED` |
| H4 | L1/L2는 v1/v2별 latency/error/resource/lag 변화를 재현한다. | 실제 RPS, API p50/p95, E2E p50/p95, 5xx, CPU/memory, endpoint/restart, Kafka lag | gate 초과, abort 기준 초과, 용량·route 분포 불명 | Prometheus/Grafana/Kubernetes query가 비거나 version label이 없으면 `OBSERVABILITY_BLOCKED` |
| H5 | 한 Order Pod의 복구는 업무 불변식을 깨지 않고 측정 가능한 시간 안에 끝난다. | target Pod/UID, PDB, endpoint 제거, replacement Ready, 첫 정상 응답, RTO | 120초 초과, Ready 불가, 중복/oversell, cleanup 실패 | 대상·시각·Ready 또는 첫 정상 응답을 측정할 수 없으면 `OBSERVABILITY_BLOCKED`; preflight 불충족이면 `BLOCKED` |
| H6 | 단일-Pod NetworkChaos는 target과 같은 버전 제어군을 구분해 보이며, bounded cleanup 뒤 정상화된다. | fault start/end, target version/name/UID, 같은 버전 control, API/E2E·5xx, target/control readiness, cleanup/first normal | 다른 Pod·버전에 확산, 30초 경계 위반, 제어군 장애, invariant 위반, cleanup 실패 | same-version control 또는 live signal이 없으면 `BLOCKED`/`OBSERVABILITY_BLOCKED` |

## 4. 판정 어휘와 gate

판정은 `function`, `load`, `recovery`, `observability`를 분리해 `summary.csv`에
기록한다. 하나의 성공 문장으로 합치지 않는다.

| 상태 | 정확한 의미 |
| --- | --- |
| `PASS` | 해당 차원의 모든 업무 assertion과 적용 가능한 gate가 통과했고, 필요한 live evidence가 raw artifact로 존재한다. |
| `FAIL` | traffic/장애는 실행되었으나 assertion, gate, cleanup, 불변식 또는 복구가 실패했다. 실패 artifact를 보존한다. |
| `BLOCKED` | preflight, 권한, fixture, route, 대상 Pod, same-version control 중 하나가 충족되지 않아 다음 traffic/fault를 시작하지 않았다. |
| `UNMEASURED` | 개별 signal의 값이 없다. 빈칸이나 추정값 대신 이 문자열과 사유·source path를 쓴다. |
| `OBSERVABILITY_BLOCKED` | 실행 흔적은 있으나 필요한 Prometheus, Grafana, Loki, Tempo 또는 Kubernetes signal이 비어/권한 부족/시간창 불일치로 판정 불가다. 기능 성공으로 낮춰 쓰지 않는다. |
| `NOT RUN` | 계획에는 있으나 이 run에서 실행하지 않았다. 실행 결과로 링크하지 않는다. |

### 4.1 실험 gate

| gate | 적용 phase | 계산 방법 | PASS 조건 | 미측정/초과 |
| --- | --- | --- | --- | --- |
| API p95 | L1/L2와 traffic이 충분한 C/NetworkChaos window | protected API route별 동일 UTC window의 request-duration histogram p95 | `p95 ≤ 1,000ms`이고 예상 밖 5xx·timeout 없음 | query/표본 부족이면 `UNMEASURED`→`OBSERVABILITY_BLOCKED`; `>1,000ms`면 `FAIL` |
| E2E p95 | L1/L2, 복구 후 post window, NetworkChaos post window | 한 journey의 첫 request부터 terminal assertion까지의 client-side bounded duration | `p95 ≤ 10,000ms`이고 business assertion 모두 통과 | journey timestamp 부족이면 `UNMEASURED`→`OBSERVABILITY_BLOCKED`; `>10,000ms`면 `FAIL` |
| RTO | Order Pod recovery, NetworkChaos cleanup 후 정상화 | fault/eviction 또는 chaos cleanup 시각부터 replacement Ready와 첫 정상 응답까지. 둘 중 늦은 시각을 기록 | `RTO ≤ 120s`; target과 control, version, 시각을 모두 확인 | 시각/Ready/first normal 누락이면 `UNMEASURED`→`OBSERVABILITY_BLOCKED`; `>120s` 또는 Ready 실패면 `FAIL` |

F 기능 smoke는 1 iteration이므로 p95 gate를 억지로 계산하지 않는다. F에는 single
sample duration을 참고값으로 남기고 `UNMEASURED`를 성공으로 바꾸지 않는다. 부하 중
unexpected 5xx가 60초 동안 5% 초과하거나 p95가 3초 초과한 1분 창이 2회 연속,
CPU/memory saturation이 90% 초과로 2분 유지되면 L2/chaos를 중단한다. 이는 abort
규칙이지 p95≤1s gate의 대체가 아니다.

## 5. 정확한 실행·캡처 단계

모든 시각은 UTC ISO-8601로 적고, `parent_run_id`와 phase를 filename·CSV에 함께
넣는다. F/L1/L2와 recovery/NetworkChaos는 fixture와 time window를 섞지 않는다.
카오스는 새 `run_id`와 새 전용 fixture를 사용한다.

| 단계 | 실행과 고정값 | 시작·중간·끝에 캡처할 것 | 다음 단계 진입 조건 |
| --- | --- | --- | --- |
| PRE | AWS dev context, Argo revision/health, Istio route/authz, v1=2/v2=2, PDB v1/v2 `minAvailable=1`, target capacity, fixture, query 권한 | K8s deployment/pod/PDB/endpoint/event, Prometheus target/up, Loki/Tempo probe, Grafana dashboard/panel metadata, redaction check | 모든 safety gate `PASS`; 하나라도 아니면 traffic 금지·`BLOCKED` |
| F | 04/05는 1 journey, 06은 5 workers를 barrier로 1 round | request/response/business summary, API status, request/trace/log correlation, v1/v2 Pod readiness/restart, UTC begin/end | 기능 assertion과 필수 live signal이 있으면 다음 단계; 아니면 해당 차원 `FAIL`/`OBSERVABILITY_BLOCKED` |
| L1 | 04/05 `R0=6 journeys/min, 5분`; 06 5 workers × 3 independent rounds | steady window의 RPS, API/E2E p50/p95, 5xx, CPU/memory, endpoint/restart, DB headroom, Kafka lag, version split | abort 없음·L1 gate 확인·fixture cleanup/격리 확인 |
| L2-A | 04/05 `2R0, 5분`; 06 10 workers × 3 rounds | L1과 같은 query/time-window schema, 증분·counter reset, v1/v2 용량 비교 | L1 안전·abort 없음·L2-A gate 확인 |
| L2-B | 04/05 `4R0, 5분`; 06 20 workers × 3 rounds, 선택적 | L2-A와 동일. 실행하지 않으면 `NOT RUN`과 이유 | L2-A 안전하고 operator 승인·abort monitor 준비 |
| Order recovery | L1 1분 → 이름·UID 확인한 Order Pod 1개 삭제 → endpoint/Ready 관찰 → replacement Ready·첫 정상 응답 → post 2분 | target version/UID, same-version 다른 Pod, PDB, deletion/endpoint/Ready/first-normal 시각, RTO, business invariant, v1/v2 metrics | target 외 Pod/DB/Kafka 이상 없음, cleanup 완료 |
| NetworkChaos | 새 fixture/run; pre 1분 → Chaos Mesh `NetworkChaos` **최대 30초** → 명시적 delete/expiry → post 2분 | YAML/name/UID, target Pod/version, same-version control Pod, fault start/end, request/p95/5xx, target/control readiness, cleanup, first normal/RTO | exactly-one target·control untouched·cleanup 성공. control 미확인 시 시작 금지 |
| POST | 모든 traffic/fault 종료 후 read-only snapshot | final K8s/Prom/Loki/Tempo/Grafana metadata, artifact manifest/checksum, verdict/limitation | 누락 signal은 `UNMEASURED`/`OBSERVABILITY_BLOCKED`; 수치·캡처를 새로 만들지 않음 |

Chaos Mesh round의 target은 `kubectl get pod`로 이름과 UID를 고정한 한 Pod다. `NetworkChaos`
selector는 그 Pod와 실제 `version` label에만 맞추고, 같은 버전의 control Pod에는
적용하지 않는다. 30초를 넘기거나 다른 버전·namespace에 영향이 보이면 즉시 delete,
read-only snapshot, `FAIL`/`BLOCKED` 판정을 남긴다.

## 6. 시나리오별 신호·성공·실패 표

### 6.1 기능 및 업무 불변식

| 시나리오/phase | 기능 assertion | Prometheus/Grafana | Loki | Tempo | Kubernetes | 성공/실패 핵심 |
| --- | --- | --- | --- | --- | --- | --- |
| 04 F/L1/L2/C | `PENDING_PAYMENT → APPROVED → CONFIRMED`, `ORDER_CONFIRMED` 알림 정확히 1건, 재고 delta, idempotency replay에 새 record 없음 | Order/Payment/Notification request count·status·p95·5xx; version별 route/endpoint | 동일 `run_id`/request ID의 order 생성, 결제 승인, terminal, notification log | ingress→Order→Payment 및 outbox/Kafka→Notification span·status | v1/v2 Pod readiness/restart/event, endpoint, PDB | 누락·중복 terminal 또는 알림 ≠1이면 `FAIL`; trace/log/query가 비면 `OBSERVABILITY_BLOCKED` |
| 05 F/L1/L2/C | `FAILED(card_declined) → PAYMENT_FAILED`, 정확한 inventory release, `CONFIRMED` 없음, 같은 key/event 재전달에도 한 번만 처리 | Payment/Order failure route count·p95·5xx, consumer lag/processing delay, version별 resource | decline, order failure, release, dedupe 로그를 correlation ID로 연결 | Payment failure HTTP span→outbox/consumer span | Payment worker owner/Pod UID, restart/readiness/event, Kafka/DB snapshot | false confirmation·미/과다 release·중복이면 `FAIL`; worker 역할/async signal을 못 찾으면 `BLOCKED` |
| 06 F/L1/L2/C | barrier 동시 시작, 시작 stock 기록, response distribution, 성공 수량 ≤ stock, 실패 결제 release 후 다른 user 재구매 | Order 2xx/409/5xx 분포, RPS/p95, DB lock/error, version별 resource | worker request ID, sold-out, reserve/release, replay log | 경쟁 request trace와 payment-failure 이후 async span | v1/v2 endpoint/restart/event, DB/Kafka health | 순차 실행·oversell·예상 밖 5xx·재고 과다/미해제면 `FAIL`; barrier/fixture/parallel proof가 없으면 `BLOCKED` |

`card_declined`와 06의 기대된 `409`는 업무 결과이므로 일반 5xx 장애율에 섞지
않는다. `summary.csv`에 `business_failure_expected=true`처럼 의미를 명시하거나
signal 이름에 `expected_business`를 넣고, 예상 밖 4xx/5xx는 별도 행으로 둔다.

### 6.2 부하·버전·용량

L1/L2 각 단계에는 아래 최소 행을 시나리오별·버전별로 만든다. `value`는 빈칸을
허용하지 않고 실제 값·`UNMEASURED`·`BLOCKED` 중 하나다.

| signal | 정의/단위 | 필요한 label·window | 판정 |
| --- | --- | --- | --- |
| `request_count` / `actual_rps` | 실행 window의 HTTP request count, count/s | route, response class, `version`, UTC start/end | 목표와 실제를 모두 기록; counter reset이면 bounded delta 사유 |
| `api_p50` / `api_p95` | protected API latency, ms | route, `version`, 같은 1분/5분 window | API p95 ≤1,000ms gate |
| `e2e_p50` / `e2e_p95` | journey 시작→terminal assertion, ms | scenario, worker, UTC window | E2E p95 ≤10,000ms gate |
| `unexpected_5xx` / `timeout` | 의도하지 않은 서버 오류·timeout, count/rate | route/status, scenario phase | 0 또는 abort 기준 이하; business 409/decline 제외 |
| `cpu` / `memory` | pod CPU cores·working set bytes | Pod, `version`, container, window | 총 4 replica와 v1/v2 headroom을 함께 설명 |
| `endpoint_ready` / `restart_count` | ready endpoint 수·container restart | Pod UID, `version`, pre/mid/post | PDB와 target/control 상태를 구분 |
| `pdb_min_available` / `disruptions_allowed` | PDB 설정·현재 여유 | PDB 이름, `version` | v1=1, v2=1 확인; 누락이면 `BLOCKED` |
| `kafka_lag` / `db_headroom` | consumer lag·DB connection 여유 | consumer/group, DB target, window | async terminal 지연과 함께 해석 |

### 6.3 복구·NetworkChaos

| signal | Order Pod recovery | NetworkChaos |
| --- | --- | --- |
| 대상 | 이름·UID·`version` 1개; 다른 Pod/DB/Kafka를 건드리지 않음 | 같은 조건의 이름·UID 1개, `NetworkChaos` name/namespace/selector |
| control | 같은 버전의 다른 Ready Pod와 다른 버전 Pod를 함께 표시 | 같은 `version`의 비대상 Ready Pod 1개 이상을 필수 control로 표시 |
| fault window | Pod delete 시각→endpoint 제거→replacement Ready→첫 정상 응답 | Chaos create/start→최대 30초→delete/expiry→target/control 정상화 |
| RTO | delete/fault 시각부터 replacement Ready와 첫 정상 응답 중 늦은 시각 | cleanup/end 시각부터 첫 정상 응답; Pod replacement가 발생하면 delete→Ready도 별도 기록 |
| 필수 5축 evidence | **Grafana screenshot, Prometheus query/result, Loki redacted correlation, Tempo trace/span, Kubernetes Pod/PDB/Event snapshot**을 모두 target/control·UTC window와 함께 보관 | **Grafana screenshot, Prometheus query/result, Loki redacted correlation, Tempo trace/span, Kubernetes Pod/NetworkChaos/Event snapshot**을 모두 target/control·fault/pre/post UTC window와 함께 보관 |
| 기능 | 주문·결제·알림·재고 중복/oversell 없음, post journey 통과 | target 영향이 control/다른 version으로 번지지 않고 post journey 통과 |
| FAIL | RTO>120s, Ready 불가, 불변식 위반, target 외 변경, cleanup 실패 | 30초 초과, control 장애, 다른 version 확산, 불변식 위반, cleanup 실패 |
| BLOCKED | 이름/UID·시각·Pod/Event/Prometheus query를 확보하지 못함 | same-version control 없음, selector/cleanup 권한 없음, live telemetry 없음 |

## 7. Evidence contract와 query 캡처

실행별 경계는 [AWS dev run-ID 계약](../../evidence/purchase-e2e/aws-dev/README.md)과
[구매 evidence 계약](../../evidence/purchase-e2e/README.md)을 따른다. 실행하지 않은
run-ID 폴더·빈 PNG·placeholder 수치를 만들지 않는다.

### 7.1 최소 artifact tree

```text
aws-dev/<YYYY-MM-DD>-<run_id>/
├── README.md
├── summary.csv
├── raw/
│   ├── prometheus/<scenario>-<phase>-<utc>.json
│   ├── loki/<scenario>-<phase>-<utc>.json
│   ├── tempo/<scenario>-<phase>-<utc>.json
│   └── kubernetes/<resource>-<phase>-<utc>.json
├── grafana/<dashboard>-<panel>-<phase>-<utc>.json
├── screenshots/grafana/<dashboard-uid>-<scenario>-<phase>-<utc>.png
├── graphs/<signal>-<scenario>-<phase>-<utc>.png
└── assets/manifest.md
```

각 raw JSON에는 query 원문, UTC `from/to`, 대상 namespace/route/`version`, 결과,
counter reset 여부, redaction 상태를 넣는다. 값이 없을 때 파일을 삭제하지 말고
`status=UNMEASURED` 또는 `status=OBSERVABILITY_BLOCKED`, `reason`, `next_check`를
넣는다.

### 7.2 Query와 캡처 규칙

아래는 실행자가 실제 metric/label 이름을 확인해 채우는 query **형식**이다. 실제
query와 결과를 raw 파일에 그대로 보관하고, placeholder를 측정값처럼 발표하지 않는다.

| 시스템 | 최소 query/캡처 | 필수 field |
| --- | --- | --- |
| Prometheus | `increase(istio_requests_total{route=...,version=...}[window])`; `histogram_quantile(0.95, sum by (le,version) (rate(<request_duration_bucket>{...}[window])))`; CPU/memory/restart/Kafka lag query | query 원문, UTC window, route/status/version, unit, result/empty, reset 여부 |
| Grafana | 고정 dashboard UID·panel ID·query ref와 같은 UTC time range의 PNG | UID, panel, from/to, datasource, redaction flag. 비밀 header·payload가 보이면 저장하지 않음 |
| Loki | `{app=~"order|payment|notification"} \| json \| run_id="<run_id>"` 또는 request/correlation ID query | query, redacted JSON field excerpt, match count, trace/order ID 최소 식별자 |
| Tempo | ingress trace search에서 HTTP span과 Kafka/outbox span을 열고 status/timestamp를 기록 | query, trace/span 최소 ID(필요시 부분 마스킹), service/version, span start/end/status |
| Kubernetes | `kubectl get deploy,pod,pdb,endpoints,events -n <ns> -l app=order-service -o yaml`; v1/v2 selector를 별도 실행 | Pod name/UID/node/readiness/restart, `version`, PDB minAvailable/disruptionsAllowed, event time, target/control |

Prometheus는 누적 절대값을 발표하지 않고 실행 window의 `increase()` 또는 bounded
delta를 사용한다. Loki/Tempo query가 빈 결과이면 “로그가 없었다”가 아니라 해당
signal을 `UNMEASURED`로 남기고, 기능 판정에 필요한 correlation이면
`OBSERVABILITY_BLOCKED`로 낮춘다. Kubernetes snapshot만 있고 Prometheus/Grafana가
없다면 live latency gate를 통과했다고 쓰지 않는다.

### 7.3 `summary.csv` 최소 schema와 rows

```csv
run_id,scenario,phase,signal,value,unit,version,verdict,source_artifact,redaction
<run_id>,04,L1,api_p95,UNMEASURED,ms,v1,OBSERVABILITY_BLOCKED,raw/prometheus/04-L1-<utc>.json,redacted
<run_id>,OrderRecovery,C,RTO,UNMEASURED,s,v2,OBSERVABILITY_BLOCKED,raw/kubernetes/order-recovery-C-<utc>.json,redacted
<run_id>,NetworkChaos,C,target_control_impact,UNMEASURED,classification,v1,OBSERVABILITY_BLOCKED,raw/loki/networkchaos-C-<utc>.json,redacted
```

모든 phase에 최소 `request_count`, `actual_rps`, `api_p50`, `api_p95`, `e2e_p50`,
`e2e_p95`, `unexpected_5xx`, `timeout`, `cpu`, `memory`, `restart_count`,
`kafka_lag`, `trace_log_match`, `endpoint_ready` 행을 두고, 해당 없는 signal은
`UNMEASURED`와 이유를 적는다. v1/v2를 구분할 수 없는 행은 `version=unknown`으로
숨기지 말고 `version=UNMEASURED`와 `OBSERVABILITY_BLOCKED`를 사용한다.

## 8. 발표 graph·artifact 표

발표자는 아래 순서로 각 run을 연다. 한 행의 artifact가 없으면 그 칸은
`UNMEASURED` 카드로 표시하고, 가짜 PNG·값·trace ID를 만들지 않는다.

| 발표 artifact | 화면/그래프 내용 | 데이터 source | 필수 annotation·판정 |
| --- | --- | --- | --- |
| A. Run cover | AWS dev 식별자, parent/phase run ID, UTC window, GitOps revision, fixture, v1=2/v2=2, PDB v1/v2=1 | run `README.md` | 범위·operator·redaction·`PASS/FAIL/BLOCKED` 요약, production SLO 아님 |
| B. Business card | 04/05/06 state transition, status 분포, notification/release/oversell | scenario result + `summary.csv` | expected `409`/`card_declined`와 unexpected 5xx를 분리 |
| C. Latency/error | RPS, API p50/p95, E2E p50/p95, unexpected 5xx; v1/v2 line과 합계 | Grafana screenshot + Prometheus raw | API 1s/E2E 10s experimental gate line, UTC start/end |
| D. Capacity/version | v1/v2 CPU/memory, endpoint/replica, restart, PDB, Kafka lag/DB headroom | Grafana/Kubernetes/Prometheus | 총 4 replica와 버전별 2 replica 영향, PDB minAvailable=1, label/query |
| E. 04/05/06 correlation | trace waterfall와 Loki event sequence | Tempo + Loki redacted raw | request/run correlation, missing span/log는 `OBSERVABILITY_BLOCKED` |
| F. Order recovery timeline | delete/fault, endpoint 제거, replacement Ready, first normal, RTO | **Grafana screenshot + Prometheus query/result + Loki redacted correlation + Tempo trace/span + Kubernetes Pod/PDB/Event snapshot** 및 client result | RTO 120s gate, target version/UID, same-version/other-version 상태 |
| G. NetworkChaos isolation | Chaos start/end, target Pod, same-version control, target/control error·readiness, cleanup/post | **Grafana screenshot + Prometheus query/result + Loki redacted correlation + Tempo trace/span + Kubernetes Pod/NetworkChaos/Event snapshot** 및 Chaos YAML/manifest | 30s bounded fault, target only, control untouched, post normal/RTO if measured |
| H. Verdict/limits | 차원별 verdict와 미측정 목록 | run README + manifest | `UNMEASURED`, `OBSERVABILITY_BLOCKED`, `NOT RUN`; 생산 SLO/HA 주장 금지 |

### 8.1 발표 artifact checklist

- [ ] Run README를 열어 AWS dev, UTC, revision, fixture, target/control, v1/v2 replica와
  PDB를 확인했다.
- [ ] `summary.csv`에서 04·05·06 F/L1/L2, Order recovery, NetworkChaos가 각각
  `PASS`/`FAIL`/`BLOCKED`/`NOT RUN`으로 채워졌고 source path가 존재한다.
- [ ] Prometheus/Grafana panel에 RPS·API/E2E p95·5xx가 같은 UTC 축으로 있고, API 1s·
  E2E 10s gate를 실험 gate라고 표시했다.
- [ ] v1/v2 version label, CPU/memory, endpoint/restart, PDB, Kafka lag를 합계와
  분리해 표시했다. label 없는 그래프는 성공 그래프가 아니다.
- [ ] 04는 terminal/알림 1건·idempotency, 05는 decline/release·중복 없음, 06은
  barrier/stock·release/재구매를 보여 준다.
- [ ] Order recovery에는 target Pod name/UID, deletion·Ready·first normal 시각과
  RTO가 있다. `RTO≤120s`는 이 실행 gate일 뿐 SLA가 아니다.
- [ ] NetworkChaos에는 정확히 한 target Pod와 같은 버전 control Pod, 30초 제한,
  cleanup/post 결과가 있다. control 또는 다른 version에 대한 주장을 섞지 않았다.
- [ ] Loki·Tempo·Kubernetes 원문은 redacted 상태이며 query·UTC window·match/empty
  상태를 함께 볼 수 있다.
- [ ] 실제 존재하는 PNG/SVG만 링크했고, 미캡처 자산은 `UNMEASURED`로 표시했다.
- [ ] 마지막 슬라이드에 관측 권한·빈 signal·단일 실행·AWS dev 한계를 적었으며,
  production SLO/SLA·30일 Error Budget·HA를 주장하지 않았다.

## 9. Redaction과 정직한 결과 규칙

다음 값은 Markdown, CSV, raw JSON, Grafana 화면, PNG/SVG, 로그 excerpt에 저장하지
않는다: password, JWT/token, cookie, raw `Authorization` header, 개인 email, 운영
customer/order/payment payload. request/trace/order ID는 실행 전용 최소 식별자만
남기고 필요하면 부분 마스킹한다. query의 label·dashboard UID·panel ID·UTC 범위는
기록할 수 있지만 비밀 값은 `<REDACTED>`로 치환한다.

스크린샷을 아직 찍지 않았다면 PNG를 복사하거나 빈 placeholder를 만들지 않는다.
실행하지 않은 phase는 `NOT RUN`, 실행했으나 query가 비어 있으면
`UNMEASURED`/`OBSERVABILITY_BLOCKED`를 사용한다. 그래프에 임의의 p95, RTO, RPS,
trace ID를 채우거나 기존 04 기능 결과에서 L1/L2/chaos 성공을 추론하지 않는다.

## 10. Manual-QA opening path

1. [AWS dev run-ID 안내](../../evidence/purchase-e2e/aws-dev/README.md)를 연다.
2. 실제 실행된 날짜/run ID만 선택해 그 폴더의 `README.md`를 먼저 연다.
3. `summary.csv`에서 scenario·phase·version·verdict·source artifact를 확인한다.
4. `assets/manifest.md`와 `screenshots/grafana/`를 열고, 실제 파일이 있을 때만 그래프를
     연다. 이어서 `graphs/` → `raw/prometheus/` → `raw/loki/` → `raw/tempo/` →
   `raw/kubernetes/` 순으로 query와 결과를 대조한다.
5. 현재 예시 run인 [04 결과 README](../../evidence/purchase-e2e/aws-dev/2026-07-24-aws-purchase-20260724T014919Z-c4e07388/README.md)는 기능 smoke의
   redacted 결과와 관측성 `UNMEASURED` 상태를 함께 보여 주므로, 이 opening path가
   미측정 값을 성공으로 바꾸지 않는지 확인하는 수동 QA 출발점으로만 사용한다.

## 11. 완료 조건

문서 설계 자체의 완료는 다음을 모두 만족할 때다.

- 04·05·06, L1, L2, Order Pod recovery, bounded NetworkChaos가 각각 목적·가설·
  성공/실패/blocked와 signal/source를 가진다.
- AWS dev 외부 Istio, Order v1=2/v2=2, version label, 버전별 PDB `minAvailable=1`,
  용량 영향, same-version control이 명시된다.
- API p95≤1s, E2E p95≤10s, RTO≤120s가 실험 gate로만 정의된다.
- Grafana/Prometheus/Loki/Tempo/Kubernetes query·파일·redaction 규칙과 UTC capture
  phases가 존재한다.
- 실제 측정값·스크린샷을 만들거나 기존 결과를 확장 주장하지 않는다.

이 문서가 추가됐다고 AWS traffic, live telemetry, 기능 PASS, 복구 RTO 또는
NetworkChaos 성공이 발생한 것은 아니다. 실행 후에는 반드시 run-ID evidence contract에
따라 artifact를 채우고 위의 Manual-QA 순서로 검증한다.
