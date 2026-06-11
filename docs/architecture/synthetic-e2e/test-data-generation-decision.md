# Synthetic 테스트 데이터 생성 결정

결정일: 2026-06-10

열린 질문:

```text
예약/결제 테스트 데이터는 고정 fixture로 둘지, 매번 생성 후 정리할지 결정해야 한다.
```

## 결정

고정할 데이터와 매번 생성할 데이터를 나눈다.

```text
고정
-> synthetic provider/customer 계정
-> synthetic venue
-> synthetic concert template

자동 fixture 준비
-> `task dev:synthetic` 또는 `task dev:synthetic:run` 실행 시 synthetic venue/concert/showtime/seats 준비

매 실행 생성 후 누적
-> reservation
-> payment
-> ticket
-> notification 업무 record

정리
-> 매 실행 cleanup 없음
-> 30일 지난 synthetic 업무 데이터만 별도 retention job에서 정리
```

좌석 선택은 synthetic 전용 API를 만들지 않고, k6가 사용자와 같은 공개 조회 API를 이용해 active showtime과 available seat를 조회한 뒤 분산 방식으로 선택한다.

## 범위

이 결정은 서비스 DB 안의 synthetic 테스트 데이터 생성과 정리만 다룬다.

포함:

- synthetic 계정
- venue
- concert
- showtime
- seat
- reservation
- payment
- ticket
- notification 업무 record

제외:

- audit log 보존
- domain event log 보존
- outbox 보존
- ELK log 보존
- trace 보존
- metric 보존

로그, audit, event, trace, metric의 보존 정책은 관측성 또는 감사 로그 아키텍처에서 다룬다.

## 데이터별 정책

| 데이터 | 정책 | 이유 |
|---|---|---|
| synthetic provider 계정 | 고정 | fixture 생성 주체 |
| synthetic customer 계정 | 고정 | 반복 journey의 사용자 |
| synthetic venue | 고정 | 매번 만들 필요 없음 |
| synthetic concert template | 고정 | synthetic 전용 공연 기준 |
| synthetic showtime | 주기적 생성 | 과거 회차 전환과 좌석 소진 방지 |
| synthetic seats | showtime 생성 시 넉넉하게 생성 | 반복 예약에 필요한 seat pool 확보 |
| reservation | 매 실행 생성, 30일 보존 | 실제 고객 행동 record 누적 |
| payment | 매 실행 생성, 30일 보존 | 결제 flow 검증 record 누적 |
| ticket | 매 실행 생성, 30일 보존 | 티켓 발급 flow 검증 record 누적 |
| notification 업무 record | 매 실행 생성, 30일 보존 | 최종 알림 flow 검증 record 누적 |

## Showtime 생성

고정 공연 template에 대해 synthetic showtime을 앞으로 일정 기간 유지한다.

권장 초기값:

```text
lookahead window: 14일
retention window: 30일
showtime cadence: 하루 1회 또는 하루 2회
seat count per showtime: 2,000-5,000
```

로컬 구현:

```text
task dev:synthetic
-> CronJob 배포
-> 내부 setup-fixture k6 Job 실행
-> provider/admin/customer login
-> venue/concert/showtime/seat-map/sale-policy/open schedule/sales start 준비

task dev:synthetic:run
-> 내부 setup-fixture k6 Job 실행
-> CronJob template에서 manual full journey Job 생성
```

showtime은 사용자가 조회할 수 있는 일반 공연 회차와 같은 API surface에 있어야 한다. synthetic runner만 쓰는 전용 target API는 만들지 않는다.

## Seat pool 크기

seat pool은 실행 주기와 lookahead window를 기준으로 계산한다.

```text
5분 주기
-> 하루 288회
-> 14일 약 4,032회

10분 주기
-> 하루 144회
-> 14일 약 2,016회
```

따라서 초기값은 다음처럼 둔다.

```text
배포 환경 10분 주기
-> showtime당 2,000석 이상

배포 환경 5분 주기
-> showtime당 5,000석 권장

local 1분 주기
-> local fixture 또는 짧은 보존 정책 별도 적용
```

수동 실행, 실패 재시도, 병렬 검증을 고려하면 최소 계산값보다 넉넉하게 잡는다.

## Seat 선택

좌석 선택은 k6에서 분산 방식으로 처리한다.

선택 흐름:

```text
1. synthetic concert 조회
2. active synthetic showtime 목록 조회
3. synthetic_run_id hash로 showtime index 선택
4. 선택한 showtime의 available seat 목록 조회
5. synthetic_run_id hash로 seat candidate 선택
6. 예약 실패 시 같은 showtime 안에서 다음 seat 후보로 제한적으로 retry
```

이 방식은 특정 showtime 또는 특정 좌석 앞쪽에 요청이 몰리는 문제를 줄인다.

하지 않는 방식:

```text
GET /synthetic/fixture/available-target
```

이런 synthetic 전용 API는 만들지 않는다. 사용자가 실제로 쓰지 않는 API이므로 synthetic E2E의 의미가 약해지고, 서비스에 테스트 전용 surface가 늘어난다.

## 매 실행 생성 데이터

full journey는 매 실행마다 새로운 업무 record를 만든다.

```text
1. customer login
2. synthetic concert/showtime 조회
3. available seat 분산 선택
4. reservation 생성
5. payment 승인
6. ticket 발급 확인
7. notification 확인
```

생성된 reservation, payment, ticket, notification 업무 record는 즉시 삭제하지 않는다. 실패 분석과 장시간 실행 결과 확인을 위해 일정 기간 남긴다.

## 30일 정리

매 실행 cleanup은 하지 않는다. 별도 retention job이 30일이 지난 synthetic 업무 데이터를 정리한다.

기본 조건:

```text
is_synthetic = true
created_at < now - 30d
```

정리 대상:

```text
reservation
payment
ticket
notification 업무 record
만료된 synthetic showtime
소진된 synthetic seat 상태
```

FK 관계가 있으면 삭제 순서를 서비스 DB 모델에 맞춘다.

예시:

```text
notification
-> ticket
-> payment
-> reservation
-> seat assignment / seat hold
-> showtime
```

물리 삭제가 위험하거나 도메인 모델이 soft delete를 전제로 하면 `archived`, `expired`, `deleted_at` 같은 상태 기반 정리로 둔다.

## Synthetic 구분

서비스 DB record는 synthetic 데이터임을 구분할 수 있어야 한다.

권장 필드:

```text
is_synthetic = true
synthetic_scenario = external-journey
synthetic_actor = customer
```

`synthetic_run_id`는 디버깅에는 유용하지만 cardinality가 높다. DB record나 structured log에는 남길 수 있으나 metric label에는 사용하지 않는다.

## 운영 기준

```text
회차/좌석 부족
-> fixture setup job 문제 또는 seat pool sizing 문제

예약 실패
-> seat 선택 충돌, reservation service 문제, fixture 상태 문제

결제 실패
-> payment service 또는 auth/JWT 권한 문제

티켓/알림 미발급
-> 비동기 consumer 또는 업무 flow 문제

30일 정리 실패
-> DB 정리 job 또는 FK/soft delete 정책 문제
```

## 최종 기준

```text
고정 fixture
-> 계정, venue, concert template

주기적 fixture
-> showtime, seats

매 실행 생성
-> reservation, payment, ticket, notification 업무 record

seat 선택
-> k6에서 공개 조회 API 기반으로 synthetic 제목의 공연을 찾고 분산 선택
-> synthetic 전용 target API는 만들지 않음

정리
-> 매 실행 cleanup 없음
-> 30일 지난 synthetic 업무 데이터만 별도 retention job에서 정리

보존 범위
-> 서비스 DB 업무 record만 다룸
-> audit/event/log/trace/metric 보존은 이 문서 범위 밖
```
