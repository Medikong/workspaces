# Coupon Service API 후보

작성일: 2026-07-06

## 이 문서가 답하는 질문

- 쿠폰 서비스가 제공해야 하는 API는 무엇인가?
- 운영자, 판매자, 사용자, 주문 서비스가 각각 어떤 API를 호출해야 하는가?
- 현재 `POST /coupons/issue` 하나로는 왜 부족한가?

## API 분류

| 분류 | 호출 주체 | 목적 |
| --- | --- | --- |
| Campaign API | `seller-service`, `backoffice-service` | 캠페인, 혜택, 적용 정책 생성과 활성화 |
| Code API | `backoffice-service`, `seller-service` | 리딤 코드 배치 생성, 다운로드, 폐기, 조회 |
| Claim API | 고객 앱/BFF | 선착순 수령, 코드 리딤, 내 쿠폰 조회 |
| Redemption API | `order-service` | 주문 쿠폰 사용 예약, 확정, 해제 |
| Internal Query API | 내부 서비스 | 정책 검증, 상태 조회, 운영 진단 |

## Campaign API

| Method | Path | 설명 | Idempotency |
| --- | --- | --- | --- |
| `POST` | `/internal/coupon-campaigns` | 캠페인 초안 생성 | 필요 |
| `PATCH` | `/internal/coupon-campaigns/{campaignId}` | 캠페인 기본 정보 수정 | 권장 |
| `PUT` | `/internal/coupon-campaigns/{campaignId}/benefit` | 혜택 정의 저장 | 권장 |
| `PUT` | `/internal/coupon-campaigns/{campaignId}/applicability-policy` | 상품/드롭/주문 적용 정책 저장 | 권장 |
| `PUT` | `/internal/coupon-campaigns/{campaignId}/limits` | 총량, 사용자별 제한, 기간 저장 | 권장 |
| `POST` | `/internal/coupon-campaigns/{campaignId}/schedule` | 예약 상태로 전환 | 필요 |
| `POST` | `/internal/coupon-campaigns/{campaignId}/activate` | 활성화 | 필요 |
| `POST` | `/internal/coupon-campaigns/{campaignId}/pause` | 일시 중단 | 필요 |
| `POST` | `/internal/coupon-campaigns/{campaignId}/end` | 종료 | 필요 |
| `GET` | `/internal/coupon-campaigns/{campaignId}` | 캠페인 상세 조회 | 불필요 |
| `GET` | `/internal/coupon-campaigns/{campaignId}/readiness` | 활성화 가능 여부 조회 | 불필요 |

### CreateCouponCampaignRequest 후보

```json
{
  "campaignId": "camp_20260706_launch",
  "name": "Launch Coupon",
  "description": "DropMong launch promotion",
  "createdByType": "seller",
  "createdByRef": "seller_123",
  "startsAt": "2026-07-10T00:00:00Z",
  "endsAt": "2026-07-17T00:00:00Z"
}
```

### ApplicabilityPolicyRequest 후보

```json
{
  "rules": [
    {
      "targetType": "drop",
      "targetRef": "drop_123",
      "conditionType": "include",
      "conditionValue": {}
    },
    {
      "targetType": "order",
      "conditionType": "minimum_order_amount",
      "conditionValue": {
        "amount": "50000",
        "currency": "KRW"
      }
    }
  ]
}
```

## Code API

| Method | Path | 설명 | Idempotency |
| --- | --- | --- | --- |
| `POST` | `/internal/coupon-campaigns/{campaignId}/code-batches` | 리딤 코드 배치 생성 | 필요 |
| `GET` | `/internal/coupon-code-batches/{batchId}` | 코드 배치 상태 조회 | 불필요 |
| `GET` | `/internal/coupon-code-batches/{batchId}/export` | 생성 직후 코드 다운로드 | 불필요, 권한 강함 |
| `POST` | `/internal/coupon-code-batches/{batchId}/void` | 배치 폐기 | 필요 |
| `GET` | `/internal/coupon-codes/{codeId}` | 코드 상태 운영 조회 | 불필요 |
| `POST` | `/internal/coupon-codes/{codeId}/void` | 개별 코드 폐기 | 필요 |

### CreateCouponCodeBatchRequest 후보

```json
{
  "quantity": 10000,
  "codeFormat": "human_readable",
  "distributionChannel": "seller_export"
}
```

보안 기준:

- 코드 원문 export는 생성 직후 제한된 시간과 권한에서만 허용한다.
- 일반 조회 API는 코드 원문을 반환하지 않고 suffix, 상태, 리딤 정보만 반환한다.
- import형 외부 코드를 받는 경우 코드 원문은 즉시 해시로 변환한다.

## Claim API

| Method | Path | 설명 | Idempotency |
| --- | --- | --- | --- |
| `POST` | `/coupon-campaigns/{campaignId}/claims` | 선착순 또는 일반 수령 | 필요 |
| `POST` | `/coupon-codes/redeem` | 리딤 코드 입력으로 쿠폰 수령 | 필요 |
| `GET` | `/coupons/me` | 내 보유 쿠폰 목록 | 불필요 |
| `GET` | `/coupons/me/{userCouponId}` | 내 쿠폰 상세 | 불필요 |
| `GET` | `/coupon-campaigns/{campaignId}/public-summary` | 고객 노출용 캠페인 요약 | 불필요 |

### ClaimCouponRequest 후보

```json
{
  "campaignId": "camp_20260706_launch"
}
```

### RedeemCouponCodeRequest 후보

```json
{
  "code": "ABCD-1234-EFGH"
}
```

### UserCouponResponse 후보

```json
{
  "userCouponId": "ucpn_123",
  "campaignId": "camp_20260706_launch",
  "name": "Launch Coupon",
  "benefit": {
    "benefitType": "fixed_amount",
    "amount": "5000",
    "currency": "KRW"
  },
  "status": "granted",
  "usableFrom": "2026-07-10T00:00:00Z",
  "expiresAt": "2026-07-17T00:00:00Z"
}
```

## Redemption API

주문 서비스가 호출하는 내부 API다. 사용자 앱이 직접 호출하지 않는다.

| Method | Path | 설명 | Idempotency |
| --- | --- | --- | --- |
| `POST` | `/internal/coupon-redemptions/reserve` | 주문 후보에 쿠폰 사용 예약 | 필요 |
| `POST` | `/internal/coupon-redemptions/{redemptionId}/commit` | 주문/결제 성공 후 사용 확정 | 필요 |
| `POST` | `/internal/coupon-redemptions/{redemptionId}/release` | 주문 실패, 결제 실패, 타임아웃 해제 | 필요 |
| `GET` | `/internal/coupon-redemptions/{redemptionId}` | 사용 기록 조회 | 불필요 |
| `POST` | `/internal/coupon-applicability/validate` | 주문 후보가 쿠폰 정책을 만족하는지 사전 검증 | 권장 |

### ReserveCouponRedemptionRequest 후보

```json
{
  "userCouponId": "ucpn_123",
  "userId": "user_123",
  "orderId": "order_123",
  "orderCandidate": {
    "currency": "KRW",
    "items": [
      {
        "productId": "product_1",
        "dropId": "drop_123",
        "sellerId": "seller_1",
        "categoryId": "category_1",
        "quantity": 1,
        "unitPrice": "55000"
      }
    ]
  }
}
```

### ReserveCouponRedemptionResponse 후보

```json
{
  "redemptionId": "redm_123",
  "status": "reserved",
  "discountAmount": "5000",
  "currency": "KRW",
  "reservedUntil": "2026-07-06T10:05:00Z"
}
```

## Internal Query API

| Method | Path | 설명 |
| --- | --- | --- |
| `GET` | `/internal/users/{userId}/coupons` | 내부 진단용 사용자 쿠폰 조회 |
| `GET` | `/internal/coupon-campaigns/{campaignId}/metrics-snapshot` | 캠페인 발급/사용 현황 스냅샷 |
| `GET` | `/internal/coupon-campaigns/{campaignId}/ledger` | 발급/사용 원장 조회 |
| `GET` | `/internal/coupon-code-batches/{batchId}/ledger` | 코드 배치 생성/폐기 원장 조회 |

## API 설계 결론

- 기존 `POST /coupons/issue`는 `POST /coupon-campaigns/{campaignId}/claims`로 좁혀야 한다.
- 코드 입력은 `POST /coupon-codes/redeem`으로 분리한다.
- 주문 적용은 `POST /internal/coupon-redemptions/reserve|commit|release`로 분리한다.
- `PreparePolicyRequest`의 `dropId`는 제거하고, `CouponApplicabilityPolicy` API로 옮긴다.
- 운영자/판매자 API와 사용자 API를 파일과 컨트롤러에서 분리한다.
