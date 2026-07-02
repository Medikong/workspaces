# 도메인 선정 및 MSA 서비스 분리 추천 (상세판 v2)
> 평가표 (1) 도메인·아키텍처 정립 — 세부과제 1: MSA 경계 정의
> 작성일: 2026-07-02
> 세 도메인 후보를 동일한 틀(선정근거 → 분리안 → 분리이유 → 통신방식)로 비교

---

# 도메인 A. 한정판/타임세일 e커머스

## A-1. 선정 근거

콘서트 티켓팅(티켓몽) 구조를 그대로 대응:

| 티켓몽 개념 | 한정판 커머스 개념 |
|---|---|
| 콘서트 (concert) | 드롭 상품 (product drop) |
| 회차 (showtime) | 판매 세션 (sale session) |
| 좌석 (seat, A1~A10) | 재고 단위 (SKU stock) |
| 좌석 상태 HELD→ISSUING→TICKETED | 주문 상태 HELD→PAID→CONFIRMED |
| 예약(reservation-service) | 주문(order-service) |

즉시 재고 소진형 — 오픈 순간 트래픽이 몰리고, 재고가 초 단위로 줄어듦. 페인포인트 #1(트래픽 폭증)·#2(재고 동시성)과 직결.

## A-2. 서비스 분리안 (4개 + 선택 1개)

### catalog — 상품 카탈로그 서비스
**책임**: 드롭 상품의 정적 정보(이름·이미지·브랜드·카테고리·설명), 드롭 일정, 가격
**주요 API**: `GET /products`, `GET /drops/upcoming`
**데이터 특성**: 읽기 위주, 변경 빈도 낮음 → 캐싱 적극 활용
**재활용도**: 신규 구축. concert-service의 "콘서트 등록/조회" 구조만 참고

### inventory — 재고 서비스 ⭐ 핵심 차별화
**책임**: SKU별 실시간 재고 수량, 재고 HOLD·RELEASE·CONFIRM, 오버셀 방지
**주요 API**: `POST /inventory/{sku}/hold`, `POST /inventory/{sku}/confirm`
**데이터 특성**: 쓰기 위주, 드롭 시작 순간 트래픽 폭증
**재활용도**: ⭐ reservation-service의 좌석 HELD 상태 관리(동시 예약 방지 락 전략) 그대로 재활용

### order — 주문 서비스
**책임**: 상태기계 `CREATED→HELD→PAID→CONFIRMED`/`CANCELLED`, inventory·payment 오케스트레이션
**주요 API**: `POST /orders`, `PATCH /orders/{id}/cancel`
**재활용도**: ⭐ reservation-service의 HELD→ISSUING→TICKETED 전이 로직을 그대로 매핑

### payment — 결제 서비스
**책임**: 결제 처리, PG사 연동, 환불
**주요 API**: `POST /payments`, `POST /payments/{id}/refund`
**재활용도**: ⭐⭐ payment-service 그대로 재활용

### notification (선택) — 알림 서비스
**책임**: Kafka 이벤트(`order.created`, `payment.completed`) 구독 후 푸시/이메일 발송
**재활용도**: 신규 구축이나 로직 단순, Kafka 인프라 재활용

## A-3. 분리 이유
- **catalog/inventory**: 변경 주기가 다름(상품정보 vs 초단위 재고), inventory는 락 전략이 별도로 필요
- **order/payment**: PG사 외부 의존 → 장애 격리 필요 (Shopify Redismageddon 교훈)

## A-4. 통신 방식
| 흐름 | 방식 | 이유 |
|---|---|---|
| order → inventory | 동기 REST | 오버셀 방지, 즉시 확인 필요 |
| order → payment | 동기 REST | 결제 성공 여부로 주문 확정 분기 |
| order → notification | 비동기(Kafka) | 지연 허용 |
| inventory → catalog | 비동기(Kafka) | 최종 일관성으로 충분 |

---

# 도메인 B. 예약구매 (Pre-order 커머스)

## B-1. 선정 근거

한정판이 "지금 있는 재고를 즉시 채가는" 구조라면, 예약구매는 **"아직 없는 상품을 미리 결제·예약하고, 나중에 배송받는"** 구조 (게임 사전예약, 화장품 프리런칭, 가전 사전판매 등). 사실상 **티켓몽과 가장 1:1로 가까운 도메인**:

| 티켓몽 개념 | 예약구매 개념 |
|---|---|
| 콘서트 (공연 이벤트) | 상품 출시 이벤트 |
| 회차(showtime) | 예약 배치(batch, 수량 한정) |
| 좌석 예약 | 예약 슬롯 확보 |
| 티켓 발권(TICKETED) | 출고 완료(SHIPPED) |

한정판과 다른 점은 **결제 시점 분리**(예약금만 먼저 받고 잔금은 출고 전 결제) 와 **출고 대기 상태 관리**가 추가로 필요하다는 것. 재활용률은 도메인 A와 동급으로 높으면서, "예약 후 대기"라는 상태 관리가 하나 더 늘어나 조금 더 볼륨 있는 프로젝트가 됨.

## B-2. 서비스 분리안 (4개 + 선택 1개)

### catalog — 예약상품 카탈로그
**책임**: 사전예약 상품 정보, 예약 오픈일, 출시 예정일, 수량 한도
**주요 API**: `GET /preorder-products`, `GET /preorder-products/{id}`
**재활용도**: 신규 구축, concert-service 구조 참고

### reservation — 예약 서비스 ⭐ 핵심 차별화
**책임**: 예약 슬롯 확보(HOLD), 예약 확정, 예약 취소, 수량 동시성 제어
**주요 API**: `POST /reservations`, `PATCH /reservations/{id}/confirm`, `PATCH /reservations/{id}/cancel`
**데이터 특성**: 예약 오픈 순간 트래픽 집중 — inventory 역할까지 겸함
**재활용도**: ⭐⭐ reservation-service 명칭·구조·상태기계까지 이름 그대로 대응 가능 (가장 재활용도가 높은 서비스)

### payment — 분할 결제 서비스
**책임**: 예약금 결제 → 잔금 결제(출고 전) → 전체 결제 완료 처리, 예약 취소 시 환불
**주요 API**: `POST /payments/deposit`, `POST /payments/balance`, `POST /payments/{id}/refund`
**데이터 특성**: 결제가 2단계로 분리되는 것이 한정판 도메인과의 핵심 차이
**재활용도**: ⭐ payment-service 재활용하되 분할결제 로직 추가 개발 필요

### fulfillment — 출고/배송 서비스
**책임**: 상품 준비 완료 후 출고 처리, 배송 상태 추적
**주요 API**: `POST /fulfillments`, `PATCH /fulfillments/{id}/ship`
**데이터 특성**: 예약구매 도메인에만 있는 신규 개념(한정판은 즉시배송이라 이 서비스가 상대적으로 단순)
**재활용도**: 낮음, 신규 구축이나 로직 단순

### notification (선택) — 알림 서비스
**책임**: 예약 확정, 잔금 결제 안내, 출고 알림
**재활용도**: 도메인 A와 동일

## B-3. 분리 이유
- **reservation을 catalog에서 분리**: 티켓몽과 동일 — 상태 변경 빈도·동시성 요구가 완전히 다름
- **payment를 2단계로 분리 설계**: 예약금과 잔금은 시점이 달라 각각 다른 실패 시나리오(예약금 결제 실패 vs 잔금 결제 실패 시 재고 처리)를 가짐 → 하나의 결제 흐름으로 뭉치면 상태 분기가 복잡해짐
- **fulfillment를 order/reservation과 분리**: 출고는 생산·입고 일정이라는 외부 변수에 의존 — reservation의 동시성 이슈와 무관한 관심사

## B-4. 통신 방식
| 흐름 | 방식 | 이유 |
|---|---|---|
| reservation → payment(예약금) | 동기 REST | 예약금 결제 실패 시 슬롯 즉시 반환 필요 |
| fulfillment → payment(잔금) | 동기 REST | 잔금 미결제 시 출고 보류해야 함 |
| reservation → notification | 비동기(Kafka) | 지연 허용 |
| fulfillment → notification | 비동기(Kafka) | 출고 알림은 실시간성 불필요 |

---

# 도메인 C. 공동구매 (그룹바이 커머스)

## C-1. 선정 근거

한정판·예약구매와 다른 종류의 동시성 문제를 다루는 도메인 — **"목표 인원이 모여야 주문이 성사되는"** 구조 (예: 목표 100명 도달 시 전체 주문 확정, 미달 시 전원 자동환불). 재고 동시성이 아니라 **참여자 수(쿼럼) 동시성**이라는 점에서 티켓몽과는 다른 각도의 기술 도전.

재활용 관점에서는 A·B보다는 낮지만, reservation-service의 "임시 확보(HOLD) 후 확정/취소" 상태기계 설계 철학은 그대로 응용 가능 — 좌석 1석 확보 대신 참여자 1명 확보로 치환하면 구조가 유사함.

## C-2. 서비스 분리안 (4개 + 선택 1개)

### campaign — 공동구매 캠페인 서비스
**책임**: 캠페인 정보(목표 인원, 마감 시각, 상품 정보), 캠페인 상태(모집중/성사/실패)
**주요 API**: `GET /campaigns`, `GET /campaigns/{id}`, `PATCH /campaigns/{id}/close`
**재활용도**: 신규 구축, concert-service 구조 일부 참고

### participation — 참여 서비스 ⭐ 핵심 차별화
**책임**: 참여자 등록, 목표 인원 도달 여부 실시간 카운팅, 동시 참여 시 카운터 동시성 제어
**주요 API**: `POST /campaigns/{id}/participate`, `GET /campaigns/{id}/participants/count`
**데이터 특성**: 마감 임박 시 참여 요청 폭주 — 카운터 증가 연산의 동시성 제어가 핵심
**재활용도**: ⭐ reservation-service의 "동시 확보 후 카운트 관리" 락 전략을 참여자 카운터에 응용 (좌석 대신 참여자 슬롯)

### payment — 조건부 결제 서비스
**책임**: 참여 시점 결제(선결제) 또는 캠페인 성사 후 결제(후결제) 처리, 캠페인 실패 시 자동 전액환불
**주요 API**: `POST /payments/hold`, `POST /payments/{id}/capture`, `POST /payments/batch-refund`
**데이터 특성**: 대량 자동환불(batch refund)이라는 독특한 실패 시나리오 존재
**재활용도**: ⭐ payment-service 재활용하되 보류결제(hold→capture) 및 배치환불 로직 추가

### settlement — 정산/배송 서비스
**책임**: 캠페인 성사 시 판매자 정산, 구매자 배송 처리
**주요 API**: `POST /settlements`, `PATCH /settlements/{id}/ship`
**재활용도**: 낮음, 신규 구축

### notification (선택) — 알림 서비스
**책임**: 목표 인원 임박 알림("3명만 더 모이면 성사!"), 캠페인 성사/실패 알림
**재활용도**: 도메인 A·B와 동일하나 실시간성 요구가 조금 더 높음(카운트다운 성격)

## C-3. 분리 이유
- **campaign/participation 분리**: campaign은 정적 설정 정보, participation은 초당 변경되는 카운터 — 변경 주기 기준 분리
- **payment의 hold→capture 분리**: 캠페인 성사 여부가 결정되기 전까지 결제를 확정할 수 없는 조건부 트랜잭션 특성 때문에 별도 상태 관리 필요
- **settlement를 participation과 분리**: 정산은 캠페인 마감 이후 일괄 처리되는 배치성 작업 — 실시간 참여 카운팅과 트래픽 패턴이 완전히 다름

## C-4. 통신 방식
| 흐름 | 방식 | 이유 |
|---|---|---|
| participation → payment(hold) | 동기 REST | 결제 수단 유효성은 참여 시점에 즉시 확인 필요 |
| campaign → payment(batch capture/refund) | 비동기(Kafka) | 마감 시점 일괄 처리, 실시간 응답 불필요 |
| participation → campaign(카운트 갱신) | 동기 REST 또는 원자적 카운터 | 목표 도달 여부 오차 없이 즉시 반영 필요 |
| campaign → settlement | 비동기(Kafka) | 정산은 배치 처리로 충분 |

---

# 비교 요약

| 항목 | A. 한정판 커머스 | B. 예약구매 | C. 공동구매 |
|---|---|---|---|
| 핵심 기술 과제 | 재고 동시성, 트래픽 폭증 | 예약 동시성, 분할 결제 | 참여자 카운터 동시성, 조건부 결제 |
| 티켓몽 자산 재활용률 | 높음 | ⭐ 가장 높음 (거의 1:1 대응) | 중간 (구조 응용, 로직은 신규) |
| 신규 개념 | 거의 없음 | 잔금 결제, 출고 대기 | 쿼럼 판정, 배치 환불 |
| 페인포인트 서사 연결 | 매우 강함 (#1, #2) | 강함 (#2 중심) | 중간 (새로운 페인포인트 정의 필요) |
| 난이도/리스크 | 낮음 | 낮음~중간 | 중간 (조건부 트랜잭션 설계 필요) |

**추천 우선순위**: **B(예약구매) > A(한정판 커머스) > C(공동구매)**

B는 티켓몽과 구조가 가장 가까워 재활용률이 최고치이면서도, 분할결제·출고관리라는 신규 요소가 하나씩 더해져 "그대로 베낀 프로젝트"처럼 보이지 않을 정도의 차별화가 확보됨. 일정이 매우 빠듯하면 A, 조금 더 도전적인 과제(조건부 트랜잭션)를 원하면 C.
