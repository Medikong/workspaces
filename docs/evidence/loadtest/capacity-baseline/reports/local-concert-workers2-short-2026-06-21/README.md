# Concert Service Capacity Baseline - workers=2 short run

## 요약

- 실행일: 2026-06-21
- 실행 명령: `SCENARIO=capacity-baseline-load-test LOADTEST_SCENARIO_VALUES_FILE=.../local-concert-workers2-short.yaml LOADTEST_CAPACITY_BASELINE_PROMETHEUS_WARMUP_SECONDS=30 DEV_SERVICES=concert task --dir gitops dev:loadtest`
- run id: `read-api-loadtest-read-manual-20260621050421-zx6zm`
- 대상: `concert-service` 단독
- 결과: `FAIL`
- capacity 후보: 80 RPS, CPU request 후보 742m
- 실패 지점: `GET /performances/{performanceId}/seat-map` 120 RPS에서 p95 4,814ms로 SLO 150ms 초과

이번 실행은 Uvicorn worker를 2로 늘린 뒤 concert API를 endpoint별로 분리해 측정했다. 추천, 상세, 월간 캘린더, 날짜별 공연 API는 120 RPS까지 모두 p95 20ms 이하로 통과했다. 병목은 concert 서비스 전체가 아니라 `seat-map` endpoint에 집중되어 있다.

## 변경 조건

- `service/services/concert-service/cmd/server/main.py`: `uvicorn.run("app.main:create_app", factory=True, workers=settings.uvicorn_workers)`로 변경
- `service/services/concert-service/app/config.py`: `UVICORN_WORKERS` 설정 추가, 기본값 1
- `gitops/values/services/concert.yaml`: local 배포 기본값 `UVICORN_WORKERS=2`
- `gitops/platform/loadtest/values/presets/capacity-baseline/local-concert-workers2-short.yaml`: concert-only 단축 preset 추가
- concert RPS 구간: 15s @ 10, 30s @ 40, 30s @ 80, 30s @ 120
- 고정 조건: replicas 1, CPU request 1000m, CPU limit none, SQLAlchemy pool size 35, max overflow 20, timeout 15s, Uvicorn workers 2

## 결과 파일

- 원본 k6 summary: `archive/k6-summary.json`
- 원본 service report: `archive/loadtest-run-report-concert-service.json`
- 원본 final report: `archive/loadtest-run-report-final.json`
- 실행 metadata: `archive/metadata.json`
- 요약 JSON: `analysis-summary.json`
- k6 Job 로그: `k6-job.log`
- task 실행 로그: `task-dev-loadtest.log`
- concert 서비스 로그: `concert-service.log`
- concert Pod describe: `concert-service-pod-describe.txt`

## Endpoint 결과

| endpoint | 10 RPS p95 | 40 RPS p95 | 80 RPS p95 | 120 RPS p95 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| `GET /concerts/recommended` | 14ms | 10ms | 9ms | 18ms | pass |
| `GET /concerts/{concertId}` | 17ms | 10ms | 10ms | 9ms | pass |
| `GET /concerts/{concertId}/calendar` | 13ms | 7ms | 7ms | 9ms | pass |
| `GET /concerts/{concertId}/dates/{date}/performances` | 12ms | 7ms | 5ms | 9ms | pass |
| `GET /performances/{performanceId}/seat-map` | 44ms | 45ms | 54ms | 4,814ms | fail |

`seat-map` 120 RPS의 상세 지표:

- p95: 4,814ms
- p99: 5,797ms
- max: 6,477ms
- average: 919ms
- CPU 평균: 1,122m
- CPU throttling: 0
- k6 dropped iterations: 95
- 서비스 로그상 QueuePool timeout: 31건
- Pod restart: 0

## 원인 판단

Uvicorn worker를 2로 늘린 뒤에도 `seat-map`만 120 RPS에서 크게 느려졌다. 따라서 단일 worker 자체가 유일한 원인은 아니고, `seat-map` 요청 하나가 DB 연결과 CPU를 오래 점유하는 구조가 더 직접적인 원인이다.

코드 기준으로 `GET /performances/{id}/seat-map`은 sync endpoint다. FastAPI는 이를 threadpool에서 실행한다. `SeatService.get_seat_map()`은 `_showtime()`을 호출하고, `ShowtimeRepository.get_showtime()`은 `selectinload`로 `seats`, `seat_grades`, `venue`를 함께 읽는다. 이후 `seat_map_response()`가 `showtime.seats` 전체를 Python에서 섹션별로 순회하고 응답 객체로 변환한다.

이번 데이터셋은 performance당 좌석 700개다. 즉 `seat-map` 요청이 늘어나면 각 요청마다 좌석 700개를 DB에서 읽고, Python 객체로 변환하고, JSON 응답으로 직렬화한다. 이 처리 중 DB session은 요청이 끝날 때까지 유지된다. 120 RPS 구간에서는 요청 처리 시간이 길어지면서 threadpool 작업과 DB checkout 대기가 누적되고, 결국 로그에 `QueuePool limit of size 35 overflow 20 reached, connection timed out, timeout 15.00`가 기록됐다.

반면 다른 concert API는 120 RPS에서도 p95가 9-18ms 범위다. 그래서 DB pool 자체가 항상 부족한 상태라기보다, `seat-map`의 대량 row 로딩과 응답 생성 비용이 임계점 이후 pool 점유 시간을 늘리는 쪽으로 보는 것이 맞다.

## 해석

- Uvicorn worker 2는 기본 동시 처리 여유를 늘렸고, Pod 재시작이나 CPU throttling 없이 테스트가 끝났다.
- 실패는 concert service 전체가 아니라 `seat-map` 단일 endpoint에서 재현됐다.
- 80 RPS까지는 `seat-map`도 p95 54ms로 안정적이다.
- 120 RPS에서 `seat-map`은 p95가 4.8초로 급증하고, 요청 완료가 30초 이상 걸린 서비스 로그도 남았다.
- 이 지점에서는 DB pool을 더 키우는 것보다 `seat-map`의 read model, query shape, 응답 크기, 직렬화 비용을 줄이는 개선이 우선이다.

## 개선 방향

- `seat-map` 전용 read path를 분리한다. ORM relationship 전체 로딩 대신 필요한 컬럼만 조회하고, 가능한 한 dict/row 기반으로 응답을 구성한다.
- seat map 정적 구조와 좌석 상태를 분리한다. 좌석 배치와 grade는 캐시/사전 계산하고, 실시간 상태만 얇게 갱신한다.
- endpoint를 async로 바꾸는 것만으로는 충분하지 않다. 현재 병목은 sync 여부보다 connection 점유 시간과 대량 객체 생성 비용이 크다.
- 다음 실험은 `seat-map` 최적화 전후로 80, 100, 120 RPS만 짧게 재측정하면 된다.
