# k6 아키텍처 구조와 코드 샘플

작성일: 2026-06-10

이 문서는 `gitops/platform/synthetic`을 k6 기반 synthetic E2E로 전환할 때의 목표 아키텍처, 폴더 구조, 코드 작성 기준을 정리한다. 실제 구현은 이 구조를 기준으로 진행한다.

## 전체 아키텍처

```text
k6 CronJob
-> external Ingress DNS 또는 internal Kong DNS
-> Kong
-> service
-> database / kafka

k6 stdout
-> Kubernetes container log
-> OpenTelemetry Collector
-> Loki
-> Grafana

Application stdout/stderr
-> Kubernetes container log
-> OpenTelemetry Collector
-> Loki
-> Grafana

service trace
-> OTLP
-> OpenTelemetry Collector
-> Tempo
-> Grafana
```

k6 runner와 애플리케이션 서비스는 Loki를 직접 알지 않는다. 둘 다 stdout/stderr에 구조화 로그를 남기고, OpenTelemetry Collector가 Kubernetes container log를 수집해 Loki로 보낸다.

## 목표 구조

```text
gitops/platform/synthetic/
-> Chart.yaml
-> Taskfile.yml
-> values.yaml
-> values/
   -> local.yaml
   -> aws-dev.yaml
-> runner/
   -> Dockerfile
-> scenarios/
   -> setup-fixture.js
   -> internal-smoke.js
   -> external-smoke.js
   -> external-journey.js
-> flows/
   -> auth.js
   -> fixture.js
   -> catalog.js
   -> reservation.js
   -> payment.js
   -> ticket.js
   -> notification.js
-> lib/
   -> config.js
   -> http.js
   -> trace.js
   -> checks.js
   -> log.js
   -> seat-selection.js
-> templates/
   -> _helpers.tpl
   -> namespace.yaml
   -> serviceaccount.yaml
   -> configmap.yaml
   -> cronjob.yaml
```

현재 Python runner는 k6 전환 후 제거한다. `runner/Dockerfile`은 k6 이미지에 `scenarios`, `flows`, `lib` 디렉터리를 복사하는 역할만 한다.

## 책임 분리

| 경로 | 책임 |
|---|---|
| `scenarios/` | CronJob 또는 수동 실행 단위의 entrypoint |
| `flows/` | 업무 단계별 API 호출 흐름 |
| `lib/` | 공통 설정, HTTP wrapper, trace relay, check/log helper |
| `runner/` | k6 실행 이미지 정의 |
| `templates/` | Helm CronJob, ConfigMap, Secret 참조, namespace 리소스 |
| `values/` | local/aws-dev 환경별 대상 URL, schedule, scenario 선택 |

## 시나리오 파일

시나리오 파일은 k6 entrypoint다. 가능한 얇게 유지하고, 실제 업무 호출은 `flows/`에 둔다.

```javascript
// scenarios/external-journey.js
import { group } from 'k6';
import { getConfig } from '../lib/config.js';
import { createTraceContext } from '../lib/trace.js';
import { logRunStarted, logRunFinished } from '../lib/log.js';
import { loginCustomer } from '../flows/auth.js';
import { selectSyntheticSeat } from '../flows/catalog.js';
import { createReservation } from '../flows/reservation.js';
import { approvePayment } from '../flows/payment.js';
import { waitForTicket } from '../flows/ticket.js';
import { waitForNotification } from '../flows/notification.js';

export const options = {
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const config = getConfig();
  const trace = createTraceContext(config);
  const state = {};

  logRunStarted(config);

  group('auth.login', () => {
    state.customerToken = loginCustomer(config, trace);
  });

  group('catalog.select_seat', () => {
    state.target = selectSyntheticSeat(config, trace);
  });

  group('reservation.create', () => {
    state.reservation = createReservation(config, trace, state.customerToken, state.target);
  });

  group('payment.approve', () => {
    state.payment = approvePayment(config, trace, state.customerToken, state.reservation);
  });

  group('ticket.wait', () => {
    state.ticket = waitForTicket(config, trace, state.customerToken, state.reservation);
  });

  group('notification.wait', () => {
    state.notification = waitForNotification(config, trace, state.customerToken, state.ticket);
  });

  logRunFinished(config, state);
}
```

`internal-smoke.js`와 `external-smoke.js`는 같은 flow helper를 재사용하되, 로그인이나 결제까지 가지 않고 auth/catalog 생존 확인에 집중한다.

## 설정 로딩

k6 script는 `__ENV`에서 설정을 읽는다. 필수값이 없으면 즉시 실패시킨다.

```javascript
// lib/config.js
function required(name) {
  const value = __ENV[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(name, fallback) {
  return __ENV[name] || fallback;
}

export function getConfig() {
  const runId = optional('SYNTHETIC_RUN_ID', `${Date.now()}-${__VU}-${__ITER}`);

  return {
    runId,
    baseUrl: required('SYNTHETIC_BASE_URL'),
    requestPrefix: optional('SYNTHETIC_REQUEST_PREFIX', 'synthetic'),
    timeoutSeconds: Number(optional('SYNTHETIC_TIMEOUT_SECONDS', '10')),
    pollSeconds: Number(optional('SYNTHETIC_POLL_SECONDS', '45')),
    pollIntervalSeconds: Number(optional('SYNTHETIC_POLL_INTERVAL_SECONDS', '2')),
    paymentAmount: Number(optional('SYNTHETIC_PAYMENT_AMOUNT', '50000')),
    customerEmail: required('SYNTHETIC_CUSTOMER_EMAIL'),
    customerPassword: required('SYNTHETIC_CUSTOMER_PASSWORD'),
  };
}
```

Provider/admin credential은 `setup-fixture` 시나리오에서만 필수값으로 둔다. 로컬 `task dev:synthetic`과 `task dev:synthetic:run`은 이 내부 시나리오를 먼저 실행하므로, 로컬 Secret에도 provider/admin/customer credential이 모두 있어야 한다.

## Fixture Setup

`setup-fixture.js`는 사용자에게 별도 task로 노출하지 않는 내부 k6 시나리오다. `dev:synthetic`과 `dev:synthetic:run`이 CronJob template에서 일회성 Job을 만들 때 `SYNTHETIC_SCENARIO=setup-fixture`만 override해서 실행한다.

```text
auth.login_provider
-> auth.login_admin
-> auth.login_customer
-> provider venue 생성
-> provider concert 생성
-> provider showtime 생성
-> provider seat-map 업로드
-> provider sale-policy 제출
-> admin sale-policy 승인
-> admin open schedule 설정
-> admin sales start
-> public performances/seats 조회 확인
```

full journey는 생성된 concert id를 별도 ConfigMap에 쓰지 않는다. 대신 `SYNTHETIC_CONCERT_TITLE`과 공개 `/concerts` 조회 결과를 사용해 synthetic 공연을 찾고, 이후 `/concerts/{id}/performances`, `/performances/{id}/seats`에서 실제 사용자와 같은 방식으로 좌석을 고른다.

## HTTP Wrapper

모든 요청은 공통 wrapper를 통과한다. 이 wrapper가 request id, synthetic header, traceparent relay를 처리한다.

```javascript
// lib/http.js
import http from 'k6/http';
import { check, fail } from 'k6';
import { logStep } from './log.js';

export function request(config, trace, step, method, path, body = null, extraHeaders = {}) {
  const url = `${config.baseUrl}${path}`;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Synthetic-Traffic': 'true',
    'X-Request-Id': `${config.requestPrefix}-${config.runId}`,
    ...trace.headers(),
    ...extraHeaders,
  };

  const params = {
    headers,
    timeout: `${config.timeoutSeconds}s`,
    tags: {
      scenario: __ENV.SYNTHETIC_SCENARIO || 'external-journey',
      step,
    },
  };

  const response = http.request(method, url, body ? JSON.stringify(body) : null, params);
  trace.capture(response);

  const ok = check(response, {
    [`${step} status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${step} content-type is json`]: (r) => String(r.headers['Content-Type'] || '').includes('application/json'),
  });

  logStep(config, trace, step, response);

  if (!ok) {
    fail(`${step} failed with status ${response.status}`);
  }

  return response;
}
```

동적 ID는 k6 tag에 넣지 않는다. `reservation_id`, `payment_id`, `ticket_id`, `trace_id`, `request_id`, `run_id`는 로그와 DB record에서만 확인한다.

## Trace Relay

첫 요청에는 `traceparent`를 보내지 않는다. 응답에서 받은 `traceparent`를 같은 journey의 후속 요청에 릴레이한다.

```javascript
// lib/trace.js
export function createTraceContext() {
  let traceparent = null;
  let traceId = null;

  return {
    headers() {
      return traceparent ? { traceparent } : {};
    },
    capture(response) {
      const nextTraceparent = response.headers.traceparent || response.headers.Traceparent;
      const nextTraceId = response.headers['X-Trace-Id'] || response.headers['x-trace-id'];

      if (nextTraceparent) {
        traceparent = nextTraceparent;
      }
      if (nextTraceId) {
        traceId = nextTraceId;
      }
    },
    traceId() {
      return traceId;
    },
    traceparent() {
      return traceparent;
    },
  };
}
```

`tracestate`는 1차 시나리오에서 저장하거나 전송하지 않는다.

## Flow 예시

Flow 함수는 한 업무 단계만 책임진다.

```javascript
// flows/auth.js
import { request } from '../lib/http.js';

export function loginCustomer(config, trace) {
  const response = request(config, trace, 'auth.login', 'POST', '/auth/login', {
    email: config.customerEmail,
    password: config.customerPassword,
  });

  const body = response.json();
  if (!body.access_token) {
    throw new Error('auth.login response missing access_token');
  }

  return body.access_token;
}
```

```javascript
// flows/reservation.js
import { request } from '../lib/http.js';

export function createReservation(config, trace, token, target) {
  const response = request(
    config,
    trace,
    'reservation.create',
    'POST',
    '/reservations',
    {
      showtime_id: target.showtimeId,
      seat_id: target.seatId,
      synthetic_run_id: config.runId,
    },
    {
      Authorization: `Bearer ${token}`,
    },
  );

  const body = response.json();
  if (!body.reservation_id) {
    throw new Error('reservation.create response missing reservation_id');
  }

  return body;
}
```

## 좌석 분산 선택

좌석 선택은 synthetic 전용 target API 없이 공개 조회 API를 사용한다.

```javascript
// lib/seat-selection.js
export function pickByRunId(items, runId) {
  if (!items.length) {
    throw new Error('no candidate items');
  }

  let hash = 0;
  for (let i = 0; i < runId.length; i += 1) {
    hash = (hash * 31 + runId.charCodeAt(i)) >>> 0;
  }

  return items[hash % items.length];
}
```

```javascript
// flows/catalog.js
import { request } from '../lib/http.js';
import { pickByRunId } from '../lib/seat-selection.js';

export function selectSyntheticSeat(config, trace) {
  const showtimeResponse = request(config, trace, 'catalog.showtimes', 'GET', '/showtimes?synthetic=true&active=true');
  const showtimes = showtimeResponse.json().items || [];
  const showtime = pickByRunId(showtimes, config.runId);

  const seatResponse = request(config, trace, 'catalog.seats', 'GET', `/showtimes/${showtime.id}/seats?available=true`);
  const seats = seatResponse.json().items || [];
  const seat = pickByRunId(seats, config.runId);

  return {
    showtimeId: showtime.id,
    seatId: seat.id,
  };
}
```

예약 생성에서 seat conflict가 발생하면 같은 showtime 안에서 다음 seat 후보로 제한적으로 retry한다. retry는 무한 반복하지 않고 2-3회 정도로 제한한다.

## 로그 형식

1차 결과 확인은 Kubernetes Job 상태와 로그를 기준으로 한다. 로그는 JSON line 형태로 남긴다.

```javascript
// lib/log.js
export function logStep(config, trace, step, response) {
  console.log(JSON.stringify({
    event: 'synthetic_step',
    run_id: config.runId,
    scenario: __ENV.SYNTHETIC_SCENARIO || 'external-journey',
    step,
    status: response.status,
    trace_id: trace.traceId(),
    request_id: response.headers['X-Request-Id'] || response.headers['x-request-id'],
  }));
}
```

로그에는 동적 ID를 남길 수 있지만, metric label로는 올리지 않는다.

## Dockerfile

```dockerfile
FROM grafana/k6:latest

WORKDIR /synthetic
COPY scenarios ./scenarios
COPY flows ./flows
COPY lib ./lib

ENTRYPOINT ["k6"]
CMD ["run", "/synthetic/scenarios/external-smoke.js"]
```

Helm CronJob은 `SYNTHETIC_SCENARIO` 값에 따라 실행 파일을 선택한다.

```text
k6 run /synthetic/scenarios/${SYNTHETIC_SCENARIO}.js
```

## Helm values 예시

```yaml
synthetic:
  scenario: external-journey
  baseUrl: https://api.aws-dev.example
  timeoutSeconds: 10
  pollSeconds: 45
  pollIntervalSeconds: 2
  paymentAmount: 50000
  requestPrefix: synthetic
  credentialsSecretName: synthetic-traffic-credentials
```

local은 빠른 feedback을 위해 1분 주기와 내부 Kong DNS 또는 로컬 Ingress를 사용한다.

```yaml
cronJob:
  schedule: "* * * * *"

synthetic:
  scenario: internal-smoke
  baseUrl: http://kong-kong-proxy.kong.svc.cluster.local
```

## Taskfile 기준

`gitops/platform/synthetic/Taskfile.yml`은 synthetic 관련 작업을 모두 소유한다.

```text
task --dir platform/synthetic render
task --dir platform/synthetic image-build
task --dir platform/synthetic deploy
task --dir platform/synthetic run
task --dir platform/synthetic status
```

root Taskfile은 synthetic 세부 task를 직접 정의하지 않는다.

## 전환 순서

1. `scenarios/`, `flows/`, `lib/` 디렉터리를 추가한다.
2. Python runner를 k6 runner로 교체한다.
3. Dockerfile base image를 `grafana/k6`로 바꾼다.
4. Helm CronJob command를 `k6 run` 기준으로 바꾼다.
5. values에 `synthetic.scenario`, `credentialsSecretName`을 추가한다.
6. local smoke를 먼저 검증한다.
7. external smoke를 검증한다.
8. full journey를 단계적으로 붙인다.

## 완료 기준

- `task --dir platform/synthetic render`가 k6 CronJob manifest를 렌더링한다.
- `task --dir platform/synthetic deploy`가 k6 runner image를 배포한다.
- `task --dir platform/synthetic run`이 CronJob에서 수동 Job을 만들고 k6 로그를 보여준다.
- `internal-smoke.js`는 내부 Kong DNS 기준 smoke를 실행한다.
- `external-smoke.js`는 외부 Ingress DNS 기준 smoke를 실행한다.
- `external-journey.js`는 login, seat 선택, reservation, payment, ticket, notification flow를 순차 실행한다.
- 실패 시 k6 exit code가 non-zero가 되고 Job이 실패한다.
- 실패 로그에는 step, status, request id, trace id가 남는다.
