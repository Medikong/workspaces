# Medikong repo boundaries

Medikong은 repo별 책임을 분리해 변경 속도, 리뷰 관점, 권한 범위를 명확히 한다.

## workspace

`workspace`는 polyrepo 보조 진입점이다.

- `repos.env`로 repo 목록과 clone 대상 위치를 관리한다.
- `help`, `bootstrap`, `status`, `list`, `doctor` 명령을 제공한다.
- 공통 ADR, 온보딩, repo 경계 문서의 기준점이다.
- 다른 repo를 `workspace/` 내부에 clone하지 않는다.
- 브랜치, worktree, commit, push, release 전략을 강제하지 않는다.

## service

`service`는 애플리케이션이 어떻게 동작하는지 관리한다.

- FastAPI 서비스 코드
- dashboard
- unit/E2E 테스트
- Dockerfile과 image build 정의
- 서비스 개발자 중심 README와 개발 명령

Kubernetes 배포 정책, Argo CD Application, Terraform, 클러스터 bootstrap은 `service`의 주 책임이 아니다.

## gitops

`gitops`는 애플리케이션이 어디에 어떤 선언으로 배포되는지 관리한다.

- Kubernetes base/overlay 또는 Helm values
- Argo CD Application
- image tag, replica, HPA/PDB, NetworkPolicy
- 배포/rollback runbook

Terraform, Ansible, Vagrant/kubeadm 같은 클러스터와 클라우드 자원 구성은 `infra` 책임이다.

## infra

`infra`는 클러스터와 클라우드 자원 자체를 관리한다.

- Terraform
- AWS 네트워크, IAM, ECR
- Ansible
- Vagrant/kubeadm 기반 클러스터 구성
- 운영 권한이 필요한 bootstrap 절차

애플리케이션 코드와 GitOps 배포 선언을 직접 소유하지 않는다.

## workspace가 하지 않는 일

workspace는 repo를 묶어 보는 입구이지 상위 orchestrator가 아니다.

- repo update를 자동으로 수행하지 않는다.
- worktree와 브랜치 전략을 만들지 않는다.
- commit/push를 대리 실행하지 않는다.
- 로컬 배포 사이클이나 AWS 실행을 자동화하지 않는다.

이 경계를 유지해야 workspace가 공통 문서와 빠른 구성 도구로 남고, 각 repo의 책임이 흐려지지 않는다.
