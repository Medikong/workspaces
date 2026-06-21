---
id: TROUBLE-010
title: "Trivy 보안 스캔이 PR comment와 failed check로 HIGH 이슈를 드러낸 상태"
status: triaged
priority: p1
severity: high
area: security
repos:
  - workspace
  - gitops
owner: 이석진
created: 2026-06-19
updated: 2026-06-19
resolved: null
tags:
  - trivy
  - github-actions
  - code-scanning
  - pr-comment
  - devsecops
related:
  - workspace/docs/evidence/security/trivy-pr-comment-gate/README.md
  - workspace/docs/members/service/goal/2026-06-15-goal-review/goal-functional-equivalence-checklist-2026-06-15.md
links:
  - https://github.com/Medikong/gitops/pull/30
---

# Trivy PR comment gate

## Context

`gitops` PR [Medikong/gitops#30](https://github.com/Medikong/gitops/pull/30)에서 loadtest 관련 manifest와 runner Dockerfile 변경을 올린 뒤, GitHub Actions의 Kubernetes security scan이 실행됐다.

`gitops/.github/workflows/k8s-security-scan.yml`의 핵심 설정은 다음이다.

```text
trigger: pull_request, push, workflow_dispatch
scanner: aquasecurity/trivy-action@v0.36.0
scan-type: config
format: sarif
severity: HIGH,CRITICAL
upload: github/codeql-action/upload-sarif@v3
```

GOAL 체크리스트의 관련 항목은 다음이다.

```text
Critical issue 발견 시 pipeline을 중단하고 PR comment를 게시한다.
```

## Symptoms

PR 검토 중 캡처 화면에서 다음 현상이 확인됐다.

![GitHub PR Trivy comments](assets/github-trivy-pr-comments.png)

| 관찰 항목 | 내용 |
| --- | --- |
| PR comment | `github-advanced-security[bot]`가 변경 라인에 inline security comment를 게시했다. |
| 실패 check | 캡처 시점에 `Code scanning results / Trivy`가 실패했다. |
| PR 상태 표시 | 캡처 시점에 `Some checks were not successful`, `Pull request cannot be merged`가 표시됐다. |
| 주요 HIGH 경고 | runner Dockerfile non-root user 누락, ConfigMap 내 Secret key 저장 경고가 표시됐다. |

대표 경고는 다음이다.

| 파일 | 심각도 | Trivy ID | 메시지 요약 |
| --- | --- | --- | --- |
| `platform/loadtest/runner/Dockerfile` | HIGH | `DS002` | `USER` 명령이 없어 root user 실행 가능성이 있다. |
| `platform/loadtest/templates/configmap.yaml` | HIGH | `KSV039` | Secret 성격의 key가 ConfigMap에 저장될 수 있다. |
| `platform/loadtest/templates/configmap.yaml` | MEDIUM | `KSV010` | ConfigMap에 민감 정보처럼 보이는 값이 포함되어 있다. |
| `platform/loadtest/runner/Dockerfile` | LOW | `DS026` | Dockerfile에 `HEALTHCHECK`가 없다. |

## Impact

- 보안 기준을 만족하지 않는 manifest/Dockerfile 변경은 failed check와 PR comment로 드러난다.
- PR 작성자는 GitHub UI에서 어느 파일과 라인이 문제인지 바로 확인할 수 있다.
- ConfigMap/Secret 경계가 흐려진 loadtest 설정은 실제 배포 전에 수정하거나 예외 기준을 남겨야 한다.
- 발표/검수 관점에서는 DevSecOps gate가 PR comment와 failed check까지 동작한다는 증거로 사용할 수 있다.
- Branch protection에서 Trivy check를 필수 check로 강제했는지는 별도 확인이 필요하다.

## Investigation

| 시간 | 확인 내용 | 결과 |
| --- | --- | --- |
| 2026-06-19 | `gitops/.github/workflows/k8s-security-scan.yml` 확인 | PR에서 Trivy config scan을 실행하고 SARIF를 GitHub code scanning에 업로드한다. |
| 2026-06-19 | `Medikong/gitops#30` PR 화면 확인 | `github-advanced-security[bot]` inline comment가 게시됐다. |
| 2026-06-19 | PR check 상태 확인 | 캡처 시점에 `Code scanning results / Trivy`가 실패했다. |
| 2026-06-19 | PR 최종 상태 확인 | PR #30은 이후 merge됐다. 이 trouble은 최종 PR 상태가 아니라 검토 중 보안 피드백 노출을 기록한다. |

## Decision

이 건은 “스캔 파이프라인 실패” 자체가 문제가 아니라, 보안 게이트가 의도대로 작동하면서 실제 수정이 필요한 HIGH 이슈를 드러낸 상태로 본다.

판정은 다음이다.

```text
Trivy PR comment와 failed check: 정상 동작
PR에 남은 HIGH/MEDIUM/LOW 경고: 조치 필요
```

GOAL 체크리스트에서는 Trivy 기준으로 다음 항목을 충족 처리한다.

```text
Critical issue 발견 시 pipeline을 중단하고 PR comment를 게시한다.
```

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | PR comment와 failed check가 표시된 화면을 evidence asset으로 보관 | Codex | `workspace/docs/evidence/security/trivy-pr-comment-gate/README.md` |
| done | trouble 문서로 PR 보안 게이트 동작과 남은 조치 범위 정리 | Codex | 이 문서 |
| done | GOAL 기능 동등성 체크리스트에 evidence/trouble 링크 반영 | Codex | `workspace/docs/members/service/goal/2026-06-15-goal-review/goal-functional-equivalence-checklist-2026-06-15.md` |
| todo | runner Dockerfile non-root user 기준 적용 또는 예외 사유 기록 | 이석진 | [Medikong/gitops#30](https://github.com/Medikong/gitops/pull/30) |
| todo | ConfigMap에 들어간 password 계열 값을 Secret으로 분리하거나 dummy/test-only 값임을 명시 | 이석진 | [Medikong/gitops#30](https://github.com/Medikong/gitops/pull/30) |
| todo | threshold/env 이름 중 실제 Secret이 아닌 값에 대한 Trivy 예외 기준을 결정 | 이석진 | [Medikong/gitops#30](https://github.com/Medikong/gitops/pull/30) |

## Resolution

아직 닫지 않는다.

닫는 기준은 다음 중 하나다.

```text
1. PR 또는 후속 PR에서 Trivy HIGH 경고를 실제 수정으로 제거하고 check가 통과한다.
2. 실제 위험이 아닌 항목은 근거와 함께 예외 처리하고 check 기준을 유지한다.
3. Branch protection에서 Trivy check를 필수 check로 둘지 결정한다.
```
