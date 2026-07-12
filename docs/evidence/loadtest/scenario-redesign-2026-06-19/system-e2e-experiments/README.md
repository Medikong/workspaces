# System E2E Experiments

## 목적

전체 시스템 E2E 실험은 실제 사용자 여정이 API Gateway를 통과해 여러 서비스를 함께 사용하는 조건을 검증한다.

기준 사용자 여정은 다음이다.

```text
로그인
-> 공연 조회
-> 회차 조회
-> 좌석 조회
-> 예약 생성
-> 결제 승인
-> 주문/티켓 조회
```

현재 기준 시나리오는 `reservation-journey-load-test`다.

## 실험 세트

| 테스트 | 목적 | 성공 기준 |
| --- | --- | --- |
| smoke | AWS 실행 경로와 API 계약 확인 | 전체 여정 완료, `loadtest_run_report` 생성 |
| baseline | 운영 예상 트래픽 수준에서 기준 수치 산출 | p50/p95/p99, max RPS, error rate 산출 가능 |

## Smoke

Smoke는 Baseline 실행 전에 같은 E2E 시나리오가 AWS에서 끝까지 수행되는지 확인하는 관문이다. 성능 판단용 수치로 사용하지 않고, Job, image, secret, dataset, network, report 경로를 검증한다.

### 실험 조건

| 항목 | 값 |
| --- | --- |
| 목적 | Baseline과 같은 E2E ticket-open 시나리오의 실행 경로 확인 |
| 시나리오 | `reservation-journey-load-test` |
| 트래픽 모델 | ticket-open smoke |
| 사용자 단위 | iteration 1회 = 사용자 1명이 로그인부터 티켓 조회까지 전체 E2E 과정 수행 |
| HPA | 비활성화 |
| replica | 주요 서비스 고정 replica 2 기준 |
| executor | `ramping-arrival-rate` |
| target rate | `75 iterations/min` |
| preAllocatedVUs | 150 |
| maxVUs | 300 |
| 기준 | Baseline target rate `750 iterations/min`의 10% |
| ramp-up | 30초, `0 -> 75 iterations/min` |
| steady hold | 2분, `75 iterations/min` 유지 |
| ramp-down | 30초, `75 -> 0 iterations/min` |
| 총 실행 시간 | 3분 |
| 측정 구간 | steady hold 2분 |
| 예상 iteration 수 | steady hold 기준 약 150회 |

### 통과 기준

| 영역 | 기준 |
| --- | --- |
| 실행 | Kubernetes Job과 Pod가 정상 생성됨 |
| E2E | 로그인부터 티켓 조회까지 전체 iteration이 완료됨 |
| 리포트 | `loadtest_run_report`가 생성됨 |
| API 계약 | 필수 API에서 404, 인증 실패, schema mismatch가 반복되지 않음 |
| 인프라 | image pull, secret, network, dataset setup 문제가 없음 |

Smoke가 실패하면 Baseline을 실행하지 않는다. 실패는 성능 문제가 아니라 실행 계약, dataset, secret, image, network 문제로 분리한다.

## Baseline

Baseline은 HPA scale-out 영향을 제거하고, 고정된 replica 조건에서 일반적인 티켓 오픈 트래픽을 처리할 때의 기준 성능을 측정하는 실험이다.

### 부하 산출 근거

일반적인 티켓 오픈 트래픽은 다음처럼 가정한다.

| 항목 | 가정 |
| --- | --- |
| 티켓 오픈 이벤트 규모 | 관심 사용자 3,000명 |
| 예상 진입 사용자 수 | 오픈 직후 1분 안에 25% 진입, 750명 |
| 진입 집중 시간 | 1분, 60초 |
| 평균 E2E 체류 시간 | 75초 |
| think time | 포함, 단계별 3~7초 |
| 조회/좌석 선택/재시도 행동 | 좌석 조회 3회, 예약 재시도 15% |
| 로그인 포함 여부 | 포함 |
| 예약 성공/실패/재시도 비율 | 성공 70%, 좌석 충돌 또는 실패 30% |

이 가정에서 분당 시작되는 E2E iteration은 다음처럼 계산한다.

```text
iteration rate = 예상 진입 사용자 수 / 진입 집중 시간
               = 750명 / 1분
               = 750 iterations/min
               = 12.5 iterations/s
```

평균 동시 진행 사용자 수는 다음처럼 계산한다.

```text
평균 동시 진행 사용자 수 = iteration rate * 평균 E2E 체류 시간
                      = 12.5 iterations/s * 75초
                      = 937.5명
                      => 약 940명
```

따라서 baseline은 `750 iterations/min`을 10분 동안 유지해 약 940명의 사용자가 동시에 E2E 과정을 진행하는 상태를 만든다. 오픈 직후 30초 안에 같은 사용자가 몰리는 조건은 현재 baseline보다 높은 별도 실험 후보로 분리한다.

### 실험 조건

| 항목 | 값 |
| --- | --- |
| 목적 | HPA OFF 상태에서 E2E ticket-open 기준 성능 측정 |
| 시나리오 | `reservation-journey-load-test` |
| 트래픽 모델 | 일반적인 티켓 오픈 |
| 사용자 단위 | iteration 1회 = 사용자 1명이 로그인부터 티켓 조회까지 전체 E2E 과정 수행 |
| HPA | 비활성화 |
| replica | 주요 서비스 고정 replica 2 기준 |
| executor | `ramping-arrival-rate` |
| target rate | `750 iterations/min` |
| preAllocatedVUs | 1200 |
| maxVUs | 2000 |
| ramp-up | 2분, `0 -> 750 iterations/min` |
| steady hold | 10분, `750 iterations/min` 유지 |
| ramp-down | 1분, `750 -> 0 iterations/min` |
| 총 실행 시간 | 13분 |
| 측정 구간 | steady hold 10분 |
| 예상 iteration 수 | steady hold 기준 약 7,500회 |

### VU 산출 근거

`ramping-arrival-rate`는 VU 수가 아니라 iteration 시작 rate를 제어한다. 다만 k6 VU는 동시에 하나의 iteration만 실행할 수 있으므로, 목표 rate를 유지하려면 충분한 VU 풀을 미리 잡아야 한다.

Baseline의 평균 동시 진행 사용자 수는 약 940명이다. 여기에 iteration 지연, p99 상승, GC, 네트워크 지연, 응답 지연으로 생기는 일시적인 VU 부족을 흡수하기 위해 약 25% 여유를 둔다.

```text
필요 VU 기준 = 평균 동시 진행 사용자 수 * 1.25
            = 940 * 1.25
            = 1175
            => preAllocatedVUs 1200
```

`maxVUs`는 Baseline 도중 E2E duration이 75초보다 길어져도 iteration drop 없이 목표 rate를 유지할 수 있도록 2000으로 둔다. 실행 중 `dropped_iterations`가 발생하면 부하 결과 해석 전에 VU 부족인지, 시스템 응답 지연으로 iteration이 길어진 것인지 먼저 분리한다.

### 실행 시간 근거

총 13분은 `ramp-up 2분 + steady hold 10분 + ramp-down 1분`이며, steady hold에서 약 7,500회의 E2E iteration을 확보해 p95/p99와 error rate를 비교한다.

### 결과 지표

Baseline 결과에는 다음 지표를 남긴다.

| 영역 | 지표 |
| --- | --- |
| 실행 조건 | run id, scenario, preset, start/end time, HPA OFF 여부, 고정 replica 수, dataset revision |
| E2E 결과 | iteration count, iteration rate per minute, 전체 성공률, E2E duration p50/p95/p99 |
| API별 결과 | 시나리오 단계별(auth.login, concerts.list, seats.list, reservation.create 등) request count, RPS, p50/p95/p99, error rate, status code 분포 |
| Gateway | upstream별 request count, 4xx/5xx, timeout |
| 서비스 | 서비스별 CPU, memory, pod count, restart, readiness event |
| DB | connection 수, query latency, pool exhaustion, lock wait |
| Kafka | produce/consume error, consumer lag |

Baseline은 튜닝 전후 비교의 기준점이므로 scenario, preset, dataset, HPA 조건, replica 수를 반드시 고정해서 기록한다. `사용자 1명당 API 호출 수`와 `HTTP RPS`는 baseline 입력값이 아니라 실행 후 부하를 해석하는 결과 지표로 둔다.

실행 결과는 [baseline-results.md](baseline-results.md)에 별도로 기록한다.

## 실행 순서

1. `reservation-journey-load-test` smoke로 AWS 실행 경로를 확인한다.
2. baseline으로 기준 p50/p95/p99, RPS, error rate를 산출한다.
