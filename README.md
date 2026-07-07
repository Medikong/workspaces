# DropMong

누군가는 발매일을 기다리고, 누군가는 오픈 시간을 알람으로 맞춰둡니다.

좋아하는 브랜드의 새로운 컬렉션, 한정판 굿즈, 아티스트 협업 제품.
사람들은 단순히 상품을 구매하는 것이 아니라, **같은 순간을 기다리고 함께 참여하는 경험**을 즐깁니다.

DropMong은 이러한 기다림에서 시작되었습니다.

우리는 쇼핑이 단순한 소비를 넘어, 오픈을 기다리는 설렘과 구매에 성공하는 성취감까지 하나의 경험이 될 수 있다고 믿습니다. 정해진 시간에 모두가 같은 출발선에서 만나고, 누구에게나 공정한 기회가 주어지는 드롭 커머스를 지향합니다.

DropMong은 한정 상품을 판매하는 쇼핑몰이 아니라, **기다림이 가장 즐거운 순간이 되는 공간**을 만들고 있습니다.


![DropMong Brand](assets/dropmong-brand.png)


![DropMong](assets/dropmong-userflow-overview.png)

---

## 프로젝트 주제

```text
드롭 오픈 순간의 트래픽 피크에서도 oversell 없이 주문을 접수하고,
결제 지연이나 알림 장애가 핵심 주문 상태를 망가뜨리지 않도록 검증한다.
```

- 상품 드롭 조회, 재고 예약, 주문 생성, mock 결제, 알림 저장 과정을 API 기준으로 연결한다.
- 재고 차감과 주문 상태 변경은 idempotency와 transaction boundary를 기준으로 검증한다.
- 결제 승인, 결제 실패, 주문 만료, 알림 발송은 Kafka 이벤트로 분리한다.
- Kubernetes, Istio, Helm, Argo CD로 배포와 트래픽 정책을 검증한다.
- Prometheus, Grafana, Loki, Tempo, Alertmanager로 장애 원인과 병목을 추적한다.

---

## 서비스 구성도

![DropMong 서비스 구성도](assets/dropmong-service-overview.png)

## 관측성 아키텍처

![DropMong 관측성 아키텍처](assets/dropmong-observability-overview.png)

## 마스코트 캐릭터 시트

![DropMong 마스코트 캐릭터 시트](assets/dropmong-mascot-character-sheet.png)

## UI & UX 컴포넌트 시트

![DropMong UI & UX 컴포넌트 시트](assets/dropmong-ui-ux-component-sheet.png)



## Workspace

이 저장소는 DropMong 브랜드와 서비스를 함께 만들어가는 Workspace입니다.

공통 문서와 설계, 개발 규칙을 관리하며, 실제 구현은 각 저장소에서 진행됩니다.

- `workspaces` : 공통 문서, 온보딩, repo manifest
- `services` : 서비스 구현
- `gitops` : Kubernetes 배포 및 GitOps 관리
- `infra` : 클라우드 및 인프라 구성

## 예상 아키텍처

서비스 경계는 새 구현에서 확정한다. 현재 README의 다이어그램은 DropMong을 Kubernetes 위에 올릴 때의 클라우드 네이티브 예상 골격을 보여준다. AWS 같은 퍼블릭 클라우드 프로비저닝은 이 그림의 범위에서 제외한다.

![DropMong 클라우드 네이티브 예상 아키텍처](assets/dropmong-expected-architecture.png)

## 목표

- Oversell 0건
  동시 주문 상황에서도 판매 가능 수량보다 많은 주문이 확정되지 않게 한다.

- 주문 상태 정합성
  결제 승인, 결제 실패, 주문 만료가 같은 주문에 중복 적용되지 않게 한다.

- 후속 처리 분리
  알림 장애가 주문 확정과 결제 처리 결과를 실패시키지 않게 한다.

- 트래픽 피크 대응
  HPA와 backpressure 지표로 드롭 오픈 순간의 처리 한계를 설명한다.

- 배포 안정성
  Istio traffic policy, canary, rollback 기준을 운영 절차로 검증한다.

- 운영 가시성
  metric, log, trace로 병목과 장애 원인을 찾을 수 있게 한다.

## 기술 스택

| 영역 | 후보 |
| --- | --- |
| Backend | Python, FastAPI, JWT |
| Data & Messaging | PostgreSQL, MongoDB, Kafka |
| Platform | Docker, Kubernetes, Istio |
| CI/CD & IaC | GitHub Actions, Helm, Argo CD, Terraform, AWS, Amazon ECR |
| Observability | structlog, OpenTelemetry, Prometheus, Alertmanager, Grafana, Loki, Tempo |
| Quality & Test | k6, Postman, Newman, Trivy |

## 레포지토리 구조

```text
workspace-root/
  workspaces/  # 공통 문서, 온보딩, repo manifest
  service/     # 서비스 코드, 테스트, 이미지 빌드
  gitops/      # Kubernetes/GitOps 배포 선언
  infra/       # 클러스터, 클라우드, 네트워크 기반
  archive/     # 과거 설계와 실험 결과 보관
```

## Local 개발 접속 주소

| 이름 | 주소 | 비고 |
| --- | --- | --- |
| Grafana | http://localhost/grafana | `gitops` 레포에서 로컬 플랫폼을 올린 뒤 접속 |
| pgAdmin | http://localhost/pgadmin | 로컬 DB stack을 올린 뒤 접속 |

## GitHub 이미지 배포

신규 서비스의 이미지 배포 기반은 유지한다. 서비스가 추가되거나 제외되어도 manifest와 CI 설정에서 서비스 목록만 조정할 수 있도록 관리한다.

```bash
task deploy:tag SERVICE=all BUMP=patch DRY_RUN=true
task deploy:tag SERVICE=all BUMP=patch
```

- 실행 절차: [docs/runbooks/deployment/tag-based-image-deploy.md](docs/runbooks/deployment/tag-based-image-deploy.md)
- 배포 구조: [docs/architecture/deployment/README.md](docs/architecture/deployment/README.md)

## 문서 기준

| 영역 | 용도 |
| --- | --- |
| [docs/adr](docs/adr/README.md) | 구조적 의사결정 기록 |
| [docs/architecture](docs/architecture/README.md) | repo 경계, 배포, 관측성, 플랫폼 아키텍처 |
| [docs/evidence](docs/evidence/README.md) | 검증 결과와 실행 증거 |
| [docs/runbooks](docs/runbooks/README.md) | 배포, 관측성, 운영 확인 절차 |
| [docs/trouble](docs/trouble/README.md) | 장애, 실패, 운영 리스크 분석 기록 |

과거 프로젝트 산출물은 `archive` repo에서 보관하고, 이 workspace는 DropMong의 현재 작업 기준만 유지한다.
