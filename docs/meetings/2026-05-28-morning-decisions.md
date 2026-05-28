---
id: MEETING-YYYY-MM-DD-001
title: ""
date: YYYY-MM-DD
type: meeting
status: draft
areas: []
repos:
  - workspace
attendees: []
related: []
links: []
---

# 2026-05-28 오전 회의록: 결정 사항 정리

## 목적

프로젝트 문서화 방식, 로컬 개발 도구 방향, 역할 분담, 당일 조사 항목을 정리한다.

## 결정 사항

1. 서비스 분배및 openapi

1 차 목표는  6개 서비스 auth-service
concert-service
reservation-service
payment-service
ticket-service
notification-service

서비스를 2개씩나눠서

auth-service, payment-service 명수
concert-service, reservation-service 범휘
ticket-service, notification-service 석진

openapi 스펙은  service 레포의 docs/openapi 폴더에다가 저장

2. 프론트앤드 개발 여부

- 프론트앤드 우선순위는 낮게 가져가고.  프로젝트 진행상황을 보고 나중에하기.
- 프론트엔드가 없어도  서비스를 토대로  newman, postman, curl로 api 테스트가 가능함.
-

3. 서비스 구현

- service 레포 폴더에 contracts 폴더 만들어서 openapi 스펙 저장
- openapi 스펙에 맞춰서 api 구현
- 1차 목표는 api 구현에 집중하고, api 구현이 끝나면

## 논의 메모

- 일단 CS 운영자는 나중에 필요하면 그 때 진행하자.

## 후속 정리 필요

다른 팀원들이 휴가 일정이 있음.   그래서 다음주까지 할수있고 독립적으로 가능한 굴직한 것부터

6월 3일은 휴일
박명수님이 6월 2일, 4일 오후 조퇴
이석진님이 5월 29일 ~ 6월1일 휴가

- 명수님이 서비스메시
- 범휘 테스트 자동화 시나리오
- 석진 AWS 사전준비
