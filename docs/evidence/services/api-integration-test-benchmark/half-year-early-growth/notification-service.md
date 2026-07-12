# notification-service API 통합 벤치마크

## 가정

- 이 문서는 동시접속 부하테스트가 아니라, 대량 데이터가 누적된 DB에서 API 1회 처리 비용을 측정한 결과다.
- seed 생성은 API 순차 호출이 아니라 PostgreSQL/MongoDB bulk insert로 수행한다.
- testcontainers 컨테이너는 테스트 종료 시 정리되며, seed/setup 시간은 endpoint 측정값에 포함하지 않는다.
- 민감값은 artifact와 보고서에 남기지 않고, synthetic user id와 deterministic id만 사용한다.

## 사용자군 기준

- normal 기준: 비교군 사용자는 endpoint별 samples 수만큼 알림을 보장한다. 현재 large artifact에서는 약 100건이다.
- heavy 기준: 전체 활성 알림 354,000건 중 heavy 비율 5%를 synthetic heavy 사용자 1명에게 몰아 긴 알림함을 재현한다. 현재 약 17,700건이다.
- pagination 적용 후 heavy/normal 비교는 보유 알림 수 차이 약 177배가 첫 페이지 비용에 새어 나오는지 확인하는 기준이다. 응답은 기본 20건 page로 제한한다.

## 실행 기준

- YAML preset 경로: `tests/benchmarks/datasets/half-year-early-growth.yaml`
- artifact root: `tests/tmp/reports/api-integration`
- smoke 실행: `task benchmark-api-smoke-service SERVICE=notification-service PRESET=smoke`
- large 실행: `task benchmark-api-large-service SERVICE=notification-service PRESET=half-year-early-growth SAMPLES=100`
- 보고서 갱신: `task benchmark-api-report SERVICE=notification-service`

## Smoke 결과

- preset: `smoke`
- 생성 시각: `2026-06-20T14:10:10.863386+00:00`
- artifact: `tests/tmp/reports/api-integration/notification-service/smoke/latest.json`
- seed 규모: 서비스기간 7일, 활성 사용자 80명, 공연 12개, 회차 36개, 좌석 2,520석, notifications=354, processed_events=354

| endpoint | method | status | samples | warmup | minMs | p50Ms | p95Ms | p99Ms | maxMs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| list-notifications-normal-first-page | GET | 200 | 5 | 1 | 1.920 | 2.850 | 7.237 | 7.237 | 7.237 |
| list-notifications-heavy-first-page | GET | 200 | 5 | 1 | 1.739 | 2.095 | 3.074 | 3.074 | 3.074 |
| get-notification | GET | 200 | 5 | 1 | 1.275 | 1.580 | 1.707 | 1.707 | 1.707 |

## Large 결과

- preset: `half-year-early-growth`
- 생성 시각: `2026-06-20T14:09:16.588713+00:00`
- artifact: `tests/tmp/reports/api-integration/notification-service/half-year-early-growth/latest.json`
- seed 규모: 서비스기간 180일, 활성 사용자 40,000명, 공연 270개, 회차 810개, 좌석 567,000석, notifications=354,000, processed_events=354,000

| endpoint | method | status | samples | warmup | minMs | p50Ms | p95Ms | p99Ms | maxMs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| list-notifications-normal-first-page | GET | 200 | 100 | 2 | 1.124 | 1.831 | 2.941 | 6.177 | 6.801 |
| list-notifications-heavy-first-page | GET | 200 | 100 | 2 | 1.140 | 1.735 | 2.340 | 2.684 | 2.961 |
| get-notification | GET | 200 | 100 | 2 | 0.957 | 1.408 | 1.737 | 1.846 | 1.928 |

## 샘플 수 해석

- 이 artifact의 endpoint별 samples는 `100`이고 warmup은 `2`이다.
- samples가 100 수준이면 p95/p99와 max를 분리해서 볼 수 있어, 일시적인 TestClient/컨테이너 wall time outlier를 더 조심스럽게 해석할 수 있다.

## Query Plan / Index Analysis

| endpoint | query shape | plan summary | index used | index decision | 데이터 성능 분석 |
| --- | --- | --- | --- | --- | --- |
| `list-notifications-normal-first-page` | `db.notifications.find({user_id}).sort({_id: -1}).limit(21)` | index_scan, indexes=`user_id_1__id_-1`, returned=21, docsExamined=21, keysExamined=21, execution=0.000ms | yes | 현재 (user_id, _id desc) 복합 인덱스를 사용한다. 첫 페이지는 API limit 20에 hasMore 판단용 1건을 더해 21건만 확인한다. | normal 사용자 보유 알림은 약 100건이지만 첫 페이지 비용은 page size에 가깝다. heavy/normal 차이는 전체 알림함 크기보다 첫 페이지 조회와 응답 직렬화 비용으로 비교한다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `list-notifications-heavy-first-page` | `db.notifications.find({user_id}).sort({_id: -1}).limit(21)` | index_scan, indexes=`user_id_1__id_-1`, returned=21, docsExamined=21, keysExamined=21, execution=0.000ms | yes | API가 limit + 1 cursor pagination으로 바뀌었으므로 (user_id, _id desc) 복합 인덱스가 첫 페이지와 다음 페이지 조회를 직접 지원한다. | large preset notifications=354,000, heavy 비율=5%라 헤비 사용자 1명에게 약 17,700건이 몰려도 첫 응답은 20건만 반환한다. pagination 적용 후에는 보유 알림 전체 수가 아니라 page size가 목록 API 비용을 좌우한다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `get-notification` | `db.notifications.find({_id})` | index_scan, indexes=`_id_`, returned=1, docsExamined=1, keysExamined=1, execution=0.000ms | yes | MongoDB 기본 _id 인덱스로 충분하다. 별도 인덱스 추가 대상이 아니다. | 단일 문서 조회라 전체 notifications 규모보다 _id lookup과 응답 직렬화 비용의 영향을 받는다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |

## 해석

- p99가 가장 큰 endpoint는 `list-notifications-normal-first-page`이며 p99=6.177ms다.
- p50 대비 p99 꼬리가 가장 긴 endpoint는 `list-notifications-normal-first-page`이며 p99/p50=3.37배다.
- smoke와 large 결과 차이는 seed 규모 변화에 따른 DB 조회/정렬/집계 비용 증가를 보는 기준으로 사용한다.
- p95/p99가 높은 endpoint는 아래 query plan, index decision, 데이터 분포를 함께 보고 DB scan 문제인지 응답 크기/직렬화 문제인지 분리한다.
- 알림 목록은 cursor pagination으로 첫 page만 반환하므로 heavy 사용자의 전체 보유 알림 수가 곧바로 응답 크기나 JSON 직렬화 비용이 되지 않아야 한다.

## 병목 후보

- `list-notifications-normal-first-page`: p95=2.941ms, p99=6.177ms
- `list-notifications-heavy-first-page`: p95=2.340ms, p99=2.684ms
- `get-notification`: p95=1.737ms, p99=1.846ms

## 후속 개선점

- notification 목록은 cursor pagination을 유지하고, 필요해질 때 type/sourceId 필터나 projection 축소를 별도 후보로 검토한다.
- 운영 데이터가 쌓이면 실제 알림 보유량, 읽음/보관 정책, page size를 기준으로 YAML preset 분포를 보정한다.
