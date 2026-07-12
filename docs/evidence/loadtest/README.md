# Loadtest Evidence

이 폴더는 k6 부하테스트 실행 조건, 결과 수치, Grafana/Prometheus/Kubernetes에서 확인한 병목 판단 근거를 보관한다.

## Evidence Index

| 날짜 | 주제 | 요약 | 문서 |
| --- | --- | --- | --- |
| 2026-06-20 | HPA spike test | capacity baseline CPU request 후보를 적용한 뒤 예매 전체 여정에서 HPA scale-out 반응을 검증하는 smoke/spike 구성 | [hpa-spike-test/README.md](hpa-spike-test/README.md) |
| 2026-06-20 | stress find limit | 단일 replica 조건에서 SLO가 깨지는 경계와 첫 병목 후보를 찾기 위한 실험 기준 | [stress-find-limit/README.md](stress-find-limit/README.md) |
| 2026-06-19 | capacity baseline | CPU request 기준 탐색을 위한 `capacity-baseline-load-test` 설계와 local smoke 결과 보관 | [capacity-baseline/README.md](capacity-baseline/README.md) |
| 2026-06-19 | loadtest scenario redesign | 부하테스트를 반복 가능한 가설 검증 실험으로 재정의하고 서비스별/전체 E2E/보고서 계약을 분리한 설계안 | [scenario-redesign-2026-06-19/README.md](scenario-redesign-2026-06-19/README.md) |
| 2026-06-19 | aws-dev reservation journey HPA scale-out | HPA CPU 70%, min 2, max 10 조건에서 예매 여정 부하와 scale-out 응답 시간을 검증하기 위한 실험 계획 | [aws-dev-reservation-journey-2026-06-19/README.md](aws-dev-reservation-journey-2026-06-19/README.md) |
| 2026-06-16 | reservation journey auth bottleneck | 예매 여정 부하테스트에서 login 단계가 먼저 포화되어 Kong 503이 발생한 결과 | [reservation-journey-auth-bottleneck/README.md](reservation-journey-auth-bottleneck/README.md) |
