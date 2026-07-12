# local-write-services-expand-1000m Capacity Baseline Result

## Source

| 항목 | 값 |
| --- | --- |
| raw final report | [loadtest-run-report-final.json](loadtest-run-report-final.json) |
| service reports | [reservation](loadtest-run-report-reservation-service.json), [payment](loadtest-run-report-payment-service.json), [ticket](loadtest-run-report-ticket-service.json) |
| k6 summary | [k6-summary.json](k6-summary.json) |
| metadata | [metadata.json](metadata.json) |
| k6 job log | [k6-job.log](k6-job.log) |
| task wrapper log | [task-dev-loadtest.log](task-dev-loadtest.log) |
| analysis summary | [analysis-summary.json](analysis-summary.json) |
| service candidate table | [service-candidate-table.md](service-candidate-table.md) |
| step result table | [step-result-table.md](step-result-table.md) |
| rendered loadtest values | [helm-template-loadtest-local-write-services-expand.yaml](helm-template-loadtest-local-write-services-expand.yaml) |
| rendered worker check | [helm-template-worker-env-check.txt](helm-template-worker-env-check.txt) |
| pod/job evidence | [k6-job-describe.txt](k6-job-describe.txt), [k6-pod-describe.txt](k6-pod-describe.txt), [loadtest-status-final.txt](loadtest-status-final.txt) |
| service pod evidence | [ticketing-reservation-pods-describe.txt](ticketing-reservation-pods-describe.txt), [ticketing-payment-pods-describe.txt](ticketing-payment-pods-describe.txt), [ticketing-ticket-pods-describe.txt](ticketing-ticket-pods-describe.txt) |
| loadtest_run_id | `read-api-loadtest-read-manual-20260621082125-tq74h` |
| scenario | `capacity-baseline-load-test` |
| preset | `local-write-services-expand-1000m` |
| dataset_revision | `capacity-baseline-half-year-early-growth-v2` |
| raw run status | `FAIL` |
| interpretation | 상한 탐색 완료. 실패 구간을 포함해 서비스별 최대 유효 RPS를 확인했다. |

## Conditions

이번 실행은 기존 비교 프리셋 `local-baseline-1000m`을 바꾸지 않고, reservation/payment/ticket만 대상으로 하는 새 preset을 사용했다.

| 항목 | 값 |
| --- | --- |
| preset file | `gitops/platform/loadtest/values/presets/capacity-baseline/local-write-services-expand-1000m.yaml` |
| 비교 기준 | [local-baseline-1000m server/worker split](../local-baseline-1000m-server-worker-2026-06-21/README.md) |
| 서비스 CPU 조건 | `request=1000m`, CPU limit 없음, HPA disabled, replica 1 |
| dataset | 고객 100,000명, 공연 270개, 회차 810개, 좌석 567,000개 |
| serviceSteps | `reservation`, `payment`, `ticket` |
| warmup 제외 | 각 서비스 첫 stage를 후보 산정에서 제외 |
| worker entrypoint | `command=python`, `args=cmd/worker/main.py` |
| `UVICORN_WORKERS` 적용 범위 | API Deployment env에만 있고 worker Deployment에는 없음 |

report 코드가 warmup stage를 별도 필드로 처리하지 않으므로, 이 문서와 [analysis-summary.json](analysis-summary.json), [step-result-table.md](step-result-table.md)에서 첫 stage를 `warmup 제외`로 명시했다. 이번 run의 최대 유효 구간은 모두 첫 stage 이후라 raw report의 후보값과 warmup 제외 해석이 같다.

## Command

```bash
SCENARIO=capacity-baseline-load-test \
  PRESET=local-write-services-expand-1000m \
  task --dir /Users/danghamo/Documents/gituhb/medikong/gitops dev:loadtest
```

실행 로그에는 아래 preset 파일명이 남았다.

```text
values=platform/loadtest/values/presets/capacity-baseline/local-write-services-expand-1000m.yaml
```

Task wrapper가 read Job을 끝까지 기다렸고, 완료 후 Kong rate limit은 `120/min`으로 복구됐다.

## Overall Result

k6 최종 상태는 `FAIL`이다. 다만 이번 실험은 상한 탐색이므로, 실패 구간을 포함한 것이 정상적인 결과다. Kubernetes Job은 완료됐고, raw report는 reservation 240 RPS 통과, payment 320 RPS 실패, ticket 120 RPS의 list gate 실패를 기록했다.

| 서비스 | warmup 제외 | 최대 유효 RPS | 기준 step | CPU avg | CPU request 후보 | 실패 시작 구간 | 기존 대비 | 판단 |
| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- |
| reservation-service | `80 RPS` | 240 | `reservation_rps_240` | 1384.6m | 1978m | 없음 | 120 -> 240 RPS | 테스트 최대 구간까지 통과 |
| payment-service | `40 RPS` | 240 | `payment_rps_240` | 1137.4m | 1625m | `payment_rps_320` | 40 -> 240 RPS | 320 RPS에서 p95/error gate 실패 |
| ticket-service | `40 RPS` | 100 | `ticket_rps_100` | 1005.8m | 1437m | `ticket_rps_120` | 60 -> 100 RPS | 120 RPS에서 `/tickets/me` p95 gate 실패 |

## Step Results

| 서비스 | step | API | target RPS | p95 | p99 | error rate | CPU avg | 후보 | 판정 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| reservation-service | `reservation_rps_80` | `POST /reservations` | 80 | 13.4ms | 40.1ms | 0.00% | 182.9m | 262m | warmup 제외 |
| reservation-service | `reservation_rps_120` | `POST /reservations` | 120 | 20.9ms | 40.0ms | 0.00% | 536.3m | 767m | valid |
| reservation-service | `reservation_rps_160` | `POST /reservations` | 160 | 37.3ms | 110.4ms | 0.00% | 791.8m | 1132m | valid |
| reservation-service | `reservation_rps_200` | `POST /reservations` | 200 | 43.2ms | 158.2ms | 0.00% | 1060.8m | 1516m | valid |
| reservation-service | `reservation_rps_240` | `POST /reservations` | 240 | 63.7ms | 108.9ms | 0.00% | 1384.6m | 1978m | valid |
| payment-service | `payment_rps_40` | `POST /payments` | 40 | 8.2ms | 18.3ms | 0.00% | 60.2m | 87m | warmup 제외 |
| payment-service | `payment_rps_80` | `POST /payments` | 80 | 7.2ms | 18.6ms | 0.00% | 207.7m | 297m | valid |
| payment-service | `payment_rps_120` | `POST /payments` | 120 | 16.3ms | 34.5ms | 0.00% | 444.4m | 635m | valid |
| payment-service | `payment_rps_160` | `POST /payments` | 160 | 34.1ms | 101.8ms | 0.00% | 774.3m | 1107m | valid |
| payment-service | `payment_rps_240` | `POST /payments` | 240 | 96.6ms | 498.0ms | 0.00% | 1137.4m | 1625m | valid |
| payment-service | `payment_rps_320` | `POST /payments` | 320 | 4120.9ms | 10000.8ms | 12.89% | 1611.4m | 2303m | limit: p95/error |
| ticket-service | `ticket_rps_40` | `POST /tickets/issue` / `GET /tickets/me` | 40 | 23.7ms / 20.8ms | 57.5ms / 59.5ms | 0.00% | 199.5m | 285m | warmup 제외 |
| ticket-service | `ticket_rps_60` | `POST /tickets/issue` / `GET /tickets/me` | 60 | 21.2ms / 20.3ms | 57.8ms / 60.0ms | 0.00% | 488.6m | 699m | valid |
| ticket-service | `ticket_rps_80` | `POST /tickets/issue` / `GET /tickets/me` | 80 | 42.4ms / 40.5ms | 97.3ms / 99.2ms | 0.00% | 721.2m | 1031m | valid |
| ticket-service | `ticket_rps_100` | `POST /tickets/issue` / `GET /tickets/me` | 100 | 55.3ms / 60.0ms | 148.0ms / 128.5ms | 0.00% | 1005.8m | 1437m | valid |
| ticket-service | `ticket_rps_120` | `POST /tickets/issue` / `GET /tickets/me` | 120 | 103.4ms / 117.8ms | 196.8ms / 196.3ms | 0.00% | 1337.2m | 1911m | limit: ticket list p95 |

## Comparison

| 서비스 | 기존 최대 유효 RPS | 확장 탐색 최대 유효 RPS | CPU request 후보 변화 | 해석 |
| --- | ---: | ---: | --- | --- |
| reservation-service | 120 | 240 | 732m -> 1978m | 240 RPS까지 SLO/error/throttling gate 통과. 다음 상한은 아직 미측정 |
| payment-service | 40 | 240 | 208m -> 1625m | 240 RPS까지 통과, 320 RPS에서 503/status 0과 p95 급증 |
| ticket-service | 60 | 100 | 669m -> 1437m | 100 RPS까지 통과, 120 RPS에서 `/tickets/me` p95가 100ms gate 초과 |

## Notes

- `payment-service-background`와 `ticket-service-background` pod는 run 중 재시작이 관측됐다. API 측정 Job은 완료됐지만, 해당 상태는 [ticketing-payment-pods-describe.txt](ticketing-payment-pods-describe.txt), [ticketing-ticket-pods-describe.txt](ticketing-ticket-pods-describe.txt), [payment-worker-tail.log](payment-worker-tail.log), [ticket-worker-tail.log](ticket-worker-tail.log)에 남겼다.
- payment 240 RPS는 p95 gate는 통과했지만 p99가 498.0ms라 tail latency 여유는 크지 않다.
- ticket 120 RPS는 issue API 자체 p95는 120ms 안에 들어왔지만, 같은 step의 `/tickets/me` p95가 117.8ms로 list gate를 넘었다.
- `local-baseline-1000m`에서 확정한 auth/concert/notification 기준은 이번 실험에서 다시 판단하지 않았다.

## Decision

이번 상한 탐색 기준으로 reservation/payment/ticket의 1000m 단일 Pod 기준 후보는 아래처럼 본다.

| 서비스 | Pod당 기준 RPS | CPU request 후보 | 운영 판단 |
| --- | ---: | ---: | --- |
| reservation-service | 240 | 1978m | 240 RPS 목표면 2 vCPU급 request가 필요하다. 1000m 기준 운영값은 더 낮은 RPS로 분리해야 한다. |
| payment-service | 240 | 1625m | 240 RPS는 유효하지만 320 RPS는 한계 구간이다. 1000m 유지 시 scale-out 기준을 별도 산정한다. |
| ticket-service | 100 | 1437m | 100 RPS가 유효 상한이다. 120 RPS 이상은 `/tickets/me` gate 개선 또는 scale-out 판단이 먼저 필요하다. |
