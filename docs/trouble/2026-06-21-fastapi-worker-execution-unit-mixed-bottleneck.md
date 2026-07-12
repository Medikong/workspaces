---
id: TROUBLE-018
title: "FastAPI uvicorn worker 수 부족으로 capacity-baseline 병목이 발생한 문제"
status: closed
priority: p1
severity: high
area: service
repos:
  - service
  - gitops
  - workspace
owner: unassigned
created: 2026-06-21
updated: 2026-06-22
resolved: 2026-06-21
tags:
  - loadtest
  - fastapi
  - worker
  - uvicorn
  - capacity-baseline
  - concert-service
related:
  - TROUBLE-015
  - workspace/docs/evidence/loadtest/capacity-baseline/reports/local-baseline-1000m-pool35-2026-06-21/README.md
  - workspace/docs/evidence/loadtest/capacity-baseline/reports/local-concert-workers2-short-2026-06-21/README.md
  - ../evidence/loadtest/capacity-baseline/reports/local-baseline-1000m-server-worker-2026-06-21/README.md
links: []
---

# FastAPI uvicorn worker 수 부족으로 capacity-baseline 병목이 발생한 문제

## 문제

`local-baseline-1000m` capacity-baseline에서 concert-service가 DB pool 병목처럼 보이는 실패를 반복했다. 실제 1차 병목은 FastAPI HTTP 서버의 `uvicorn worker` 수가 부족해 요청 처리 슬롯이 좁아진 문제였다.

`pool35` 실험에서는 SQLAlchemy pool을 `35/20/15s`로 키웠는데도 concert-service가 40 RPS부터 실패했고, Pod health probe까지 밀렸다. 이때는 단순한 기본 pool 부족으로 보기 어려웠다.

## 원인

원인은 하나가 아니었지만, 중심 원인은 `uvicorn worker=1`이었다.

1. 기본 pool 부족은 reservation-service와 ticket-service의 1차 병목이었다.
2. concert-service는 DB pool만 키워도 해결되지 않았다. `uvicorn worker=1`에서 DB pool checkout 대기, 동기 DB 호출, 큰 응답 직렬화, health probe가 한 HTTP process의 처리 여유를 공유했다.
3. worker 수를 늘리려 하자 FastAPI lifespan 기반 background loop가 HTTP server process와 묶여 있어 API worker 수만 독립적으로 조정하기 어려웠다.
4. 그래서 background worker 분리는 원인이 아니라, API `uvicorn worker` 수를 조정하기 위해 필요한 구조 정리였다.

핵심은 DB connection 수만 늘리는 것이 아니라 FastAPI HTTP worker 수를 서비스별로 조정할 수 있게 만드는 것이었다. API는 `cmd/server/main.py`에서 Uvicorn worker로 실행하고, background worker는 같은 이미지의 별도 Deployment에서 `python cmd/worker/main.py`로 실행해야 한다.

## 시도

| 시도 | 결과 |
| --- | --- |
| DB pool 상향 `35/20/15s` | reservation/ticket은 개선됐지만 concert-service는 40 RPS부터 실패 |
| concert-service Uvicorn workers 2 단축 실험 | Pod restart는 사라졌고 병목이 `seat-map` endpoint로 좁혀짐 |
| `cmd/server` / `cmd/worker` 구조 정리 | API worker 수를 HTTP 서버에만 적용할 수 있도록 API entrypoint와 worker entrypoint를 분리 |
| worker Deployment 렌더링 확인 | worker는 `cmd/worker/main.py`를 실행하고 `UVICORN_WORKERS`를 받지 않음 |
| `local-baseline-1000m` 전체 재실행 | 모든 서비스가 최대 구간까지 `PASS` |

## 해결

서비스 이미지는 API와 worker가 같은 이미지를 공유한다. 대신 Kubernetes 실행 단위를 나눠 `UVICORN_WORKERS`가 HTTP API 서버에만 적용되게 한다.

| workload | 실행 |
| --- | --- |
| API Deployment | `python cmd/server/main.py` |
| worker Deployment | `python cmd/worker/main.py` |

GitOps chart는 API Deployment에는 `container.apiEnv`를 붙이고, worker Deployment에는 공통 env와 worker 전용 env만 붙인다. 그래서 `UVICORN_WORKERS`는 API에만 적용되고 worker에는 들어가지 않는다. 이 변경은 background worker가 병목의 원인이라서가 아니라, FastAPI lifespan과 HTTP server 실행이 묶인 상태에서는 API worker 수를 안전하게 늘리기 어려웠기 때문에 필요했다.

## 검증

검증 근거는 [local-baseline-1000m Capacity Baseline Result - server/worker split](../evidence/loadtest/capacity-baseline/reports/local-baseline-1000m-server-worker-2026-06-21/README.md)이다. 검증 run은 `read-api-loadtest-read-manual-20260621062618-full-9bvvm`이다.

| 항목 | 결과 |
| --- | --- |
| preset | `gitops/platform/loadtest/values/presets/capacity-baseline/local-baseline-1000m.yaml` |
| status | `PASS` |
| worker command | `python cmd/worker/main.py` |
| worker `UVICORN_WORKERS` | 없음 |
| concert-service | 160 RPS까지 통과 |
| reservation-service | 120 RPS까지 통과 |
| ticket-service | 60 RPS까지 통과 |
| notification-service | 320 RPS까지 통과 |

주요 수치:

| 서비스 | 최대 유효 RPS | CPU request 후보 |
| --- | ---: | ---: |
| auth-service | 40 | 2110m |
| concert-service | 160 | 1113m |
| reservation-service | 120 | 732m |
| payment-service | 40 | 208m |
| ticket-service | 60 | 669m |
| notification-service | 320 | 842m |

## 운영 판단

auth-service는 다른 서비스와 성격이 다르다. 병목은 애플리케이션 구조보다 로그인 경로의 CPU 집약 연산에 가깝다.

`local-baseline-1000m` 실험에서 auth-service는 40 RPS까지 통과했지만, 40 RPS 구간의 평균 CPU는 `1476.4m`였고 70% target utilization 기준 CPU request 후보는 `2110m`였다. 반면 30 RPS 구간은 평균 CPU `747.8m`, 후보 `1069m`였다.

따라서 auth-service는 단일 Pod를 40 RPS 기준으로 키우기보다, `1000m` 요청을 유지하고 Pod당 목표를 30 RPS로 잡은 뒤 scale-out하는 편이 비용 효율이 좋다.

비용 계산은 evidence 문서로 분리한다.

- [capacity-baseline cost model](../evidence/loadtest/capacity-baseline/cost/README.md)

## 결론

이 문제는 "DB pool을 더 늘리면 되는 문제"가 아니었다. pool 상향은 일부 write/read 서비스에는 효과가 있었지만, concert-service의 핵심 병목은 `uvicorn worker=1`로 FastAPI HTTP 처리 슬롯이 부족했던 점이었다.

`cmd/server`와 `cmd/worker`를 분리하고 worker를 별도 Deployment로 실행한 뒤 같은 `local-baseline-1000m` 프리셋은 통과했다. 앞으로 FastAPI 서비스에 background worker가 있으면 API worker 수를 HTTP 서버 기준으로 먼저 산정하고, background worker는 그 결과로 분리된 별도 실행 단위로 관리한다.

## 남은 리스크

- `task dev:loadtest`의 read Job wait deadline은 full capacity-baseline보다 짧다. 이번 검증은 같은 preset으로 read Job을 직접 감시해서 완료했다.
- auth-service는 40 RPS에서 CPU request 후보가 2110m로 높다. 운영 기준이 30 RPS인지 40 RPS인지 분리해서 봐야 한다.
