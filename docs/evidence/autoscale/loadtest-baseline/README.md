---
title: Loadtest 기본 실험 기준
category: autoscale
environment: local-kubernetes
scope: loadtest-structural-smoke
---

# Loadtest 기본 실험 기준

## 목적

이 폴더는 성능 한계를 찾기 전, 부하 테스트 장치가 올바르게 연결되었는지 확인하는
기본 실험 기준이다. 1일치 데이터와 매우 낮은 RPS로 모든 서비스를 한 번씩 순서대로
실행한다.

12살도 이해할 수 있게 말하면, 큰 시험 전에 각 교실의 전등, 책상, 출석부가 모두
준비됐는지 확인하는 작은 점검이다. 점검이 끝났다고 모든 학생의 시험 점수가 좋다는
뜻은 아니다.

## 실행 약속

클러스터의 서비스, migration, 기본 설정은 먼저 `task dev`가 준비한다. 사용자는 그
다음 아래 한 명령만 실행하면 된다.

```sh
task loadtest:run RUN=local-smoke-1day-static-replicas-1.yaml SERVICE=all
```

실행기는 필요한 로컬 loadtest 입력 참조와 이미지를 준비하고, Dataset Job을 서비스당
한 번만 실행한다. 그 뒤 Dataset, k6, 관측성 snapshot, scenario report를 서비스별로
차례대로 처리한다. 별도의 `task dev:loadtest`를 사람이 먼저 실행할 필요는 없다.

## 고정 조건

| 항목 | 기준 |
| --- | --- |
| RUN | `local-smoke-1day-static-replicas-1.yaml` |
| scenario | `service-static-replica-capacity-load-test` |
| preset | `local-smoke-1day-low-rps` |
| dataset | `smoke-1day` |
| replica | 측정 중 서비스당 1개, 종료 후 기존 dev 값으로 복원 |
| 요청 경로 | Istio ingress gateway를 통한 HTTP 요청 |
| 실행 범위 | `SERVICE=all`, 서비스 순차 실행 |
| 관측성 | k6 종료 뒤 실행 시간 구간을 한 번 read-only 조회 |

DB 연결은 사용자 HTTP 요청이 아니라 Dataset Job과 서비스 내부 통신이다. 그래서
ingress 앞문이 열려 있어도 서비스에서 DB로 가는 길까지 자동으로 보장되지는 않는다.

## 기본 실험의 완료 기준

- 모든 대상 서비스가 Dataset Job, k6 Job, report 생성, replica 복원을 끝낸다.
- 각 scenario 결과에 API별 요청 수, actual RPS, 오류율, checks, p50/p95/p99가 남는다.
- 서비스/Pod 관측성은 API 결과와 분리해 붙고, 조회할 수 없으면 `0`이 아니라
  `null`과 `unavailable`으로 남는다.
- fixture 또는 입력 참조가 없으면 임의 값을 만들지 않고 `configuration` 실패로 남긴다.
- 이 기본 실험은 구조 검증이다. `verification_only: true`이면 실행 전체의 `pass`는
  "실행 장치가 끝까지 동작했다"는 뜻이며, 모든 API가 성능 기준을 통과했다는 뜻은 아니다.

## 실행 기록

- [2026-07-25 로컬 90일 baseline 실제 ramp, bulk 토큰 경로](baseline90d-ramp-20260725t215600z/README.md): 웹 제외 8개 backend 서비스의 실제 1 replica ramp. Coupon 포함 5개는 최대 기준점 도달, Auth·Catalog·Notification은 병목 후보, Interest는 runtime addressing 실행 실패를 별도 보고서로 보관.
- [2026-07-25 로컬 90일 baseline 실제 ramp](baseline90d-ramp-20260725t122500z/README.md): 웹 제외 8개 backend 서비스의 실제 1 replica ramp 결과. Auth·Catalog 병목 후보와 6개 실행 실패를 분리해 보관.
- [2026-07-25 로컬 Istio 전체 서비스 최종 smoke](local-istio-smoke-20260725-final-all/README.md): Istio·서비스·fixture 계약을 맞춘 뒤 9개 서비스 API 모두 오류율 0, checks 1로 확인한 결과
- [2026-07-25 로컬 Istio 전체 서비스 smoke](local-istio-smoke-20260725/README.md): Auth 요청 사용자 토큰 경로를 포함해 다시 실행한 9개 서비스 결과와 남은 API 계약 실패
- [2026-07-24 로컬 Istio 전체 서비스 smoke](local-istio-smoke-20260724/README.md): 이 기준으로 실제 실행한 9개 서비스 결과와 migration 문제 진단

## 보관 원칙

원본 artifact와 `result.json`은 GitOps loadtest 결과 경로에 보관한다. 이 evidence
폴더에는 결론, 실행 조건, 재현 명령, 확인한 사실만 적는다. 비밀번호, 토큰, 쿠키,
Authorization 값과 coupon 평문은 기록하지 않는다.
