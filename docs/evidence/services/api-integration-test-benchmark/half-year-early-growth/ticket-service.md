# ticket-service API 통합 벤치마크

## 가정

- 이 문서는 동시접속 부하테스트가 아니라, 대량 데이터가 누적된 DB에서 API 1회 처리 비용을 측정한 결과다.
- seed 생성은 API 순차 호출이 아니라 PostgreSQL/MongoDB bulk insert로 수행한다.
- testcontainers 컨테이너는 테스트 종료 시 정리되며, seed/setup 시간은 endpoint 측정값에 포함하지 않는다.
- 민감값은 artifact와 보고서에 남기지 않고, synthetic user id와 deterministic id만 사용한다.

## 실행 기준

- YAML preset 경로: `tests/benchmarks/datasets/half-year-early-growth.yaml`
- artifact root: `tests/tmp/reports/api-integration`
- smoke 실행: `task benchmark-api-smoke-service SERVICE=ticket-service PRESET=smoke`
- large 실행: `task benchmark-api-large-service SERVICE=ticket-service PRESET=half-year-early-growth SAMPLES=100`
- 보고서 갱신: `task benchmark-api-report SERVICE=ticket-service`

## Smoke 결과

- preset: `smoke`
- 생성 시각: `2026-06-20T13:08:17.170049+00:00`
- artifact: `tests/tmp/reports/api-integration/ticket-service/smoke/latest.json`
- seed 규모: 서비스기간 7일, 활성 사용자 80명, 공연 12개, 회차 36개, 좌석 2,520석, processed_events=170, tickets=170

| endpoint | method | status | samples | warmup | minMs | p50Ms | p95Ms | p99Ms | maxMs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| issue-ticket | POST | 200 | 5 | 1 | 8.801 | 16.278 | 27.932 | 27.932 | 27.932 |
| list-my-tickets-normal-first-page | GET | 200 | 5 | 1 | 7.069 | 10.814 | 14.826 | 14.826 | 14.826 |
| list-my-tickets-heavy-first-page | GET | 200 | 5 | 1 | 7.083 | 7.847 | 13.649 | 13.649 | 13.649 |
| list-my-tickets-heavy-cursor-next-page | GET | 200 | 5 | 1 | 7.469 | 9.006 | 17.289 | 17.289 | 17.289 |
| get-ticket | GET | 200 | 5 | 1 | 7.551 | 13.544 | 14.504 | 14.504 | 14.504 |

## Large 결과

- preset: `half-year-early-growth`
- 생성 시각: `2026-06-20T13:54:18.909653+00:00`
- artifact: `tests/tmp/reports/api-integration/ticket-service/half-year-early-growth/latest.json`
- seed 규모: 서비스기간 180일, 활성 사용자 40,000명, 공연 270개, 회차 810개, 좌석 567,000석, processed_events=170,000, tickets=170,000

| endpoint | method | status | samples | warmup | minMs | p50Ms | p95Ms | p99Ms | maxMs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| issue-ticket | POST | 200 | 100 | 2 | 5.421 | 8.165 | 15.358 | 21.283 | 23.371 |
| list-my-tickets-normal-first-page | GET | 200 | 100 | 2 | 3.667 | 4.942 | 11.140 | 23.285 | 35.547 |
| list-my-tickets-heavy-first-page | GET | 200 | 100 | 2 | 3.299 | 4.272 | 6.293 | 8.225 | 9.569 |
| list-my-tickets-heavy-cursor-next-page | GET | 200 | 100 | 2 | 3.323 | 4.491 | 6.936 | 8.914 | 12.441 |
| get-ticket | GET | 200 | 100 | 2 | 3.050 | 3.949 | 6.335 | 7.220 | 11.765 |

## 샘플 수 해석

- 이 artifact의 endpoint별 samples는 `100`이고 warmup은 `2`이다.
- samples가 100 수준이면 p95/p99와 max를 분리해서 볼 수 있어, 일시적인 TestClient/컨테이너 wall time outlier를 더 조심스럽게 해석할 수 있다.

## Query Plan / Index Analysis

| endpoint | query shape | plan summary | index used | index decision | 데이터 성능 분석 |
| --- | --- | --- | --- | --- | --- |
| `issue-ticket` | `SELECT tickets WHERE reservation_id, INSERT ticket` | index_scan, indexes=`ix_tickets_reservation_id`, returned=0, estimated=1, buffers=6/0, planning=0.056ms, execution=0.037ms | yes | 중복 발급 방어에는 reservation_id unique index 유지. | tickets=170,000. S3/Kafka는 제외되어 DB insert와 local artifact path 중심이다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `list-my-tickets-normal-first-page` | `SELECT tickets WHERE user_id ORDER BY id LIMIT 21` | index_scan, indexes=`ix_tickets_user_id`, returned=414, estimated=158, buffers=42/0, planning=0.046ms, execution=0.136ms | yes | 현재 수치는 낮지만 목록 tail이 커지면 (user_id, id) 복합 index를 검토한다. | 일반 사용자는 보장 row가 작아 응답/직렬화 비용이 작다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `list-my-tickets-heavy-first/cursor` | `SELECT tickets WHERE user_id ORDER BY id LIMIT 21` | index_scan, indexes=`ix_tickets_id`, returned=21, estimated=8540, buffers=8/0, planning=0.026ms, execution=0.031ms | yes | heavy tail이 커지면 (user_id, id) 복합 index가 자연스러운 다음 후보다. | heavy 비율 5%라 약 8,500건이 한 사용자에게 몰릴 수 있다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `list-my-tickets-heavy-first/cursor` | `SELECT tickets WHERE user_id AND id > cursor ORDER BY id LIMIT 21` | index_scan, indexes=`ix_tickets_id`, returned=21, estimated=8539, buffers=14/0, planning=0.097ms, execution=0.072ms | yes | cursor pagination은 유지. 복합 index 결정은 first/cursor page를 함께 보고 판단한다. | cursor 조건이 있어도 heavy 사용자 row 분포가 tail 비용을 좌우한다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `get-ticket` | `SELECT tickets WHERE id` | index_scan, indexes=`ix_tickets_id`, returned=1, estimated=1, buffers=4/0, planning=0.072ms, execution=0.025ms | yes | 단건 조회는 PK 유지. | 전체 tickets 규모보다 권한 확인과 응답 변환 비용이 크다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |

## 해석

- p99가 가장 큰 endpoint는 `list-my-tickets-normal-first-page`이며 p99=23.285ms다.
- p50 대비 p99 꼬리가 가장 긴 endpoint는 `list-my-tickets-normal-first-page`이며 p99/p50=4.71배다.
- smoke와 large 결과 차이는 seed 규모 변화에 따른 DB 조회/정렬/집계 비용 증가를 보는 기준으로 사용한다.
- p95/p99가 높은 endpoint는 아래 query plan, index decision, 데이터 분포를 함께 보고 DB scan 문제인지 응답 크기/직렬화 문제인지 분리한다.

## 병목 후보

- `list-my-tickets-normal-first-page`: p95=11.140ms, p99=23.285ms
- `issue-ticket`: p95=15.358ms, p99=21.283ms
- `list-my-tickets-heavy-cursor-next-page`: p95=6.936ms, p99=8.914ms

## 후속 개선점

- 목록 API는 일반 사용자와 헤비 사용자 결과를 분리해서 pagination 또는 projection 개선 후보를 판단한다.
- 운영 데이터가 쌓이면 YAML preset의 분포와 상태 비율을 실제 로그/DB 통계 기준으로 보정한다.
