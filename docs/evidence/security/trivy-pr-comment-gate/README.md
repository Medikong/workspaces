# Trivy PR Comment Gate Evidence

작성일: 2026-06-19

## 1. 목적

이 문서는 `gitops` PR에서 Trivy Kubernetes manifest scan이 보안 이슈를 발견했을 때 pipeline check를 실패시키고 PR inline comment를 게시하는지 확인한 evidence다.

검증 기준은 다음이다.

```text
Pull Request에서 Kubernetes/GitOps manifest scan이 실행된다.
보안 이슈가 있으면 Trivy/code scanning check가 실패한다.
GitHub code scanning 결과가 PR 변경 라인에 inline comment로 게시된다.
PR 화면에서 failed check를 확인할 수 있다.
```

관련 trouble:

```text
workspace/docs/trouble/trivy-pr-comment-gate/README.md
```

## 2. 환경

| 항목 | 값 |
| --- | --- |
| repo | `Medikong/gitops` |
| PR | [Medikong/gitops#30](https://github.com/Medikong/gitops/pull/30) |
| workflow | `.github/workflows/k8s-security-scan.yml` |
| job | `Trivy config scan` |
| scanner | `aquasecurity/trivy-action@v0.36.0` |
| output | SARIF upload through `github/codeql-action/upload-sarif@v3` |
| local workflow severity | `HIGH,CRITICAL` |

`gitops/.github/workflows/k8s-security-scan.yml` 기준으로 workflow는 `pull_request`, `push`, `workflow_dispatch`에서 실행된다. SARIF 업로드 권한은 `security-events: write`로 설정되어 있다.

## 3. PR 화면 증거

![GitHub PR Trivy comments](assets/github-trivy-pr-comments.png)

캡처에서 확인한 상태는 다음이다.

| 항목 | 관찰 결과 | 판정 |
| --- | --- | --- |
| PR inline comment | `github-advanced-security[bot]`가 변경 라인별 보안 코멘트를 게시 | 통과 |
| Dockerfile root user 경고 | `platform/loadtest/runner/Dockerfile`에 `DS002` HIGH comment 게시 | 통과 |
| ConfigMap secret key 경고 | `platform/loadtest/templates/configmap.yaml`에 `KSV039` HIGH comment 게시 | 통과 |
| ConfigMap sensitive content 경고 | `platform/loadtest/templates/configmap.yaml`에 `KSV010` MEDIUM comment 게시 | 통과 |
| Dockerfile healthcheck 경고 | `platform/loadtest/runner/Dockerfile`에 `DS026` LOW comment 게시 | 참고 |
| PR check 상태 | 캡처 시점에 `Code scanning results / Trivy` check failed | 통과 |
| PR 상태 표시 | 캡처 시점에 `Some checks were not successful`, `Pull request cannot be merged` 표시 | 참고 |

## 4. 최종 판정

```text
Trivy PR comment gate: PASS
```

`Medikong/gitops#30`에서 Trivy config scan 결과가 GitHub code scanning alert로 전환되고, PR 변경 라인에 inline comment가 게시되며, 캡처 시점에 `Code scanning results / Trivy` check가 실패로 표시되는 것을 확인했다.

따라서 다음 GOAL 체크 항목은 Trivy 기준에서 충족으로 판단할 수 있다.

```text
Critical issue 발견 시 pipeline을 중단하고 PR comment를 게시한다.
```

단, 이 evidence는 Trivy 기반 Kubernetes manifest scan에 대한 것이다.

또한 PR #30은 이후 2026-06-19에 merge됐다. 따라서 이 문서는 최종 PR 상태가 아니라, PR 검토 중 Trivy comment와 failed check가 실제로 표시됐다는 시점 증거로 사용한다.

Branch protection에서 Trivy check를 필수 check로 강제했는지는 이 문서의 검증 범위에 포함하지 않는다.

## 5. 후속 조치 후보

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| todo | Dockerfile에 non-root `USER` 적용 또는 runner 이미지 실행 권한 기준 명시 | 이석진 | [Medikong/gitops#30](https://github.com/Medikong/gitops/pull/30) |
| todo | `LOADTEST_*PASSWORD*` 값을 ConfigMap에서 Secret으로 분리 | 이석진 | [Medikong/gitops#30](https://github.com/Medikong/gitops/pull/30) |
| todo | 민감값처럼 보이는 threshold/env 이름 중 실제 Secret이 아닌 항목의 예외 기준 정리 | 이석진 | [Medikong/gitops#30](https://github.com/Medikong/gitops/pull/30) |
| todo | `HEALTHCHECK` 경고를 컨테이너 실행 방식 기준으로 처리할지 결정 | 이석진 | [Medikong/gitops#30](https://github.com/Medikong/gitops/pull/30) |
