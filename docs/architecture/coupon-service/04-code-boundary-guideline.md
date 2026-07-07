# Coupon Service 코드 경계 가이드

작성일: 2026-07-06

## 이 문서가 답하는 질문

- 현재 코드의 단일 `Store`, 단일 `Handler`, 단일 `routes.go` 구조를 어떻게 고칠 것인가?
- DDD 기반 쿠폰 서비스에서 패키지와 파일 이름은 어떤 도메인 언어를 써야 하는가?
- 레포지토리와 컨트롤러를 어떤 기준으로 분리해야 하는가?

## 금지할 구조

아래 구조는 쿠폰 서비스가 커질수록 도메인 경계를 숨긴다.

```text
internal/
  handler/
    routes.go
  repository/
    repository.go        # type Store interface
  store/
    postgres/store.go    # type Store struct
    memory/store.go      # type Store struct
  service/
    service.go           # PreparePolicy, Issue, ListMine 전부 포함
```

문제:

- `Store`가 어떤 도메인을 저장하는지 드러나지 않는다.
- `Issue`가 선착순 수령인지, 코드 리딤인지, 주문 사용인지 구분되지 않는다.
- 컨트롤러가 정책 관리, 사용자 수령, 주문 사용을 한 파일에서 처리한다.
- `DropID` 같은 외부 도메인 필드가 쿠폰 핵심 모델에 섞인다.
- 테스트도 도메인별 실패 원인을 분리하지 못하고 동시 발급 케이스에만 몰린다.

## 권장 패키지 경계

초기에는 지나치게 많은 계층을 만들지 않되, 도메인 이름은 분명히 드러낸다.

```text
internal/
  campaign/
    model.go
    service.go
    repository.go
    postgres_repository.go
  code/
    model.go
    generator.go
    service.go
    repository.go
    postgres_repository.go
  grant/
    model.go
    service.go
    repository.go
    postgres_repository.go
  redemption/
    model.go
    service.go
    repository.go
    postgres_repository.go
  applicability/
    model.go
    service.go
  ledger/
    model.go
    repository.go
  handler/
    campaign_handler.go
    code_handler.go
    claim_handler.go
    redemption_handler.go
    routes.go
  gate/
    claim_gate.go
    redis_claim_gate.go
```

대안으로 패키지를 덜 나누고 싶다면 `internal/domain` 아래에 모델을 모을 수 있다. 그래도 레포지토리 인터페이스와 핸들러 파일 이름은 도메인별로 나눠야 한다.

## 레포지토리 이름

| 나쁜 이름 | 권장 이름 | 이유 |
| --- | --- | --- |
| `repository.Store` | `campaign.CouponCampaignRepository` | 캠페인/정책 저장소임을 드러낸다. |
| `store/postgres.Store` | `campaign.PostgresCouponCampaignRepository` | 구현체의 책임과 백엔드를 함께 표현한다. |
| `Issue(ctx, policyID, userID)` | `CreateUserCouponFromClaim(ctx, command)` | 선착순 수령 유스케이스를 명확히 한다. |
| `ListByUser(ctx, userID)` | `ListUserCoupons(ctx, query)` | 사용자 보유 쿠폰 조회임을 드러낸다. |
| `UpsertPolicy` | `SaveCampaignDraft`, `ActivateCampaign` | 무분별한 upsert 대신 상태 전이를 표현한다. |

## 컨트롤러 파일 분리

| 파일 | 담당 API |
| --- | --- |
| `campaign_handler.go` | 캠페인 생성, 혜택/적용 정책/제한 설정, 활성화, 중단 |
| `code_handler.go` | 코드 배치 생성, 코드 export, 코드 조회, 폐기 |
| `claim_handler.go` | 사용자 선착순 수령, 코드 리딤, 내 쿠폰 조회 |
| `redemption_handler.go` | 주문 서비스의 쿠폰 예약, 확정, 해제 |
| `routes.go` | 라우팅 조립만 담당. 비즈니스 핸들러 메서드를 담지 않는다. |
| `error_mapper.go` | 도메인 에러를 HTTP 에러로 매핑 |

`routes.go`에는 다음 정도만 남긴다.

```go
func RegisterRoutes(mux *http.ServeMux, deps Dependencies) {
    campaignHandler := NewCampaignHandler(deps.CampaignService)
    codeHandler := NewCodeHandler(deps.CodeService)
    claimHandler := NewClaimHandler(deps.ClaimService)
    redemptionHandler := NewRedemptionHandler(deps.RedemptionService)

    registerCampaignRoutes(mux, campaignHandler)
    registerCodeRoutes(mux, codeHandler)
    registerClaimRoutes(mux, claimHandler)
    registerRedemptionRoutes(mux, redemptionHandler)
}
```

## 서비스 이름

단일 `Service` 대신 유스케이스별 application service를 둔다.

| 서비스 | 책임 |
| --- | --- |
| `CampaignService` | 캠페인 생성, 혜택/정책/제한 설정, 활성화 상태 전이 |
| `CouponCodeService` | 코드 배치 생성, 코드 리딤 준비, 폐기 |
| `CouponClaimService` | 선착순 수령, 코드 리딤, 사용자 쿠폰 생성 |
| `CouponRedemptionService` | 주문 사용 예약, 확정, 해제 |
| `CouponQueryService` | 내 쿠폰, 캠페인 상태, 운영 조회 |

## Redis gate 위치

현재 Redis gate는 선착순 발급의 DB 앞단 압력 완화로는 의미가 있다. 다만 위치는 `coupon-service` 전체 gate가 아니라 claim 전용 gate여야 한다.

| 현재 후보 | 권장 이름 |
| --- | --- |
| `gate.Gate` | `claim.ClaimAdmissionGate` |
| `gate.IssueRequest` | `claim.AdmissionRequest` |
| `ResultIssuedCandidate` | `ResultClaimCandidate` |
| Redis key `coupon:{policyId}:remaining` | `coupon:campaign:{campaignId}:remaining` |

코드 리딤과 주문 사용은 같은 gate를 공유하지 않는다. 코드 리딤은 code hash unique constraint와 짧은 예약 TTL이 핵심이고, 주문 사용은 `CouponRedemption` 예약 상태가 핵심이다.

## 점진적 리팩터링 순서

1. 현재 `Policy`를 `CouponCampaign`으로 이름만 바꾸기보다 `DropID` 제거와 `CouponApplicabilityPolicy` 분리를 먼저 설계한다.
2. `repository.Store`를 도메인별 인터페이스로 나눈다.
3. `handler/routes.go`의 메서드를 `campaign_handler.go`, `claim_handler.go`로 먼저 분리한다.
4. 기존 `POST /coupons/issue`는 호환 레이어로 남기되 내부에서는 `CouponClaimService`를 호출하게 바꾼다.
5. `CouponCode`와 `UserCoupon` 모델을 추가하고 `POST /coupon-codes/redeem`을 새 유스케이스로 만든다.
6. 주문 서비스가 생기기 전이라도 `CouponRedemption` 모델과 API 계약을 문서/테스트로 먼저 둔다.
7. Redis gate는 `ClaimAdmissionGate`로 이름을 바꾸고 캠페인 수량 gate에만 사용한다.

## 테스트 경계

| 테스트 | 검증 |
| --- | --- |
| Campaign unit test | 캠페인 상태 전이, 기간, 혜택/정책 필수 조건 |
| Code repository test | 코드 해시 중복 방지, 리딤 경쟁, 폐기 상태 |
| Claim integration test | 선착순 수량, 사용자별 제한, idempotency |
| Redemption integration test | 예약/확정/해제 상태 전이와 중복 호출 |
| API handler test | 도메인 에러별 HTTP status와 error code |
| Redis gate test | gate 실패 시 DB 원장으로 보정되는지 |

## 결론

쿠폰 서비스의 치명적인 문제는 코드가 부족한 것이 아니라 도메인 언어가 코드에 들어오지 않은 것이다. `Store`, `Handler`, `Issue` 같은 이름은 v0 샘플에는 빠르지만, 프로덕션 서비스에서는 리딤 코드, 보유 쿠폰, 사용 원장, 적용 정책을 모두 가린다. 리팩터링은 파일 정리보다 도메인 이름을 코드 경계에 박는 작업으로 시작해야 한다.
