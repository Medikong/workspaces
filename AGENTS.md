# AGENTS.md

이 repo는 Medikong polyrepo의 보조 진입점이다. `workspace`는 monorepo가 아니며, `service`, `gitops`, `infra`를 내부에 포함하거나 대신 관리하지 않는다. 공통 문서, 온보딩, `repos.env`, `task help/list/doctor/bootstrap/status`, VS Code workspace 같은 빠른 작업공간 구성만 담당한다.

VS Code 기준 폴더 구조는 `medikong.code-workspace`를 따른다. `medikong/` 자체는 git repo가 아니며, Windows에서는 VS Code 기본 터미널을 Git Bash로 쓰는 것을 기준으로 한다.

- `medikong/workspace`: 현재 repo
- `medikong/service`: `../service`
- `medikong/gitops`: `../gitops`
- `medikong/infra`: `../infra`

# 이슈 관리

GitHub Issue나 Project 발행 후보를 다룰 때는 먼저 `docs/issues/README.md`를 읽고, 제목·발행 단위·repo 배치·본문 템플릿 기준을 따른다.
실제 등록 전에는 사용자와 제목, repo 배치, 발행 단위를 확인한다.

Pull Request를 작성할 때는 `docs/issues/template/pull-request.md`를 기준으로 변경 내용, 배경, 범위, 운영 영향, 배포 참고, 검증, 롤백, 리스크와 후속 작업, 관련 이슈를 정리한다.
repo별 `.github` PR 템플릿이 필요해지면 `docs/issues/template`의 원본 문서를 기준으로 파생하고, 원본 규칙은 이 폴더에서 일원화해 관리한다.

## docs 폴더 기준

`docs/`는 Medikong polyrepo 전체에서 공유할 문서 기준점을 둔다. 단, 실제 코드 수정, 배포 선언, 인프라 변경은 각 repo의 책임 경계를 따른다.

- `docs/adr`: 장기적으로 다시 참조해야 하는 구조적 의사결정을 남긴다. repo 경계, 검증 전략, 배포 구조, 운영 방식처럼 결정의 배경과 대안까지 보존해야 하는 요청이면 ADR로 정리하고 `docs/adr/README.md`의 인덱스와 템플릿 규칙을 따른다.
- `docs/meetings`: 회의에서 확정된 결정, 역할, 액션 아이템을 남긴다. Notion이나 대화 중 나온 실시간 메모를 repo에 남길 때는 회의록으로 정리하고, 구조적 결정은 `docs/adr/`, 추적할 트러블은 `docs/trouble/`, 일정과 범위 변경은 `docs/projects_plan/`에 연결한다.
- `docs/trouble`: 런타임 장애, 배포 실패, repo 간 경계 충돌, 검증 실패, 운영 리스크처럼 원인 확인과 후속 조치가 필요한 문제를 파일 단위로 기록한다. 실제 해결 작업은 관련 repo에서 진행하되, 공통 트러블 인덱스와 상태 기록은 이 폴더의 README와 템플릿을 기준으로 유지한다.
