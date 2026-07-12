# Observability Evidence

metric, log, trace, dashboard처럼 관측성으로 확인한 결과물을 주제별로 보관한다.

## Index

| 날짜 | 주제 | 확인한 것 | 문서 |
| --- | --- | --- | --- |
| 2026-06-11 | payment-ticket trace context | `/payments` trace가 Kafka consumer와 ticket DB span까지 이어짐 | [payment-ticket-trace-context/README.md](payment-ticket-trace-context/README.md) |
| 2026-06-19 | synthetic 정기 실행 | aws-dev synthetic CronJob 주기와 Logs 50 dashboard/실행 증빙 정리 | [synthetic-automation/README.md](synthetic-automation/README.md) |

## 작성 기준

- 화면 캡처는 각 주제 폴더의 `assets/`에 둔다.
- 본문에는 trace id, 조회 도구, 확인 시간, 성공 기준을 남긴다.
- trouble 문서가 있으면 연결한다.
- 운영 판단에 필요한 후속 작업은 문서 끝에 따로 둔다.
