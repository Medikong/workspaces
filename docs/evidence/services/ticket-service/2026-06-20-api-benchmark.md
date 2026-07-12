# ticket-service API 벤치마크

## 대상 API

- 내부/API 발급: `POST /tickets/issue`
- 사용자 API: `GET /tickets/me`, `GET /tickets/{ticket_id}`

## 비대상

- `GET /tickets/me/async-experiment`는 `include_in_schema=False` 실험 endpoint라 제외했다.
- Kafka consumer와 payment-approved event handler는 API route가 아니라 background/event 처리 경로라 제외했다.
- `/health`, `/readyz`, `/metrics`는 운영 endpoint라 서비스 API 처리 시간 대상에서 제외했다.

## smoke 결과

| endpoint | method | status | samples | warmup | min ms | p50 ms | p95 ms | p99 ms | max ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| issue-ticket | POST | 200 | 2 | 1 | 28.535 | 28.535 | 50.642 | 50.642 | 50.642 |
| list-my-tickets | GET | 200 | 2 | 1 | 8.057 | 8.057 | 21.582 | 21.582 | 21.582 |
| get-ticket | GET | 200 | 2 | 1 | 9.661 | 9.661 | 10.480 | 10.480 | 10.480 |

## 해석

- smoke 표본에서는 `issue-ticket`이 가장 컸다. 현재 route는 DB insert 후 QR/PDF 업로드 함수를 거치며, 자격증명이 없으면 외부 S3 호출 없이 `None`으로 끝난다.
- Kafka producer는 dependency override로 `None` 처리해 외부 브로커 비용은 제외했다.
- 목록 조회는 cursor 기반 API의 첫 페이지 경로를 측정했다.
