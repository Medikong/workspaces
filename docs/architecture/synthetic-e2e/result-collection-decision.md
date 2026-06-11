# Synthetic 실행 결과 수집 결정

결정일: 2026-06-10

열린 질문:

```text
k6 metric을 Prometheus로 직접 보낼지, 우선 Loki 로그와 Kubernetes Job 상태만 사용할지 결정해야 한다.
```

## 결정

1차 구현에서는 k6 metric을 Prometheus로 직접 보내지 않는다.

우선 Kubernetes Job 상태와 k6 로그로 synthetic 실행이 잘 되는지 확인한다. k6 Job 로그와 애플리케이션 로그는 OpenTelemetry Collector contrib DaemonSet이 Kubernetes container log에서 `filelog` receiver로 수집해 Loki의 OTLP endpoint로 보낸다. k6 Prometheus remote write는 시나리오 구조, 단계 이름, label 정책이 안정된 뒤 2차로 검토한다.

```text
1차
-> k6 threshold로 process exit code 결정
-> Kubernetes Job succeeded/failed 확인
-> k6 console/JSON log 확인
-> OpenTelemetry Collector filelog receiver가 container log 수집
-> Loki에서 실행 로그 조회
-> X-Request-Id, X-Trace-Id, traceparent로 실패 지점 추적

2차 후보
-> k6 Prometheus remote write
-> Grafana synthetic success/latency dashboard
-> Alertmanager 연속 실패 알림
```

## 여기서 말하는 k6 metric

이 문서에서 말하는 metric은 서비스가 직접 노출하는 Prometheus metric이 아니라, k6 실행기가 만든 테스트 결과 metric이다.

예시:

| k6 metric | 의미 |
|---|---|
| `http_reqs` | k6가 보낸 HTTP 요청 수 |
| `http_req_failed` | HTTP 요청 실패율 |
| `http_req_duration` | 요청 전체 응답 시간 |
| `http_req_waiting` | 서버 응답 대기 시간 |
| `checks` | `check()` 통과율 |
| `iterations` | 시나리오 반복 횟수 |
| `iteration_duration` | 한 iteration 수행 시간 |
| `vus` | 실행 중인 virtual user 수 |

서비스 metric과는 구분한다.

```text
서비스 metric
-> reservation_created_total
-> payment_approved_total
-> ticket_issued_total
-> app_http_request_duration_seconds

k6 metric
-> http_req_duration
-> http_req_failed
-> checks
-> iterations
```

## 1차 수집 방식

1차는 단순한 실행 결과 확인에 집중한다.

```text
k6
-> process exit code
-> Kubernetes Job succeeded/failed
-> Pod log
-> OpenTelemetry Collector
-> Loki
```

k6 시나리오는 threshold를 이용해 실패 시 non-zero exit code로 종료한다.

예시:

```javascript
export const options = {
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};
```

실패 시 로그에는 최소한 다음 정보를 남긴다.

```text
synthetic_run_id
scenario
step
target_base_url
http_status
error_message
X-Request-Id
X-Trace-Id 또는 trace_id
reservation_id
payment_id
ticket_id
```

동적 ID는 Prometheus label로 올리지 않고 로그와 DB record에서만 확인한다.

애플리케이션 로그도 같은 수집 경로를 사용한다.

```text
Application stdout/stderr
-> Kubernetes container log
-> OpenTelemetry Collector
-> Loki
-> Grafana
```

서비스와 k6 runner는 Loki로 직접 전송하지 않는다. 로그는 stdout/stderr에 JSON line 또는 구조화 로그로 남기고, Collector가 수집과 전송을 담당한다.

Loki label은 낮은 cardinality 값만 사용한다.

허용 label 후보:

```text
namespace
pod
container
service_name
app
environment
scenario
step
```

label로 피할 값:

```text
trace_id
request_id
synthetic_run_id
reservation_id
payment_id
ticket_id
user_id
email
```

이 값들은 로그 본문 JSON field로 남긴다.

구현상 Collector는 Kubernetes metadata와 k6 JSON line의 `scenario`, `step`을 resource attribute로 승격한다. Loki는 `namespace`, `pod`, `container`, `app`, `environment`, `scenario`, `step`처럼 낮은 cardinality resource attribute만 index label로 사용한다. `trace_id`, `request_id`, `synthetic_run_id`, reservation/payment/ticket id는 Loki label이 아니라 로그 본문 field와 structured metadata에 남긴다.

## Prometheus remote write를 미루는 이유

초기에 k6 metric을 바로 Prometheus로 보내지 않는 이유는 다음과 같다.

- 아직 full journey 시나리오와 step 이름이 안정되지 않았다.
- label/cardinality 정책을 성급하게 정하면 나중에 수정 비용이 커진다.
- `synthetic_run_id`, `reservation_id`, `user_id` 같은 동적 값을 label로 넣으면 Prometheus가 지저분해질 수 있다.
- Job 상태와 k6 로그만으로도 초기 성공/실패와 실패 단계 확인은 가능하다.
- 서비스 자체 metric은 서비스가 노출하는 Prometheus metric으로 별도 확인할 수 있다.

따라서 1차에서는 로그 중심으로 실제 실행이 잘 되는지부터 확인한다.

## 2차 도입 조건

k6 Prometheus remote write는 다음 조건이 충족되면 검토한다.

- full journey 단계 이름이 안정되어 있다.
- k6 로그만으로는 장기 추세 확인이 불편해졌다.
- 최근 24시간 synthetic 성공률, p95 응답 시간, step별 실패율을 Grafana에서 보고 싶다.
- low-cardinality label 정책이 정리되어 있다.
- Prometheus remote write endpoint와 인증 방식이 정해져 있다.

허용 label 후보:

```text
scenario
step
result
environment
target
```

금지 label:

```text
synthetic_run_id
reservation_id
payment_id
ticket_id
user_id
email
trace_id
request_id
```

## 운영 확인 흐름

1차 확인 흐름:

```text
1. CronJob schedule 확인
2. Job succeeded/failed 확인
3. 실패한 Pod log 또는 Loki 로그 확인
4. 실패 step과 request id 확인
5. Tempo/Loki/DB에서 같은 요청 흐름 추적
```

장기 추세가 필요해지면 2차로 metric화를 붙인다.

```text
k6 Prometheus remote write
-> Prometheus
-> Grafana
-> Alertmanager
```

## 최종 기준

```text
1차 실행 결과 확인
-> Kubernetes Job 상태
-> k6 로그
-> Collector를 거친 Loki 조회

k6 metric remote write
-> 1차에서는 하지 않음
-> 시나리오와 label 정책 안정 후 2차 검토

서비스 metric
-> 서비스가 직접 노출하는 Prometheus metric으로 별도 관리
```
