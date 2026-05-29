# Issues

이 폴더는 GitHub Issues와 Project로 올릴 작업 후보를 먼저 정리하는 공간이다. 실제 GitHub 이슈를 발행하기 전에, 큰 주제와 하위 이슈의 발행 단위가 맞는지 여기서 먼저 맞춘다.

## 기본 원칙

- 이슈 제목은 `무엇을 할지`를 말하되, 문장형 설명이 아니라 결과 중심 명사구로 쓴다.
- 이슈 제목은 작업 결과를 나타내는 명사형 표현으로 끝낸다.
- 이슈 제목은 구현 동작을 설명하는 서술형 문장으로 끝내지 않는다.
- 이슈 제목에 구현 방법을 넣지 않는다.
- 구현 방법, 명령, 파일 경로, 검증 절차는 이슈 본문이나 PR 체크리스트에 둔다.
- repo를 넘나드는 큰 주제는 `workspace` 부모 이슈로 둔다.
- 실제 작업은 소유 repo의 하위 이슈로 나눈다.
- GitHub Issue와 Project 등록은 로컬 workplan을 먼저 검토한 뒤 진행한다.

## 발행 단위

부모 이슈는 여러 repo를 묶는 목표를 한 줄로 설명한다. 예를 들어 다음처럼 쓴다.

```text
CI/CD 리팩토링: 변경 서비스 단위 테스트·빌드·배포 파이프라인 재정비
```

하위 이슈는 각 repo에서 끝낼 수 있는 결과 단위로 쓴다.

- `service`: 서비스별 CI 파이프라인 분리
- `service`: 서비스별 단위·통합 테스트 개선
- `service`: 변경 서비스 기준 이미지 빌드·푸시 정리
- `gitops`: 새 서비스 기준 GitOps 배포 선언 정리
- `gitops`: GitOps 검증 파이프라인 개선

이보다 더 작은 항목은 하위 이슈가 아니라 본문 체크리스트로 둔다. 예를 들어 `path filter`, `matrix`, `image tag`, `Argo valueFiles 검사`는 독립 이슈 제목이 아니라 관련 이슈 안의 구현 항목이다.

## 제목 기준

좋은 제목은 결과가 보인다.

- `서비스별 CI 파이프라인 분리`
- `새 서비스 기준 GitOps 배포 선언 정리`
- `서비스별 단위·통합 테스트 개선`

피해야 할 제목은 구현 방법이 먼저 보인다.

- `path filter로 변경된 서비스 목록을 계산한다`
- `GitOps 검증에서 Argo valueFiles 불일치를 잡는다`
- `변경 서비스만 Docker build 후 registry에 push한다`

위 표현이 필요하면 이슈 본문에 `구현 방향` 또는 `검증 항목`으로 둔다.

## Repo 배치

`workspace`는 부모 이슈와 repo 간 조율을 맡는다. 작업 자체를 대신 소유하지 않는다.

`service`는 서비스 코드, 테스트, Docker image build/push, service repo의 GitHub Actions를 맡는다.

`gitops`는 Helm values, Argo Application, Kubernetes 배포 선언, GitOps 검증 workflow를 맡는다.

`infra`는 registry, cluster, cloud 계정, runner, 배포 대상 환경 같은 기반 조건이 필요할 때만 별도 이슈를 둔다.

## 이슈 본문 템플릿

부모 이슈와 하위 이슈는 같은 톤을 쓰되, 담는 내용의 깊이만 다르게 한다.

### 부모 이슈

부모 이슈는 여러 repo를 묶는 목표와 범위를 담는다. 하위 이슈 목록은 본문에 직접 적지 않고, GitHub relation과 Project에서 관리한다.

```markdown
## 목표

이 이슈에서 달성하려는 큰 목표를 한두 문장으로 적는다.

## 배경

- 현재 문제가 되는 상황:
- 왜 지금 정리해야 하는지:
- 영향을 받는 repo:

## 범위

- 포함:
- 제외:

## 완료 기준

- 하위 이슈 발행 단위가 합의되어 있다.
- 필요한 하위 이슈가 담당 repo에 발행되어 있다.
- 하위 이슈가 GitHub relation, Project, Sprint milestone에 연결되어 있다.
```

### 하위 이슈

하위 이슈는 한 repo에서 끝낼 수 있는 결과 단위를 담는다. 구현 방법은 `작업 메모`나 PR 체크리스트로 내려간다.

```markdown
## 목표

이 repo에서 끝낼 작업 결과를 한두 문장으로 적는다.

## 배경

- 현재 상태:
- 문제 또는 gap:
- 관련 부모 이슈:

## 범위

- 포함:
- 제외:

## 완료 기준

-
-
-

## 작업 메모

- 구현 중 검토할 항목:
- 검증할 항목:
- 후속으로 분리할 수 있는 항목:
```

## Workplan 파일

로컬 workplan은 `*.yaml`로 둔다. 스키마는 다음 파일을 사용한다.

```text
docs/issues/template/linear-workplan.schema.json
```

workplan의 `tasks`는 GitHub Issue 후보를 뜻한다. 코드 수준 작업 절차나 구현 체크리스트를 `tasks`로 쪼개지 않는다.

GitHub에 등록한 뒤에는 각 task의 `links`에 실제 이슈 URL을 남긴다. 회수하거나 다시 설계해야 하는 이슈 링크는 유지하지 않고 정리한다.
