# Meetings

이 폴더는 Medikong 회의에서 확정된 결정, 역할, 액션 아이템을 repo에서 추적하기 위한 공간이다.

Notion은 회의 중 실시간 메모와 공유에 사용하고, 이 폴더는 결정된 내용과 후속 작업을 남기는 기준 기록으로 사용한다.

## 파일 구성

| 경로 | 용도 |
| --- | --- |
| `README.md` | 회의록 인덱스와 작성 기준 |
| `templates/meeting.md` | 새 회의록 문서 템플릿 |
| `YYYY-MM-DD-short-topic.md` | 개별 회의록 |

## 회의록 인덱스

| ID | 날짜 | 주제 | 파일 |
| --- | --- | --- | --- |
| MEETING-2026-05-27-001 | 2026-05-27 | 오전 결정 사항 | `2026-05-27-morning-decisions.md` |
| MEETING-2026-05-29-001 | 2026-05-29 | 데일리 미팅 | `2026-05-29-daily-meeting.md` |
| MEETING-2026-06-01-001 | 2026-06-01 | 데일리 미팅 | `2026-06-01-daily-meeting.md` |
| MEETING-2026-06-02-001 | 2026-06-02 | AWS 인프라 질문 | `2026-06-02-aws-infra-questions.md` |
| MEETING-2026-06-02-002 | 2026-06-02 | 데일리 미팅 | `2026-06-02-daily-meeting.md` |
| MEETING-2026-06-04-001 | 2026-06-04 | 데일리 미팅 | `2026-06-04-daily-meeting.md` |
| MEETING-2026-06-08-001 | 2026-06-08 | 데일리 미팅 | `2026-06-08-daily-meeting.md` |
| MEETING-2026-06-15-001 | 2026-06-15 | 데일리 미팅 | `2026-06-15-daily-meeting.md` |
| MEETING-2026-07-20-001 | 2026-07-20 | 관측성, 서비스 간 보안 및 배포 환경 정비 | `2026-07-20-daily-meeting.md` |

## Frontmatter

모든 회의록 문서는 YAML frontmatter로 검색과 정렬에 필요한 값을 먼저 기록한다.

```yaml
---
id: MEETING-YYYY-MM-DD-001
title: ""
date: YYYY-MM-DD
type: meeting
status: recorded
areas: []
repos: []
attendees: []
related: []
links: []
---
```

## 필드 규칙

| 필드 | 값 |
| --- | --- |
| `id` | `MEETING-2026-05-27-001`처럼 날짜와 순번을 함께 쓴다. |
| `title` | 회의 주제를 짧게 쓴다. |
| `date` | 회의 날짜를 `YYYY-MM-DD`로 쓴다. |
| `type` | `meeting`, `decision`, `planning`, `review`, `retro` 중 하나를 기본으로 쓴다. |
| `status` | `draft`, `recorded`, `superseded` 중 하나를 쓴다. |
| `areas` | 문서, 로컬 개발, 인프라, 서비스처럼 회의가 다룬 영역을 쓴다. |
| `repos` | 관련 repo를 쓴다. 예: `workspace`, `service`, `gitops`, `infra` |
| `attendees` | 참석자 이름을 쓴다. |
| `related` | 관련 ADR, 트러블, workplan, 회의록 경로를 쓴다. |
| `links` | Notion, GitHub issue, PR, 외부 자료 링크를 쓴다. |

## 작성 기준

- 결정 사항은 회의록에 남기고, 구조적 결정은 `docs/adr/`에 별도 반영한다.
- 추적해야 할 문제나 장애, 운영 리스크는 `docs/trouble/`에 별도 트러블로 남긴다.
- 일정, 범위, 검증 시나리오 변경은 `docs/projects_plan/` 문서나 workplan에 반영한다.
- 개인별 조사 자료는 `docs/members/` 아래 담당 영역 문서에 정리한다.
- 회의록은 삭제하지 않고, 후속 변경이 있으면 새 회의록이나 연결 문서로 추적한다.

## 작성 순서

1. `templates/meeting.md`를 복사해 `YYYY-MM-DD-short-topic.md` 파일을 만든다.
2. frontmatter의 `id`, `title`, `date`, `type`, `areas`, `repos`, `attendees`를 채운다.
3. 본문에 목적, 결정 사항, 액션 아이템, 논의 메모, 후속 정리 필요 항목을 남긴다.
4. `README.md`의 회의록 인덱스 표에 새 파일을 추가한다.
5. 구조적 결정, 트러블, 일정 변경은 각각 `docs/adr/`, `docs/trouble/`, `docs/projects_plan/`에 연결한다.
