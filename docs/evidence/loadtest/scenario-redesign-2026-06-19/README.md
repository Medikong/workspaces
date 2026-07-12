# Loadtest Scenario Redesign

## 목적

이 문서는 기존 부하테스트를 "얼마나 버티는지 보는 실행"이 아니라 "반복 가능한 가설 검증 실험"으로 다시 나누기 위한 설계 기준이다.

핵심 목표는 네 가지다.

- baseline에서 현재 한계와 정상 수치를 측정한다.
- spike에서 HPA scale-out 지연을 측정한다.
- 같은 시나리오로 튜닝 전후를 비교한다.
- k6 결과, Prometheus 지표, HPA 이벤트를 하나의 실험 리포트로 남긴다.

## 피드백 반영

이번 피드백의 핵심은 테스트 종류를 많이 만드는 것이 아니라, 비교 가능한 실험 단위를 고정하는 것이다.

| 피드백 | 반영 방향 |
| --- | --- |
| 부하테스트가 아니라 가설 검증 실험으로 나눠야 함 | `smoke`, `baseline`, `stress`, `spike`를 목적별 실험으로 정의 |
| 전체 API 평균만 보면 안 됨 | k6 step, 서비스, Pod, DB, Kafka 지표를 함께 본다 |
| 같은 시나리오를 반복해야 튜닝 비교가 가능함 | scenario/preset/dataset/run condition을 고정하고 Before/After 표로 비교 |
| HPA 검증에는 spike가 중요함 | spike는 전체 시스템 E2E에서 우선 수행 |
| 서비스별로 4가지를 모두 할 필요는 없음 | 개별 서비스는 병목 후보만 `smoke`, `baseline`, `stress` 중심으로 수행 |

## 테스트 계층

MSA에서는 테스트를 두 계층으로 나눈다.

| 계층 | 목적 | 테스트 |
| --- | --- | --- |
| 개별 서비스 성능 검증 | 병목 후보를 좁혀서 원인 확인 | smoke, baseline, stress |
| 전체 시스템 성능 검증 | 실제 사용자 여정과 HPA 반응 확인 | smoke, baseline, stress, spike |

개별 서비스 spike는 기본 범위에서 제외한다. HPA scale-out 지연과 트래픽 재분산은 API Gateway를 통과한 전체 사용자 여정에서 보는 편이 더 의미 있다.

## 현재 Medikong 매핑

외부 피드백의 `Order`, `Inventory`는 현재 Medikong 도메인에서는 다음처럼 매핑한다.

| 일반 MSA 항목 | Medikong 기준 |
| --- | --- |
| API Gateway / BFF | Kong Gateway |
| Auth Service | auth-service |
| Order Service | reservation-service |
| Payment Service | payment-service |
| Inventory Service | concert-service, ticket-service |
| Queue | Kafka |
| DB | PostgreSQL, MongoDB |
| Cache | Redis 사용 여부 확인 후 포함 |

## 우선순위

현재 목표가 AWS 상의 HPA 동작 검증과 튜닝 전후 정량 비교라면 실행 순서는 다음이 가장 효율적이다.

1. 전체 시스템 baseline
2. 전체 시스템 spike
3. 전체 시스템 stress
4. 병목 서비스만 개별 stress

단, AWS smoke가 끝까지 통과하지 못하면 baseline 이후 실험으로 넘어가지 않는다. smoke 실패는 성능 문제가 아니라 실행 장치, API 계약, dataset, secret, network 문제로 분리한다.

## 문서 구성

- [cpu-request-baseline-loadtest.md](cpu-request-baseline-loadtest.md): CPU request 기준 탐색을 위한 고정 replica 부하테스트 조건과 API 목록
- [cpu-request-experiment-template.md](cpu-request-experiment-template.md): CPU request 후보 산출을 위한 실험값 기록 템플릿
- [service-experiments.md](service-experiments.md): 개별 서비스별 실험 범위와 현재 시나리오 매핑
- [system-e2e-experiments/README.md](system-e2e-experiments/README.md): 전체 시스템 E2E smoke/baseline 설계와 baseline 결과 기록 위치
- [report-contract.md](report-contract.md): 실험 리포트에 반드시 남겨야 하는 값과 Before/After 비교 표
