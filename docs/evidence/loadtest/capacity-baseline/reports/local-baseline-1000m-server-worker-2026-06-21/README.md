# local-baseline-1000m Capacity Baseline Result - server/worker split

## Source

| 항목 | 값 |
| --- | --- |
| raw final report | [loadtest-run-report-final.json](loadtest-run-report-final.json) |
| service reports | [auth](loadtest-run-report-auth-service.json), [concert](loadtest-run-report-concert-service.json), [reservation](loadtest-run-report-reservation-service.json), [payment](loadtest-run-report-payment-service.json), [ticket](loadtest-run-report-ticket-service.json), [notification](loadtest-run-report-notification-service.json) |
| k6 summary | [k6-summary.json](k6-summary.json) |
| metadata | [metadata.json](metadata.json) |
| k6 job log | [k6-job.log](k6-job.log) |
| task wrapper log | [task-dev-loadtest-task-wrapper-timeout-risk-aborted.log](task-dev-loadtest-task-wrapper-timeout-risk-aborted.log) |
| manual full run id | [manual-full-run-id.txt](manual-full-run-id.txt) |
| rendered worker check | [helm-template-worker-env-check.txt](helm-template-worker-env-check.txt) |
| deployed worker check | [actual-worker-env-check.txt](actual-worker-env-check.txt) |
| report archive copy | [report-archive/read-api-loadtest-read-manual-20260621062618-full-9bvvm/](report-archive/read-api-loadtest-read-manual-20260621062618-full-9bvvm/) |
| loadtest_run_id | `read-api-loadtest-read-manual-20260621062618-full-9bvvm` |
| scenario | `capacity-baseline-load-test` |
| preset | `local-baseline-1000m` |
| dataset_revision | `capacity-baseline-half-year-early-growth-v2` |
| run status | `PASS` |

## Conditions

이번 실행은 기존 비교 프리셋을 바꾸지 않았다.

| 항목 | 값 |
| --- | --- |
| preset file | `gitops/platform/loadtest/values/presets/capacity-baseline/local-baseline-1000m.yaml` |
| 서비스 CPU 조건 | `request=1000m`, CPU limit 없음, HPA disabled, replica 1 |
| dataset | 고객 100,000명, 공연 270개, 회차 810개, 좌석 567,000개 |
| DB pool | 배포 시점 GitOps 기본값 |
| API entrypoint | service image `CMD ["python", "cmd/server/main.py"]` |
| worker entrypoint | 같은 service image + worker Deployment `command: ["python"]`, `args: ["cmd/worker/main.py"]` |
| `UVICORN_WORKERS` 적용 범위 | API Deployment의 `container.apiEnv`에만 적용, worker Deployment에는 없음 |

`task dev:loadtest` wrapper는 전체 scenario보다 짧은 read Job wait deadline을 갖고 있어 full run 감시에는 부적합했다. 그래서 같은 Helm release와 같은 preset으로 dataset setup을 완료한 뒤 read Job만 `manual-20260621062618-full`로 직접 트리거하고 70분 deadline으로 감시했다. 프리셋 값은 바꾸지 않았다.

## Command

```bash
cd /Users/danghamo/Documents/gituhb/medikong/gitops
SCENARIO=capacity-baseline-load-test \
  PRESET=local-baseline-1000m \
  task dev:loadtest
```

주의: `task --dir ... dev:loadtest SCENARIO=... PRESET=...` 형태는 이 Taskfile 내부 쉘 env로 전달되지 않아 `local-smoke`로 해석됐다. 해당 시도는 중단했고 [task-dev-loadtest-initial-preset-mispass.log](task-dev-loadtest-initial-preset-mispass.log)에 보관했다.

full run은 아래 조건으로 직접 감시했다.

```bash
task --dir gitops/platform/loadtest kong-rate-limit:disable
helm upgrade read-api-loadtest gitops/platform/loadtest \
  --namespace loadtest \
  --reuse-values \
  --set manualRuns.dataset.enabled=false \
  --set-string manualRuns.dataset.runId= \
  --set manualRuns.read.enabled=true \
  --set-string manualRuns.read.runId=manual-20260621062618-full
kubectl -n loadtest get job read-api-loadtest-read-manual-20260621062618-full -o wide
task --dir gitops/platform/loadtest kong-rate-limit:restore
```

## Overall Result

전체 run은 `PASS`다. 모든 서비스가 지정 프리셋의 최대 RPS 구간까지 p95 SLO, error rate, CPU throttling 기준을 통과했다.

`pool35` 실험에서는 reservation/ticket은 개선됐지만 concert-service가 40 RPS부터 실패했다. `concert-workers2-short` 단축 실험에서는 Uvicorn worker 2개 이후 concert 병목이 `seat-map` 120 RPS에 집중되는 것으로 좁혀졌다. 이번 전체 실행에서는 새 `cmd/server` / `cmd/worker` 구조와 worker Deployment 분리 상태에서 concert-service도 160 RPS까지 통과했다.

즉 이전 실패는 DB pool 하나만의 문제가 아니었다. API process와 background worker 실행 단위가 섞이고, API worker 수와 health probe가 같은 처리 여유를 공유하던 상태가 concert-service 병목을 크게 키웠다. worker를 별도 Deployment로 분리하고 API entrypoint를 `cmd/server/main.py`로 통일한 뒤에는 같은 `local-baseline-1000m` 프리셋에서 병목이 재현되지 않았다.

## Capacity Candidates

| 서비스 | 최대 유효 RPS | 기준 step | CPU avg | CPU request 후보 | 판단 |
| --- | ---: | --- | ---: | ---: | --- |
| auth-service | 40 | `auth_rps_40` | 1476.4m | 2110m | 통과, CPU request 후보는 1000m보다 큼 |
| concert-service | 160 | `concert_rps_160` | 779.0m | 1113m | 통과, 이전 pool35의 20 RPS 한계 해소 |
| reservation-service | 120 | `reservation_rps_120` | 512.2m | 732m | 통과 |
| payment-service | 40 | `payment_rps_40` | 145.2m | 208m | 통과 |
| ticket-service | 60 | `ticket_rps_60` | 467.9m | 669m | 통과 |
| notification-service | 320 | `notification_rps_320` | 588.7m | 842m | 통과 |

## Endpoint Highlights

| 서비스 | 최대 구간의 대표 p95 | p99 | error rate |
| --- | ---: | ---: | ---: |
| auth `POST /auth/login` @ 40 RPS | 52.8ms | 64.1ms | 0% |
| concert `GET /concerts/{id}` @ 160 RPS | 21.8ms | 40.6ms | 0% |
| concert `GET /performances/{id}/seat-map` @ 160 RPS | 39.1ms | 94.4ms | 0% |
| reservation `POST /reservations` @ 120 RPS | 23.5ms | 47.1ms | 0% |
| payment `POST /payments` @ 40 RPS | 5.9ms | 18.4ms | 0% |
| ticket `POST /tickets/issue` @ 60 RPS | 14.9ms | 32.1ms | 0% |
| ticket `GET /tickets/me` @ 60 RPS | 12.9ms | 33.8ms | 0% |
| notification `GET /notifications` @ 320 RPS | 34.2ms | 57.6ms | 0% |

## Comparison

| 서비스 | pool35 최대 유효 RPS | server/worker split 최대 유효 RPS | 변화 |
| --- | ---: | ---: | --- |
| auth-service | 40 | 40 | 유지, CPU 후보는 2057m -> 2110m |
| concert-service | 20 | 160 | 가장 큰 개선. pool35에서 40 RPS부터 실패하던 concert read path가 160 RPS까지 통과 |
| reservation-service | 80 | 120 | 개선 |
| payment-service | 40 | 40 | 유지 |
| ticket-service | 60 | 60 | 유지 |
| notification-service | 240 | 320 | 개선, 320 RPS p95 SLO 통과 |

`concert-workers2-short`와 비교하면 단축 실험은 concert-only 80 RPS를 후보로 봤고 `seat-map` 120 RPS에서 실패했다. 이번 전체 실행은 같은 1000m 조건에서 `seat-map` 160 RPS도 p95 39.1ms로 통과했다. 차이는 단축 실험 이후 반영된 실행 단위 정리와 worker Deployment 분리까지 포함한 결과로 본다.

## Notes

- `task dev:loadtest` 자체는 full capacity-baseline read Job을 끝까지 기다리기에 짧다. 이번 run도 Task wrapper가 아니라 manual watcher로 완료를 확인했다.
- `task --dir ... dev:loadtest SCENARIO=... PRESET=...`는 쉘 env 전달이 아니어서 오동작한다. full run에는 `SCENARIO=... PRESET=... task --dir ... dev:loadtest` 형태를 사용해야 한다.
- report archive PVC에는 과거 run 파일도 남아 있어 최신 run directory만 루트로 복사했다.
- Kong rate-limit은 실행 중 `1000000/min`으로 올렸고 완료 후 `120/min`으로 복구했다.

## Decision

CPU request 후보는 이번 `PASS` 결과를 기준으로 다시 볼 수 있다. 다만 auth-service는 40 RPS에서 CPU avg가 1476m라 `1000m` request로는 target utilization 70%를 넘는다. 운영 기준으로 이미 고정한 `1000m @ 30 RPS`는 유지하되, 40 RPS까지 요구한다면 별도 auth CPU 상향 판단이 필요하다.

concert-service는 더 이상 `pool35` 실패처럼 20 RPS에 묶어둘 필요가 없다. 이번 결과에서는 160 RPS가 유효하고 CPU request 후보는 1113m다. `seat-map` endpoint도 160 RPS에서 SLO 안에 들어왔으므로, 현 구조 기준 병목은 해소된 것으로 판단한다.

## Follow-up

1. `task dev:loadtest`의 read Job wait deadline을 scenario duration 기반으로 늘린다.
2. `task --dir` 사용 시 `PRESET`/`SCENARIO` 전달 방식이 헷갈리지 않게 Taskfile 또는 RUNBOOK에 명시한다.
3. auth-service는 `30 RPS 고정 기준`과 `40 RPS 확장 기준`을 문서에서 분리한다.
