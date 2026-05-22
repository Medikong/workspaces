# Medikong workspace quickstart

이 문서는 Medikong 작업공간을 처음 준비하는 사용자를 위한 최소 절차입니다.

## 1. workspace clone

```bash
mkdir medikong
cd medikong
git clone https://github.com/Medikong/workspace.git workspace
cd workspace
```

## 2. 명령 확인

```bash
make help
```

workspace는 macOS, Linux, Windows WSL을 기준으로 동작합니다. Windows native shell을 별도로 지원하지 않으므로 Node/npm 의존성은 두지 않습니다.

## 3. manifest 확인

```bash
make list
```

`list`는 `repos.env`에 정의된 `service`, `gitops`, `infra` repo와 clone 대상 경로를 보여줍니다. 대상 경로는 `workspace/` 내부가 아니라 `../service`, `../gitops`, `../infra`입니다.

## 4. 환경 검사

```bash
make doctor
```

`doctor`는 Git, Bash, manifest, workspace root, path 충돌을 확인합니다. 로컬 배포, 클라우드 권한, Terraform 상태는 검사하지 않습니다.

## 5. repo 구성

```bash
make bootstrap
```

`bootstrap`은 없는 repo만 clone합니다. 이미 `../service`, `../gitops`, `../infra` 폴더가 있으면 덮어쓰지 않고 건너뜁니다.

## 6. 상태 확인

```bash
make status
```

`status`는 각 repo가 존재하는지, 현재 branch가 무엇인지, dirty 상태인지, origin remote가 manifest와 맞는지 간단히 보여줍니다.

## 7. VS Code 열기

```bash
code medikong.code-workspace
```

`medikong.code-workspace`는 `workspace`, `service`, `gitops`, `infra`를 한 VS Code 창에서 함께 열도록 구성되어 있습니다.

## 다음 단계

각 repo에서 실제 작업을 시작할 때는 해당 repo 문서를 기준으로 합니다.

- `service`: 애플리케이션 코드, 테스트, 이미지 빌드
- `gitops`: Kubernetes/GitOps 배포 선언과 runbook
- `infra`: 클러스터, 클라우드, IAM, 네트워크 구성

workspace는 이 repo들을 준비하고 상태를 확인하는 보조 도구입니다. 브랜치, worktree, commit, push 전략은 각 작업 맥락에서 별도로 결정합니다.
