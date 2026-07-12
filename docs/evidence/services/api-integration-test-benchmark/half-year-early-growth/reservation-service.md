# reservation-service API 통합 벤치마크

## 가정

- 이 문서는 동시접속 부하테스트가 아니라, 대량 데이터가 누적된 DB에서 API 1회 처리 비용을 측정한 결과다.
- seed 생성은 API 순차 호출이 아니라 PostgreSQL/MongoDB bulk insert로 수행한다.
- testcontainers 컨테이너는 테스트 종료 시 정리되며, seed/setup 시간은 endpoint 측정값에 포함하지 않는다.
- 민감값은 artifact와 보고서에 남기지 않고, synthetic user id와 deterministic id만 사용한다.

## 실행 기준

- YAML preset 경로: `tests/benchmarks/datasets/half-year-early-growth.yaml`
- artifact root: `tests/tmp/reports/api-integration`
- smoke 실행: `task benchmark-api-smoke-service SERVICE=reservation-service PRESET=smoke`
- large 실행: `task benchmark-api-large-service SERVICE=reservation-service PRESET=half-year-early-growth SAMPLES=100`
- 보고서 갱신: `task benchmark-api-report SERVICE=reservation-service`

## Smoke 결과

- preset: `smoke`
- 생성 시각: `2026-06-20T13:08:04.249956+00:00`
- artifact: `tests/tmp/reports/api-integration/reservation-service/smoke/latest.json`
- seed 규모: 서비스기간 7일, 활성 사용자 80명, 공연 12개, 회차 36개, 좌석 2,520석, queue_policies=12, reservations=260, sales_states=12, traffic_policies=12

| endpoint | method | status | samples | warmup | minMs | p50Ms | p95Ms | p99Ms | maxMs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create-reservation | POST | 201 | 5 | 1 | 6.690 | 7.936 | 9.181 | 9.181 | 9.181 |
| list-my-reservations-normal-first-page | GET | 200 | 5 | 1 | 3.306 | 4.198 | 5.025 | 5.025 | 5.025 |
| list-my-reservations-heavy-first-page | GET | 200 | 5 | 1 | 3.638 | 4.152 | 4.485 | 4.485 | 4.485 |
| get-reservation | GET | 200 | 5 | 1 | 3.195 | 3.491 | 10.926 | 10.926 | 10.926 |
| cancel-reservation | POST | 200 | 5 | 1 | 4.357 | 5.638 | 7.168 | 7.168 | 7.168 |
| expire-reservation | POST | 200 | 5 | 1 | 5.083 | 5.321 | 5.649 | 5.649 | 5.649 |
| admin-start-sales | POST | 200 | 5 | 1 | 4.495 | 4.759 | 5.640 | 5.640 | 5.640 |
| admin-pause-sales | POST | 200 | 5 | 1 | 5.273 | 5.654 | 8.472 | 8.472 | 8.472 |
| admin-resume-sales | POST | 200 | 5 | 1 | 4.623 | 4.776 | 5.535 | 5.535 | 5.535 |
| admin-get-sales | GET | 200 | 5 | 1 | 4.754 | 6.151 | 11.418 | 11.418 | 11.418 |
| provider-concert-sales | GET | 200 | 5 | 1 | 4.452 | 5.411 | 7.200 | 7.200 | 7.200 |
| provider-showtime-sales | GET | 200 | 5 | 1 | 2.724 | 2.992 | 3.218 | 3.218 | 3.218 |
| admin-queue-policy | PUT | 200 | 5 | 1 | 4.235 | 4.680 | 5.262 | 5.262 | 5.262 |
| admin-traffic-policy | PUT | 200 | 5 | 1 | 4.197 | 4.924 | 5.594 | 5.594 | 5.594 |

## Large 결과

- preset: `half-year-early-growth`
- 생성 시각: `2026-06-20T13:53:25.514727+00:00`
- artifact: `tests/tmp/reports/api-integration/reservation-service/half-year-early-growth/latest.json`
- seed 규모: 서비스기간 180일, 활성 사용자 40,000명, 공연 270개, 회차 810개, 좌석 567,000석, queue_policies=270, reservations=261,000, sales_states=270, traffic_policies=270

| endpoint | method | status | samples | warmup | minMs | p50Ms | p95Ms | p99Ms | maxMs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create-reservation | POST | 201 | 100 | 2 | 4.943 | 5.870 | 7.435 | 11.138 | 12.597 |
| list-my-reservations-normal-first-page | GET | 200 | 100 | 2 | 2.694 | 3.436 | 4.622 | 5.479 | 6.883 |
| list-my-reservations-heavy-first-page | GET | 200 | 100 | 2 | 5.118 | 6.190 | 7.462 | 10.056 | 11.665 |
| get-reservation | GET | 200 | 100 | 2 | 2.179 | 3.557 | 5.896 | 7.663 | 11.317 |
| cancel-reservation | POST | 200 | 100 | 2 | 4.099 | 5.464 | 6.874 | 9.528 | 11.422 |
| expire-reservation | POST | 200 | 100 | 2 | 4.086 | 5.978 | 9.170 | 11.920 | 17.088 |
| admin-start-sales | POST | 200 | 100 | 2 | 3.778 | 4.656 | 6.180 | 7.839 | 11.768 |
| admin-pause-sales | POST | 200 | 100 | 2 | 3.661 | 4.538 | 5.446 | 5.880 | 6.195 |
| admin-resume-sales | POST | 200 | 100 | 2 | 4.240 | 6.010 | 8.993 | 14.008 | 94.120 |
| admin-get-sales | GET | 200 | 100 | 2 | 4.928 | 7.669 | 12.181 | 15.905 | 16.462 |
| provider-concert-sales | GET | 200 | 100 | 2 | 5.356 | 7.784 | 15.573 | 18.744 | 20.596 |
| provider-showtime-sales | GET | 200 | 100 | 2 | 2.307 | 3.531 | 5.680 | 7.733 | 8.868 |
| admin-queue-policy | PUT | 200 | 100 | 2 | 3.220 | 4.052 | 6.064 | 6.321 | 9.546 |
| admin-traffic-policy | PUT | 200 | 100 | 2 | 3.097 | 4.112 | 5.460 | 6.761 | 7.114 |

## 샘플 수 해석

- 이 artifact의 endpoint별 samples는 `100`이고 warmup은 `2`이다.
- samples가 100 수준이면 p95/p99와 max를 분리해서 볼 수 있어, 일시적인 TestClient/컨테이너 wall time outlier를 더 조심스럽게 해석할 수 있다.

## Query Plan / Index Analysis

| endpoint | query shape | plan summary | index used | index decision | 데이터 성능 분석 |
| --- | --- | --- | --- | --- | --- |
| `create-reservation` | `SELECT active reservation WHERE performance_id, seat_id, status` | index_scan, indexes=`ix_reservations_seat_id`, returned=0, estimated=1, buffers=3/0, planning=0.096ms, execution=0.032ms | yes | 중복 방어는 active_seat_key unique를 유지한다. active lookup은 복합/부분 index 후보로 남긴다. | reservations=261,000. 생성 path는 conflict check + insert + commit 비용이다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `list-my-reservations-normal-first-page` | `SELECT reservations WHERE user_id ORDER BY created_at DESC LIMIT 20` | index_scan, indexes=`ix_reservations_user_id`, returned=210, estimated=278, buffers=39/0, planning=0.033ms, execution=0.091ms | yes | 목록 tail이 커지면 (user_id, created_at desc) 복합 index를 검토한다. | 일반 사용자는 seed에서 samples 수준만 보장되어 scan 폭이 작다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `list-my-reservations-heavy-first-page` | `SELECT reservations WHERE user_id ORDER BY created_at DESC LIMIT 20` | index_scan, indexes=`ix_reservations_user_id`, returned=26100, estimated=25520, buffers=1033/0, planning=0.030ms, execution=3.472ms | yes | 헤비 사용자 p95가 커지면 (user_id, created_at desc)로 정렬 비용을 줄인다. | heavy 비율 5%라 한 사용자에게 약 13,050건이 몰릴 수 있다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `get/cancel/expire-reservation` | `SELECT/UPDATE reservations WHERE id` | index_scan, indexes=`reservations_pkey`, returned=1, estimated=1, buffers=4/0, planning=0.069ms, execution=0.039ms | yes | 단건 상태 변경은 PK 유지. | p95 outlier는 row scan보다 transaction/commit wall time 후보가 크다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |
| `sales/policy endpoints` | `SELECT reservation counts WHERE concert_id GROUP BY status` | index_scan, indexes=`ix_reservations_concert_id`, returned=1932, estimated=2090, buffers=1941/0, planning=0.067ms, execution=1.551ms | yes | 판매 집계가 커지면 (concert_id, status) 복합 index를 검토한다. | concerts=270, reservations=261,000. 상태별 count 비용을 같이 본다. samples=100에서는 p95가 정렬값의 95번째 샘플, p99가 99번째 샘플에 가까워진다. 단일 max와 tail percentile을 분리해서 해석할 수 있다. |

## 해석

- p99가 가장 큰 endpoint는 `provider-concert-sales`이며 p99=18.744ms다.
- p50 대비 p99 꼬리가 가장 긴 endpoint는 `provider-concert-sales`이며 p99/p50=2.41배다.
- smoke와 large 결과 차이는 seed 규모 변화에 따른 DB 조회/정렬/집계 비용 증가를 보는 기준으로 사용한다.
- p95/p99가 높은 endpoint는 아래 query plan, index decision, 데이터 분포를 함께 보고 DB scan 문제인지 응답 크기/직렬화 문제인지 분리한다.

## 병목 후보

- `provider-concert-sales`: p95=15.573ms, p99=18.744ms
- `admin-get-sales`: p95=12.181ms, p99=15.905ms
- `admin-resume-sales`: p95=8.993ms, p99=14.008ms

## 후속 개선점

- 목록 API는 일반 사용자와 헤비 사용자 결과를 분리해서 pagination 또는 projection 개선 후보를 판단한다.
- 운영 데이터가 쌓이면 YAML preset의 분포와 상태 비율을 실제 로그/DB 통계 기준으로 보정한다.
