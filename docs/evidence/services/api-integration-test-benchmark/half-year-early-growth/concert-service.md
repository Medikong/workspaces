# concert-service API 통합 벤치마크

## 가정

- 이 문서는 동시접속 부하테스트가 아니라, 대량 데이터가 누적된 DB에서 API 1회 처리 비용을 측정한 결과다.
- seed 생성은 API 순차 호출이 아니라 PostgreSQL/MongoDB bulk insert로 수행한다.
- testcontainers 컨테이너는 테스트 종료 시 정리되며, seed/setup 시간은 endpoint 측정값에 포함하지 않는다.
- 민감값은 artifact와 보고서에 남기지 않고, synthetic user id와 deterministic id만 사용한다.

## 실행 기준

- YAML preset 경로: `tests/benchmarks/datasets/half-year-early-growth.yaml`
- artifact root: `tests/tmp/reports/api-integration`
- smoke 실행: `task benchmark-api-smoke-service SERVICE=concert-service PRESET=smoke`
- large 실행: `task benchmark-api-large-service SERVICE=concert-service PRESET=half-year-early-growth SAMPLES=100`
- 보고서 갱신: `task benchmark-api-report SERVICE=concert-service`

## Smoke 결과

- preset: `smoke`
- 생성 시각: `2026-06-20T13:36:46.832365+00:00`
- artifact: `tests/tmp/reports/api-integration/concert-service/smoke/latest.json`
- seed 규모: 서비스기간 7일, 활성 사용자 80명, 공연 12개, 회차 36개, 좌석 2,520석, concerts=12, seat_grades=144, seats=2,520, showtimes=36, venues=12

| endpoint | method | status | samples | warmup | minMs | p50Ms | p95Ms | p99Ms | maxMs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| recommended-concerts | GET | 200 | 5 | 1 | 4.724 | 5.333 | 6.017 | 6.017 | 6.017 |
| concert-detail | GET | 200 | 5 | 1 | 6.051 | 6.686 | 7.694 | 7.694 | 7.694 |
| concert-calendar | GET | 200 | 5 | 1 | 3.340 | 4.141 | 5.089 | 5.089 | 5.089 |
| date-performances | GET | 200 | 5 | 1 | 3.613 | 3.854 | 5.579 | 5.579 | 5.579 |
| seat-map | GET | 200 | 5 | 1 | 5.993 | 7.311 | 9.836 | 9.836 | 9.836 |

## Large 결과

- preset: `half-year-early-growth`
- 생성 시각: `2026-06-20T13:52:53.157977+00:00`
- artifact: `tests/tmp/reports/api-integration/concert-service/half-year-early-growth/latest.json`
- seed 규모: 서비스기간 180일, 활성 사용자 40,000명, 공연 270개, 회차 810개, 좌석 567,000석, concerts=270, seat_grades=3,240, seats=567,000, showtimes=810, venues=270

| endpoint | method | status | samples | warmup | minMs | p50Ms | p95Ms | p99Ms | maxMs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| recommended-concerts | GET | 200 | 100 | 2 | 4.919 | 6.554 | 7.966 | 9.632 | 9.672 |
| concert-detail | GET | 200 | 100 | 2 | 5.636 | 7.380 | 9.687 | 11.683 | 12.159 |
| concert-calendar | GET | 200 | 100 | 2 | 3.360 | 4.568 | 5.608 | 6.532 | 6.917 |
| date-performances | GET | 200 | 100 | 2 | 2.836 | 4.098 | 4.874 | 5.783 | 6.891 |
| seat-map | GET | 200 | 100 | 2 | 12.348 | 13.924 | 39.745 | 57.766 | 117.078 |

## 샘플 수 해석

- 이 artifact의 endpoint별 samples는 `100`이고 warmup은 `2`이다.
- samples가 100 수준이면 p95/p99와 max를 분리해서 볼 수 있어, 일시적인 TestClient/컨테이너 wall time outlier를 더 조심스럽게 해석할 수 있다.

## Query Plan / Index Analysis

| endpoint | query shape | plan summary | index used | index decision | 데이터 성능 분석 |
| --- | --- | --- | --- | --- | --- |
| `recommended-concerts` | `SELECT concerts ORDER BY created_at DESC, id DESC LIMIT 11` | index_scan, indexes=`ix_concerts_created_at_id`, returned=11, estimated=270, buffers=6/0, planning=0.063ms, execution=0.052ms | yes | 추천 first/cursor page는 (created_at, id) index 유지. | concerts=270. showtimes selectinload가 붙어 목록 카드 응답 비용도 포함된다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `concert-detail` | `SELECT concert by id` | index_scan, indexes=`concerts_pkey`, returned=1, estimated=1, buffers=3/0, planning=0.037ms, execution=0.067ms | yes | 상세 기본 row는 PK index로 충분하다. | 공연 상세는 단일 row 조회 뒤 showtime/grade selectinload 비용이 붙는다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `concert-detail` | `SELECT showtimes WHERE concert_id ORDER BY starts_at` | index_scan, indexes=`ix_showtimes_concert_id`, returned=3, estimated=3, buffers=6/0, planning=0.049ms, execution=0.057ms | yes | showtimes(concert_id, starts_at) index 유지. | 공연당 회차는 약 3건이라 scan 폭은 작다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `concert-calendar` | `SELECT showtimes range + EXISTS seats` | index_scan, indexes=`ix_seats_showtime_id`, `ix_showtimes_concert_id`, returned=4, estimated=688, buffers=45/0, planning=0.287ms, execution=0.107ms | yes | 좌석 row 전체 로딩 대신 EXISTS 유지. 추가 인덱스보다 응답 생성 outlier를 본다. | seats=567,000지만 showtime당 sellable 존재만 확인한다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `date-performances` | `SELECT showtimes WHERE concert_id AND starts_at range` | index_scan, indexes=`ix_showtimes_concert_starts_at`, returned=1, estimated=1, buffers=3/0, planning=0.059ms, execution=0.040ms | yes | 날짜별 회차는 현재 복합 인덱스 유지. | 공연당 회차 수가 작아 DB plan보다 TestClient/SQLAlchemy wall time 변동을 같이 본다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `seat-map` | `SELECT seats WHERE showtime_id ORDER BY section,row,number` | index_scan, indexes=`ix_seats_showtime_id`, returned=700, estimated=696, buffers=26/0, planning=0.056ms, execution=0.765ms | yes | 좌석도는 showtime_id index 유지. 대형 공연장은 section pagination을 별도 결정한다. | 좌석 응답 크기가 직접 비용이 된다. 현재 preset은 회차당 약 700석이다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |

## 해석

- p99가 가장 큰 endpoint는 `seat-map`이며 p99=57.766ms다.
- p50 대비 p99 꼬리가 가장 긴 endpoint는 `seat-map`이며 p99/p50=4.15배다.
- smoke와 large 결과 차이는 seed 규모 변화에 따른 DB 조회/정렬/집계 비용 증가를 보는 기준으로 사용한다.
- p95/p99가 높은 endpoint는 아래 query plan, index decision, 데이터 분포를 함께 보고 DB scan 문제인지 응답 크기/직렬화 문제인지 분리한다.

## 병목 후보

- `seat-map`: p95=39.745ms, p99=57.766ms
- `concert-detail`: p95=9.687ms, p99=11.683ms
- `recommended-concerts`: p95=7.966ms, p99=9.632ms

## 후속 개선점

- 목록 API는 일반 사용자와 헤비 사용자 결과를 분리해서 pagination 또는 projection 개선 후보를 판단한다.
- 운영 데이터가 쌓이면 YAML preset의 분포와 상태 비율을 실제 로그/DB 통계 기준으로 보정한다.
