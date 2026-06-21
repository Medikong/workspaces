# DB Pool Follow-up After pool35

## 요약

pool 기본값을 `35/20/15s`로 키운 뒤 재실험한 결과, DB pool 문제는 서비스별로 갈렸다.

- reservation-service와 ticket-service는 timeout/error가 사실상 사라졌고 최대 유효 RPS가 각각 `80`, `60`으로 올라갔다.
- concert-service는 최대 DB connection capacity가 55개로 늘었는데도 `concert_rps_40`부터 pool timeout이 반복됐다.
- concert Pod는 실행 중 liveness/readiness probe timeout을 겪었고, `Exit Code 137`, `Restart Count 3` 상태가 남았다.
- 따라서 지금 남은 DB pool 문제는 "기본값이 너무 작다"가 아니라 concert-service의 단일 replica 동시성, query/session 점유, health probe starvation 문제로 좁혀진다.

## 바뀐 조건

이번 배포에서 chart default 자체가 다음 값으로 바뀌었다.

```yaml
database:
  sqlalchemy:
    poolSize: 35
    maxOverflow: 20
    poolTimeoutSeconds: 15
    poolRecycleSeconds: 1800
```

Pod env도 같은 값으로 확인됐다.

```text
SQLALCHEMY_POOL_SIZE=35
SQLALCHEMY_MAX_OVERFLOW=20
SQLALCHEMY_POOL_TIMEOUT_SECONDS=15
SQLALCHEMY_POOL_RECYCLE_SECONDS=1800
```

이 조건에서 여전히 pool timeout이 발생했다면, 단순한 "pool 5개 한계"는 더 이상 충분한 설명이 아니다.

## 서비스별 변화

| 서비스 | 이전 증상 | pool35 결과 | 판단 |
| --- | --- | --- | --- |
| reservation-service | 40 RPS부터 약 10s timeout/error | 80 RPS까지 p95 16.8ms, error 0% | 기존 병목은 작은 pool 영향이 컸음 |
| ticket-service | 20 RPS부터 issue timeout/error | 60 RPS까지 p95 25.2ms max, error 0% | 기존 병목은 작은 pool 영향이 컸음 |
| concert-service | 40 RPS부터 recommended timeout/error | 40 RPS부터 여전히 p95 약 10s, error 34.53% | pool 크기보다 요청 동시성/점유 시간이 문제 |

## concert-service 근거

`concert-service-previous.log`에는 다음 계열의 에러가 반복된다.

```text
QueuePool limit of size 35 overflow 20 reached, connection timed out, timeout 15.00
```

주요 stack path는 다음과 같다.

- `service/services/concert-service/app/routers/public.py`
- `service/services/concert-service/app/services/catalog.py`
- `service/services/concert-service/app/repositories/concerts.py`

추천 API의 핵심 조회는 `list_recommended_concerts()`에서 `Concert`와 `showtimes -> venue`를 `selectinload`로 가져오는 부분이다.

```python
return self.db.scalars(query).all()
```

실패는 API latency 수치만의 문제가 아니다. `concert-service-pod-describe.txt`에는 probe 실패와 재시작 흔적이 같이 남았다.

```text
Last State:     Terminated
  Reason:       Error
  Exit Code:    137
Restart Count:  3
Liveness probe failed: context deadline exceeded
Readiness probe failed: context deadline exceeded
Readiness probe failed: connection refused
```

즉 concert-service는 pool wait가 길어지는 순간 일반 요청뿐 아니라 health 응답도 1초 안에 처리하지 못한다. 이 상태에서는 k6의 `concert_rps_40` 결과를 "순수 CPU capacity"로 해석할 수 없다.

## 부하 모델 해석

`capacity-baseline-load-test.js`에서 concert-service iteration 하나는 API 5개를 순차 호출한다.

```text
GET /concerts/recommended
GET /concerts/{concertId}
GET /concerts/{concertId}/calendar
GET /concerts/{concertId}/dates/{date}/performances
GET /performances/{performanceId}/seat-map
```

따라서 `concert_rps_40`은 service iteration 기준 40 RPS지만, endpoint 호출 관점에서는 단일 replica에 최대 5배의 read API 압박을 만든다. 첫 호출인 recommended가 pool wait에 빠지면 후속 API의 호출 수와 latency도 같이 왜곡된다.

## 결론

이번 재실험은 두 가지를 확인했다.

1. reservation/ticket의 이전 timeout은 기본 pool `5/0/5s`가 주요 원인이었다.
2. concert의 현재 timeout은 pool 기본값 상향만으로 해결되지 않는다.

concert-service는 다음 단계에서 pool을 더 키우기보다, API별 단독 부하와 query/session 계측으로 병목을 분리해야 한다. 특히 recommended API의 checkout wait, query count, query latency, request 처리 worker 점유 시간, health probe 처리 경로를 같이 봐야 한다.

## 다음 확인 순서

1. concert API 5개를 각각 단독 scenario로 분리해 `20 -> 40 -> 80 RPS`를 재실행한다.
2. concert-service에도 SQLAlchemy pool event instrumentation을 추가해 checkout wait와 checkin을 남긴다.
3. recommended API의 쿼리 계획과 index 사용 여부를 half-year dataset 기준으로 확인한다.
4. health endpoint가 request worker 포화에 같이 밀리는지 확인하고, loadtest 환경의 probe timeout/failure threshold를 별도로 조정할지 결정한다.
5. service RPS 기반 capacity baseline과 사용자 여정 기반 browse loadtest를 별도 리포트 단위로 나눈다.
