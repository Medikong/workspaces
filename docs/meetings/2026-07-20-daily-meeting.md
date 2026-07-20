---
id: MEETING-2026-07-20-001
title: "데일리 미팅: 관측성, 서비스 간 보안 및 배포 환경 정비"
date: 2026-07-20
type: meeting
status: recorded
areas:
  - observability
  - slo
  - alerting
  - service-mesh
  - security
  - ci-cd
  - infrastructure
repos:
  - workspace
  - service
  - gitops
  - infra
attendees:
  - 최범휘
  - 박명수
  - 김정엽
related: []
links: []
---

# 2026-07-20 데일리 미팅

## 목적

관측성 및 서비스 간 보안 작업과 CI/CD·인프라 환경 정비 현황을 공유하고 담당자별 진행 작업을 정리한다.

## 진행 작업

| 담당 | 작업 내용 | 완료 기준 |
| --- | --- | --- |
| 최범휘 | 디스코드 알림 웹훅 주소를 변경하고 관측성 시스템을 연동한 뒤 SLO를 측정한다. | 변경한 알림 경로가 정상 동작하고, 관측성 데이터로 SLO를 측정할 수 있다. |
| 박명수 | mTLS를 도입하고 서비스 간 통신 보안을 강화한다. | 서비스 간 통신에 mTLS가 적용되고 통신 정책의 적용 범위를 검증한다. |
| 김정엽 | CI/CD를 연동하고 AWS 및 Terminal Lab 환경을 재설치한다. | 재설치한 환경에서 CI/CD 작업을 실행하고 배포 연동 상태를 확인한다. |

## 액션 아이템

| 상태 | 작업 | 담당 | 기록 위치 | 링크 |
| --- | --- | --- | --- | --- |
| in-progress | 디스코드 알림 웹훅 주소 변경, 관측성 연동 및 SLO 측정 | 최범휘 | 관련 관측성 및 알림 문서 |  |
| in-progress | mTLS 도입 및 서비스 간 통신 보안 강화 | 박명수 | 관련 서비스 메시 및 보안 문서 |  |
| in-progress | CI/CD 연동과 AWS 및 Terminal Lab 환경 재설치 | 김정엽 | 관련 `gitops`, `infra` 문서 |  |

## 후속 정리 필요

- 알림 경로 변경 결과와 SLO 측정 기준 및 결과를 관련 관측성 문서에 연결한다.
- mTLS 적용 범위와 서비스 간 통신 검증 결과를 관련 서비스 메시 및 보안 문서에 연결한다.
- AWS 및 Terminal Lab 환경 재설치 결과와 CI/CD 연동 검증 결과를 관련 문서에 연결한다.
