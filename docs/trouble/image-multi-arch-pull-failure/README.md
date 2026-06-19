---
id: TROUBLE-014
title: "arm64 노드에서 이미지 manifest 또는 태그 불일치로 pull이 실패하는 문제"
status: triaged
priority: p1
severity: high
area: deployment
repos:
  - workspace
  - gitops
  - service
owner: unassigned
created: 2026-06-19
updated: 2026-06-19
resolved: null
tags:
  - imagepullbackoff
  - arm64
  - manifest
  - ecr
  - private-dev
related:
  - workspace/docs/trouble/ecr-registry-403/README.md
  - workspace/docs/members/service/goal/2026-06-15-goal-review/goal-functional-equivalence-checklist-2026-06-15.md
links: []
---

# Image manifest pull failure on arm64

## Context

private-dev 클러스터의 ECR `403 Forbidden` 문제를 해결한 뒤에도 일부 Pod의 `ImagePullBackOff`가 남았다.

최신 이벤트에서 `403`/`Forbidden`은 사라졌고, 남은 pull 실패는 인증 문제가 아니라 이미지 repository, tag, platform manifest 문제로 분리됐다.

## Symptoms

남은 pull 실패 예시:

```text
ticketing-dashboard/dashboard-98c84ccdb-fwtbd
  image: 941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/dashboard:dev
  error: failed to resolve image ... dashboard:dev: not found

observability/opentelemetry-collector-agent-*
  image: 941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/otel/opentelemetry-collector-contrib:0.153.0
  error: no match for platform in manifest sha256:3b098e7bd5fca8f3f03320ab207cd17972a8b992903f7dc1b519b9426858cd34
```

노드 아키텍처:

```text
NAME               ARCH
ip-172-31-12-203   arm64
ip-172-31-4-112    arm64
ip-172-31-49-159   arm64
ip-172-31-53-105   arm64
ip-172-31-61-179   arm64
ip-172-31-63-39    arm64
```

## Impact

- ECR 인증이 정상이어도 특정 Pod가 계속 `ImagePullBackOff`로 남는다.
- 배포 실패 원인을 ECR Secret 만료로 오해할 수 있다.
- arm64 노드로 구성된 private-dev에서 amd64 전용 mirror 또는 잘못된 tag는 즉시 pull 실패가 된다.
- 관측성 DaemonSet은 일부 노드에서 agent가 뜨지 않아 로그/trace 수집 범위가 줄어든다.

## Investigation

| 시간 | 확인 내용 | 결과 |
| --- | --- | --- |
| 2026-06-19 02:55 UTC | 최신 이벤트에서 `403`/`Forbidden` 검색 | ECR 인증 오류는 더 이상 보이지 않았다. |
| 2026-06-19 02:55 UTC | dashboard Pod Event 확인 | `dashboard:dev` 이미지가 ECR에서 `not found`로 실패했다. |
| 2026-06-19 02:55 UTC | collector Pod Event 확인 | `0.153.0` manifest에 현재 플랫폼과 맞는 image config가 없어 실패했다. |
| 2026-06-19 02:55 UTC | node architecture 확인 | 모든 노드가 `arm64`였다. |
| 2026-06-19 02:56 UTC | ECR repository 확인 | `dashboard` repository는 없고 `frontend` repository만 확인됐다. |
| 2026-06-19 02:56 UTC | collector ECR image 확인 | `0.153.0`, `0.153.0-amd64` tag가 같은 manifest list를 가리키며 arm64 pull에 실패했다. |

## Current Diagnosis

현재 문제는 두 가지로 분리된다.

| 대상 | 원인 | 근거 | 필요한 조치 |
| --- | --- | --- | --- |
| dashboard | 배포 값이 존재하지 않는 ECR repository/tag를 참조 | ECR에 `dashboard` repository가 없고 Pod는 `dashboard:dev`를 pull한다. | `gitops/values/services/dashboard.yaml`의 repository/tag를 실제 이미지로 교정하거나 dashboard 이미지를 ECR에 publish한다. |
| OpenTelemetry Collector | ECR mirror image가 arm64 노드에서 pull 가능한 manifest를 제공하지 않음 | 노드는 `arm64`, Event는 `no match for platform in manifest`다. | collector mirror workflow를 arm64 포함 manifest로 다시 publish한다. |

## Recommended Verification

dashboard repository/tag 확인:

```bash
aws ecr describe-repositories \
  --region ap-northeast-2 \
  --query "repositories[?contains(repositoryName, 'dashboard') || contains(repositoryName, 'frontend')].[repositoryName,repositoryUri]"

aws ecr describe-images \
  --region ap-northeast-2 \
  --repository-name frontend
```

collector manifest 확인:

```bash
docker buildx imagetools inspect \
  941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/otel/opentelemetry-collector-contrib:0.153.0
```

기대 확인값:

```text
linux/arm64
```

## Improvement Plan

| 우선순위 | 개선안 | 담당 repo | 완료 기준 |
| --- | --- | --- | --- |
| p1 | dashboard Deployment가 실제 ECR repository/tag를 참조하도록 교정 | gitops | dashboard Pod가 `ImagePullBackOff` 없이 pull된다. |
| p1 | collector mirror를 arm64 포함 manifest로 재발행 | gitops | 모든 arm64 노드의 collector agent가 `Running`이 된다. |
| p2 | 배포 전 ECR repository/tag 존재 여부를 workflow 또는 preflight로 검증 | service, gitops | 없는 tag를 참조하는 GitOps 변경이 사전에 잡힌다. |
| p2 | private-dev 노드 아키텍처와 image manifest를 같이 검증하는 운영 체크를 추가 | gitops | arm64-only 클러스터에서 amd64-only 이미지를 배포하지 않는다. |

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | ECR 인증 문제와 이미지 manifest/tag 문제를 별도 trouble 문서로 분리 | Codex | 이 문서 |
| todo | dashboard 이미지 repository/tag 정리 | unassigned | `gitops/values/services/dashboard.yaml` |
| todo | collector image mirror를 arm64 포함으로 재발행 | unassigned | `gitops/platform/observability/collector/image-mirror/aws-dev.yaml` |
| todo | 서비스별 image publish workflow의 multi-platform 결과 점검 | unassigned |  |

## Resolution

아직 미해결이다.

닫기 전 필요한 확인:

- dashboard Pod가 실제 ECR image를 pull해 `Running`이 되는지 확인한다.
- 모든 collector DaemonSet Pod가 arm64 노드에서 `Running`이 되는지 확인한다.
- 최신 Kubernetes Events에서 `not found`와 `no match for platform in manifest`가 사라졌는지 확인한다.
