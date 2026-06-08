# ADR

이 폴더는 Medikong 프로젝트의 구조적 의사결정을 기록하는 공간이다.

ADR은 Architecture Decision Record의 약자로, 중요한 결정을 당시의 맥락, 대안, 선택 이유, 결과와 함께 남긴다. 회의록에는 결정이 발생한 사실을 남기고, 장기적으로 참조해야 하는 구조적 결정은 이 폴더에 별도 ADR로 정리한다.

## 파일 구성

| 경로 | 용도 |
| --- | --- |
| `README.md` | ADR 인덱스와 작성 기준 |
| `templates/adr.md` | 새 ADR 문서 템플릿 |
| `NNNN-short-title.md` | 개별 ADR 문서 |

## ADR 인덱스

| ID | 상태 | 날짜 | 제목 | 파일 |
| --- | --- | --- | --- | --- |
| ADR-0001 | accepted | 2026-05-22 | workspace를 polyrepo 보조 진입점으로 사용한다 | `0001-use-workspace-as-polyrepo-helper.md` |
| ADR-0002 | accepted | 2026-05-27 | 로컬 Kubernetes 검증은 Docker Desktop을 기준으로 한다 | `0002-use-docker-desktop-for-local-kubernetes-validation.md` |
| ADR-0003 | accepted | 2026-05-29 | Kong은 Edge API Gateway로, Istio는 내부 Service Mesh로 분리한다 | `0003-separate-kong-edge-gateway-and-istio-service-mesh.md` |
| ADR-0004 | accepted | 2026-06-04 | 관측성 신호별 수집 경로와 Trace 처리 기준을 분리한다 | `0004-observability-signal-routing-and-trace.md` |
| ADR-0005 | accepted | 2026-06-04 | GitHub Actions의 AWS 인증은 OIDC 기반 IAM Role Assume을 사용한다 | `0005-use-github-oidc-for-aws-ci-authentication.md` |
| ADR-0006 | accepted | 2026-06-08 | 서비스 간 Circuit Breaker는 Istio outlierDetection으로 시작한다 | `0006-use-istio-outlierdetection-for-mesh-circuit-breaker.md` |
| ADR-0007 | accepted | 2026-06-08 | Istio 설치와 서비스 트래픽 정책은 ArgoCD Application으로 분리한다 | `0007-separate-istio-platform-and-traffic-policy-sync.md` |

## Frontmatter

모든 ADR 문서는 YAML frontmatter로 검색과 정렬에 필요한 값을 먼저 기록한다.

```yaml
---
id: ADR-0000
title: ""
status: proposed
date: YYYY-MM-DD
areas: []
repos: []
decision_drivers: []
related: []
links: []
supersedes: []
superseded_by: null
---
```

## 필드 규칙

| 필드 | 값 |
| --- | --- |
| `id` | `ADR-0001`처럼 증가하는 고유 ID |
| `title` | 결정 내용을 짧은 문장으로 쓴다. |
| `status` | `proposed`, `accepted`, `deprecated`, `superseded` 중 하나를 쓴다. |
| `date` | 결정 날짜를 `YYYY-MM-DD`로 쓴다. |
| `areas` | 결정이 다루는 영역을 쓴다. 예: `workspace`, `local-dev`, `gitops` |
| `repos` | 관련 repo를 쓴다. 예: `workspace`, `service`, `gitops`, `infra` |
| `decision_drivers` | 결정에 영향을 준 핵심 기준을 짧게 쓴다. |
| `related` | 관련 회의록, 이슈, workplan, 다른 ADR을 쓴다. |
| `links` | GitHub issue, PR, Notion, 외부 자료 링크를 쓴다. |
| `supersedes` | 이 ADR이 대체하는 ADR ID를 쓴다. 없으면 빈 배열로 둔다. |
| `superseded_by` | 이 ADR을 대체한 ADR ID를 쓴다. 없으면 `null`로 둔다. |

## 작성 기준

- 단순 회의 메모나 작업 목록은 ADR로 만들지 않는다.
- repo 경계, 검증 전략, 배포 구조, 운영 방식처럼 나중에 다시 판단해야 할 결정을 ADR로 남긴다.
- 대안과 선택 이유를 함께 기록해 결정의 배경을 잃지 않게 한다.
- 결정이 바뀌면 기존 ADR을 삭제하지 않고 새 ADR에서 대체 관계를 남긴다.

## 작성 순서

1. `templates/adr.md`를 복사해 `NNNN-short-title.md` 파일을 만든다.
2. frontmatter의 `id`, `title`, `status`, `date`, `areas`, `repos`, `decision_drivers`를 채운다.
3. 본문에 상태, 날짜, 배경, 결정, 대안, 결과, 후속 작업을 남긴다.
4. `README.md`의 ADR 인덱스 표에 새 파일을 추가한다.
5. 관련 회의록, 이슈, workplan이 있으면 `related`와 본문에 연결한다.
