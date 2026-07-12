# DB Pool Follow-up Analysis

## 요약

이번 `local-baseline-1000m` 결과에서 반복적으로 보이는 DB pool 문제는 아직 "connection leak"으로 단정하기보다, `local-capacity-baseline` 배포 조건이 부하 모델보다 먼저 DB connection pool 한계에 걸린 것으로 보는 편이 맞다.

- `concert-service`, `reservation-service`, `ticket-service` Pod 모두 `SQLALCHEMY_POOL_SIZE=5`, `SQLALCHEMY_MAX_OVERFLOW=0`, `SQLALCHEMY_POOL_TIMEOUT_SECONDS=5`로 실행 중이었다.
- `local-capacity-baseline` 값 파일은 CPU request와 replica/HPA 조건만 조정하고, DB pool override를 따로 주지 않는다.
- 차트 기본값도 pool `5`, overflow `0`, timeout `5s`라서 단일 replica가 동시에 사용할 수 있는 DB connection은 서비스별 5개로 제한된다.
- 실패 구간의 p95가 대부분 `10000ms` 근처로 붙는다. 이는 k6 요청 timeout 10초, SQLAlchemy pool timeout 5초, upstream 대기 시간이 겹친 포화 양상에 가깝다.
- `reservation-service`와 `ticket-service`는 async route 안에서 sync DB 작업 이후 Kafka publish까지 같은 요청 안에서 처리한다. 이 구조는 pool 부족 상황에서 세션/connection 점유 시간을 더 길게 만들 수 있다.

따라서 이번 capacity baseline의 CPU request 후보값은 DB pool이 병목이 된 서비스에서는 보수적으로만 해석해야 한다. CPU 1000m 조건 자체보다 pool 5/0/5s 조건이 먼저 실험 결과를 제한했다.

## 근거

### 1. 현재 배포는 단일 replica와 작은 pool로 고정되어 있다

`gitops/values/env/local-capacity-baseline.yaml`은 `deployment.replicas: 1`, `hpa.enabled: false`를 지정한다. 같은 파일에는 `database.sqlalchemy` override가 없다.

`gitops/charts/medikong-service/values.yaml`의 chart default는 다음 값이다.

```yaml
database:
  sqlalchemy:
    poolSize: 5
    maxOverflow: 0
    poolTimeoutSeconds: 5
    poolRecycleSeconds: 1800
```

`gitops/charts/medikong-service/templates/deployment.yaml`은 이 값을 그대로 `SQLALCHEMY_POOL_SIZE`, `SQLALCHEMY_MAX_OVERFLOW`, `SQLALCHEMY_POOL_TIMEOUT_SECONDS` env로 주입한다.

실제 Pod env 확인 결과도 동일했다.

```text
concert-service:     SQLALCHEMY_POOL_SIZE=5, SQLALCHEMY_MAX_OVERFLOW=0, SQLALCHEMY_POOL_TIMEOUT_SECONDS=5
reservation-service: SQLALCHEMY_POOL_SIZE=5, SQLALCHEMY_MAX_OVERFLOW=0, SQLALCHEMY_POOL_TIMEOUT_SECONDS=5
ticket-service:      SQLALCHEMY_POOL_SIZE=5, SQLALCHEMY_MAX_OVERFLOW=0, SQLALCHEMY_POOL_TIMEOUT_SECONDS=5
```

### 2. k6의 service RPS는 실제 API 호출 수보다 작게 보일 수 있다

`gitops/platform/loadtest/scenarios/capacity-baseline-load-test.js` 기준으로 `concert-service`의 한 iteration은 다음 5개 API를 순차 호출한다.

- `GET /concerts/recommended`
- `GET /concerts/{concertId}`
- `GET /concerts/{concertId}/calendar`
- `GET /concerts/{concertId}/dates/{date}/performances`
- `GET /performances/{performanceId}/seat-map`

즉 `concert_rps_40`은 service iteration 기준 40 RPS이고, endpoint 호출 수 관점에서는 최대 5배의 DB 조회 압박을 만들 수 있다. pool 5개, overflow 0개인 단일 replica에서는 `concert_rps_40`부터 포화가 시작되는 것이 자연스럽다.

`ticket-service`도 한 iteration에서 `POST /tickets/issue` 후 `GET /tickets/me`를 호출한다. issue 단계가 실패하면 list 호출은 줄어들 수 있으므로, report에서 일부 후속 step이 `p95_ms=0` 또는 유효해 보이는 구간은 실제 성공 여유라기보다 앞 단계 실패로 호출 수가 줄어든 결과일 수 있다.

### 3. 실패 수치가 pool 포화 패턴과 맞는다

보존된 `loadtest-run-report-final.json`의 주요 실패 구간은 다음과 같다.

| service | step | 실패 시작 | p95 | error rate | 해석 |
| --- | --- | ---: | ---: | ---: | --- |
| concert-service | recommended | 40 RPS | 10001.96ms | 92.33% | 첫 API가 pool/timeout에 걸리며 이후 호출도 연쇄 감소 |
| concert-service | detail | 40 RPS | 5866.84ms | 7.25% | recommended 실패 이후에도 일부 호출이 지연 |
| concert-service | calendar | 40 RPS | 8028.47ms | 8.59% | 같은 pool 공유로 지연 확산 |
| concert-service | date_performances | 40 RPS | 9485.98ms | 11.97% | 같은 pool 공유로 지연 확산 |
| concert-service | seat_map | 40 RPS | 5125.72ms | 9.71% | 같은 pool 공유로 지연 확산 |
| reservation-service | create | 40 RPS | 10002.07ms | 76.72% | write path가 20 RPS 이후 급격히 timeout |
| ticket-service | issue | 20 RPS | 10001.62ms | 25.33% | issue path가 list보다 먼저 병목 |
| ticket-service | list | 60 RPS | 10000.45ms | 7.69% | issue 실패가 커진 뒤 list도 timeout 영향권 |

반대로 정상 구간에서는 지연이 낮다.

- `concert_rps_20`: 모든 concert step p95가 약 21.8ms에서 55.7ms 범위, error rate 0
- `reservation_rps_20`: create p95 13.87ms, error rate 0
- `ticket_rps_10`: issue p95 16.83ms, list p95 13.18ms, error rate 0

낮은 RPS에서 빠르게 성공하다가 특정 구간부터 10초 근처 timeout으로 바뀌는 모양은 개별 쿼리 하나가 항상 느린 문제라기보다, 동시성 제한 자원인 pool이 꽉 차면서 대기열이 길어진 패턴에 가깝다.

## 서비스별 해석

### concert-service

`GET /concerts/recommended`는 `service/services/concert-service/app/services/catalog.py`에서 추천 목록을 만들고, repository에서 `Concert`와 `showtimes -> venue`를 `selectinload`로 조회한다.

참고 경로:

- `service/services/concert-service/app/services/catalog.py`
- `service/services/concert-service/app/repositories/concerts.py`

현재 코드에서 session은 request dependency로 생성되고 응답 처리 뒤 `finally`에서 닫힌다. 명확한 leak 단서는 보이지 않는다. 다만 추천 API가 concert iteration의 첫 호출이고, 한 iteration 안에 DB 조회 API가 5개 연속 배치되어 있어 pool이 작을 때 가장 먼저 timeout을 만든다.

추천 API가 40 RPS에서 error rate 92.33%로 먼저 실패하기 때문에, 이후 detail/calendar/date/seat-map의 결과는 "각 API가 독립적으로 40 RPS를 버티지 못했다"보다 "첫 API timeout 이후 같은 서비스 pool이 이미 포화 상태였다"로 읽는 편이 안전하다.

### reservation-service

`POST /reservations` route는 async 함수지만 내부에서 sync SQLAlchemy service를 직접 호출한 뒤, 같은 route에서 Kafka publish를 `await`한다.

참고 경로:

- `service/services/reservation-service/app/routers/reservations.py`
- `service/services/reservation-service/app/services/reservations.py`
- `service/services/reservation-service/app/repositories/reservations.py`

DB 작업 자체는 `sales_state` 조회, active reservation 조회, insert, commit으로 비교적 짧다. 그런데 FastAPI dependency로 주입된 DB session은 route가 끝날 때 닫힌다. 따라서 Kafka publish가 느려지거나 event loop가 밀리면 요청의 session lifetime도 길어진다. SQLAlchemy `commit()` 뒤 connection 반환 여부는 실제 session 상태와 후속 object access에 따라 달라질 수 있으므로, 이 구간은 pool 점유 시간 계측이 필요하다.

이번 결과에서는 20 RPS까지 p95 13.87ms로 안정적이고, 40 RPS부터 p95 10002.07ms/error 76.72%로 급변했다. 이것도 DB 자체의 평균 처리 시간이 점진적으로 나빠진 것보다 pool 또는 요청 처리 자원 포화에 더 가깝다.

### ticket-service

`POST /tickets/issue` route도 async 함수이며, sync SQLAlchemy 작업을 async 함수 내부에서 직접 실행한다. 처리 순서는 중복 조회, insert, flush, artifact upload, commit, refresh, Kafka publish다.

참고 경로:

- `service/services/ticket-service/app/routers/tickets.py`
- `service/services/ticket-service/app/services/ticket_service.py`
- `service/services/ticket-service/app/database.py`

local 환경에서 S3 key가 없으면 QR/PDF upload는 no-op이므로, 이번 병목의 1차 원인으로 보기는 어렵다. 더 중요한 점은 issue path가 write/flush/commit/refresh와 Kafka publish를 한 요청 안에서 수행한다는 것이다. pool 5/0/5s 조건에서는 list보다 issue가 먼저 민감하게 실패하는 것이 자연스럽다.

`ticket-service`는 `instrument_sqlalchemy_pool_events(engine)`가 들어 있어 pool event 관측 기반이 있다. 같은 수준의 pool event instrumentation을 concert/reservation에도 맞추면 다음 재실험에서 "connection checkout 대기"와 "쿼리 실행 시간"을 분리하기 쉬워진다.

## 결론

지속적인 DB pool 문제의 1차 원인은 `local-capacity-baseline`의 배포 조건과 부하 모델의 불일치다.

- capacity baseline은 CPU request 후보를 찾는 실험인데, DB pool은 chart default `5/0/5s`에 머물러 있다.
- HPA disabled, single replica 조건이라 서비스별 총 DB connection이 5개로 제한된다.
- concert/ticket 시나리오는 service iteration 하나가 여러 API를 호출해서 report의 target RPS보다 실제 endpoint 호출 압박이 크다.
- reservation/ticket write path는 async route 내부 sync DB 작업과 Kafka publish가 묶여 있어, pool 부족 상황에서 요청 lifetime이 길어질 수 있다.

따라서 이번 run의 실패를 "CPU 1000m에서 해당 서비스가 RPS를 못 버틴다"로 해석하면 안 된다. 더 정확한 해석은 "CPU request를 비교하기 전에 DB pool 조건이 먼저 capacity ceiling이 되었다"이다.

## 다음 확인 순서

1. `local-capacity-baseline`에 DB pool override를 추가한 뒤 같은 CPU 1000m로 재실험한다.
   - 시작값 후보: concert `poolSize=35`, `maxOverflow=10`, `poolTimeoutSeconds=15`
   - reservation/ticket 후보: `poolSize=20`, `maxOverflow=20`, `poolTimeoutSeconds=10`
   - 기존 `local-hpa-spike` override 값과 맞춰 비교하면 변화량을 보기 쉽다.
2. concert/reservation에도 ticket처럼 SQLAlchemy pool event instrumentation을 붙여 checkout wait, checkout count, checkin count를 로그/metric으로 남긴다.
3. reservation/ticket write route에서 DB transaction 구간과 Kafka publish 구간을 분리해 계측한다.
   - DB commit 전후 pool checkout 상태
   - Kafka publish latency
   - request dependency session close 시점
4. pool override 후에도 concert recommended가 병목이면 그때 쿼리 계획을 본다.
   - `Concert.created_at`, `Concert.id` 정렬 조건
   - `showtimes`, `venue` selectinload 횟수
   - half-year early-growth dataset 기준 row count와 index 사용 여부
5. `task dev:loadtest`의 Job wait deadline을 scenario 실제 duration에 맞춘다.
   - 이번 run은 Kubernetes Job은 complete 되었지만 Task wrapper가 먼저 timeout되어 중간 판단을 어렵게 만들었다.

## 판정

현재 증거만으로는 "DB connection leak" 확정보다 "pool cap이 너무 낮고, 일부 요청 경로가 pool 점유 시간을 늘릴 수 있다"가 더 설득력 있다. 다음 run은 pool 크기를 올린 단일 변수 실험으로 진행해야 한다. 그 실험에서 timeout이 사라지면 pool cap이 1차 원인이고, timeout이 남으면 서비스별 쿼리/transaction/Kafka publish 경로로 좁히면 된다.
