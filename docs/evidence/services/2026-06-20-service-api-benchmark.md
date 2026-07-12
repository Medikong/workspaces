# 서비스별 API 통합테스트 벤치마크

작성일: 2026-06-20

## 목적

- `reservation-service`, `payment-service`, `ticket-service`, `notification-service`의 라우터 단위 API 처리 시간을 같은 artifact 계약으로 측정한다.
- 측정 결과는 endpoint별 `minMs`, `p50Ms`, `p95Ms`, `p99Ms`, `maxMs`를 포함한다.
- setup, seed, token/context 준비 비용은 측정 루프 밖에 둔다.

## 공통 실행 방식

- SQL 서비스는 `testcontainers`의 `postgres:16-alpine` 컨테이너를 사용한다.
- 알림 서비스는 `testcontainers`의 `mongo:7` 컨테이너를 사용한다.
- 기본 `uv run pytest`에서는 벤치마크 테스트가 skip된다.
- Docker가 없으면 testcontainers benchmark는 skip된다.
- artifact 기본 위치는 각 서비스의 `tests/tmp/reports/<service>-api-benchmark/latest.json`이다.

## 기존 패턴 정리

- `concert-service`의 `test_public_api_benchmark.py`는 명시 옵션으로만 실행되고, testcontainers PostgreSQL을 생성한 뒤 FastAPI router와 DB dependency override를 함께 측정한다.
- 콘서트 벤치마크 artifact는 `generatedAt`, `finishedAt`, git 상태, seed 규모, endpoint별 latency, query plan을 JSON으로 남긴다.
- percentile은 정렬 후 `ceil(n * percentile / 100) - 1` index를 쓰는 nearest-rank 방식이다.
- `auth-service`의 password verify benchmark는 환경변수 sample 수를 받아 JSON summary를 출력하지만, 기본 pytest에서 skip되지는 않는다. 이번 API benchmark는 콘서트 서비스의 명시 실행 패턴을 따랐다.

## 전체 smoke 결과

아래 수치는 `samples=2`, `warmup=1`의 artifact 생성 검증용 smoke 결과다. 표본이 작으므로 성능 기준값이 아니라 측정 계약과 실행 가능성 확인으로 해석한다.

| service | endpoints | slowest p99 ms | note |
| --- | ---: | ---: | --- |
| reservation-service | 13 | 12.938 | 예약 생성/조회/취소/만료, 판매, 정책 API 포함 |
| payment-service | 4 | 15.923 | 결제 생성, 결제 조회, 공급자/관리자 정산 조회 포함 |
| ticket-service | 3 | 50.642 | 티켓 발급 경로가 QR/PDF 생성 함수까지 지나 가장 큼 |
| notification-service | 2 | 6.996 | 목록/상세 조회 Mongo 경로 확인 |

## 실행 명령

```bash
cd /Users/danghamo/Documents/gituhb/medikong/service/services/reservation-service
uv run pytest tests/integration/test_api_benchmark.py --run-reservation-api-benchmark --reservation-benchmark-samples=50 --reservation-benchmark-warmup=5

cd /Users/danghamo/Documents/gituhb/medikong/service/services/payment-service
uv run pytest tests/integration/test_api_benchmark.py --run-payment-api-benchmark --payment-benchmark-samples=50 --payment-benchmark-warmup=5

cd /Users/danghamo/Documents/gituhb/medikong/service/services/ticket-service
uv run pytest tests/integration/test_api_benchmark.py --run-ticket-api-benchmark --ticket-benchmark-samples=50 --ticket-benchmark-warmup=5

cd /Users/danghamo/Documents/gituhb/medikong/service/services/notification-service
uv run pytest tests/integration/test_api_benchmark.py --run-notification-api-benchmark --notification-benchmark-samples=50 --notification-benchmark-warmup=5
```

## 서비스별 보고서

- [reservation-service](reservation-service/2026-06-20-api-benchmark.md)
- [payment-service](payment-service/2026-06-20-api-benchmark.md)
- [ticket-service](ticket-service/2026-06-20-api-benchmark.md)
- [notification-service](notification-service/2026-06-20-api-benchmark.md)
