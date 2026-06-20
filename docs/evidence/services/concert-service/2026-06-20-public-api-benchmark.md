# concert-service public API benchmark evidence

## Summary

- 실행 일시: 2026-06-20 21:38:51 KST
- service HEAD: `14ca7d1` dirty
- workspace HEAD: `e0945c0` dirty
- 대상: `concert-service` 공개 조회 API 5개
- 대량 benchmark 상태: `PASS`
- machine-readable artifact: `service/services/concert-service/tests/tmp/reports/concert-public-api-benchmark/latest.json`

## Commands

```bash
task --dir service benchmark-concert-public-api CONCERTS=1000 SHOWTIMES_PER_CONCERT=4 SEATS_PER_SHOWTIME=100 SAMPLES=50
```

검증 대상 smoke 명령:

```bash
task --dir service test-service SERVICE=concert-service
task --dir service test-e2e SCENARIO=05-concert-public-api-benchmark
```

## Target APIs

| API | 범위 |
| --- | --- |
| `GET /concerts/recommended?sort=latest&limit=10` | 추천 공연 카드 목록 |
| `GET /concerts/{concertId}` | 공연 상세 |
| `GET /concerts/{concertId}/calendar?yearMonth=YYYY-MM` | 월간 날짜별 `bookable` |
| `GET /concerts/{concertId}/dates/{date}/performances` | 선택 날짜의 performance 목록 |
| `GET /performances/{performanceId}/seat-map` | 선택 performance의 좌석도와 좌석 상태 |

## Large Dataset Benchmark

이 benchmark는 기존 운영/개발 DB를 쓰지 않는다. `testcontainers.postgres`로 `postgres:16-alpine` 컨테이너를 새로 만들고, seed 후 `ANALYZE`를 실행한 뒤 FastAPI `TestClient`로 router, dependency, service, repository query path를 함께 측정한다. 테스트가 끝나면 PostgreSQL 컨테이너와 SQLAlchemy engine이 정리된다.

| seed | count |
| --- | ---: |
| concerts | 1,000 |
| performances | 4,000 |
| seats | 400,000 |
| grades | 16,000 |
| showtimes per concert | 4 |
| seats per performance | 100 |
| samples per endpoint | 50 |
| warmup per endpoint | 5 |

| endpoint | count | min ms | p50 ms | p95 ms | p99 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/concerts/recommended?sort=latest&limit=10` | 50 | 7.819 | 10.591 | 29.890 | 38.937 | 38.937 |
| `/concerts/concert-bench-0999` | 50 | 9.042 | 10.666 | 17.551 | 21.230 | 21.230 |
| `/concerts/concert-bench-0999/calendar?yearMonth=2026-07` | 50 | 5.412 | 8.562 | 21.130 | 24.563 | 24.563 |
| `/concerts/concert-bench-0999/dates/2026-07-01/performances` | 50 | 4.770 | 7.086 | 20.892 | 37.382 | 37.382 |
| `/performances/showtime-bench-0999-00/seat-map` | 50 | 8.740 | 12.529 | 40.997 | 71.859 | 71.859 |

## Query Plan Summary

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 기준이다. 모든 핵심 조회는 최종 대량 benchmark에서 index scan 계열로 판정됐다. Calendar는 좌석 row 전체를 로딩하지 않고 `EXISTS`로 sellable 좌석 존재 여부만 판정한다.

| query | scan 판정 | index | rows | buffers hit/read | planning ms | execution ms |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| recommended-first-page | index_scan | `ix_concerts_created_at_id` | 13 | 3 / 0 | 0.041 | 0.041 |
| recommended-cursor-page | index_scan | `ix_concerts_created_at_id` | 13 | 6 / 0 | 0.028 | 0.049 |
| concert-detail-base | index_scan | `concerts_pkey` | 1 | 3 / 0 | 0.019 | 0.019 |
| concert-detail-showtimes | index_scan | `ix_showtimes_concert_id` | 4 | 3 / 0 | 0.025 | 0.017 |
| calendar-bookable-exists | index_scan | `ix_showtimes_concert_id`, `ix_seats_showtime_id` | 4 | 19 / 0 | 0.790 | 0.140 |
| date-performances | index_scan | `ix_showtimes_concert_starts_at` | 1 | 3 / 0 | 0.123 | 0.085 |
| seat-map-showtime | index_scan | `showtimes_pkey` | 1 | 3 / 0 | 0.019 | 0.017 |
| seat-map-seats | index_scan | `ix_seats_showtime_id` | 100 | 5 / 0 | 0.025 | 0.033 |
| seat-map-grades | index_scan | `ix_seat_grades_showtime_id` | 4 | 3 / 0 | 0.065 | 0.027 |

## Index Decision

- 추가 구현: `concerts(created_at, id)` index로 추천 목록 최신순 first/cursor page를 받친다.
- 추가 구현: `showtimes(concert_id, starts_at)` index로 날짜/월간 performance 범위 조회를 받친다.
- 추가 구현: calendar 조회는 showtime별 seat collection 로딩을 제거하고 `EXISTS`로 sellable 좌석 존재만 판정한다.
- 기존 유지: `seats.showtime_id`, `seat_grades.showtime_id`, PK 조회는 현재 index로 충분하다.
- 병목 판단: `date-performances`는 p50 7.086ms, query plan execution 0.085ms다. p99/max outlier는 index scan 자체보다 컨테이너 DB roundtrip과 TestClient/SQLAlchemy wall time 변동으로 관측된다.

## Date Performances Outlier Analysis

`/concerts/{concertId}/dates/{date}/performances`에서 관측된 50ms대 outlier는 단일 PostgreSQL plan 비용이 아니라 불필요한 ORM graph preload 문제였다. 원인과 처리 내역은 [date performances 7 SQL analysis](./2026-06-20-date-performances-7sql-analysis.md)에 분리했다.

## Newman Smoke

`05-concert-public-api-benchmark`는 이름은 benchmark지만 성격은 E2E smoke다. provider API로 공연장, 공연, 회차, 좌석 4개를 준비한 뒤 공개 조회 API 5개를 endpoint별로 3회씩 호출한다. 대량 seed, percentile, PostgreSQL query plan evidence는 위의 독립 PostgreSQL benchmark가 담당한다.

기존 smoke 결과:

| endpoint | status | count | avg ms | min ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/concerts/recommended?sort=latest&limit=10` | 200 | 3 | 14.33 | 13 | 15 |
| `/concerts/{concertId}` | 200 | 3 | 22.67 | 14 | 34 |
| `/concerts/{concertId}/calendar?yearMonth=2026-06` | 200 | 3 | 22.67 | 15 | 32 |
| `/concerts/{concertId}/dates/2026-06-27/performances` | 200 | 3 | 15.33 | 15 | 16 |
| `/performances/{performanceId}/seat-map` | 200 | 3 | 12.00 | 11 | 14 |

전체 Newman 결과: iterations 1, requests 20, failed requests 0, assertions 35, failed assertions 0, total run duration 21.2s, average response time 25ms.

## Constraints And Follow-Ups

- benchmark runner는 Docker socket을 mount해야 `testcontainers`가 독립 PostgreSQL 컨테이너를 생성할 수 있다.
- 이 측정은 ASGI `TestClient` 기반이라 네트워크 hop과 uvicorn worker 비용은 제외한다.
- 현재 공개 API는 provider 생성 공연도 public 조회에 노출하던 동작을 유지한다. 공개 승인 상태를 엄격히 적용하려면 provider/admin publish 모델 정리가 먼저 필요하다.
- 좌석도는 현재 단일 `seat-map` 응답이다. 매우 큰 공연장에서는 section 단위 조회 API를 별도로 결정할 수 있다.
