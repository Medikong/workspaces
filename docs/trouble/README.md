# Trouble

이 폴더는 Medikong 진행 중 발생한 문제와 장애를 파일 단위로 기록하는 공간이다. 런타임 장애, 배포 실패, repo 간 경계 충돌, 검증 실패, 운영 리스크처럼 원인 확인과 후속 조치가 필요한 트러블을 남긴다.

`workspace` repo의 역할에 맞게 이 폴더는 공통 인덱스와 기록 양식만 담당한다. 각 repo의 실제 수정, 배포, 테스트 실행은 `service`, `gitops`, `infra`의 책임 경계를 따른다.

## 파일 구성

| 경로 | 용도 |
| --- | --- |
| `README.md` | 트러블 인덱스, 작성 규칙, frontmatter 기준 |
| `templates/trouble.md` | 새 트러블 문서 템플릿 |
| `YYYY-MM-DD-short-title.md` | 개별 트러블 기록 파일 |
| `short-title/README.md` | 캡처, 로그, 산출물 등 asset이 필요한 트러블 기록 |
| `short-title/assets/` | 트러블 문서에서 참조하는 이미지, 로그, 보조 증거 |

## 종합 분석

| 문서 | 용도 |
| --- | --- |
| [2026-06-22-service-bottleneck-summary.md](../evidence/services/2026-06-22-service-bottleneck-summary.md) | 서비스별 CPU, memory, network I/O, DB/pool 병목과 capacity/HPA/journey 실험 개선 방향 종합 |

## 트러블 인덱스

| ID | 상태 | 우선순위 | 영역 | 제목 | 파일 |
| --- | --- | --- | --- | --- | --- |
| TROUBLE-001 | triaged | p1 | observability | aws-dev 관측성 배포 EBS StorageClass 부재 | [2026-06-04-aws-dev-observability-storageclass-pending.md](2026-06-04-aws-dev-observability-storageclass-pending.md) |
| TROUBLE-002 | open | p1 | deployment | 서비스 Pod 배포 후 DB 의존성 Pod 부재 | [2026-06-08-service-pods-without-database-dependencies.md](2026-06-08-service-pods-without-database-dependencies.md) |
| TROUBLE-003 | triaged | p2 | service | 서비스 이미지 publish 빌드 시간 증가 | [2026-06-08-service-image-build-time-regression.md](2026-06-08-service-image-build-time-regression.md) |
| TROUBLE-004 | resolved | p2 | observability | Synthetic 예약 충돌의 ERROR 로그 오분류 | [2026-06-11-synthetic-reservation-conflict-error-log.md](2026-06-11-synthetic-reservation-conflict-error-log.md) |
| TROUBLE-005 | in_progress | p1 | observability | payment outbox trace context 컬럼 마이그레이션 누락 | [2026-06-11-payment-outbox-trace-context-migration.md](2026-06-11-payment-outbox-trace-context-migration.md) |
| TROUBLE-006 | in_progress | p2 | observability | payment outbox DB 단독 trace의 작업 맥락 부재 | [2026-06-12-payment-outbox-db-only-trace.md](2026-06-12-payment-outbox-db-only-trace.md) |
| TROUBLE-007 | triaged | p2 | observability | Kafka producer trace 계측이 호출부에 흩어지는 문제 | [2026-06-12-kafka-producer-trace-wrapper.md](2026-06-12-kafka-producer-trace-wrapper.md) |
| TROUBLE-008 | closed | p1 | security | NetworkPolicy runtime test에서 connect-only 검증이 Istio sidecar Pod에서 허용처럼 보이는 문제 | [2026-06-17-networkpolicy-connect-only-false-positive.md](2026-06-17-networkpolicy-connect-only-false-positive.md) |
| TROUBLE-009 | resolved | p2 | observability | Grafana dashboard UID 길이 초과로 Load 50 미노출 | [2026-06-15-grafana-dashboard-uid-too-long.md](2026-06-15-grafana-dashboard-uid-too-long.md) |
| TROUBLE-010 | triaged | p2 | observability | 로컬 부하테스트 k6 Pod IP 단위 Kong rate limit | [2026-06-16-local-loadtest-kong-ip-rate-limit.md](2026-06-16-local-loadtest-kong-ip-rate-limit.md) |
| TROUBLE-011 | in_progress | p1 | observability | 부하테스트 중 auth login trace의 미계측 지연 구간 | [2026-06-16-auth-login-trace-latency-under-load.md](2026-06-16-auth-login-trace-latency-under-load.md) |
| TROUBLE-012 | triaged | p1 | service | 부하테스트 중 ticket-service /tickets/me 전체 목록 조회 과부하 | [2026-06-17-ticket-service-ticket-list-overload.md](2026-06-17-ticket-service-ticket-list-overload.md) |
| TROUBLE-013 | triaged | p1 | deployment | Rolling Update 중 ECR registry 403으로 서비스 이미지 pull이 반복 실패하는 문제 | [ecr-registry-403/README.md](ecr-registry-403/README.md) |
| TROUBLE-014 | triaged | p1 | deployment | arm64 노드에서 이미지 manifest 또는 태그 불일치로 pull이 실패하는 문제 | [image-multi-arch-pull-failure/README.md](image-multi-arch-pull-failure/README.md) |
| TROUBLE-015 | triaged | p1 | service | concert-service catalog API overfetch로 인한 예매 부하테스트 병목 | [2026-06-20-concert-service-catalog-api-overfetch.md](2026-06-20-concert-service-catalog-api-overfetch.md) |
| TROUBLE-016 | closed | p1 | service | notification-service 알림 목록 전체 materialize로 인한 heavy 사용자 응답 지연 | [2026-06-20-notification-list-full-materialization.md](2026-06-20-notification-list-full-materialization.md) |
| TROUBLE-017 | closed | p2 | service | payment-service 정산 기준 API의 중복 집계 쿼리와 인덱스 미스매치 | [2026-06-20-payment-service-settlement-query-aggregate-index.md](2026-06-20-payment-service-settlement-query-aggregate-index.md) |
| TROUBLE-018 | closed | p1 | service | FastAPI uvicorn worker 수 부족으로 capacity-baseline 병목이 발생한 문제 | [2026-06-21-fastapi-worker-execution-unit-mixed-bottleneck.md](2026-06-21-fastapi-worker-execution-unit-mixed-bottleneck.md) |
| TROUBLE-019 | open | p1 | service | HPA scale-out 후 DB connection budget 초과가 다시 병목이 된 문제 | [2026-06-21-hpa-scaleout-db-connection-budget.md](2026-06-21-hpa-scaleout-db-connection-budget.md) |

새 트러블을 추가하면 위 표에 한 줄을 추가한다. 해결된 기록도 삭제하지 않고 `status: closed`로 유지한다.

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

모든 트러블 문서는 YAML frontmatter로 검색과 정렬에 필요한 값을 먼저 기록한다.

```yaml
---
id: TROUBLE-000
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
| `id` | `TROUBLE-001`처럼 증가하는 고유 ID |
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
| `related` | 관련 트러블 ID, workplan ID, ADR 번호 |
| `links` | PR, Linear, GitHub issue, 로그, 캡처 등 외부 링크 |

## 작성 순서

1. `templates/trouble.md`를 복사해 `YYYY-MM-DD-short-title.md` 파일을 만든다.
2. frontmatter의 `id`, `title`, `created`, `updated`, `area`, `repos`를 채운다.
3. 본문에 현상, 영향, 가설, 조치 기록, 다음 액션을 남긴다.
4. `README.md`의 트러블 인덱스 표에 새 파일을 추가한다.
5. 해결 후 `status`, `updated`, `resolved`, `Resolution`을 갱신한다.

## 본문 기준

- `Context`: 트러블이 발견된 배경과 범위
- `Symptoms`: 관찰된 현상과 재현 조건
- `Impact`: 사용자, 개발, 배포, 보안, 일정에 미치는 영향
- `Investigation`: 확인한 로그, 명령, 문서, 가설
- `Decision`: 임시 판단 또는 확정된 처리 방향
- `Actions`: 완료한 조치와 남은 작업
- `Resolution`: 닫을 때 남기는 최종 결과와 재발 방지 메모
