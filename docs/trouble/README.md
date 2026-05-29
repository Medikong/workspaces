# Issues

이 폴더는 Medikong 진행 중 발견한 이슈를 파일 단위로 기록하는 공간이다. 런타임 장애, 설계 결정 대기, repo 간 경계 충돌, 검증 실패, 운영 리스크처럼 후속 추적이 필요한 내용을 남긴다.

`workspace` repo의 역할에 맞게 이 폴더는 공통 인덱스와 기록 양식만 담당한다. 각 repo의 실제 수정, 배포, 테스트 실행은 `service`, `gitops`, `infra`의 책임 경계를 따른다.

## 파일 구성

| 경로 | 용도 |
| --- | --- |
| `README.md` | 이슈 인덱스, 작성 규칙, frontmatter 기준 |
| `templates/issue.md` | 새 이슈 문서 템플릿 |
| `YYYY-MM-DD-short-title.md` | 개별 이슈 기록 파일 |

## 이슈 인덱스

| ID | 상태 | 우선순위 | 영역 | 제목 | 파일 |
| --- | --- | --- | --- | --- | --- |

새 이슈를 추가하면 위 표에 한 줄을 추가한다. 닫힌 이슈도 삭제하지 않고 `status: closed`로 유지한다.

## 파일 이름

파일 이름은 생성일과 짧은 영문 slug를 함께 쓴다.

```text
YYYY-MM-DD-short-title.md
```

예시:

```text
2026-05-27-kong-local-route-timeout.md
```

## Frontmatter

모든 이슈 문서는 YAML frontmatter로 검색과 정렬에 필요한 값을 먼저 기록한다.

```yaml
---
id: ISSUE-000
title: ""
status: open
priority: p2
severity: medium
area: workspace
repos:
  - workspace
owner: unassigned
created: YYYY-MM-DD
updated: YYYY-MM-DD
resolved: null
tags: []
related: []
links: []
---
```

## 필드 규칙

| 필드 | 값 |
| --- | --- |
| `id` | `ISSUE-001`처럼 증가하는 고유 ID |
| `status` | `open`, `triaged`, `in_progress`, `blocked`, `closed` |
| `priority` | `p0`, `p1`, `p2`, `p3` |
| `severity` | `critical`, `high`, `medium`, `low` |
| `area` | 대표 영역. 예: `workspace`, `service`, `gitops`, `infra`, `docs`, `security`, `observability` |
| `repos` | 관련 repo 목록. 예: `workspace`, `service`, `gitops`, `infra` |
| `owner` | 담당자 또는 `unassigned` |
| `created` | 최초 기록일 |
| `updated` | 마지막 갱신일 |
| `resolved` | 종료일. 미해결이면 `null` |
| `tags` | 검색용 보조 키워드 |
| `related` | 관련 이슈 ID, workplan ID, ADR 번호 |
| `links` | PR, Linear, GitHub issue, 로그, 캡처 등 외부 링크 |

## 작성 순서

1. `templates/issue.md`를 복사해 `YYYY-MM-DD-short-title.md` 파일을 만든다.
2. frontmatter의 `id`, `title`, `created`, `updated`, `area`, `repos`를 채운다.
3. 본문에 현상, 영향, 가설, 조치 기록, 다음 액션을 남긴다.
4. `README.md`의 이슈 인덱스 표에 새 파일을 추가한다.
5. 해결 후 `status`, `updated`, `resolved`, `Resolution`을 갱신한다.

## 본문 기준

- `Context`: 이슈가 발견된 배경과 범위
- `Symptoms`: 관찰된 현상과 재현 조건
- `Impact`: 사용자, 개발, 배포, 보안, 일정에 미치는 영향
- `Investigation`: 확인한 로그, 명령, 문서, 가설
- `Decision`: 임시 판단 또는 확정된 처리 방향
- `Actions`: 완료한 조치와 남은 작업
- `Resolution`: 닫을 때 남기는 최종 결과와 재발 방지 메모
