# Root Cause Analysis

## Conclusion

이번 `concert-140rps` 실패의 직접 원인은 HPA 미동작이 아니라 `concert-db` PostgreSQL connection 한계 초과다. HPA는 `2 -> 4`까지 정상적으로 scale-out 했지만, scale-out이 늘린 애플리케이션 처리 용량만큼 DB 연결 예산이 같이 늘어나지 않았다.

핵심 근거는 Tempo trace다. 대표 실패 trace `36688b93cf9c569a123884d0a5d9cab1`에서 root span은 `GET /concerts/{id}/calendar` 500이고, 내부 `connect` span이 `concert-db:5432` 접속 중 `FATAL: sorry, too many clients already`로 실패했다. 같은 유형의 후보 trace 16개를 확인했고, 16개 모두 같은 DB connection exhaustion 메시지를 포함했다.

## Evidence Summary

| 항목 | 값 |
| --- | --- |
| 실험 시간 | `2026-06-21T12:19:15Z` - `2026-06-21T12:42:46Z` |
| Loki slow access sample | `1000` rows |
| Loki failed access sample | `202` rows |
| Tempo checked traces | `16 / 16 found` |
| Tempo traces with `too many clients already` | `16 / 16` |
| 대표 실패 route | `/concerts/{id}/calendar` |
| 대표 실패 trace | `36688b93cf9c569a123884d0a5d9cab1` |
| 대표 DB span | `connect`, `2356.605ms`, `concert-db`, `concert_db` |
| 실패 코드 위치 | `app.repositories.concerts.has_concert /app/app/repositories/concerts.py:27` |

## Why It Happened

현재 local HPA spike 설정은 `concert-service`에 다음 값을 준다.

| 설정 | 값 |
| --- | ---: |
| `SQLALCHEMY_POOL_SIZE` | `35` |
| `SQLALCHEMY_MAX_OVERFLOW` | `10` |
| `UVICORN_WORKERS` | `2` |
| HPA max replicas | `4` |
| `concert-db max_connections` | `200` |

SQLAlchemy engine은 worker process 안에서 생성된다. 따라서 연결 예산은 단순히 Pod당 `35 + 10 = 45`가 아니라, `UVICORN_WORKERS=2` 기준 Pod당 최대 `90`까지 열릴 수 있다. HPA가 4 replicas까지 올라가면 앱 쪽 이론상 최대 DB 연결 수는 `360`이다. 이는 `concert-db max_connections=200`을 넘는다.

따라서 HPA가 정상적으로 Pod를 늘릴수록 DB 연결 수요도 같이 증가했고, `concert-db`가 연결을 거부하면서 `calendar` API가 500을 냈다. 이 때문에 k6 threshold가 실패했다.

## Route Evidence

Loki slow/failed sample에서 가장 뚜렷한 route는 `/concerts/{id}/calendar`다.

| route | slow sampled | failed sampled | max duration ms |
| --- | ---: | ---: | ---: |
| `/concerts/{id}/calendar` | `398` | `168` | `5370` |
| `/concerts/{id}` | `217` | `33` | `2168` |
| `/concerts/recommended` | `304` | `0` | `1788` |
| `/performances/{id}/seat-map` | `79` | `0` | `1727` |
| `/concerts/{id}/dates/{selected_date}/performances` | `2` | `1` | `1092` |

## Trace Evidence

대표 trace `36688b93cf9c569a123884d0a5d9cab1`의 상위 span은 다음과 같다.

| span | duration ms | status | 핵심 attribute |
| --- | ---: | --- | --- |
| `GET /concerts/{id}/calendar` | `3948.288` | `ERROR` | `http.status_code=500`, `error.type=OperationalError` |
| `connect` | `2356.605` | `ERROR` | `db.system=postgresql`, `net.peer.name=concert-db`, `FATAL: sorry, too many clients already` |

이 trace는 `root-cause-evidence/tempo-traces/36688b93cf9c569a123884d0a5d9cab1.json`에 저장했다.

## Supporting Metrics

Prometheus에서 PostgreSQL exporter 계열의 `pg_stat_activity_count`는 현재 비어 있다. 그래서 DB connection 수의 시계열은 확보하지 못했다. 대신 trace와 live DB 설정으로 연결 거부 원인을 확인했다.

서비스 CPU는 HPA를 유발할 만큼 올라갔다. run window에서 `concert-service` Pod별 최대 CPU는 대략 `0.54`, `0.61`, `0.96`, `0.97` cores 수준이었다. 이는 HPA scale-out이 정상적으로 일어난 배경이고, 실패 원인 자체는 DB connection budget 초과다.

## Evidence Files

- `root-cause-evidence/root-cause-summary.json`
- `root-cause-evidence/loki-slow.jsonl`
- `root-cause-evidence/loki-failed.jsonl`
- `root-cause-evidence/candidate-trace-ids.txt`
- `root-cause-evidence/tempo-trace-summary.json`
- `root-cause-evidence/tempo-traces/36688b93cf9c569a123884d0a5d9cab1.json`
- `root-cause-evidence/prometheus-summary.json`
- `root-cause-evidence/runtime-db-settings.txt`
