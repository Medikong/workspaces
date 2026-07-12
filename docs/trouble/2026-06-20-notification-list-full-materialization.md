---
id: TROUBLE-016
title: "notification-service 알림 목록 전체 materialize로 인한 heavy 사용자 응답 지연"
status: closed
priority: p1
severity: high
area: service
repos:
  - service
  - workspace
owner: unassigned
created: 2026-06-20
updated: 2026-06-20
resolved: 2026-06-20
tags:
  - api-benchmark
  - notification-service
  - mongodb
  - pagination
  - cursor
  - index
  - serialization
related:
  - TROUBLE-012
  - service/services/notification-service/app/services/notification_service.py
  - service/services/notification-service/app/database.py
  - service/services/notification-service/tests/integration/test_api_benchmark.py
links:
  - ../evidence/services/api-integration-test-benchmark/half-year-early-growth/notification-service.md
---

# notification-service 알림 목록 전체 materialize로 인한 heavy 사용자 응답 지연

## Context

`notification-service`의 `GET /notifications`가 로그인 사용자의 알림 전체를 한 번에 반환하고 있었다.

`half-year-early-growth` benchmark에서는 normal 사용자가 약 `100`건, heavy 사용자가 약 `17,700`건의 알림을 가지고 있었다. 이 차이 때문에 heavy 사용자 목록 조회만 크게 느려졌다.

```text
db.notifications.find({user_id}).sort({_id: -1})
-> cursor 전체 순회
-> list[dict]로 전체 materialize
-> 전체 JSON 응답 반환
```

즉 문제는 DB 단건 조회 실패가 아니라, 목록 API가 page 없이 전체 알림함을 응답하는 API 설계였다.

## Symptoms

- 기존 heavy 사용자 목록 조회: p95 `192.112ms`, p99 `209.000ms`
- 기존 normal 사용자 목록 조회: p95 `5.442ms`, p99 `7.853ms`
- 기존 heavy query analysis: `returned=17,700`, `docsExamined=17,700`, `keysExamined=17,700`
- 단건 조회인 `get-notification`은 p99 `1.891ms` 수준이라 병목이 아니었다.

## Root Cause

`GET /notifications`가 pagination 없이 사용자 알림 전체를 materialize하고 JSON으로 직렬화했다.

인덱스가 없어서 생긴 문제는 아니었다. `(user_id, _id desc)` 인덱스가 있어도 API가 `limit`을 걸지 않으면 heavy 사용자의 모든 알림을 읽고 반환해야 한다.

## Fix

목록 API를 cursor 기반 pagination으로 바꿨다.

- 응답 구조: `{ items, page }`
- 기본 `limit`: `20`
- 최대 `limit`: `100`
- 조회 방식: `find({user_id}).sort({_id:-1}).limit(limit + 1)`
- 다음 page: `_id < cursor`
- 잘못된 cursor: HTTP `400`
- 앱 시작 시 보장하는 index:
  - `notifications(user_id, _id desc)`
  - `processed_events(event_id unique)`

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | `GET /notifications`를 cursor pagination으로 변경 | service | `service/services/notification-service/app/services/notification_service.py` |
| done | 목록 응답을 `{ items, page }` 구조로 변경 | service | `service/services/notification-service/app/schemas.py` |
| done | MongoDB index를 앱 시작 시 보장 | service | `service/services/notification-service/app/database.py` |
| done | 단위 테스트, benchmark, E2E polling을 새 응답 구조에 맞춤 | service | `service/services/notification-service/tests/test_notifications.py` |
| done | benchmark report와 evidence 문서 갱신 | workspace | `../evidence/services/api-integration-test-benchmark/half-year-early-growth/notification-service.md` |

## Result

개선 후 `half-year-early-growth` large benchmark 결과는 다음과 같다.

| endpoint | before p95 | before p99 | after p95 | after p99 |
| --- | ---: | ---: | ---: | ---: |
| `list-notifications-normal-first-page` | `5.442ms` | `7.853ms` | `2.941ms` | `6.177ms` |
| `list-notifications-heavy-first-page` | `192.112ms` | `209.000ms` | `2.340ms` | `2.684ms` |
| `get-notification` | `1.751ms` | `1.891ms` | `1.737ms` | `1.846ms` |

개선 후 query analysis는 normal/heavy 모두 첫 page에서 `returned=21`, `docsExamined=21`, `keysExamined=21`이다.

heavy 사용자가 약 `17,700`건의 알림을 가지고 있어도 첫 응답은 기본 `20`건만 반환한다. `hasMore` 판단을 위해 1건만 추가로 확인하므로 첫 page 비용은 전체 알림 수가 아니라 page size에 가깝다.

## Verification

| 명령 | 결과 |
| --- | --- |
| `cd service/services/notification-service && uv run --group test pytest -q tests/test_notifications.py` | `20 passed` |
| `cd service && task benchmark-api-large-service SERVICE=notification-service PRESET=half-year-early-growth SAMPLES=100` | passed |
| `cd service && task benchmark-api-smoke-service SERVICE=notification-service PRESET=smoke` | passed |
| `cd service && task benchmark-api-report SERVICE=notification-service` | report 갱신 |
| `cd service && task test-e2e SCENARIO=04-user-booking-happy-path` | passed |
| `git -C service diff --check` | passed |
| `git -C workspace diff --check` | passed |

## Follow-up

- type/sourceId 필터는 이번 해결 범위에는 넣지 않았다. 알림 검색이나 특정 이벤트 추적 요구가 생기면 별도 API 계약으로 검토한다.
- 오래된 client가 전체 배열 응답을 기대한다면 배포 전 API contract 변경 공지가 필요하다.

## Resolution

해결됨.

API 설계 문제였다. 알림 목록이 모든 데이터를 반환하던 것을 cursor pagination으로 바꿔 첫 page만 반환하도록 개선했다.
