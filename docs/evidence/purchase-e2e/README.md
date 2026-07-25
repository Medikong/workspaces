# Purchase E2E Evidence

이 폴더는 [구매 생명주기 E2E 검증 설계](../../architecture/purchase-e2e/README.md)를 실제 AWS dev에서 실행한 결과를 보관한다.

설계 문서와 결과 문서를 분리하는 이유는 간단하다. 설계에는 “무엇을 확인할지”를, evidence에는 “언제 어떤 조건에서 무엇을 관측했는지”를 남긴다.

## 폴더 규칙

```text
purchase-e2e/
  aws-dev/
    YYYY-MM-DD-<run_id>/
      README.md
      summary.csv
      04-happy-purchase-results.md
      05-payment-failure-results.md
      06-sold-out-concurrency-results.md
      order-recovery-drill-results.md
      raw/
        prometheus/<scenario>-<phase>-<utc>.json
        loki/<scenario>-<phase>-<utc>.json
        tempo/<scenario>-<phase>-<utc>.json
        kubernetes/<pods|events|deployments>-<phase>-<utc>.json
      screenshots/
        grafana/<dashboard-uid>-<scenario>-<utc>.png
      graphs/
        <metric>-<scenario>-<utc>.png
        <metric>-<scenario>-<utc>.svg
      assets/                       # optional manifest/query metadata only
```

실행 전에는 `aws-dev/` 하위에 빈 결과 폴더를 만들지 않는다. 실제로 실행한 `run_id`만 보관한다.

## 발표용 run-ID 증거 계약

`aws-dev/<YYYY-MM-DD>-<run_id>/`는 한 번의 AWS dev 실행을 발표자가 독립적으로 열어 볼 수 있는 경계다. 아래 파일은 **필수**이며 이름만 바꾸어 누락하지 않는다.

| 필수 artifact | 보이는 내용과 규칙 |
| --- | --- |
| `README.md` | 한 페이지 요약: AWS dev/ingress 식별자, run ID, UTC 시작·종료, operator·maintenance window, GitOps enable/rollback revision, fixture 경계, 04/05/06 및 각 chaos round의 `PASS`/`FAIL`/`BLOCKED`, `UNMEASURED`/`OBSERVABILITY_BLOCKED` 사유, 한계와 결론 |
| `summary.csv` | 시나리오·phase·signal·raw count·RPS·p50·p95·5xx·CPU/memory·Kafka lag·recovery seconds·verdict·source artifact를 한 행씩 기록. 측정하지 않은 값은 빈칸 대신 `UNMEASURED` 또는 `BLOCKED` |
| `raw/prometheus/*.json` | 실행 전/중/후 UTC query 원문, `increase()`/bounded delta 결과, counter reset 여부와 query 시각 |
| `raw/loki/*.json` | `run_id`/request ID/correlation ID를 JSON field로 찾은 redacted log 결과. raw payload, token, cookie, email은 제외 |
| `raw/tempo/*.json` | trace ID, HTTP/Kafka span ID·시각·상태와 조회 query. trace가 없으면 `UNMEASURED`/`OBSERVABILITY_BLOCKED` |
| `raw/kubernetes/*.json` | Deployment/Pod/endpoint/PDB, UID·node·readiness·restart, Event, Kafka/DB snapshot을 실행 전·중·후로 저장 |
| `screenshots/grafana/*.png` | 고정 dashboard UID, UTC time range, panel/query 식별자와 redaction 상태를 README에 기록. 비밀번호·Authorization header를 화면에 남기지 않음 |
| `graphs/*.png` 및/또는 `graphs/*.svg` | (1) scenario verdict, (2) RPS·p50·p95·5xx, (3) CPU/memory·Kafka lag, (4) Eviction/NetworkChaos 시작·종료·replacement Ready를 동일 UTC 축으로 표시. 데이터가 없으면 `UNMEASURED` 카드/주석을 그린다 |

필수 artifact 하나라도 생성할 수 없거나 신호가 비어 있으면 결과 행·그래프·README 카드를 삭제하지 않는다. 해당 위치에 `UNMEASURED` 또는 `BLOCKED`를 명시하고 기능/부하/복구 verdict를 `OBSERVABILITY_BLOCKED`로 낮춘다. 정적 render/validator PASS는 live Prometheus·Loki·Tempo·Kubernetes 신호나 Grafana 화면을 대신하지 않는다.

`summary.csv`의 최소 header는 다음과 같다.

```csv
run_id,scenario,phase,signal,value,unit,verdict,source_artifact,redaction
<run_id>,04,F,p95,UNMEASURED,ms,OBSERVABILITY_BLOCKED,raw/prometheus/04-F-<utc>.json,redacted
```

## 결과 문서 최소 형식

각 결과 문서에는 아래 내용을 포함한다.

| 항목 | 기록 내용 |
| --- | --- |
| 식별 | 실행일, UTC 시작/종료, run ID, GitOps revision, image digest |
| 조건 | ingress URL의 비밀이 아닌 식별 정보, fixture, 사용자 역할, replica 수 |
| phase | F/L1/L2/C, 목표·실제 rate 또는 worker 수, duration, fault 시각 |
| 기능 | 요청 수, status code 분포, 주문·결제·알림·재고 결과 |
| 부하 | iteration 수, RPS, p50/p95, 예상 밖 오류율, 자원 포화, consumer lag |
| 카오스 | 대상 Pod/UID, 장애·endpoint 제거·replacement Ready·첫 정상 응답 시각, 복구 시간 |
| 관측성 | Prometheus query와 값, Loki query와 redacted excerpt, Tempo trace ID, Kubernetes event |
| 판정 | 기능 PASS/FAIL/BLOCKED, 부하 PASS/FAIL/BLOCKED, 복구 RECOVERY_PASS/FAIL/BLOCKED와 근거 |
| 한계 | 관측하지 못한 신호, 실행하지 않은 항목, 30일 SLO 미측정 여부 |

## 보안 규칙

- password, JWT, cookie, Authorization header, 개인 email, 고객 주문 데이터는 저장하지 않는다.
- request ID, trace ID, order ID는 필요한 경우 일부 마스킹하거나 실행 전용 ID만 기록한다.
- Grafana·Loki·Tempo 캡처는 query 시간 범위와 마스킹 여부를 함께 남긴다.

## 해석 규칙

이 결과는 AWS dev의 한 실행 구간에 대한 증거다. 짧은 실행 성공을 production readiness, 30일 SLO, Error Budget 충족, HA 보장으로 확대 해석하지 않는다.
