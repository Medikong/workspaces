# Service Evidence

이 폴더는 부하테스트와 관측성 자료를 서비스 단위로 다시 묶어 병목 원인, 근거, 개선 방향을 정리한다.

`loadtest` evidence가 실행 단위 결과를 보관한다면, 이 폴더는 같은 결과를 서비스 운영 관점으로 재분류한다. 각 문서는 CPU, 메모리, 네트워크 I/O, 애플리케이션 trace/log, DB connection 같은 근거를 함께 보고 "무엇이 병목인지"와 "무엇은 이번 증거로 병목이라고 보기 어려운지"를 분리한다.

## Evidence Index

| 서비스 | 주제 | 요약 | 문서 |
| --- | --- | --- | --- |
| 전체 | 서비스별 병목 종합 | capacity baseline, HPA spike, reservation journey, trouble 기록을 묶어 CPU, memory, network I/O, DB/pool 병목과 개선 방향 정리 | [2026-06-22-service-bottleneck-summary.md](2026-06-22-service-bottleneck-summary.md) |
| 전체 | API 기준 성능 baseline | half-year early-growth preset 기준 P50/P95/P99, 환산 처리량, 에러율 종합 | [service-baseline-summary.md](service-baseline-summary.md) |
| auth-service | login 부하 병목 | PBKDF2 password verification과 DB connection budget이 `/auth/login` tail latency와 실패를 만든 원인 후보로 확인됨 | [auth-service/README.md](auth-service/README.md) |
