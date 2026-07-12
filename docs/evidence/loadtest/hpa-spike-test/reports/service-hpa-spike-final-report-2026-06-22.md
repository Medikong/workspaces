# Service HPA Spike 최종 실험 결과 보고서

## 요약

이번 실험의 원래 목표는 HPA target CPU `70%`, min replicas `2`, max replicas `10`을 운영 또는 검증 scenario에서 만족하고, scale-out 응답 시간을 측정하는 것이었다.

실제 local 검증은 Docker Desktop 자원 한계를 고려해 `local-hpa-spike` 기준으로 진행했다. 이 검증 scenario의 HPA 조건은 report 기준 `targetCPUUtilization=70`, `minReplicas=1`, `maxReplicas=4`다. 따라서 이번 결과는 CPU 70% 기반 scale-out 응답 시간 검증으로는 유효하지만, 운영형 `min=2`, `max=10` 조건을 그대로 검증한 결과는 아니다. 운영/aws-dev 기준 `min=2`, `max=10`은 별도 scenario에서 다시 확인해야 한다.

서비스별 결론은 다음과 같다.

| service | preset | k6 | HPA 결과 | decision s | ready s | ready after decision | 판단 |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| `auth-service` | `auth-30rps` | `FAIL` | `1 -> 2` | `118.354` | `129.721` | `11.367` | HPA 유효, spike p99 SLO 초과 |
| `reservation-service` | `reservation-140rps` | `PASS` | `1 -> 2` | `217.723` | `229.870` | `12.147` | HPA 유효, 품질 안정 |
| `ticket-service` | `ticket-75rps` | `PASS` | scale-out 없음 | `-` | `-` | `-` | RPS 부족, CPU target 미도달 |
| `notification-service` | `notification-400rps` | `FAIL` | `1 -> 2` | `148.583` | `160.480` | `11.897` | HPA 유효, spike p99 SLO 초과 |
| `payment-service` | `payment-250rps` | `FAIL` | `1 -> 3` | `88.011` | `99.794` | `11.783` | HPA 반응 확인, 성능 한계 초과 |
| `concert-service` | `concert-140rps` | `FAIL` | `1 -> 4` | `57.818` | `71.969` | `14.151` | HPA 반응 확인, DB-bound read 병목 |

전체적으로 CPU 기반 HPA는 `auth`, `reservation`, `notification`, `payment`, `concert`에서 실제 scale-out을 만들었다. `ticket`은 `75 RPS` 조건에서 CPU가 70%에 닿지 않아 scale-out을 유발하지 못했다. scale-out이 확인된 서비스의 Ready 반영 시간은 decision 이후 대략 `11-14s` 범위였다.

## 실험 기준

| 항목 | 값 |
| --- | --- |
| scenario | `service-hpa-spike-load-test` |
| dataset scenario | `setup-capacity-baseline-dataset` |
| dataset profile | `capacity-baseline` |
| dataset revision | `capacity-baseline-half-year-early-growth-v2` |
| target environment | `local`, `local-hpa-spike` 배포 기준 |
| HPA target CPU | `70%` |
| local 검증 HPA min / max | `1 / 4` |
| 원래 운영 목표 min / max | `2 / 10` |
| service CPU request | `1000m` |
| service memory request | `256Mi` |
| k6 runner CPU request | `500m` |
| k6 runner memory request | `1Gi` |
| 공통 error threshold | `http_req_failed < 1%` |
| 공통 checks threshold | `checks >= 99%` |
| 공통 latency threshold | `http_req_duration p95 < 150ms`, `p99 < 300ms` |
| cooldown 해석 | recovery 관찰 전용, scale-down 검증 아님 |

`local-hpa-spike`의 service CPU request는 모든 대상 서비스에서 `1000m`로 맞췄다. `auth-service`만 CPU limit `2`가 남아 있고, 나머지 서비스는 CPU/memory limit을 제거한 상태로 실험했다.

## 데이터셋 기준치

| 데이터 | 건수 / 설정 |
| --- | ---: |
| admins | `1` |
| providers | `1` |
| customers | `100,000` |
| concerts | `270` |
| performances | `810` |
| seats | `567,000` |
| seat grades | `3,240` |
| reservation history | `261,000` |
| tickets | `170,000` |
| ticket issue pool | `170,000` |
| payments | `184,000` |
| payment events | `184,000` |
| payment pool | `184,000` |
| notifications | `354,000` |
| customer pool email | `capacity-customer@loadtest.medikong.local` |

이 데이터셋은 half-year early growth 모델을 기준으로 한다. concert 관련 read API는 `270 concerts * 3 performances * 700 seats = 567,000 seats` 규모에서 측정됐다.

## DB Pool 기준

현재 기준 GitOps base 값은 다음과 같다.

| 항목 | 값 |
| --- | ---: |
| `database.sqlalchemy.poolSize` | `15` |
| `database.sqlalchemy.maxOverflow` | `0` |
| `database.sqlalchemy.poolTimeoutSeconds` | `15` |
| `database.sqlalchemy.poolRecycleSeconds` | `1800` |
| `UVICORN_WORKERS` | `2` |

다만 모든 서비스의 과거 run이 같은 pool 값으로 실행된 것은 아니다. pool 값은 실험 과정에서 조정됐고, per-run runtime snapshot이 남은 서비스만 확정값으로 기록한다.

| service | 실험별 확인된 pool | 비고 |
| --- | --- | --- |
| `concert-service` 1차 | `poolSize=35`, `maxOverflow=10`, `timeout=15` | `too many clients already` 발생 |
| `concert-service` 3차 | `poolSize=15`, `maxOverflow=0`, `timeout=15`, `recycle=1800` | PostgreSQL connection 초과는 미재발, SQLAlchemy QueuePool timeout 재발 |
| `payment-service` 250RPS | `poolSize=20`, `maxOverflow=20`, `timeout=10`, `recycle=1800` | deploy describe로 확인 |
| `auth-service` | 실행 당시 runtime snapshot 없음 | 현재 기준은 base `15/0/15/1800` |
| `reservation-service` | 실행 당시 runtime snapshot 없음 | 현재 기준은 base `15/0/15/1800` |
| `ticket-service` | 실행 당시 runtime snapshot 없음 | 현재 기준은 base `15/0/15/1800` |
| `notification-service` | SQLAlchemy pool snapshot 없음 | notification DB 경로는 별도 확인 필요 |

connection budget은 다음 식으로 계산한다.

```text
api_connection_budget = hpa_max_replicas * uvicorn_workers * (poolSize + maxOverflow)
worker_connection_budget = worker_replicas * (poolSize + maxOverflow)
service_connection_budget = api_connection_budget + worker_connection_budget
```

이번 concert 최종 재실험 기준으로는 `4 replicas * 2 workers * 15 pool = 120` connection이다. PostgreSQL `max_connections=200` 안에는 들어오지만, worker process별 pool은 독립적이므로 특정 worker에 요청이 몰리면 해당 process의 15개 pool이 먼저 고갈될 수 있다.

## RPS 기준

| service | preset | warmup | baseline | spike | overload | cooldown | 해석 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `auth-service` | `auth-30rps` | `5` | `15` | `25` | `30` | `15` | 단일 login API |
| `reservation-service` | `reservation-140rps` | `20` | `80` | `120` | `140` | `80` | 단일 reservation create API |
| `ticket-service` | `ticket-75rps` | `20` | `40` | `60` | `75` | `40` | issue/list API 동시 측정 |
| `notification-service` | `notification-400rps` | `40` | `240` | `320` | `400` | `240` | 단일 notification list API |
| `payment-service` | `payment-250rps` | `50` | `120` | `200` | `250` | `120` | 단일 payment create API |
| `concert-service` | `concert-140rps` | `20` | `80` | `120` | `140` | `80` | concert endpoint별 순차 측정 |

`concert-service`의 `concert-140rps`는 실제 사용자 여정 전체가 140 RPS라는 뜻이 아니다. `recommended`, `detail`, `calendar`, `date_performances`, `seat_map` 같은 API를 순차적으로 떼어 각각 같은 RPS 계단에 올리는 endpoint 단위 capacity probe에 가깝다. 실제 운영 트래픽에서는 API마다 자연 발생 RPS가 다르므로, HPA 운영 판단에는 funnel 비율을 반영한 journey mix preset이 별도로 필요하다.

## SLO 기준

벤치마크 측정 결과 문서: [Half-year early-growth API 기준 성능 종합 보고서](../../../services/service-baseline-summary.md)

공통 threshold는 `http_req_failed < 1%`, `checks >= 99%`, `http_req_duration p95 < 150ms`, `p99 < 300ms`다. 서비스별 endpoint SLO는 scenario report의 `slo_p95_ms` 기준으로 다음과 같이 기록됐다.

| service | endpoint | p95 SLO |
| --- | --- | ---: |
| `auth-service` | `POST /auth/login` | `300ms` |
| `reservation-service` | `POST /reservations` | `120ms` |
| `ticket-service` | `POST /tickets/issue` | `120ms` |
| `ticket-service` | `GET /tickets/me` | `100ms` |
| `notification-service` | `GET /notifications` | `80ms` |
| `payment-service` | `POST /payments` | `120ms` |
| `concert-service` | `GET /concerts/recommended` | `80ms` |
| `concert-service` | `GET /concerts/{concertId}` | `80ms` |
| `concert-service` | `GET /concerts/{concertId}/calendar` | `80ms` |
| `concert-service` | `GET /concerts/{concertId}/dates/{date}/performances` | `80ms` |
| `concert-service` | `GET /performances/{performanceId}/seat-map` | `150ms` |

## 서비스별 결과

### auth-service

| 항목 | 값 |
| --- | --- |
| preset | `auth-30rps` |
| run id | `read-api-loadtest-read-manual-20260621092401-jqx9r` |
| k6 status | `FAIL` |
| HPA | `1 -> 2` |
| decision / ready | `118.354s / 129.721s` |
| first limit | `auth_spike_rps_25` |
| first limit p95 / p99 | `178.1ms / 810.8ms` |
| error / checks | `0.00% / 100.00%` |

HPA는 유효했다. 실패 원인은 error가 아니라 spike 구간 p99 SLO 초과다. overload와 cooldown에서는 다시 안정화됐기 때문에, scale-out 이후 품질 회복 가능성이 보인다.

### reservation-service

| 항목 | 값 |
| --- | --- |
| preset | `reservation-140rps` |
| run id | `read-api-loadtest-read-manual-20260621101259-5vcqs` |
| k6 status | `PASS` |
| HPA | `1 -> 2` |
| decision / ready | `217.723s / 229.870s` |
| first limit | 없음 |
| overload p95 / p99 | `20.3ms / 33.1ms` |
| error / checks | `0.00% / 100.00%` |

성능은 안정적이고 HPA도 scale-out 했다. 다만 decision 시간이 늦다. 같은 RPS에서 duration을 늘려 decision 전후 CPU와 latency를 더 길게 보는 재검증이 필요하다.

### ticket-service

| 항목 | 값 |
| --- | --- |
| preset | `ticket-75rps` |
| run id | `read-api-loadtest-read-manual-20260621102813-mjt9v` |
| k6 status | `PASS` |
| HPA | scale-out 없음 |
| first limit | 없음 |
| overload issue p95 / p99 | `9.3ms / 20.2ms` |
| overload list p95 / p99 | `6.4ms / 20.3ms` |
| error / checks | `0.00% / 100.00%` |

서비스 자체는 안정적이었지만 CPU target 70%에 닿지 않았다. 이 preset은 HPA 검증 부하로는 부족하다. 다음 실험은 `ticket-110rps` 또는 더 긴 spike/overload duration으로 scale-out 유발 여부를 확인해야 한다.

### notification-service

| 항목 | 값 |
| --- | --- |
| preset | `notification-400rps` |
| run id | `read-api-loadtest-read-manual-20260621103553-7s2j9` |
| k6 status | `FAIL` |
| HPA | `1 -> 2` |
| decision / ready | `148.583s / 160.480s` |
| first limit | `notification_spike_rps_320` |
| first limit p95 / p99 | `22.5ms / 341.7ms` |
| error / checks | `0.00% / 100.00%` |

HPA는 유효했다. 실패 원인은 spike 구간 p99 SLO 초과이며, error/checks는 안정적이었다. 다만 당시 background pod 이슈가 있었으므로 다음 run에서는 worker/DB network policy 문제를 제거한 clean cluster 상태에서 재확인하는 편이 좋다.

### payment-service

| 항목 | 값 |
| --- | --- |
| preset | `payment-250rps` |
| run id | `read-api-loadtest-read-manual-20260621133024-lr7tl` |
| k6 status | `FAIL` |
| HPA | `1 -> 3` |
| decision / ready | `88.011s / 99.794s` |
| first limit | `payment_baseline_rps_120` |
| first limit p95 / p99 | `1041.8ms / 1638.2ms` |
| first limit error / checks | `0.04% / 99.98%` |
| overload error / checks | `27.35% / 72.73%` |
| cooldown error / checks | `41.79% / 58.91%` |

HPA 반응을 확인하기에는 충분한 부하였지만, 성능 한계를 크게 넘었다. 특히 baseline 120 RPS부터 latency SLO를 넘었고, overload/cooldown에서는 status `0` 계열 실패가 커졌다. 안정 구간을 찾으려면 120 RPS 이하 또는 더 완만한 stage로 좁히는 것이 맞다.

### concert-service

| 항목 | 값 |
| --- | --- |
| preset | `concert-140rps` |
| run id | `read-api-loadtest-read-manual-20260621160921-fhfxw` |
| k6 status | `FAIL` |
| HPA | `1 -> 4` |
| decision / ready | `57.818s / 71.969s` |
| first limit | `concert_recommended_baseline_rps_80` |
| first limit p95 / p99 | `10113.0ms / 10305.7ms` |
| first limit error / checks | `41.95% / 58.05%` |
| SQLAlchemy QueuePool timeout | 재발 |
| PostgreSQL `too many clients already` | 미재발 |

HPA는 빠르게 scale-out했고 max replicas 4까지 도달했다. 그러나 baseline 80 RPS부터 이미 실패가 시작됐다. 1차 concert run에서는 `poolSize=35`, `maxOverflow=10` 조합이 PostgreSQL `too many clients already`를 만들었다. 최종 3차 run에서는 `poolSize=15`, `maxOverflow=0`으로 PostgreSQL connection 초과는 막았지만, worker별 SQLAlchemy QueuePool timeout이 재발했다.

concert 결과는 "HPA가 동작하지 않았다"가 아니라 "DB-bound read API에서는 HPA만으로 처리량이 선형 증가하지 않는다"로 해석한다. 다음 개선의 1차 방향은 pool size 확대가 아니라 Redis cache, singleflight, stale-while-revalidate로 DB 진입량과 pool 점유 시간을 줄이는 것이다.

## 목표 달성 판단

| 목표 | 판단 | 근거 |
| --- | --- | --- |
| CPU target `70%` 기반 HPA 반응 확인 | 부분 달성 | 6개 중 5개 서비스에서 scale-out 관측 |
| `min=2`, `max=10` 운영형 조건 만족 | 미검증 | local 검증은 `min=1`, `max=4` |
| scale-out 응답 시간 측정 | 달성 | scale-out 발생 서비스는 decision/ready 시간이 report에 기록됨 |
| 안정 성능 확인 | 부분 달성 | reservation은 PASS, auth/notification은 p99 초과, payment/concert는 처리 한계 초과 |
| DB connection budget 검증 | 부분 달성 | concert에서 PostgreSQL connection 초과는 막았지만 SQLAlchemy pool timeout은 남음 |

## 최종 결론

CPU 기반 HPA는 local 검증 scenario에서 동작한다. scale-out이 발생한 서비스들은 HPA decision 이후 약 `11-14s` 안에 새 Pod Ready가 따라왔다. 다만 HPA가 동작한다는 사실과 SLO를 만족한다는 사실은 다르다.

`reservation-service`는 이번 조건에서 가장 안정적이었다. `auth-service`와 `notification-service`는 HPA가 유효하고 error는 없지만 spike p99 SLO를 넘었다. `payment-service`는 HPA 반응은 확인됐으나 `250 RPS`가 처리 한계를 크게 넘었다. `ticket-service`는 안정적이지만 RPS가 부족해 scale-out을 검증하지 못했다. `concert-service`는 HPA가 max까지 올라가도 DB-bound read path와 pool budget 한계가 먼저 나타났다.

운영 목표인 `min=2`, `max=10`을 검증하려면 local 결과를 그대로 확장하지 말고, aws-dev 또는 운영형 검증 preset에서 다음을 다시 확인한다.

- HPA `targetCPUUtilization=70`, `minReplicas=2`, `maxReplicas=10`
- 서비스별 CPU request와 limit 정책
- `maxReplicas * UVICORN_WORKERS * (poolSize + maxOverflow)` connection budget
- endpoint별 SLO와 실제 journey mix RPS
- scale-out decision/ready 시간과 cooldown 회복 여부

## 다음 액션

| 우선순위 | 액션 | 대상 |
| --- | --- | --- |
| 1 | aws-dev/운영형 HPA preset을 `min=2`, `max=10`으로 별도 검증한다 | 전체 |
| 2 | ticket은 `ticket-110rps` 이상 또는 duration 확대로 scale-out 유발 부하를 찾는다 | ticket |
| 3 | payment는 120 RPS 이하에서 안정 구간을 다시 좁힌다 | payment |
| 4 | concert는 Redis cache + singleflight 적용 후 `concert-140rps`를 재실행한다 | concert |
| 5 | SQLAlchemy pool checkout/checked_out metric과 DB activity dashboard를 보강한다 | SQLAlchemy 기반 서비스 |
| 6 | concert는 API 단위 RPS probe와 실제 journey mix preset을 분리한다 | concert |

## 원본 증거

- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-auth-30rps/README.md`
- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-auth-30rps/loadtest-run-report-service.json`
- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-reservation-140rps/README.md`
- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-reservation-140rps/loadtest-run-report-service.json`
- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-ticket-75rps/README.md`
- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-ticket-75rps/loadtest-run-report-service.json`
- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-notification-400rps/README.md`
- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-notification-400rps/loadtest-run-report-service.json`
- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-payment-150rps/README.md`
- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-payment-150rps/loadtest-run-report-service.json`
- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-concert-140rps-third-20260622/README.md`
- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-concert-140rps-third-20260622/summary.json`
- `workspace/docs/evidence/loadtest/hpa-spike-test/reports/service-hpa-spike-concert-140rps-third-20260622/report-archive/read-api-loadtest-read-manual-20260621160921-fhfxw/loadtest-run-report-concert-service.json`
- `workspace/docs/trouble/2026-06-21-hpa-scaleout-db-connection-budget.md`
