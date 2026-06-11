# k6 기반 Synthetic E2E 조사

수집일: 2026-06-10

이 문서는 지속 E2E 검증을 k6 기반으로 구성할 때 참고할 자료를 모은 스크랩이다. 목적은 부하 테스트 도구를 고르는 것이 아니라, 배포된 Medikong 서비스의 핵심 사용자 흐름을 주기적으로 실행하고 실패 지점, 응답 시간, 관측성 연결 방식을 판단하는 것이다.

## 결론

k6는 현재 synthetic E2E 방향에 잘 맞는다.

- JavaScript로 사용자 흐름을 순서대로 표현할 수 있다.
- `group()`으로 로그인, 공연 조회, 예약, 결제 같은 단계를 나눠 결과를 볼 수 있다.
- `check()`로 응답 검증을 남기고, `thresholds`로 실행 성공과 실패 기준을 명확히 만들 수 있다.
- Kubernetes CronJob에서 `grafana/k6` 컨테이너를 직접 실행하기 쉽다.
- 이후 Prometheus remote write나 Grafana Synthetic Monitoring으로 확장할 여지가 있다.

단, k6의 `check()`는 단독으로는 실행을 실패 처리하지 않는다. 실패율이나 응답 시간 기준은 반드시 `thresholds`로 승격해야 한다. 또한 k6의 `options.scenarios`는 기본적으로 병렬 실행 모델이므로, 여러 업무 단계를 실제 사용자 여정처럼 순차 실행하려면 `default()` 안에서 함수를 차례대로 호출하고 각 단계를 `group()`으로 감싸는 구성이 더 단순하다.

## Medikong 적용 방향

관련 결정:

- [k6 아키텍처 구조와 코드 샘플](k6-architecture.md)
- [Synthetic 대상 URL 결정](target-url-decision.md)
- [Synthetic 계정과 credential 결정](credential-source-decision.md)
- [Synthetic 테스트 데이터 생성 결정](test-data-generation-decision.md)
- [Synthetic 실패 상태 처리 결정](failure-state-decision.md)
- [Synthetic 실행 결과 수집 결정](result-collection-decision.md)
- [Frontend traceparent 처리 가이드](../observability/tracing/frontend-traceparent.md)

1차 구현은 다음처럼 둔다.

```text
gitops/platform/synthetic/
-> scenarios/
   -> smoke.js
   -> full-journey.js
-> Helm CronJob
-> values/local.yaml: 1분 주기
-> values/aws-dev.yaml: aws-dev 주기와 대상 URL
```

시나리오 실행 흐름은 한 번의 CronJob Job 안에서 순차적으로 실행한다.

```text
auth smoke
-> concert catalog smoke
-> reservation flow
-> payment flow
-> ticket / notification polling
```

초기에는 `smoke.js`로 인증/공연 목록만 확인하고, 이후 `full-journey.js`에 예약과 결제 흐름을 붙인다. 이 방식은 Postman Collection보다 개발자 중심이지만, polling, 조건 분기, 단계별 metric tag, 실패 기준을 코드로 관리하기 좋다.

k6 시나리오는 프론트엔드와 같은 trace relay 규약을 따른다. 첫 요청에는 `traceparent`를 보내지 않고, 응답 header의 `traceparent`를 저장한 뒤 같은 synthetic journey의 후속 요청에 릴레이한다. 단, `traceparent`는 관측성 상관관계에만 사용하며 사용자 신뢰와 권한 판단은 JWT 기준으로 둔다.

## k6 공식 자료

| 자료 | 핵심 내용 | 적용 메모 |
|---|---|---|
| [Scenarios](https://grafana.com/docs/k6/latest/using-k6/scenarios/) | k6는 여러 scenario를 한 스크립트에 선언할 수 있고, 각 scenario마다 executor, env, tag를 다르게 둘 수 있다. scenario는 독립적이며 기본적으로 병렬 실행된다. `startTime`으로 순차처럼 보이게 만들 수 있지만 종료 보장을 직접 맞춰야 한다. | Medikong의 정상 사용자 여정은 `options.scenarios`보다 `default()` 안의 순차 함수 호출이 더 명확하다. 부하 패턴이나 병렬 smoke가 필요해질 때 scenario executor를 쓴다. |
| [Synthetic monitoring](https://grafana.com/docs/k6/latest/testing-guides/synthetic-monitoring/) | k6 smoke test를 주기적으로 실행해 production monitoring에 사용할 수 있다. | Kubernetes CronJob으로 반복 실행하는 현재 목적과 맞다. |
| [Checks](https://grafana.com/docs/k6/latest/using-k6/checks/) | `check()`는 assertion처럼 보이지만 실패해도 그 자체로 테스트를 중단하거나 실패 종료하지 않고 rate metric으로 기록한다. | `checks{}` 성공률 threshold를 반드시 함께 둔다. 예: `checks: ["rate>0.99"]`. |
| [Thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/) | threshold는 metric에 대한 pass/fail 기준이며, 기준을 못 맞추면 k6 실행이 실패 상태로 끝난다. 오류율, p95 응답 시간, endpoint별 조건을 표현할 수 있다. | CronJob 성공/실패 판정은 threshold가 담당하게 한다. 예: `http_req_failed: ["rate<0.01"]`, `http_req_duration: ["p(95)<1000"]`. |
| [Tags and Groups](https://grafana.com/docs/k6/latest/using-k6/tags-and-groups/) | tags는 request/check/custom metric을 필터링하기 위한 값이고, groups는 script 함수를 단계별로 묶는 방법이다. | `group("reservation.create", ...)`처럼 단계 이름을 안정적으로 둔다. 고카디널리티 값은 tag로 넣지 않는다. |
| [Environment variables](https://grafana.com/docs/k6/latest/using-k6/environment-variables/) | k6 script는 `__ENV` 전역 객체로 환경 변수를 읽는다. | Helm values를 ConfigMap/Secret env로 주입하고, script에서는 `__ENV.SYNTHETIC_BASE_URL` 형태로 읽는다. |
| [Prometheus remote write](https://grafana.com/docs/k6/latest/results-output/real-time/prometheus-remote-write/) | k6는 `experimental-prometheus-rw` output으로 test result metric을 Prometheus remote write endpoint로 보낼 수 있다. `testid` tag로 실행 단위를 나눌 수 있다. | 1차는 로그와 Job 성공/실패만 본다. 이후 Prometheus remote write를 붙일 때 `testid`는 run 단위 식별에만 제한적으로 사용한다. |
| [Schedule k6 tests](https://grafana.com/docs/k6/latest/set-up/set-up-distributed-k6/usage/scheduling-tests/) | k6 Operator 자체는 scheduling을 직접 지원하지 않으며, Kubernetes CronJob으로 TestRun 생성/삭제를 예약할 수 있다. | 현재 범위는 Operator 없이 `grafana/k6 run`을 직접 실행하는 CronJob으로 충분하다. 분산 부하 테스트가 필요해지면 Operator를 검토한다. |

## Synthetic Monitoring 사례

| 자료 | 핵심 내용 | 적용 메모 |
|---|---|---|
| [Google Cloud: Synthetic Monitoring GA](https://cloud.google.com/blog/products/devops-sre/synthetic-monitoring-in-cloud-monitoring-is-now-ga) | synthetic monitoring은 자동화된 스크립트를 주기적으로 실행해 로그인, 검색, 장바구니 같은 핵심 사용자 여정을 실제 사용자 관점에서 검증한다. 결과는 availability, consistency, performance 판단과 alert에 쓰인다. | Medikong에서는 로그인, 공연 조회, 예약, 결제, 티켓 확인을 핵심 사용자 여정으로 본다. 단순 Pod 상태보다 업무 흐름 기준 성공률을 본다. |
| [Google Cloud Operations Sandbox](https://cloud.google.com/blog/products/operations/on-the-road-to-sre-with-cloud-operations-sandbox) | microservice demo에 synthetic load generator를 붙이고, telemetry와 dashboard를 함께 구성해 SRE 실습 환경을 만든다. synthetic traffic은 진단 가능한 관측 데이터를 만들기 위한 입력으로 사용된다. | synthetic E2E는 테스트 도구이면서 관측성 데이터 생성기다. 실패를 만들고 찾는 연습까지 확장할 수 있다. |
| [Grafana Cloud k6 browser checks](https://grafana.com/docs/grafana-cloud/testing/synthetic-monitoring/create-checks/checks/k6-browser/) | k6 browser check는 headless browser로 사용자 행동과 Web Vitals를 확인한다. | Medikong 1차는 API flow로 충분하다. 프론트엔드 사용자 여정 검증이 필요해질 때 browser check를 별도 축으로 본다. |

## Big Tech 참고 사례

| 자료 | 핵심 내용 | 적용 메모 |
|---|---|---|
| [Spotify Engineering: 2025 Wrapped](https://engineering.atspotify.com/2026/3/inside-the-archive-2025-wrapped) | Wrapped 출시 전에 compute와 database capacity를 미리 키운 뒤 synthetic load test로 connection pool, cache, database 배치를 예열했다. | synthetic traffic은 장애 감지만이 아니라 cold path를 미리 데우고 출시 직전 readiness를 확인하는 용도로도 쓸 수 있다. |
| [Netflix: Automated Canary Analysis with Kayenta](https://netflixtechblog.com/automated-canary-analysis-at-netflix-with-kayenta-3260bc7acc69) | canary와 baseline의 metric을 비교해 배포 위험을 자동 판단한다. | 지금 단계는 canary 분석까지 가지 않는다. 다만 synthetic E2E 결과를 배포 직후 비교 지표로 쌓으면 나중에 canary gate로 확장 가능하다. |
| [Google Cloud: Kayenta announcement](https://cloud.google.com/blog/products/gcp/introducing-kayenta-an-open-automated-canary-analysis-tool-from-google-and-netflix) | Kayenta는 metric source에서 데이터를 가져와 통계적으로 비교하고 canary를 promote/fail할 수 있게 한다. | k6 결과를 metric화하면 배포 검증 기준을 수동 로그 확인에서 자동 gate로 발전시킬 수 있다. |
| [Netflix: Service-Level Prioritized Load Shedding](https://netflixtechblog.com/enhancing-netflix-reliability-with-service-level-prioritized-load-shedding-e735e6ce8f7d) | Netflix는 synthetic traffic으로 load shedding 동작을 실험하고, latency와 throughput이 어떻게 유지되는지 확인했다. | Medikong에서 synthetic traffic은 정상 흐름 검증에서 시작하되, 나중에는 결제/예약 같은 중요 요청과 낮은 우선순위 요청을 구분하는 resilience test로 확장할 수 있다. |
| [Spotify 사례의 synthetic load](https://engineering.atspotify.com/2026/3/inside-the-archive-2025-wrapped) | 실제 사용자 유입 전 synthetic load로 cache와 storage path를 준비했다. | 로컬 개발에서는 1분 주기 feedback, aws-dev에서는 배포 직후 readiness 확인에 활용한다. |
| [Meta Engineering: AI Lab](https://engineering.fb.com/2024/07/16/developer-tools/ai-lab-secrets-machine-learning-engineers-moving-fast/) | Meta는 반복 실행 가능한 synthetic signal로 성능 회귀를 빠르게 감지하고, confirmation run과 통계 기준을 함께 사용한다. | 1회 실패에 즉시 장애 판정을 내리기보다 연속 실패와 재현성 기준을 둔다. |

## 설계 메모

### 순차 실행

사용자 여정을 표현할 때는 이 형태가 가장 단순하다.

```javascript
import { group } from 'k6';

export default function () {
  group('auth.smoke', () => {
    authSmoke();
  });

  group('concert.catalog', () => {
    concertCatalog();
  });

  group('reservation.flow', () => {
    reservationFlow();
  });

  group('payment.flow', () => {
    paymentFlow();
  });
}
```

`options.scenarios`는 나중에 다음 목적이 생길 때 쓴다.

- smoke와 full journey를 같은 파일에서 다른 executor로 병렬 실행
- VU 수나 반복 횟수가 다른 workload 비교
- 부하 테스트, spike test, soak test처럼 traffic model 자체가 중요할 때

### 성공 기준

CronJob 성공 기준은 k6 process exit code가 되도록 한다. 이를 위해 check와 threshold를 함께 둔다.

```javascript
export const options = {
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};
```

업무 단계별 threshold가 필요해지면 tag를 제한적으로 쓴다.

```javascript
http.get(`${baseUrl}/concerts`, {
  tags: { step: 'concert.catalog' },
});
```

`reservation_id`, `user_id`, `run_id`처럼 매번 달라지는 값은 metric tag로 넣지 않는다. 이런 값은 로그나 요청 헤더에만 남긴다.

### Kubernetes 실행

초기 Kubernetes 실행은 k6 Operator 없이 CronJob으로 둔다.

```text
CronJob
-> grafana/k6 image
-> ConfigMap으로 mounted scenario
-> Secret/ConfigMap env
-> k6 run /scripts/smoke.js
```

CronJob에는 `concurrencyPolicy: Forbid`를 둔다. 이전 synthetic run이 끝나기 전에 다음 run이 겹치면 결과 해석이 어려워지고 테스트 데이터도 꼬일 수 있다.

### 관측성 연결

1차는 다음만 확인한다.

```text
Job succeeded / failed
Pod log
실패 단계
응답 코드
응답 시간
요청 식별자
```

2차부터 연결한다.

```text
k6 summary
-> OpenTelemetry Collector
-> Loki log
-> Prometheus remote write
-> Grafana panel
-> 연속 실패 alert
```

Prometheus remote write를 붙일 때는 실행별 `testid`를 남길 수 있지만, 장기 보존 metric의 label cardinality가 커지지 않게 보존 기간과 label 정책을 같이 정해야 한다.
