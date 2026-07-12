| 서비스 | warmup 제외 | 최대 유효 RPS | 기준 step | CPU avg | CPU request 후보 | 실패 시작 구간 | 기존 대비 | 판단 |
| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- |
| reservation-service | `80 RPS` | 240 | `reservation_rps_240` | 1384.6m | 1978m | 없음 | 120 -> 240 RPS | 테스트 최대 구간까지 통과 |
| payment-service | `40 RPS` | 240 | `payment_rps_240` | 1137.4m | 1625m | `payment_rps_320` | 40 -> 240 RPS | slo_p95_ms, error_rate_threshold |
| ticket-service | `40 RPS` | 100 | `ticket_rps_100` | 1005.8m | 1437m | `ticket_rps_120` | 60 -> 100 RPS | slo_p95_ms |
