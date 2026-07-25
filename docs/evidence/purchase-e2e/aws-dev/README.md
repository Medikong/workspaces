# AWS dev 구매 실험 run-ID / asset 안내

이 폴더는 AWS dev Istio 구매 실험의 **실행별 증거 경계**다. 아직 실행하지 않은 상태에서는 run-ID 하위 폴더나 빈 screenshot/raw 파일을 만들지 않는다. 발표용 해석은 [readout skeleton](../../../architecture/purchase-e2e/aws-istio-purchase-experiment-readout.md)과 기존 [구매 evidence 기준](../README.md)을 함께 따른다.

## Run-ID directory contract

한 번의 실행은 `aws-dev/<YYYY-MM-DD>-<run_id>/` 하나로 격리한다. `<run_id>`는 UTC 시각·실험 목적을 구분하는 실행 전용 식별자이며 credential, email, JWT를 포함하지 않는다.

```text
<YYYY-MM-DD>-<run_id>/
├── README.md                         # 실행 조건, verdict, 한계, redaction 상태
├── summary.csv                       # signal별 raw count/value/source/verdict
├── raw/
│   ├── prometheus/<scenario>-<phase>-<utc>.json
│   ├── loki/<scenario>-<phase>-<utc>.json
│   ├── tempo/<scenario>-<phase>-<utc>.json
│   └── kubernetes/<resource>-<phase>-<utc>.json
├── grafana/                          # dashboard UID/panel/query metadata only
├── screenshots/
│   └── grafana/<dashboard-uid>-<scenario>-<utc>.png
├── graphs/
│   ├── <signal>-<scenario>-<utc>.png
│   └── <signal>-<scenario>-<utc>.svg
└── assets/
    └── manifest.md                   # optional link/checksum/redaction manifest
```

`README.md`에는 AWS dev/ingress의 비밀이 아닌 식별자, run-ID, UTC 시작·종료, operator/maintenance window, GitOps enable·rollback revision, fixture 경계, 04/05/06·load·chaos verdict, `UNMEASURED`/`OBSERVABILITY_BLOCKED` 사유를 기록한다. 실행하지 않은 항목은 `NOT RUN`으로 명시한다.

## Summary schema and metric contract

`summary.csv`는 한 행에 한 signal을 적고, 측정 불가 값은 빈 칸 대신 `UNMEASURED` 또는 `BLOCKED`를 쓴다.

```csv
run_id,scenario,phase,signal,value,unit,verdict,source_artifact,redaction
<run_id>,04,L1,p50,UNMEASURED,ms,OBSERVABILITY_BLOCKED,raw/prometheus/04-L1-<utc>.json,redacted
```

필수 signal은 request/iteration raw count, actual RPS, p50, p95, 5xx count/rate, trace/log match, Pod readiness/endpoint, restart count, CPU/memory, Kafka lag, fault 시각, replacement Ready 시각, 관측 RTO seconds다. `increase()`/bounded delta query와 UTC window를 raw Prometheus JSON에 함께 저장한다.

## Asset rules and relative links

Grafana metadata에는 dashboard UID·panel·query·UTC time range·redaction 상태만 둔다. PNG/SVG 그래프는 RPS/p50/p95/5xx, resource/lag, chaos/recovery timeline을 동일 UTC 축으로 표시하며, 데이터가 없으면 `UNMEASURED` 주석을 그린다. Raw Loki/Tempo/Kubernetes 파일은 query와 redacted match, span/event, Pod UID/readiness/restart를 포함한다.

다른 문서에서 asset을 가리킬 때의 상대 경로 예시는 다음과 같다.

`[04 L1 Grafana capture](../../../evidence/purchase-e2e/aws-dev/<YYYY-MM-DD>-<run_id>/screenshots/grafana/<dashboard-uid>-04-L1-<utc>.png)`

이 링크는 실제 run-ID 디렉터리에 파일이 생긴 뒤에만 발표 자료에서 활성 링크로 취급한다. placeholder 링크를 실행 증거로 세지 않는다.

## Redaction gate

저장 전 정적 검사는 password 값, JWT/token 값, cookie, raw `Authorization` header, 개인 email, 운영 payload를 거부해야 한다. 키 이름과 query 문구는 문서화할 수 있지만 값은 `<REDACTED>` 또는 `UNMEASURED`로 바꾼다. request/trace/order ID는 실행 전용·최소 식별자만 남긴다.

검사 실패 시 해당 artifact를 발표용 결과로 연결하지 않고 `BLOCKED`로 판정한다. 실제 비밀을 테스트 fixture나 evidence 파일에 심지 않는다.

## Status and stale-state semantics

- `PASS`: 기능 assertion과 필요한 live evidence가 모두 존재한다.
- `FAIL`: 실행은 되었으나 assertion, threshold, cleanup 또는 recovery가 실패했다.
- `BLOCKED`: preflight/권한/fixture/관측성 gate가 충족되지 않아 다음 traffic을 시작하지 않았다.
- `OBSERVABILITY_BLOCKED`: 실행 흔적은 있으나 Prometheus/Loki/Tempo/Kubernetes 중 필요한 신호가 비어 있다.
- `NOT RUN`: 이 skeleton만 있고 해당 run-ID 실행은 아직 없다.

정적 render/validator PASS를 live metric·trace·log·Grafana·RTO 성공으로 재해석하지 않는다. 실행 결과가 없을 때 이 폴더에는 이 안내 파일만 존재하는 것이 정상이다.

## Retention and cleanup

run-ID 폴더의 원문은 redaction 확인 후 보관하고, 발표 자료에는 최소 링크와 요약만 복사한다. token/cookie/raw payload가 발견되면 즉시 노출 경로를 차단하고 artifact를 `BLOCKED`로 표시한 뒤 정해진 보안 보관 절차를 따른다. AWS 자원 cleanup/rollback 시각과 operator는 run README에 남긴다.
