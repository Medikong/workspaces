| 서비스 | step | API | target RPS | p95 | p99 | error rate | CPU avg | 후보 | 판정 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| reservation-service | `reservation_rps_80` | `POST /reservations` | 80 | 13.4ms | 40.1ms | 0.00% | 182.9m | 262m | warmup 제외 |
| reservation-service | `reservation_rps_120` | `POST /reservations` | 120 | 20.9ms | 40.0ms | 0.00% | 536.3m | 767m | valid |
| reservation-service | `reservation_rps_160` | `POST /reservations` | 160 | 37.3ms | 110.4ms | 0.00% | 791.8m | 1132m | valid |
| reservation-service | `reservation_rps_200` | `POST /reservations` | 200 | 43.2ms | 158.2ms | 0.00% | 1060.8m | 1516m | valid |
| reservation-service | `reservation_rps_240` | `POST /reservations` | 240 | 63.7ms | 108.9ms | 0.00% | 1384.6m | 1978m | valid |
| payment-service | `payment_rps_40` | `POST /payments` | 40 | 8.2ms | 18.3ms | 0.00% | 60.2m | 87m | warmup 제외 |
| payment-service | `payment_rps_80` | `POST /payments` | 80 | 7.2ms | 18.6ms | 0.00% | 207.7m | 297m | valid |
| payment-service | `payment_rps_120` | `POST /payments` | 120 | 16.3ms | 34.5ms | 0.00% | 444.4m | 635m | valid |
| payment-service | `payment_rps_160` | `POST /payments` | 160 | 34.1ms | 101.8ms | 0.00% | 774.3m | 1107m | valid |
| payment-service | `payment_rps_240` | `POST /payments` | 240 | 96.6ms | 498.0ms | 0.00% | 1137.4m | 1625m | valid |
| payment-service | `payment_rps_320` | `POST /payments` | 320 | 4120.9ms | 10000.8ms | 12.89% | 1611.4m | 2303m | limit: slo_p95_ms, error_rate_threshold |
| ticket-service | `ticket_rps_40` | `POST /tickets/issue` | 40 | 23.7ms | 57.5ms | 0.00% | 199.5m | 285m | warmup 제외 |
| ticket-service | `ticket_rps_40` | `GET /tickets/me` | 40 | 20.8ms | 59.5ms | 0.00% | 199.5m | 285m | warmup 제외 |
| ticket-service | `ticket_rps_60` | `POST /tickets/issue` | 60 | 21.2ms | 57.8ms | 0.00% | 488.6m | 699m | valid |
| ticket-service | `ticket_rps_60` | `GET /tickets/me` | 60 | 20.3ms | 60.0ms | 0.00% | 488.6m | 699m | valid |
| ticket-service | `ticket_rps_80` | `POST /tickets/issue` | 80 | 42.4ms | 97.3ms | 0.00% | 721.2m | 1031m | valid |
| ticket-service | `ticket_rps_80` | `GET /tickets/me` | 80 | 40.5ms | 99.2ms | 0.00% | 721.2m | 1031m | valid |
| ticket-service | `ticket_rps_100` | `POST /tickets/issue` | 100 | 55.3ms | 148.0ms | 0.00% | 1005.8m | 1437m | valid |
| ticket-service | `ticket_rps_100` | `GET /tickets/me` | 100 | 60.0ms | 128.5ms | 0.00% | 1005.8m | 1437m | valid |
| ticket-service | `ticket_rps_120` | `POST /tickets/issue` | 120 | 103.4ms | 196.8ms | 0.00% | 1337.2m | 1911m | valid |
| ticket-service | `ticket_rps_120` | `GET /tickets/me` | 120 | 117.8ms | 196.3ms | 0.00% | 1337.2m | 1911m | limit: slo_p95_ms |
