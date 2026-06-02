# Issue and PR Templates

이 폴더는 GitHub Issue, Project workplan, Pull Request 작성 기준을 한곳에서 관리하는 템플릿 저장소다.

## 템플릿 목록

- `linear-workplan.schema.json`: 로컬 workplan YAML 검증 스키마
- `pull-request.md`: PR 본문 작성 기준과 한국어 템플릿

## 사용 원칙

- GitHub Issue 발행 전에는 `docs/issues/README.md`의 이슈 작성 기준을 먼저 따른다.
- PR 작성 전에는 `pull-request.md`를 기준으로 변경 범위, 운영 영향, 검증, 롤백을 정리한다.
- repo별 자동 템플릿이 필요해지면 이 폴더의 문서를 기준으로 각 repo의 `.github` 템플릿을 파생한다.
- 템플릿 원본은 이 폴더에 두고, repo별 `.github` 템플릿은 자동 입력을 위한 얇은 복사본으로만 둔다.
