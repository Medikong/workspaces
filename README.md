# Medikong workspace

Medikong `workspace`는 `service`, `gitops`, `infra` repo를 한 로컬 작업공간 아래에 빠르게 준비하기 위한 보조 진입점입니다. monorepo 대체물이 아니며, 각 repo의 브랜치, worktree, commit, push 전략을 강제하지 않습니다.

## 사전 준비

macOS와 Windows Git Bash를 기준으로 합니다. 필요한 도구는 Git, Bash, Task입니다.

```bash
# macOS
brew install go-task/tap/go-task

# Windows Git Bash
winget install Task.Task
```

다른 설치 방법은 [Task 설치 문서](https://taskfile.dev/docs/installation)를 참고합니다.

## 빠른 시작

신규 사용자는 `workspace` repo만 먼저 clone한 뒤 bootstrap/status 명령으로 형제 repo를 구성합니다.

```bash
mkdir medikong
cd medikong
git clone https://github.com/Medikong/workspace.git workspace
cd workspace
task bootstrap
task status
code medikong.code-workspace
```

구성 후 로컬 디렉터리는 다음처럼 배치됩니다.

```text
medikong/
  workspace/
  service/
  gitops/
  infra/
```

`medikong/`은 작업공간 루트일 뿐 git repo가 아닙니다. clone 대상 repo는 `workspace/` 안에 넣지 않고 `workspace/`의 형제 폴더로 둡니다.

## 명령

```bash
task help
task list
task doctor
task bootstrap
task status
```

- `help`: 사용 가능한 workspace 명령을 출력합니다.
- `list`: `repos.env`에 정의된 repo 목록과 대상 경로를 출력합니다.
- `doctor`: Git, Bash, manifest, workspace root, path 충돌을 검사합니다.
- `bootstrap`: 없는 repo만 `../service`, `../gitops`, `../infra`로 clone합니다. 이미 있는 폴더는 덮어쓰지 않습니다.
- `status`: repo 존재 여부, 현재 branch, dirty 여부, origin remote 불일치를 간단히 보여줍니다.

Taskfile은 공식 사용자 진입점입니다. 실제 로직은 `scripts/workspace.sh`에 있습니다.

## 기준 파일

- `repos.env`: workspace 이름, root, repo 목록, remote, clone 기본 branch를 정의합니다.
- `Taskfile.yml`: `task help/list/doctor/bootstrap/status` 진입점을 정의합니다.
- `scripts/workspace.sh`: `help`, `list`, `doctor`, `bootstrap`, `status`의 실제 구현입니다.
- `medikong.code-workspace`: VS Code에서 `workspace`, `service`, `gitops`, `infra`를 함께 여는 작업공간 파일입니다.
- `docs/adr/0001-use-workspace-as-polyrepo-helper.md`: workspace repo의 역할 결정을 기록합니다.
- `docs/onboarding/quickstart.md`: 신규 참여자를 위한 첫 실행 흐름입니다.
- `docs/architecture/repo-boundaries.md`: repo별 책임 경계입니다.
- `docs/trouble/README.md`: 진행 중 발생한 문제와 장애의 인덱스와 파일별 기록 템플릿입니다.
- `docs/projects_plan/README.md`: 프로젝트 계획, workplan, 참고 문서의 읽는 순서와 폴더 역할입니다.

## 실행 환경

VS Code에서는 `medikong.code-workspace`가 Windows 기본 터미널을 Git Bash로 요청합니다. 설치 후 Git Bash에서 `task --list`로 workspace 명령을 확인합니다.

## 비목표

이번 MVP는 빠른 구성, 상태 확인, 공통 문서 기준점에 집중합니다.

- workspace는 monorepo가 아니며 repo 내부에 다른 repo를 중첩 clone하지 않습니다.
- workspace는 브랜치, worktree, commit, push 전략을 강제하지 않습니다.
- workspace는 update 명령, worktree 관리, 로컬 배포 사이클, Ansible, Terraform, AWS 자동 실행을 포함하지 않습니다.
- 각 repo의 상세 개발/배포 명령은 해당 repo의 README와 문서를 기준으로 합니다.

## 참고

이 repo는 Medikong repo 분리 결정의 보조 진입점입니다. `service`는 애플리케이션 코드와 테스트, `gitops`는 Kubernetes/GitOps 배포 선언, `infra`는 클러스터와 클라우드 자원 구성을 담당합니다.
