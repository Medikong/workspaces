---
id: MEETING-2026-06-04-001
title: "데일리 미팅"
date: 2026-06-04
type: meeting
status: draft
areas:
  - planning
  - ci-cd
  - gitops
  - observability
  - service-mesh
  - istio
repos:
  - workspace
  - service
  - gitops
  - infra
attendees: []
related:
  - docs/architecture/observability/implementation/README.md
  - docs/adr/0003-separate-kong-edge-gateway-and-istio-service-mesh.md
  - docs/project_docs/04-scenarios/S9-canary-deployment.md
links: []
---

# 2026-06-04 데일리 미팅

## 목적

현재 각 담당자의 작업 상황을 먼저 파악하고, 다음 중간점검 전까지 끝낼 범위를 맞춘다.

## 현재 작업 상황

| 항목 | 담당 | 기록 위치 | 상태 |
| --- | --- | --- | --- |
| CI 기반을 바탕으로 Argo CD 목표 구성 만들기 | 석진님 | `docs/project_docs/04-scenarios/S9-canary-deployment.md` | 진행 중 |
| Grafana, Loki 기술 스택 연동 마무리 | 범휘님 | `docs/architecture/observability/implementation/README.md` | 진행 중 |
| Istio 서비스 쪽 config를 넣고 테스트 | 명순님 | `docs/adr/0003-separate-kong-edge-gateway-and-istio-service-mesh.md` | 진행 중 |

## 결정 사항

| 결정 | 이유 | 연결 문서 |
| --- | --- | --- |
| 오늘 데일리 미팅은 현재 작업 상황 파악을 먼저 진행한다. | 각 담당 작업의 진행 범위를 맞춰야 다음 점검에서 실제 연결 상태를 확인할 수 있다. |  |
| 다음 주 월요일(2026-06-08)에 작업된 내용을 토대로 중간점검한다. | CI/CD, 관측성, Istio 설정이 각자 진행된 뒤 통합 관점에서 확인이 필요하다. |  |

## 후속 정리 필요

- 석진님은 CI 기반에서 Argo CD 목표 구성이 어디까지 가능한지 정리한다.
- 범휘님은 Grafana, Loki 연동 상태와 남은 설정을 정리한다.
- 명순님은 Istio 서비스 config 테스트 결과와 막힌 지점을 정리한다.
- 2026-06-08 중간점검에서 각 작업의 결과와 연결이 필요한 지점을 확인한다.
