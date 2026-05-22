# ADR 0001: workspace를 polyrepo 보조 진입점으로 사용한다

## 상태

Accepted

## 날짜

2026-05-22

## 배경

Medikong은 책임별 repo로 분리한다.

| Repo | 책임 |
| --- | --- |
| `service` | FastAPI 서비스 코드, dashboard, 테스트, Docker image build 정의 |
| `gitops` | Kubernetes base/overlay, Helm/Kustomize 배포 선언, Argo CD Application, 배포 runbook |
| `infra` | Terraform, AWS 네트워크/IAM/ECR, Ansible, 클러스터 구성 |
| `workspace` | 여러 repo를 한 작업공간으로 받기 위한 manifest, bootstrap, status, 공통 문서 기준점 |

repo를 분리하면 리뷰 관점과 권한 경계가 선명해진다. 반대로 신규 사용자는 여러 repo를 어떤 위치에 clone해야 하는지, 현재 준비 상태가 어떤지 빠르게 확인하기 어렵다.

## 결정

`workspace` repo는 monorepo 대체물이 아니라 polyrepo 보조 진입점으로 둔다.

- `medikong/`은 작업공간 루트이며 git repo가 아니다.
- `workspace/`, `service/`, `gitops/`, `infra/`는 `medikong/` 아래 형제 폴더다.
- repo 목록은 사람이 읽기 쉬운 env 형식의 `repos.env`에 둔다.
- 실제 로직은 WSL/macOS/Linux에서 바로 실행 가능한 Bash CLI인 `scripts/workspace.sh`에 둔다.
- Makefile은 `scripts/workspace.sh`를 호출하는 얇은 진입점만 제공한다.
- Windows는 WSL 사용을 기본 경로로 보고 Windows native shell은 별도 지원하지 않는다.
- 신규 사용자는 `workspace`만 clone한 뒤 `help`, `bootstrap`, `status`, `list`, `doctor`로 작업공간을 준비한다.

## 포함 범위

이번 MVP는 다음 기능만 제공한다.

- `help`: 사용 가능한 workspace 명령 출력
- `list`: manifest 기준 repo 목록 출력
- `doctor`: Git, Bash, env manifest, workspace root, path 충돌 검사
- `bootstrap`: 없는 repo만 형제 폴더로 clone하고 기존 폴더는 보존
- `status`: repo 존재 여부, 현재 branch, dirty 여부, origin remote 불일치 출력

## 제외 범위

다음 기능은 이번 MVP에 넣지 않는다.

- repo update/pull 자동화
- git worktree 생성 또는 브랜치 전략 강제
- commit/push/release 흐름 강제
- 로컬 Kubernetes 배포 사이클 자동화
- Ansible, Terraform, AWS 자원 실행
- service/gitops/infra 내부 명령의 대체 구현

## 결과

좋아지는 점:

- 신규 사용자는 workspace repo만 clone해도 전체 작업공간의 기준 위치를 알 수 있다.
- repo 목록과 원격 주소가 `repos.env`에 모인다.
- Node/npm 설치 없이 WSL/macOS/Linux 기본 도구로 실행할 수 있다.
- bootstrap은 기존 폴더를 덮어쓰지 않아 로컬 작업을 보존한다.
- 공통 ADR, 온보딩, repo 경계 문서를 workspace에 둘 수 있다.

비용:

- 각 repo의 실제 개발 명령은 여전히 repo별 문서를 따라야 한다.
- 여러 repo를 함께 변경하는 작업은 사람이 변경 순서와 PR 전략을 판단해야 한다.
- workspace가 자동화 범위를 넓히면 repo 책임 경계가 흐려질 수 있으므로 MVP 범위를 작게 유지해야 한다.
