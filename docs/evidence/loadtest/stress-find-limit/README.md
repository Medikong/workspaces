# Stress Find Limit Loadtest

## Documents

| 문서 | 용도 |
| --- | --- |
| [../capacity-baseline/README.md](../capacity-baseline/README.md) | CPU request 기준점을 찾는 선행 실험 |

## Purpose

이 문서는 고정된 단일 replica 조건에서 서비스별 API의 SLO가 깨지는 경계와 첫 병목 지점을 찾기 위한 기준이다.

stress find limit은 CPU request를 새로 계산하는 실험이 아니라, capacity baseline에서 정한 CPU request 후보를 전제로 단일 Pod가 어디까지 버티는지 확인하는 실험이다.

## Position

| 실험 | 목적 | 결과 |
| --- | --- | --- |
| capacity baseline | CPU request 기준점 찾기 | 서비스별 CPU request 후보 |
| stress find limit | 단일 replica의 SLO 경계 찾기 | 마지막 유효 RPS, 첫 실패 RPS, 첫 병목 후보 |
| HPA spike | 급격한 부하에서 scale-out 반응 확인 | target utilization, min/max replica, scale policy 후보 |
| mixed workload | 여러 서비스가 동시에 쓰일 때 전체 시스템 검증 | 운영 유사 조건의 병목과 상호 영향 |

## Fixed Conditions

stress find limit은 여러 변수를 동시에 바꾸지 않는다. 단일 replica의 한계를 보기 위해 아래 조건을 고정한다.

| 항목 | 기준 |
| --- | --- |
| replica | `1` |
| HPA | disabled |
| CPU request | capacity baseline에서 선택한 후보값 |
| CPU limit | 제거하거나 충분히 높게 설정 |
| dataset | deterministic bulk insert로 측정 전에 준비 |
| 부하 방식 | target RPS를 계단식으로 증가 |
| 측정 방식 | 서비스별 단독 측정 |
| 제외 | dataset setup, schema guard, row count 검증 시간 |

CPU limit이 낮으면 throttling 때문에 서비스 자체 한계와 limit 정책 한계가 섞인다. 따라서 단일 replica의 실제 처리 한계를 보려면 limit을 제거하거나 실험 조건에 명확히 기록해야 한다.

## Experiment Method

서비스별 API 목록은 capacity baseline과 동일하게 유지한다. 시나리오 구현도 가능하면 `capacity-baseline-load-test`를 재사용하고, RPS step, duration, 기준값, runner 리소스는 stress 전용 preset으로 바꾼다.

| 원칙 | 방식 |
| --- | --- |
| 목표 | SLO를 만족한 마지막 RPS와 처음 깨진 RPS를 찾는다 |
| 시나리오 | 서비스별 순차 측정 시나리오를 재사용 |
| preset | `local-stress-find-limit`처럼 별도 preset 사용 |
| 측정 격리 | 한 시점에는 하나의 서비스 주요 API만 측정 |
| 종료 해석 | 실패를 run 실패로만 보지 않고 병목 경계로 기록 |
| 결과 단위 | 같은 `loadtest_run_id` 안에서 서비스/API/RPS step별 결과 기록 |

권장 RPS step은 baseline보다 넓게 잡는다. 예를 들어 baseline이 `10 -> 20 -> 40 -> 80 -> 160 RPS`라면 stress는 `40 -> 80 -> 160 -> 240 -> 320 -> 480 RPS`처럼 시작점을 올리고, 각 step duration은 최소 `90s` 이상으로 잡는다.

## Service Target APIs

| 서비스 | k6 step | Method | Path | 목적 |
| --- | --- | --- | --- | --- |
| auth-service | `capacity_baseline.auth.login` | POST | `/auth/login` | 로그인 SLO 경계 확인 |
| concert-service | `capacity_baseline.concert.concerts` | GET | `/concerts` | 공연 목록 조회 경계 확인 |
| concert-service | `capacity_baseline.concert.performances` | GET | `/concerts/{concertId}/performances` | 회차 조회 경계 확인 |
| concert-service | `capacity_baseline.concert.seats` | GET | `/performances/{performanceId}/seats` | 좌석 조회 경계 확인 |
| reservation-service | `capacity_baseline.reservation.create` | POST | `/reservations` | 예매 생성 경계 확인 |
| payment-service | `capacity_baseline.payment.approve` | POST | `/payments` | 결제 승인 경계 확인 |
| ticket-service | `capacity_baseline.ticket.list` | GET | `/tickets/me` | 티켓 조회 경계 확인 |
| notification-service | `capacity_baseline.notification.list` | GET | `/notifications` | 알림 조회 경계 확인 |

concert-service는 같은 서비스 단계 안에서 3개 조회 API를 함께 측정한다. 서비스 단위 경계는 세 API 중 하나라도 SLO를 깨는 첫 RPS를 기준으로 판단하고, API별 p95/p99/error rate는 별도로 남긴다.

## Judgment Rule

| 결과 | 의미 |
| --- | --- |
| last_valid_rps | p95, p99, error rate, throttling 기준을 만족한 마지막 RPS |
| first_failed_rps | 하나 이상의 기준이 깨진 첫 RPS |
| failure_signal | 처음 깨진 기준: latency, error, throttling, CPU saturation, dropped iterations |
| first_bottleneck_candidate | 가장 먼저 병목으로 의심되는 컴포넌트 |

첫 병목은 단일 지표만으로 확정하지 않는다. 아래 신호를 같이 본다.

| 신호 | 해석 |
| --- | --- |
| CPU usage가 request 대비 높고 p95가 상승 | 서비스 CPU 포화 가능성 |
| CPU throttling이 발생 | CPU limit 또는 cgroup 제한 영향 |
| error rate 상승 | 애플리케이션 오류, timeout, upstream 실패 가능성 |
| p95/p99만 상승하고 error는 낮음 | 큐잉, DB latency, CPU 부족 가능성 |
| k6 dropped iterations 또는 runner OOM | 부하 발생기 한계라서 결과 무효 |
| DB latency 또는 connection saturation | 서비스 코드보다 DB 또는 pool 한계 가능성 |

## Preset Direction

stress find limit은 별도 preset으로 관리한다.

| 항목 | 예시 |
| --- | --- |
| preset path | `gitops/platform/loadtest/values/presets/capacity-baseline/local-stress-find-limit.yaml` |
| scenario | `capacity-baseline-load-test` |
| cpu request | capacity baseline에서 선택한 후보값 |
| stages | baseline보다 높은 RPS 계단 |
| step duration | `90s` 또는 `120s` |
| preAllocatedVUs | target RPS를 감당할 만큼 충분히 설정 |
| maxVUs | runner가 먼저 병목이 되지 않게 충분히 설정 |
| runner resources | CPU/memory limit을 stress에 맞게 상향 |
| dataset size | write API가 전체 step을 소화할 만큼 충분히 준비 |

## Dashboard Logging

로그 이벤트는 capacity baseline과 동일하게 두 개만 사용한다.

| 로그 | 포함 내용 |
| --- | --- |
| `loadtest_experiment_conditions` | run id, scenario, preset, dataset revision, fixed CPU request, replica/HPA 조건, runner 리소스 |
| `loadtest_run_report` | 서비스/API/RPS step별 p95, p99, error rate, CPU usage, throttling, last valid RPS, first failed RPS, 병목 후보 |

`loadtest_run_report`에는 실패한 step도 남겨야 한다. stress test의 핵심 결과는 실패 자체가 아니라, 어떤 RPS에서 어떤 신호가 먼저 깨졌는지다.

## Invalid Result Conditions

아래 상황은 서비스 한계가 아니라 실험 환경 한계로 본다.

| 조건 | 처리 |
| --- | --- |
| k6 runner OOMKilled | runner 리소스 상향 후 재실험 |
| k6 dropped iterations 과다 | preAllocatedVUs/maxVUs 또는 runner CPU 상향 |
| dataset 고갈 | dataset 규모 확대 후 재실험 |
| Kong rate limit 개입 | rate limit 조건 확인 후 재실험 |
| CPU limit throttling | limit 제거 또는 조건 명시 후 재실험 |
| HPA scale-out 발생 | HPA off/fixed replica 조건으로 재실험 |

## Expected Output

최종 결과는 서비스별로 아래처럼 정리한다.

| 서비스 | 마지막 유효 RPS | 첫 실패 RPS | 첫 실패 신호 | 병목 후보 | 다음 조치 |
| --- | ---: | ---: | --- | --- | --- |
| auth-service | TBD | TBD | TBD | TBD | TBD |
| concert-service | TBD | TBD | TBD | TBD | TBD |
| reservation-service | TBD | TBD | TBD | TBD | TBD |
| payment-service | TBD | TBD | TBD | TBD | TBD |
| ticket-service | TBD | TBD | TBD | TBD | TBD |
| notification-service | TBD | TBD | TBD | TBD | TBD |

이 결과는 HPA spike test의 입력값으로 사용한다. HPA 실험은 단일 replica 경계보다 낮거나 같은 범위에서 시작해, 부하 급증 시 replica가 얼마나 빨리 늘고 p95/error가 얼마나 빨리 회복되는지 확인한다.
