---
id: MEETING-2026-06-15-001
title: "데일리 미팅"
date: 2026-06-15
type: meeting
status: draft
areas:
  - planning
  - ci-cd
  - gitops
  - deployment
repos:
  - workspace
  - service
  - gitops
attendees: []
related:
  - docs/meetings/2026-06-08-daily-meeting.md
  - docs/architecture/deployment/README.md
links: []
---

# 2026-06-15 데일리 미팅

## 목적

현재 배포 자동화에서 GitHub Actions 사용량을 크게 쓰는 지점을 확인하고, 이미지 build/push 실행 기준을 팀 기준으로 정한다.

## 오늘 확인할 일

| 항목 | 담당 | 기록 위치 | 상태 |
| --- | --- | --- | --- |
| 이미지 build/push가 main push마다 실행되는 현재 기준 확인 | 배포 담당 | `service/.github/workflows/image-publish.yml` | 논의 필요 |
| 배포 의도가 있을 때만 publish하는 태그 기반 실행 방식 검토 | 배포 담당 | `docs/architecture/deployment/README.md` | 결정됨 |
| GitOps values 업데이트와 Argo CD 반영 방식 유지 여부 확인 | 배포 담당 | `gitops/values/services/` | 논의 필요 |

## 현재 문제점

| 문제 | 영향 | 확인 위치 | 상태 |
| --- | --- | --- | --- |
| main 브랜치에 커밋이 자주 올라오면서 이미지 build/push가 반복 실행된다. | GitHub Actions 월간 사용량이 빠르게 줄어든다. | `service/.github/workflows/image-publish.yml` | 개선 필요 |
| 실제 배포 의도가 없는 변경도 publish 대상이 될 수 있다. | 검증과 운영 배포의 기준이 섞여 실행시간을 낭비할 수 있다. | `service/.github/workflows/image-publish.yml` | 개선 필요 |
| 공통 파일 변경 시 여러 서비스 이미지가 함께 빌드될 수 있다. | 한 번 실행할 때의 빌드 시간이 커지고 불필요한 이미지 push가 생길 수 있다. | `service/.github/workflows/image-publish.yml` | 개선 필요 |

## 제안

| 제안 | 이유 | 예시 |
| --- | --- | --- |
| main push에서는 이미지 publish를 실행하지 않는다. | 잦은 커밋이 곧 배포 실행으로 이어지지 않게 하기 위해서다. |  |
| 배포가 필요할 때만 Git tag를 push해서 이미지 build/push와 GitOps values 업데이트를 실행한다. | 배포 의도를 명확히 남기고 Actions 실행 빈도를 줄이기 위해서다. | `deploy/dev/reservation-service/v0.3.1` |
| 서비스 단위 태그와 `changed` 태그를 기본으로 하고 `all` 태그는 예외로 둔다. | 변경된 서비스만 배포해 전체 이미지 빌드를 줄이기 위해서다. | `deploy/dev/changed/2026.06.15-1` |

## 논의할 내용

- 현재는 개발 환경만 있으므로 단일 서비스는 `deploy/dev/<service>/v<major>.<minor>.<patch>`, 변경 서비스 묶음은 `deploy/dev/changed/<yyyy.mm.dd>-<sequence>`, 전체 배포는 `deploy/dev/all/<yyyy.mm.dd>-<sequence>` 규칙으로 시작한다.
- 서비스 단위와 `changed` 배포를 기본으로 하고 `all` 배포는 예외로 둘지 정한다.
- 기존 `image-publish.yml` 변경 시점과 적용 범위를 정한다.
- 변경 후 배포 절차를 팀 문서에 어떻게 남길지 정한다.

## 후속 정리 필요

- 태그 규칙이 확정되면 `service/.github/workflows/image-publish.yml`을 tag 기반 publish로 변경한다.
- 배포 명령 예시와 롤백 기준을 팀 문서에 추가한다.
- GitHub Actions 사용량이 실제로 줄었는지 적용 후 확인한다.
