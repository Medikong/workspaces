# DropMong Architecture

이 폴더는 DropMong 작업공간에서 공유하는 아키텍처 기준점을 둔다. 현재 서비스 코드는 새로 구성 중이므로, 서비스별 상세 설계보다 repo 경계, 배포 기반, 관측성, synthetic 검증 구조를 먼저 관리한다.

## 읽는 순서

| 순서 | 문서 | 용도 |
| ---: | --- | --- |
| 1 | [expected-architecture/README.md](expected-architecture/README.md) | README 예상 아키텍처 이미지와 원본 |
| 2 | [kubernetes-architecture/README.md](kubernetes-architecture/README.md) | namespace, Pod, container 단위 Kubernetes 전체도 |
| 3 | [seller-service/README.md](seller-service/README.md) | 판매자 중심 드롭 준비와 `backoffice-service` 역할 재정의 |
| 4 | [coupon-service/README.md](coupon-service/README.md) | 쿠폰 캠페인, 리딤 코드, 사용자 쿠폰, 사용 원장, 적용 정책 설계 |
| 5 | [repo-boundaries.md](repo-boundaries.md) | `workspaces`, `service`, `gitops`, `infra`, `archive` 책임 경계 |
| 6 | [deployment/README.md](deployment/README.md) | 이미지 배포, GitOps, rollout 기준 |
| 7 | [observability/README.md](observability/README.md) | metric, log, trace, dashboard 기준 |
| 8 | [synthetic-e2e/README.md](synthetic-e2e/README.md) | synthetic 검증 구조와 실행 결과 수집 기준 |
| 9 | [private-dev-network-architecture.md](private-dev-network-architecture.md) | private dev 네트워크 기준 |
| 10 | [onprem-private-dev-environment.md](onprem-private-dev-environment.md) | on-prem/private dev 환경 메모 |

## 현재 기준

- Kubernetes 외부 진입은 현재 GitOps의 Kong Ingress Controller 경로를 기준으로 둔다. Istio는 내부 mesh와 traffic policy 기준으로 분리해 본다.
- 판매자가 준비하는 상품/드롭/재고 계획/프로모션 요청은 [seller-service/README.md](seller-service/README.md)를 초기 기준으로 둔다.
- 쿠폰은 상품/드롭을 직접 소유하지 않고, 적용 정책으로만 외부 도메인을 참조한다. 세부 기준은 [coupon-service/README.md](coupon-service/README.md)를 따른다.
- 나머지 서비스 목록은 새 구현에서 확정한다.
- CI/CD, GitOps, observability 기반은 유지한다.
- 과거 서비스 상세 문서는 `archive` repo에서 보관한다.
- 이 폴더는 현재 DropMong 플랫폼 설계와 운영 검증 기준만 다룬다.

## 확인 필요

- `seller-service` 외 DropMong 서비스 경계 확정 후 서비스 아키텍처 문서를 추가한다.
- Istio traffic policy와 canary/rollback 기준을 신규 서비스명에 맞춰 갱신한다.
- 기존 실험 결과 중 재사용할 항목은 `evidence` 또는 `archive` 중 어느 쪽에 둘지 정한다.
