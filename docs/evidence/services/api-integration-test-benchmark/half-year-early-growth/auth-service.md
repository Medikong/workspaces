# auth-service API 통합 벤치마크

## 가정

- 이 문서는 동시접속 부하테스트가 아니라, 대량 데이터가 누적된 DB에서 API 1회 처리 비용을 측정한 결과다.
- seed 생성은 API 순차 호출이 아니라 PostgreSQL/MongoDB bulk insert로 수행한다.
- testcontainers 컨테이너는 테스트 종료 시 정리되며, seed/setup 시간은 endpoint 측정값에 포함하지 않는다.
- 민감값은 artifact와 보고서에 남기지 않고, synthetic user id와 deterministic id만 사용한다.

## 실행 기준

- YAML preset 경로: `tests/benchmarks/datasets/half-year-early-growth.yaml`
- artifact root: `tests/tmp/reports/api-integration`
- smoke 실행: `task benchmark-api-smoke-service SERVICE=auth-service PRESET=smoke`
- large 실행: `task benchmark-api-large-service SERVICE=auth-service PRESET=half-year-early-growth SAMPLES=100`
- 보고서 갱신: `task benchmark-api-report SERVICE=auth-service`

## Smoke 결과

- preset: `smoke`
- 생성 시각: `2026-06-20T13:35:21.901098+00:00`
- artifact: `tests/tmp/reports/api-integration/auth-service/smoke/latest.json`
- seed 규모: 서비스기간 7일, 활성 사용자 80명, 공연 12개, 회차 36개, 좌석 2,520석, audit_logs=400, refresh_tokens=40, revoked_tokens=0, users=200

| endpoint | method | status | samples | warmup | minMs | p50Ms | p95Ms | p99Ms | maxMs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| login-customer | POST | 200 | 5 | 1 | 56.843 | 59.203 | 63.241 | 63.241 | 63.241 |
| signup-customer | POST | 201 | 5 | 1 | 57.728 | 59.609 | 69.995 | 69.995 | 69.995 |
| me-customer | GET | 200 | 5 | 1 | 14.853 | 29.981 | 32.509 | 32.509 | 32.509 |
| refresh-token | POST | 200 | 5 | 1 | 8.594 | 9.092 | 14.643 | 14.643 | 14.643 |
| audit-logs-admin | GET | 200 | 5 | 1 | 7.400 | 7.831 | 8.495 | 8.495 | 8.495 |

## Large 결과

- preset: `half-year-early-growth`
- 생성 시각: `2026-06-20T13:52:19.758525+00:00`
- artifact: `tests/tmp/reports/api-integration/auth-service/half-year-early-growth/latest.json`
- seed 규모: 서비스기간 180일, 활성 사용자 40,000명, 공연 270개, 회차 810개, 좌석 567,000석, audit_logs=200,000, refresh_tokens=20,000, revoked_tokens=0, users=100,000

| endpoint | method | status | samples | warmup | minMs | p50Ms | p95Ms | p99Ms | maxMs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| login-customer | POST | 200 | 100 | 2 | 54.209 | 55.916 | 65.077 | 102.895 | 264.484 |
| signup-customer | POST | 201 | 100 | 2 | 54.721 | 57.030 | 68.408 | 71.613 | 107.342 |
| me-customer | GET | 200 | 100 | 2 | 5.557 | 6.637 | 13.622 | 30.404 | 114.305 |
| refresh-token | POST | 200 | 100 | 2 | 6.518 | 7.955 | 9.898 | 11.603 | 15.933 |
| audit-logs-admin | GET | 200 | 100 | 2 | 6.687 | 7.750 | 10.983 | 13.478 | 23.831 |

## 샘플 수 해석

- 이 artifact의 endpoint별 samples는 `100`이고 warmup은 `2`이다.
- samples가 100 수준이면 p95/p99와 max를 분리해서 볼 수 있어, 일시적인 TestClient/컨테이너 wall time outlier를 더 조심스럽게 해석할 수 있다.

## Query Plan / Index Analysis

| endpoint | query shape | plan summary | index used | index decision | 데이터 성능 분석 |
| --- | --- | --- | --- | --- | --- |
| `login-customer` | `SELECT users WHERE email` | index_scan, indexes=`ix_users_email`, returned=1, estimated=1, buffers=8/0, planning=0.036ms, execution=0.022ms | yes | email unique index 유지. 추가 인덱스보다 password verify 비용을 분리해서 본다. | users=100,000. 로그인 p50/p95는 DB보다 password hash 검증 영향이 크다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `signup-customer` | `SELECT users WHERE email, INSERT users` | index_scan, indexes=`ix_users_email`, returned=0, estimated=1, buffers=6/0, planning=0.022ms, execution=0.017ms | yes | 중복 이메일 방어에는 현재 unique index가 맞다. | 신규 email은 miss path라 table 규모 영향은 작고 password hash + insert 비용이 중심이다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `me-customer` | `SELECT users WHERE id` | index_scan, indexes=`ix_users_id`, returned=1, estimated=1, buffers=6/0, planning=0.042ms, execution=0.025ms | yes | PK 조회 유지. 감사 로그 insert가 같이 붙는다. | 단일 사용자 조회라 users=100,000 규모보다 JWT 검증과 audit insert 변동을 본다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `refresh-token` | `SELECT refresh_tokens WHERE token_hash` | index_scan, indexes=`ix_refresh_tokens_token_hash`, returned=1, estimated=1, buffers=10/0, planning=0.021ms, execution=0.033ms | yes | refresh token lookup은 unique index로 충분하다. | refresh_tokens=20,000. token hash 계산, revoke update, token 재발급 비용을 함께 본다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `audit-logs-admin` | `SELECT audit_logs ORDER BY id DESC LIMIT 100` | index_scan, indexes=`ix_audit_logs_id`, returned=100, estimated=200460, buffers=12/0, planning=0.025ms, execution=0.043ms | yes | 최근 100건 조회는 id index 역순 scan으로 유지한다. | audit_logs=200,000. 응답 100건 직렬화 비용이 함께 포함된다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |

## 해석

- p99가 가장 큰 endpoint는 `login-customer`이며 p99=102.895ms다.
- p50 대비 p99 꼬리가 가장 긴 endpoint는 `me-customer`이며 p99/p50=4.58배다.
- smoke와 large 결과 차이는 seed 규모 변화에 따른 DB 조회/정렬/집계 비용 증가를 보는 기준으로 사용한다.
- p95/p99가 높은 endpoint는 아래 query plan, index decision, 데이터 분포를 함께 보고 DB scan 문제인지 응답 크기/직렬화 문제인지 분리한다.

## 병목 후보

- `login-customer`: p95=65.077ms, p99=102.895ms
- `signup-customer`: p95=68.408ms, p99=71.613ms
- `me-customer`: p95=13.622ms, p99=30.404ms

## 후속 개선점

- 목록 API는 일반 사용자와 헤비 사용자 결과를 분리해서 pagination 또는 projection 개선 후보를 판단한다.
- 운영 데이터가 쌓이면 YAML preset의 분포와 상태 비율을 실제 로그/DB 통계 기준으로 보정한다.
