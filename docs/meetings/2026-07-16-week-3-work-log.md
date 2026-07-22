---
id: MEETING-2026-07-16-002
title: "3주차 주간 작업일지"
date: 2026-07-16
type: review
status: recorded
areas:
  - planning
  - service
  - ci-cd
  - gitops
  - infrastructure
  - observability
  - testing
repos:
  - workspace
  - service
  - gitops
  - infra
attendees:
  - 김정엽
  - 최범휘
  - 박명수
related:
  - docs/meetings/2026-07-13-daily-meeting.md
  - docs/meetings/2026-07-16-daily-meeting.md
links: []
---

# 3주차 주간 작업일지

## 기록 기준

- 기록 기간: 2026-07-13 ~ 2026-07-16
- 분석 저장소: `workspaces`, `service`, `gitops`, `infra`
- 분석 범위: 전체 로컬 및 원격 브랜치의 비병합 커밋
- 작성자 연결: `jyupk`는 김정엽, `homveloper`는 최범휘, `appsam`은 박명수로 구분
- 집계 제외: 병합 커밋과 아직 커밋하지 않은 작업 트리 변경
- 근거 구분: 커밋으로 확인한 내용은 대표 커밋을 표시하고, 커밋에서 직접 확인되지 않은 내용은 회의 공유로 표시

## 커밋 집계

| 담당 | 작성자 | service | gitops | infra | workspaces | 합계 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 김정엽 | `jyupk` | 2 | 0 | 3 | 0 | 5 |
| 최범휘 | `homveloper` | 14 | 6 | 10 | 0 | 30 |
| 박명수 | `appsam` | 59 | 0 | 0 | 0 | 59 |
| 합계 |  | 75 | 6 | 13 | 0 | 94 |

## 금주 프로젝트 수행 내용

### 김정엽

- 프로젝트 이해 및 서비스 개발을 위한 청사진 작성 `[회의 공유]`
- 찜 추가, 삭제 및 목록 조회 API 구현 `[service: 7b7a4c4]`
- 대기 랭킹, 인기 랭킹 및 조회 이벤트 처리 구현 `[service: 451531a]`
- 랭킹 집계용 저장소, 메시징 및 워커 테스트 추가 `[service: 451531a]`
- Terminal Lab을 활용한 CI/CD 구축 시도 `[회의 공유]`
- 프라이빗 개발 환경의 시크릿 네임스페이스 정비 `[infra: 8f81bb3]`
- SSH 설정 작업의 셸 호환성 문제 수정 `[infra: 448a53c]`
- Argo CD 루트 애플리케이션 주소 및 Calico VXLAN 구성 수정 `[infra: 2f13e5e]`

### 최범휘

- 인증, 사용자 및 대시보드 서비스 설계·구현 `[회의 공유]`
- 사용자 서비스의 OpenAPI 계약, PostgreSQL 마이그레이션, HTTP API 및 통합 테스트 구현 `[service: e73a306]`
- 사용자 도메인 구조와 공통 오류 처리 및 로깅 보강 `[service: 08e42a1, e49d707]`
- 인증 서비스를 도메인 소유 라우트 구조로 재구성하고 서버 연결 방식 정비 `[service: 7c52acb, 7a26604]`
- 인증 세션, 외부 인가, 메시지 전달 재시도 및 Kafka Outbox 실행 환경 구현 `[service: e061893]`
- PostgreSQL, Kafka 및 외부 의존성을 포함한 인증 E2E 시나리오 추가 `[service: 07572f0]`
- Go 및 Python Redis 클라이언트에 관측성 기능 추가 `[service: 76fc96a, b9dab91]`
- 판매자 포털의 분석 화면과 E2E 시나리오 개선 `[service: da7fae1]`
- AWS Terraform과 Kubernetes 프로비저닝 구조 재편 `[infra: 96d2014]`
- 태그 기반 AWS 개발 환경 배포와 GitHub Actions 워크플로 구축 `[infra: 953dacf]`
- AWS SSM, IAM, S3 및 Ansible 기반 프로비저닝 보완 `[infra: 803f936, 3d315ab, 5c39e27, 20eea39]`
- 핵심 서비스 데이터 저장소와 Helm 마이그레이션 및 관리 포트 구성 `[gitops: e4487a6, 97f192a]`
- Kong 신뢰 헤더 보호, 핵심 서비스 배포 및 텔레메트리 수집 구성 `[gitops: 8616727, f19cbb4, 9f376bf]`

### 박명수

- 구매 도메인의 주문, 결제, 재고, 환불 및 알림 생명주기 구현
- 구매 생명주기 이벤트 계약 정의 `[service: afbf544]`
- 주문, 결제, 카탈로그 및 알림 서비스의 PostgreSQL 마이그레이션 적용 `[service: 0fe510b, b5e82ff, 28b5dc0, 6646625]`
- 주문 서비스에 Transactional Outbox와 Inbox 적용 `[service: b77790b]`
- 결제 완료 이벤트의 내구성 및 Kafka 멱등성 보강 `[service: e2a9d61, 387b3da]`
- 재고를 예약 기준 정보로 사용하고 카탈로그 재고 프로젝션 연동 `[service: 6f63861, 9e5e5a1]`
- 멱등한 전액 환불, 출고 전 주문 취소 및 환불 처리 구현 `[service: 03ba440, 6d20b88]`
- 미결제 주문 만료와 지연 승인 보상 처리 구현 `[service: 40d54fe]`
- 구매 생명주기별 알림 결과 기록 `[service: 40c931f]`
- PostgreSQL 기반 오버셀 동시성 및 결제 실패 멱등성 테스트 구축 `[service: ee68f5f, 3147dae, 3a35578, b2fd84d]`
- Kafka 로그 상관관계 전파와 Loki 검증 환경 구축 `[service: 1b1c055, 0276cbc]`
- 알림 소비 결과 메트릭과 Kafka 지연 검증 시나리오 구축 `[service: 4164553, 7923597]`
- 구매 도메인 내부 회귀 테스트와 전체 생명주기 E2E 게이트 구축 `[service: 99e9210, 3fb4d44, ca7a4c0]`
- Windows에서도 실행할 수 있도록 E2E 실행 스크립트와 컨테이너 경로 처리 보완
- CloudNativePG 기반 PostgreSQL 3개 인스턴스 구성 `[회의 공유: 현재 분석 범위의 커밋에서는 직접 확인되지 않음]`

## 차주 프로젝트 수행 내용

### 김정엽

- 찜 및 랭킹 서비스의 API, 이벤트 및 데이터 저장소 통합 검증
- 주요 사용자 시나리오에 대한 E2E 테스트 추가
- Terminal Lab 기반 CI/CD 구축 보완
- 신규 서비스의 GitOps 연동, Helm 배포 및 롤백 검증
- 프라이빗 개발 환경의 Argo CD 및 네트워크 구성 안정화

### 최범휘

- 인증, 사용자 및 대시보드 서비스 간 연동 검증
- 인증 시나리오와 구매 및 결제 시나리오의 E2E 테스트 연동
- AWS 개발 환경의 Terraform 및 Ansible 배포 결과 검증
- 신규 서비스의 텔레메트리 수집 범위 확인
- 관측성 대시보드와 알림 규칙 변경

### 박명수

- 구매 도메인 전체 생명주기 E2E 테스트 안정화
- 주문 동시성, 결제 실패, 환불 및 알림 지연 시나리오 재검증
- CloudNativePG 3개 인스턴스의 복제 및 장애 전환 검증
- Istio 기반 JWT 인증·인가와 네트워크 정책 적용 범위 확인
- 서비스 장애 시나리오별 카오스 테스트 및 복구 결과 기록

## 대표 커밋 근거

### 김정엽

- `service/7b7a4c4`: 찜 추가, 삭제 및 목록 조회 API
- `service/451531a`: 대기 및 인기 랭킹과 조회 이벤트 처리
- `infra/8f81bb3`: 프라이빗 개발 환경 시크릿 네임스페이스 정비
- `infra/448a53c`: SSH 설정 작업 호환성 수정
- `infra/2f13e5e`: Argo CD 주소와 Calico VXLAN 구성 수정

### 최범휘

- `service/e73a306`: 사용자 서비스 구현
- `service/7c52acb`: 인증 서비스 도메인 구조 및 서버 연결 정비
- `service/e061893`: 인증 세션과 메시지 전달 실행 환경 구현
- `service/07572f0`: 의존 서비스를 포함한 인증 E2E 시나리오
- `gitops/e4487a6`: 핵심 서비스 데이터 저장소 구성
- `gitops/97f192a`: 서비스 마이그레이션과 관리 포트 지원
- `gitops/9f376bf`: 핵심 서비스 텔레메트리 수집
- `infra/96d2014`: Kubernetes 및 Terraform 프로비저닝 재편
- `infra/953dacf`: 태그 기반 AWS 개발 환경 배포
- `infra/803f936`: AWS SSM 기반 프로비저닝

### 박명수

- `service/b77790b`: 주문 Transactional Outbox와 Inbox
- `service/e2a9d61`: 결제 완료 이벤트 내구성
- `service/6f63861`: 재고 예약 기준 정보 적용
- `service/03ba440`: 멱등한 전액 환불
- `service/6d20b88`: 출고 전 취소 및 환불
- `service/40d54fe`: 미결제 주문 만료와 지연 승인 보상
- `service/ee68f5f`: PostgreSQL 오버셀 직렬화 검증
- `service/b2fd84d`: 결제 실패 멱등성 E2E 검증
- `service/0276cbc`: 구매 로그 상관관계 검증
- `service/7923597`: 알림 메트릭과 Kafka 지연 검증
- `service/ca7a4c0`: 구매 전체 생명주기 회귀 테스트 확장

## 확인 필요

- CloudNativePG 3개 인스턴스 구성의 실제 선언 파일 또는 커밋을 연결한다.
- 청사진과 Terminal Lab CI/CD 작업의 결과 문서 또는 커밋을 연결한다.
- 대시보드 서비스의 저장소 위치와 대표 커밋을 연결한다.
- 차주 작업 완료 후 실행 결과, 장애 대응 내용 및 후속 조치를 갱신한다.
