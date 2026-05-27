# 04. 관측성과 검증 계획

## 목적

이 문서는 service HTML의 검증 시나리오와 `observability/live-commerce` 문서의 운영 검증 기준을 공연 티켓 예매 도메인에 맞춰 통합한다. live-commerce의 "상품 오픈"은 ticketing의 "티켓 오픈"으로 치환한다.

## 핵심 KPI

| 분류 | 지표 |
| --- | --- |
| 핵심 예매 흐름 | 예매 성공률, P95/P99 응답시간, 최대 처리량, 5xx 에러율 |
| 좌석 정합성 | 중복 티켓 수, 예약 충돌 수, 최종 좌석 상태 |
| 결제/후속 처리 | 결제 실패/보류율, 티켓 발행 지연, Kafka consumer lag |
| 운영 안정성 | HPA scale-out 시간, pod restart/recovery time, MTTR |
| 배포 안정성 | canary error delta, rollback time |
| 관측성 | alert firing time, trace duration, 로그 추적 시간 |

## SLI/SLO 후보

| 시나리오 | SLO 후보 |
| --- | --- |
| 정상 예매 E2E | 성공률 99% 이상, P99 1.5초 이하 |
| 티켓 오픈 피크 | 200 VU 5분 구간에서 5xx 1% 이하, P99 1.5초 이하 |
| 좌석 경쟁 | 초기 좌석 수를 초과한 성공 예약 0건, 중복 티켓 0건 |
| 결제 지연/장애 | 예약 유실 0건, pending 전환율 95% 이상, 주문 API 5xx 1% 이하 |
| notification 장애 | core flow 성공률 정상 대비 95% 이상 |
| HPA | 부하 증가 후 60초 이내 desired replica 증가 |
| 관측성 | 실패/지연 요청 1건을 3분 이내 trace/log로 설명 |

## 테스트 기술 스택

- 테스트 오케스트레이션: Testkube
- 부하 테스트: k6
- API/E2E 테스트: Postman, Newman
- Kubernetes 테스트 실행 환경: Grafana k6 Operator, Testkube Agent
- 지표 수집: Prometheus
- 시각화: Grafana
- 로그/추적: Loki, Tempo
- 알림: Alertmanager
- CI/CD 연동: GitHub Actions, Argo CD
- 시나리오 정의: Testkube Test Workflows, k6 JavaScript scripts, Postman Collections
- 검증 증거 관리: k6 reports, Grafana snapshots, Newman reports, Kubernetes event/log outputs

## 관측성 구현 요구사항

서비스 구현 단계에서 다음을 처음부터 남긴다.

- HTTP metric: request count, latency histogram, 4xx/5xx count
- 비즈니스 metric: reservation created, reservation conflict, payment approved/failed, ticket issued, notification retry
- Kafka metric: producer success/failure, consumer lag, event processing duration
- log field: `service`, `correlationId`, `userId`, `reservationId`, `eventId`, `status`
- trace: gateway -> service -> Kafka producer -> consumer 흐름의 context propagation

## 검증 시나리오

| 우선순위 | 시나리오 | 실행 도구 | 성공 기준 | 증거 |
| --- | --- | --- | --- | --- |
| P0 | 정상 예매 E2E | Newman, curl | 로그인, 공연 조회, 예약, 결제, 티켓 조회 성공률 99% 이상 | Newman 결과, 대표 요청/응답 |
| P0 | 좌석 동시성 | k6, DB 조회 | 초기 좌석 수를 초과한 성공 예약 0건, 중복 티켓 0건 | 성공/충돌 수, DB 최종 상태 |
| P0 | 티켓 오픈 피크 | k6, Prometheus, Grafana | 피크 5분 에러율 1% 이하, P99 1.5초 이하 | k6 리포트, Grafana Before/After |
| P0 | Kafka 후속 처리 분리 | k6, Prometheus | 예약 API p95와 티켓 발행 delay 분리 측정 | API latency, consumer lag |
| P0 | 결제 지연/장애 | kubectl, k6, Grafana | 예약 유실 0건, pending 전환율 95% 이상, 5xx 1% 이하 | 주문 상태 분포, alert 기록 |
| P0 | notification 장애 격리 | kubectl, k6, Grafana | notification 장애 중 core flow 성공률 95% 이상 | 장애 전후 Grafana, service log |
| P0 | HPA scale-out | k6, kubectl, Grafana | 부하 증가 후 60초 이내 desired replica 증가 | HPA describe, replica graph |
| P0 | 관측성 추적 | Grafana, Loki, Tempo | 실패/지연 요청 1건을 3분 이내 추적 | trace, log query, alert history |
| P1 | Rate Limiting | k6, Kong | 과호출은 429, 정상 사용자 성공률 99% 이상 | gateway log, metric |
| P1 | Canary 배포 | Argo CD, Istio 또는 Argo Rollouts | 신규 버전 에러율 기존 대비 +1%p 이하 | 버전별 지표, rollout 기록 |
| P1 | Canary 롤백 | Argo CD, Alertmanager | 이상 감지 후 3분 이내 이전 버전 복구 | 알림 기록, rollback 이벤트 |
| P2 | 보안 스캔과 정책 | Trivy, NetworkPolicy, RBAC | Critical 취약점 배포 차단, 비정상 접근 차단 | scan report, allow/deny log |

## Dashboard 우선 패널

- 예매 API RPS, P95/P99, 5xx rate
- 좌석 conflict count와 duplicate ticket count
- Kafka consumer lag와 ticket issue delay
- service별 CPU, memory, replica count
- payment 장애 시 pending/failed/paid 상태 분포
- notification 장애 중 core flow success rate
- canary 버전별 latency/error 비교

## Before / After 비교

| 영역 | Baseline | Advanced Architecture | 측정 지표 |
| --- | --- | --- | --- |
| 좌석 동시성 | 동시 요청 시 중복 가능 | reservation-service lock/transaction | `duplicate_ticket_count` |
| 후속 처리 | 예약/결제/티켓/알림 동기 연결 | Kafka event 기반 분리 | `reservation_api_p95_ms`, `consumer_lag` |
| 알림 장애 | 전체 예매 실패 가능 | notification만 retry | `core_flow_success_rate` |
| 확장성 | 부하 증가 시 pod 고정 | HPA scale-out | `hpa_scale_out_seconds`, `p99_latency` |
| 서비스 통신 | plain HTTP | Istio mTLS | `mtls_enabled_services` |
| 배포 | 일괄 배포 | traffic split/canary/rollback | `traffic_split_ratio`, `rollback_time` |
| 운영 확인 | 로그 수동 확인 | dashboard, alert, trace | `alert_firing_time`, `trace_duration` |
