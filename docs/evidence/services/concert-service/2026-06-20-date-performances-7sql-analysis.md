# concert-service date performances 7 SQL analysis

## Summary

- 일시: 2026-06-20
- 대상 API: `GET /concerts/{concertId}/dates/{date}/performances`
- 증상: 대량 benchmark에서 50ms 이상 outlier가 관측됐다.
- 결론: 날짜별 performance 조회 쿼리 자체가 느린 것이 아니라, 응답에 필요 없는 concert 상세 graph와 seats preload가 함께 실행됐다.
- 처리: 불필요한 ORM preload를 제거하고, concert 존재 확인은 가벼운 `SELECT id ... LIMIT 1`로 바꿨다.

## Symptom

대량 benchmark에서 `/concerts/concert-bench-0999/dates/2026-07-01/performances`가 한 차례 50ms 이상으로 튀었다. 단순히 endpoint duration만 보면 날짜별 performance 쿼리 또는 index 문제가 의심될 수 있었다.

하지만 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 결과는 달랐다.

| query | index | rows | planning ms | execution ms |
| --- | --- | ---: | ---: | ---: |
| date-performances | `ix_showtimes_concert_starts_at` | 1 | 0.123 | 0.085 |

즉, PostgreSQL plan 자체는 매우 작았다.

## Root Cause

추가 계측으로 endpoint별 raw sample, SQL count, SQL wall time, statement summary를 artifact에 남겼다.

문제 구간에서는 한 요청에 SQL이 7번 실행됐다.

| order | statement group | 필요 여부 |
| ---: | --- | --- |
| 1 | concert base row | 존재 확인만 필요 |
| 2 | concert showtimes preload | 불필요 |
| 3 | sale policy preload | 불필요 |
| 4 | seat grades preload | 불필요 |
| 5 | venues preload | 불필요 |
| 6 | date range showtimes | 필요 |
| 7 | seats preload | 불필요 |

원인은 두 가지였다.

- `ShowtimeService.list_performances_by_date()`가 `self._concert(concert_id)`를 호출했다. 이 메서드는 존재 확인이 아니라 상세 화면용 concert graph를 로딩한다.
- `ShowtimeRepository.list_showtimes_between()`이 날짜별 performance 응답에 필요 없는 `seats`를 `selectinload`했다.

## Fix

`ConcertRepository.has_concert()`를 추가했다.

```python
def has_concert(self, concert_id: str) -> bool:
    return self.db.scalar(select(model.Concert.id).where(model.Concert.id == concert_id).limit(1)) is not None
```

`ConcertDomainService._ensure_concert_exists()`를 추가했다.

```python
def _ensure_concert_exists(self, concert_id: str) -> None:
    if not self.concerts.has_concert(concert_id):
        raise ConcertNotFoundError(concert_id)
```

`ShowtimeService.list_performances_by_date()`는 `_concert()` 대신 `_ensure_concert_exists()`를 사용한다.

`ShowtimeRepository.list_showtimes_between()`에서는 `selectinload(model.Showtime.seats)`를 제거했다.

## Result

최종 처리 후 date performances 요청은 2 SQL로 줄었다.

| metric | before | after |
| --- | ---: | ---: |
| SQL statements per request | 7 | 2 |
| slowest sample SQL wall time | 137.626ms | 28.035ms |
| p50 | 9.870ms | 7.086ms |
| p99/max | 173.870ms | 37.382ms |

처리 후 남은 30ms대 outlier는 index scan 자체가 아니라 Docker/TestClient/PostgreSQL 컨테이너 roundtrip wall time 변동으로 판단한다. 근거는 `EXPLAIN`의 실제 date performance query execution time이 0.085ms이고, 필요한 SQL이 concert existence check와 날짜 범위 showtime 조회 2개로 줄었기 때문이다.

## Verification

```bash
task --dir service benchmark-concert-public-api CONCERTS=1000 SHOWTIMES_PER_CONCERT=4 SEATS_PER_SHOWTIME=100 SAMPLES=50
task --dir service test-service SERVICE=concert-service
task --dir service test-e2e SCENARIO=05-concert-public-api-benchmark
git -C service diff --check
git -C workspace diff --check
```

검증 결과:

- 대량 benchmark: `PASS`
- concert-service test: `29 passed, 6 skipped`
- Newman smoke: requests 20, failed requests 0, assertions 35
- diff whitespace check: service/workspace 모두 통과

## Follow-Up

- `date-performances`는 현재 추가 인덱스보다 불필요한 ORM graph 로딩 제거가 ROI가 높았다.
- 비슷한 패턴이 다른 public read API에도 있는지 endpoint별 `sqlCount`와 `slowestSamples`로 계속 확인한다.
