# Capacity Baseline Experiment Plan

## 목적

capacity baseline 실험의 목적은 CPU request 값을 바로 확정하는 것이 아니라, 고정 조건에서 서비스별 처리량과 병목 구간을 관측해 CPU request 후보를 좁히는 것이다.

현재 단계에서는 목표 RPS를 먼저 고정할 수 없다. 따라서 `replica=1`, `CPU request=1000m`, `CPU limit=none`, `HPA=off` 조건을 고정하고, 서비스별로 실제 안정 처리량이 어디까지 나오는지 확인한다.

## 기본 해석

`1000m`은 단일 Pod가 CPU 1 core를 request로 확보한다는 뜻이다. limit을 제거했기 때문에 Pod는 노드 여유 CPU를 더 사용할 수 있지만, request 기준 실험 조건은 `1000m`으로 고정한다.

실험 결과는 아래 질문에 답하기 위해 사용한다.

| 질문 | 의미 |
| --- | --- |
| 단일 Pod가 안정적으로 처리하는 최대 RPS는 얼마인가? | 서비스별 `max valid RPS` |
| 그 구간에서 CPU를 얼마나 쓰는가? | CPU request 후보 계산 기준 |
| 어느 구간부터 p95/p99/error가 깨지는가? | 첫 병목 또는 실패 경계 |
| CPU가 높은데 깨지는가, CPU가 낮은데 깨지는가? | CPU 병목인지 DB/락/외부 의존성 병목인지 구분 |

## 실험 단계

### 1. 상한 탐색

현재 실행 중인 실험은 상한 탐색이다.

| 항목 | 기준 |
| --- | --- |
| CPU request | `1000m` |
| CPU limit | 없음 |
| replica | `1` |
| HPA | off |
| RPS 범위 | 높게 잡아 실패 경계를 찾음 |

이 실험은 request 후보를 확정하기 위한 실험이 아니다. 높은 RPS에서 p95/p99가 크게 튀거나 error가 발생하는 구간을 확인해 다음 실험 범위를 줄이는 것이 목적이다.

### 2. 현실 구간 재측정

상한 탐색에서 대부분 서비스가 높은 RPS 구간을 버티지 못하면, 다음 실험은 RPS 범위를 낮춰 안정 구간을 더 촘촘히 본다.

예상 구간은 다음과 같다.

| 서비스 | 다음 측정 구간 |
| --- | --- |
| auth-service | `30 -> 40` |
| payment-service | `5 -> 10 -> 20 -> 30 -> 40` |
| 나머지 서비스 | `20 -> 40 -> 60 -> 80 -> 100` |

이 단계의 목표는 서비스별 `max valid RPS`와 해당 구간의 CPU 사용량을 얻는 것이다.

## Valid Step 기준

CPU request 후보는 실패 구간이 아니라 마지막 정상 구간을 기준으로 계산한다.

`valid step`은 아래 조건을 만족하는 RPS 구간이다.

| 조건 | 기준 |
| --- | --- |
| latency | p95/p99가 임시 기준 안에 있음 |
| error | error rate가 기준 안에 있음 |
| throttling | CPU throttling이 없거나 무시 가능한 수준 |
| 그래프 형태 | latency가 급격히 튀기 전 구간 |
| 리소스 해석 | CPU 사용량과 병목 신호를 함께 설명할 수 있음 |

서비스별 `max valid RPS`는 valid step 중 가장 높은 RPS다.

## CPU Request 후보 계산

현실 구간 재측정 후 CPU request 후보는 아래 방식으로 계산한다.

```text
CPU request 후보 =
  max(
    service_min_floor,
    round_up_100m(stable_step_cpu_p95_m / target_utilization)
  )
```

현재 target utilization은 `70%`를 기준으로 본다.

예시:

| 항목 | 값 |
| --- | --- |
| max valid RPS | `60 RPS` |
| stable step CPU p95 | `620m` |
| target utilization | `0.70` |
| 계산 | `620m / 0.70 = 886m` |
| 후보 | `900m` 또는 `1000m` |

평균 CPU만 기준으로 삼으면 순간 피크를 놓칠 수 있으므로 가능하면 CPU p95 또는 `avg + buffer`를 함께 본다.

## Auth Service 해석

auth-service는 다른 조회 API와 다르게 해석한다.

`POST /auth/login`은 password hash 검증 때문에 CPU-bound 성격이 강하다. 따라서 auth의 기준은 전체 API RPS가 아니라 실제 최대 로그인 진입률이다.

| 개념 | 의미 |
| --- | --- |
| 최대 진입률 | 특정 순간에 새로 로그인하는 사용자 수, 예: `40 login RPS` |
| 실제 로그인 비중 | 전체 API 요청 중 로그인 요청 비율 |

auth CPU request는 “이론상 가능한 최대 login RPS”보다 “서비스에서 실제 예상되는 최대 login RPS”를 안정 처리할 수 있는지를 기준으로 판단한다.

예를 들어 실제 피크 로그인 유입이 `30~40 login RPS`라면, `80 login RPS`에서 깨지는 현상만으로 CPU request를 크게 올리는 것은 과할 수 있다. 반대로 티켓 오픈 직전에 세션 만료와 재로그인이 몰려 `100 login RPS`가 발생한다면 auth는 첫 진입 병목이 될 수 있다.

## 후보 검증

현실 구간 재측정으로 CPU request 후보를 계산한 뒤에는 후보 request를 적용해 같은 구간을 다시 검증한다.

| 단계 | 목적 |
| --- | --- |
| 후보 적용 실험 | 계산한 request가 과소/과대인지 확인 |
| 여유분 검증 | 최종 후보에 buffer를 둔 조건에서 반복 검증 |

후보 검증에서도 CPU limit은 제거하거나 충분히 높게 유지한다. 이 단계에서 limit 때문에 throttling이 발생하면 CPU request 판단이 흐려진다.

## 최종 산출물

최종적으로 서비스별로 아래 값을 남긴다.

| 필드 | 의미 |
| --- | --- |
| max_valid_rps | 단일 Pod가 안정적으로 처리한 최대 RPS |
| first_limit_rps | latency/error/throttling이 깨진 첫 RPS |
| cpu_usage_m_at_max_valid_rps | 최대 유효 RPS 구간의 CPU 사용량 |
| request_candidate_m | target utilization 기준 CPU request 후보 |
| decision | 유지, 상향, 하향, 재측정 중 하나 |
| notes | auth 진입률, DB 병목, lock, external dependency 등 해석 |

이 값을 바탕으로 이후 HPA 실험에서는 replica 수와 scale 기준을 별도로 검증한다.
