---
id: MEETING-2026-05-27-001
title: "오전 결정 사항 정리"
date: 2026-05-27
type: decision
status: recorded
areas:
  - docs
  - local-dev
  - planning
repos:
  - workspace
  - service
  - gitops
  - infra
attendees:
  - 석진
  - 범휘
  - 명수
related:
  - docs/adr/0002-use-docker-desktop-for-local-kubernetes-validation.md
  - docs/issues/
  - docs/projects_plan/
  - GitHub Issues
  - GitHub Projects
links: []
---

# 2026-05-27 오전 회의록: 결정 사항 정리

## 목적

프로젝트 문서화 방식, 로컬 개발 도구 방향, 역할 분담, 당일 조사 항목을 정리한다.

## 결정 사항

### 문서화 기준

프로젝트 진행 중 생기는 기록은 목적별로 나누어 관리한다.

| 문서 유형 | 기록 위치 | 목적 |
| --- | --- | --- |
| ADR | `docs/adr/` | 구조적 의사결정과 대안, 채택 사유 기록 |
| 이슈, 트러블 | `docs/issues/` | 장애, 리스크, 검증 실패, 후속 추적 필요 사항 기록 |
| 스프린트 결과 | `docs/projects_plan/` | 일정, 범위, 완료 결과, 다음 계획 기록 |
| 런북 | 담당 repo 문서 | 반복 운영 절차와 장애 대응 절차 기록 |

### Vagrant 퇴출

Vagrant + VMware 기반 로컬 클러스터는 실제 검증과 반복 테스트에 사용하기에는 너무 무겁고, 크로스 플랫폼 환경에서 동일하게 구성해 테스트하기가 복잡하다.

따라서 로컬 검증은 Docker Desktop + Kubernetes 구조로 전환한다. 로컬에서는 Kubernetes 클러스터 구조를 빠르게 검증하고 반복 테스트하며, 최종 인프라 연동 검증은 AWS 배포 환경에서 확인한다.

### Taskfile 이용

반복 실행 명령은 Taskfile을 기준 진입점으로 둔다. workspace 수준에서는 repo 구성과 상태 확인을 담당하고, 각 repo의 개발, 배포, 검증 명령은 해당 repo의 Taskfile과 README를 기준으로 한다.

### 일정관리

프로젝트 일정과 작업 진행 관리는 GitHub Issues와 GitHub Projects를 사용한다. repo 안의 계획 문서와 회의록은 결정과 맥락을 남기는 기준 기록으로 두고, 실제 작업 상태와 일정 추적은 GitHub Issues / Projects에서 운영한다.

### 역할 분배

| 담당자 | 역할 |
| --- | --- |
| 석진 | 인프라, GitOps |
| 범휘 | 관측성, PM |
| 명수 | 서비스, 서비스 디스커버리 |

## 오늘 할 일

| 항목 | 담당 | 기록 위치 | 상태 |
| --- | --- | --- | --- |
| 담당 영역별 자료 조사 | 전체 | `docs/members/` | todo |
| 서비스 주제 조사 및 선정 | 명수 | `docs/members/service/` | todo |
| MSA 서비스 후보 조사 | 명수 | `docs/members/service/` | todo |
| 선호 파트 기준으로 최종 발표에서 보여줄 내용 조사 | 전체 | `docs/members/` | todo |
| 테스트 기준과 검증 시나리오 정리 | 전체 | `docs/projects_plan/plan/05-scenarios/` | todo |
| 무엇을 증명할지 정리 | 전체 | `docs/projects_plan/plan/05-scenarios/` | todo |

## 후속 정리 필요

- Vagrant + VMware 퇴출 범위와 Docker Desktop + Kubernetes / AWS 검증 경계는 `docs/adr/0002-use-docker-desktop-for-local-kubernetes-validation.md`를 기준으로 정리한다.
- 런북을 어느 repo에 둘지 주제별로 분리한다.
- `docs/members/`의 담당자별 조사 문서 구조를 채운다.
- 최종 발표의 핵심 검증 시나리오를 프로젝트 계획 문서와 연결한다.
