# AWS Istio 구매 실험 실행 런북

이 런북은 시나리오 04·05·06과 Order Pod 복구 드릴을 AWS dev에서 실행할 때 사용한다. 목적은 실행을 강행하는 것이 아니라, 안전하지 않거나 증거가 부족한 상태를 `BLOCKED`로 분명히 남기는 것이다.

## 1. 실행 전 안전 gate (mutable traffic 앞에서)

이 문서는 **AWS dev의 실제 Istio ingress만** 대상으로 한다. 아래 표의 확인은 AWS control node에서 read-only 명령으로 수행하고, 각 결과와 UTC 시각을 run-ID `README.md`에 붙인다. `<...>`는 실행 전에 채우는 placeholder이며 credential, JWT, cookie, 개인 식별자는 문서나 Git에 넣지 않는다. 모든 행이 `PASS`가 아니면 구매 요청·부하·Eviction·NetworkChaos를 시작하지 않고 즉시 `BLOCKED`로 기록한다.

| gate | 확인 가능한 명령/관측 | PASS 조건 | 실패 시 처리 |
| --- | --- | --- | --- |
| 범위·운영자 | `kubectl config current-context`; AWS 계정/cluster 식별자, `<MAINTENANCE_WINDOW_UTC>`, `<OPERATOR>`와 연락 가능한 두 번째 운영자를 결과에 기록 | context가 AWS **dev**이고 운영 창·operator·run_id가 고정됨 | production/미확인 context, 창 또는 operator 누락이면 `BLOCKED` |
| GitOps revision/health | `argocd app get <aws-dev-root-app> -o json` 및 대상 child Application의 `status.sync.revision`, `status.health.status` 저장 | 계획한 revision이 명시되고 root/child가 `Synced`/`Healthy` | drift, `OutOfSync`, `Degraded`, revision 미확인이면 `BLOCKED` |
| Istio Gateway/VirtualService/Authz | `kubectl get gateway,virtualservice,authorizationpolicy -n istio-system medikong-internal medikong-aws-dev medikong-aws-protected-routes -o yaml` | Gateway listener/host, AWS `VirtualService`의 `/orders`, `/payments`, `/notifications` route, ext-authz `AuthorizationPolicy`가 렌더 결과와 일치하고 Kong route가 없음 | route/selector/provider/host 불일치 또는 Kong 경로이면 `BLOCKED` |
| 외부 ingress·인증 denial/allow | 무인증 `curl --fail-with-body -sS -o <redacted-response> -w '%{http_code}' "$AWS_INGRESS_URL/orders..."`; 이후 메모리의 실제 JWT로 동일 protected path를 호출 | 무인증은 401/403, 유효 JWT만 의도한 2xx/4xx business 응답을 받으며 `X-User-*` 신뢰 헤더를 보내지 않음 | ingress URL 미확인, 무인증 허용, JWT 거부, synthetic header fallback이면 `BLOCKED` |
| 서비스·sidecar readiness | `kubectl get deploy,pod,endpoints -n <order-ns> -l app=order-service -o wide`; Payment/Notification 및 auth/catalog/coupon/interest/user/web에도 반복하고 `kubectl get pods -A -o <sidecar-columns>` 저장 | 대상 서비스 Pod/endpoint와 Envoy sidecar가 Ready; Istio 정적 계약의 9개 app/namespace가 확인됨 | Pending/CrashLoop/NotReady, endpoint 부족, sidecar 누락이면 `BLOCKED` |
| PostgreSQL·Kafka | `kubectl get pods -n <db-ns> -o wide`; `kubectl get pods -n <kafka-ns> -o wide`; read-only DB connection/Kafka group·lag snapshot 저장 | DB primary/replica, connection headroom, broker/group/partition/lag가 실험 기준선 안 | DB/Kafka unavailable, connection/lag 악화, snapshot 누락이면 `BLOCKED` |
| 관측성 target | `kubectl get podmonitor,servicemonitor -A`; Prometheus `up`/`increase()` query, Loki `run_id` field query, Tempo trace lookup, Kubernetes Pod/Event read probe를 각각 저장 | Prometheus/Loki/Tempo/Kubernetes 조회 권한·target이 살아 있고 query 원문과 빈 결과가 구분됨 | target/권한/trace/log/event 중 하나라도 없거나 정적 render만 확인된 경우 `BLOCKED` (`UNMEASURED`로 숨기지 않음) |
| fixture·identity 경계 | synthetic customer A/B, 전용 drop/product와 초기 재고, 새 run_id를 redacted manifest로 확인 | 운영 고객·실결제·공유 DB reset 없이 전용 데이터만 사용하고 재사용 record가 없음 | 전용 fixture/두 JWT/재고 경계 미확인 또는 reset 필요 시 `BLOCKED` |
| 증거·redaction | `<EVIDENCE_ROOT>/aws-dev/<YYYY-MM-DD>-<run_id>/` 쓰기/읽기 확인; README·CSV·raw·Grafana·PNG/SVG 목록을 미리 생성하고 redaction check 실행 | 모든 결과가 run-ID 아래 저장되고 token/cookie/Authorization/email/raw payload가 제거됨 | 디렉터리·원문 query·redaction 검사 실패면 `BLOCKED` |
| rollback·abort 계약 | `git show <ROLLBACK_REVISION> --stat`; 아래 placeholder 명령을 operator가 dry-run으로 검토 | 원상복구 revision, 삭제 대상, abort threshold, 연락 순서가 사전에 기록됨 | rollback 경로/threshold/operator 승인 누락이면 `BLOCKED` |

다음은 실행 중단 기준이다.

- 의도하지 않은 namespace 또는 서비스가 불안정해진 경우
- 테스트 전용이 아닌 데이터·계정·결제 경로를 사용하려는 경우
- JWT, ingress, fixture, 관측성 중 하나가 준비되지 않은 경우
- Pod 삭제 중 대상 외 Pod가 종료되거나 DB/Kafka 상태가 악화된 경우
- 예상 밖 5xx가 60초 동안 5%를 넘거나 p95가 3초를 넘는 상태가 2개 연속 1분 창에서 유지되는 경우
- CPU 또는 memory saturation이 90%를 넘는 상태가 2분 이상 지속되는 경우
- business 불변식 위반, oversell, 중복 terminal state가 한 건이라도 발견된 경우

### ABORT (즉시 중단)와 안전한 rollback placeholder

위 조건 중 하나라도 관측되면 다음 순서를 run-ID `README.md`에 UTC 시각과 operator로 기록한다. `<...>`는 실제 리소스를 확인한 뒤에만 치환한다. 명령을 복사해 광범위한 selector를 만들거나 `kubectl scale`, 공유 DB reset, Argo self-heal 중지를 수행하지 않는다.

```bash
# 1) 새 요청/카오스 입력을 중지하고 현재 상태를 read-only로 보존
<RUNNER_STOP_COMMAND> --run-id <run_id>
kubectl get pod,events -n <target-namespace> -o yaml > <run-dir>/raw/kubernetes/abort-<utc>.yaml

# 2) 이미 생성된 단일 NetworkChaos만 이름으로 제거 (없어도 실패하지 않음)
kubectl delete networkchaos <networkchaos-name> -n <target-namespace> --ignore-not-found

# 3) 준비된 GitOps rollback revision을 sync하고 health를 기다림
argocd app sync <aws-dev-root-app> --revision <ROLLBACK_REVISION> --prune=false
argocd app wait <aws-dev-root-app> --sync --health --timeout <ROLLBACK_TIMEOUT_SECONDS>

# 4) 대상 child Application과 Pod/endpoint를 재확인하고 결과를 닫음
argocd app get <target-child-app> -o json > <run-dir>/raw/kubernetes/rollback-<utc>.json
kubectl get deploy,pod,pdb -n <target-namespace> -o yaml > <run-dir>/raw/kubernetes/rollback-state-<utc>.yaml
```

Rollback 명령 자체가 실패하거나 target 외 리소스가 변하면 rollback은 `FAIL`이며 실험을 성공으로 표시하지 않는다. 변경 전 revision, rollback revision, migration hook 결과, NetworkChaos 삭제 결과와 `BLOCKED`/`FAIL` 사유를 모두 보존한다. 정적 validator/render PASS는 live telemetry나 rollback 성공을 증명하지 않는다.

## 2. 공통 실행 순서

```text
1. UTC 시작 시각과 run_id 기록
2. Argo/Istio/Pod/DB/Kafka/관측성 preflight
3. synthetic customer A/B 로그인, JWT를 메모리에서만 사용
4. fixture의 시작 재고와 활성 record 확인
5. F 기능 smoke 실행
6. L1 기준 부하 실행 및 증거 수집
7. abort 기준이 없으면 L2 단계 부하 실행
8. 새로운 run/fixture로 C 카오스·복구 실행
9. 종료 시각 기록
10. Prometheus/Loki/Tempo/Kubernetes 증거 수집
11. 기능·부하·복구를 각각 PASS / FAIL / BLOCKED 판정
12. 실패 상태와 결과 파일 보관, credential/token은 삭제·redaction
```

JWT, cookie, password, raw Authorization header는 결과 문서·스크린샷·Git에 남기지 않는다. 기능, 부하, 카오스 phase는 서로 다른 `run_id`를 사용해 시간 창과 데이터를 분리한다.

## 3. 공통 부하 모델과 중단 기준

04·05의 최초 기본 부하는 `R0=6 journeys/min`이다.

```text
F: 1 iteration
L1: R0, 5분
L2-A: 2R0, 5분
L2-B: 4R0, 5분 (안전할 때만)
C: R0, 장애 전 1분 + 장애/복구 + 복구 후 2분
```

06은 동시 worker `5 → 10 → 20`을 사용하고 각 정상 부하 단계를 3개의 독립 round로 반복한다.

중단 기준이 발생하면 더 높은 부하 단계와 카오스 단계를 실행하지 않는다. 중단은 실패를 숨기는 동작이 아니라 실험 결과이며, 마지막 안전 단계와 중단 원인을 기록한다.

부하 단계마다 다음 값을 남긴다.

- 시작/종료 UTC, 목표 rate 또는 worker 수, 실제 iteration·요청 수
- 성공·업무 실패·예상 밖 4xx·5xx·timeout 분포
- E2E 및 API 단계별 p50/p95, 최대 RPS
- CPU·memory, replica, restart, DB connection, Kafka consumer lag
- 주문·결제·알림·재고의 최종 불변식

## 4. 관측성 수집 기준

### Prometheus

실행 전후 동일한 UTC 시간 창으로 다음을 확인한다.

- Istio request count와 response code delta
- Order/Payment/Notification의 5xx delta
- p95 latency
- consumer lag 또는 비동기 처리 지연

counter는 이미 누적되어 있으므로 절대값이 아니라 `increase()` 또는 실행 시간 창의 delta를 기록한다. Pod 재시작으로 counter가 reset됐는지도 함께 기록한다.

### Loki

`run_id` 또는 request ID를 JSON field에서 검색한다. 최소한 주문 생성, 결제 처리, 주문 terminal state, 알림 또는 재고 해제의 로그를 연결한다.

동적 값은 Loki label이 아니라 로그 본문 field로 다룬다.

### Tempo

ingress 요청에서 시작한 trace ID로 HTTP span과 Kafka/outbox 처리 span을 확인한다. span이 없으면 “정상”이라고 추정하지 않고 `OBSERVABILITY_BLOCKED`로 기록한다.

### Kubernetes

관련 Deployment, Pod, container readiness, restart count, event를 실행 전·후로 저장한다. Pod가 재시작됐으면 그 시각을 Prometheus/Loki/Tempo query 시간 창과 맞춘다.

## 5. 시나리오별 카오스 대상

| 시나리오 | 장애 대상 | 검증 목적 |
| --- | --- | --- |
| 04 | 정확히 확인한 Order Pod 1개 | 구매 트래픽 중 영향, replacement Ready, 중복 없는 생명주기 복구 |
| 05 | 정확히 확인한 Payment API/worker Pod 1개 | 결제 실패 event backlog와 재고 해제의 단일 처리 복구 |
| 06 | barrier release 직후 Order Pod 1개 | 응답 유실 상황에서도 oversell·중복 주문이 없는지와 복구 후 정상 round |

각 카오스 phase는 기능/부하 phase와 다른 fixture를 사용한다. 하나의 fault만 주입하고, 두 Pod나 DB/Kafka를 동시에 장애 내지 않는다.

Payment worker 역할이나 owner를 확인할 수 없으면 05 카오스는 실행하지 않고 `BLOCKED`로 기록한다.

## 6. Order Pod 복구 드릴

현재 Order가 단일 replica이면 이 절차는 무중단 또는 HA 검증이 아니다. “Order Pod 하나가 사라졌을 때 얼마나 빨리 복구되는가”를 측정하는 드릴이다.

### 절차

1. Order Deployment의 replica 수, Pod 이름, Pod UID, readiness를 기록한다.
2. 계속 상태를 확인하는 read-only probe를 시작한다.
3. 전용 run의 주문 하나를 만들고, 비동기 handoff 상태를 기록한다.
4. **확인한 Pod 이름과 UID 하나만** 삭제한다. broad label delete를 사용하지 않는다.
5. 오류 코드 수, timeout 수, replacement Pod Ready 시각, 주문·결제·알림 중복 여부를 수집한다.
6. 대상 외 서비스나 DB/Kafka가 악화되면 즉시 중단하고 rollback/복구 상태를 기록한다.

### 결과 해석

| 결과 | 해석 |
| --- | --- |
| Pod가 교체되고 기능 상태가 일관됨 | 복구 동작 확인 |
| 장애 구간에 5xx/timeout 발생 | 단일 replica recovery drill에서 관측된 영향으로 기록 |
| 주문/결제/알림이 중복 terminal state | 기능 실패 |
| Pod가 Ready로 돌아오지 않음 | 복구 실패 |

Istio retry 또는 circuit breaker가 효과가 있었다고 주장하려면 해당 정책과 retry 증거를 별도로 확인해야 한다. Pod 교체만으로 이를 추정하지 않는다.

## 7. 브라우저 확인 범위

AWS web은 현재 실제 auth/checkout 연동이 없는 상태다. 따라서 브라우저 확인은 다음까지만 한다.

- Istio ingress를 통한 page delivery
- catalog 화면 렌더링
- auth/checkout unavailable 상태가 사용자에게 명확히 보이는지
- 해당 요청의 request ID와 로그 상관관계

브라우저에서 구매 완료를 검증했다고 기록하지 않는다. 구매 생명주기의 판정은 API 시나리오 04·05·06이 담당한다.

## 8. 결과 보관

실행 결과는 [evidence/purchase-e2e](../../evidence/purchase-e2e/README.md)에 `aws-dev/<YYYY-MM-DD>-<run_id>/` 형태로 남긴다. 결과마다 실행 조건, raw count, p95, 상태 분포, query 원문, trace ID, redacted log, screenshot, PASS/FAIL/BLOCKED를 포함한다.
