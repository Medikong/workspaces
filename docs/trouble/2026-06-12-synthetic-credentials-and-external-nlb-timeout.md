---
id: TROUBLE-007
title: "aws-dev synthetic credential Secret 누락과 외부 NLB timeout"
status: in_progress
priority: p1
severity: high
area: gitops
repos:
  - gitops
  - workspace
owner: unassigned
created: 2026-06-12
updated: 2026-06-12
resolved: null
tags:
  - synthetic
  - aws-dev
  - sealed-secrets
  - gitops
  - kong
  - nlb
  - k6
related:
  - docs/runbooks/observability/synthetic-traffic-verification.md
  - docs/architecture/synthetic-e2e/credential-source-decision.md
links: []
---

# aws-dev synthetic credential Secret 누락과 외부 NLB timeout

## Context

2026-06-12 aws-dev synthetic traffic CronJob이 새 ECR image를 정상 pull한 뒤 `CreateContainerConfigError`로 멈췄다.

이미지 배포는 성공한 상태였다.

- GitHub Actions run `27393082473` 성공
- ECR image tag: `941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/synthetic-traffic:610f5e095ff389d90bd387e12251e1aa96dcdf8a`
- GitOps values 갱신 commit: `2554482 chore: update synthetic image tag to 610f5e095ff389d90bd387e12251e1aa96dcdf8a`
- Argo app `synthetic-traffic-aws-dev`는 `Synced / Healthy`

따라서 이번 트러블은 image pull 문제가 아니라 runtime credential과 HTTP 도달성 문제로 분리해 조사했다.

## Symptoms

- 관찰된 현상:
  - synthetic Pod가 처음에는 `CreateContainerConfigError` 상태였다.
  - Pod event에 `Error: secret "synthetic-traffic-credentials" not found`가 남았다.
  - Secret 복구 뒤에는 컨테이너가 생성되고 시작됐지만 Job은 `Failed`, Pod는 `Error`로 종료됐다.
  - k6 로그의 다음 실패 지점은 `auth.login`이었다.
- 재현 조건:
  - aws-dev `synthetic` namespace에 `synthetic-traffic-credentials` Secret이 없다.
  - 또는 Secret이 있어도 CronJob이 `externalBaseUrl`의 public NLB DNS를 Pod 안에서 호출한다.
- 기대 동작:
  - Secret은 GitOps 경로로 생성된다.
  - credential이 있으면 runner는 `/auth/login`에서 JWT를 받고 다음 synthetic step으로 진행한다.
- 실제 동작:
  - Secret 누락 시 컨테이너 설정 단계에서 실패했다.
  - Secret 복구 후에는 external NLB 호출이 timeout으로 끝나 k6 HTTP status `0`이 발생했다.

## Impact

- 영향 범위:
  - aws-dev synthetic traffic CronJob
  - synthetic 기반 Kong, service, DB, Kafka, dashboard 생존성 확인
  - Grafana/Loki에서 synthetic 성공 여부를 보는 운영 점검
- 우선 처리 이유:
  - Argo app은 `Healthy`였지만 실제 Job은 실행되지 않았다.
  - image 배포 성공과 synthetic 실행 성공이 분리되어 있어 장애 원인을 혼동하기 쉬웠다.
- 우회 방법:
  - Secret 누락은 SealedSecret을 수동 적용해 즉시 복구했다.
  - HTTP timeout은 synthetic target을 cluster 내부 Kong service로 바꾸면 우회할 수 있다.

## Investigation

| 시간 | 확인 내용 | 결과 |
| --- | --- | --- |
| 2026-06-12 12:50 KST | `kubectl describe pod` event 확인 | image pull은 성공, `secret "synthetic-traffic-credentials" not found`로 `CreateContainerConfigError` |
| 2026-06-12 | `kubectl get crd sealedsecrets.bitnami.com` 확인 | aws-dev에 Sealed Secrets controller가 없었다 |
| 2026-06-12 | Sealed Secrets controller 설치 | `sealed-secrets-controller`가 `kube-system`에서 `1/1 Available` |
| 2026-06-12 | `synthetic-traffic-credentials` SealedSecret 적용 | `synthetic` namespace Secret 생성, `DATA=6`, SealedSecret `SYNCED=True` |
| 2026-06-12 | CronJob 재실행 | 컨테이너가 `Created`와 `Started`까지 진행, Secret 누락 에러는 사라짐 |
| 2026-06-12 | 최신 synthetic Pod 종료 상태 확인 | `phase=Failed`, `reason=Error`, `exitCode=99` |
| 2026-06-12 | k6 로그 확인 | `auth.login failed with status 0: null`, `http_req_failed=100%` |
| 2026-06-12 | Kong/auth-service 리소스 확인 | Kong Pod `2/2 Running`, `kong-kong-proxy` endpoint 존재, auth-service `1/1 Available` |
| 2026-06-12 | 내부 Kong service에서 `/auth/login` 호출 | Secret credential로 HTTP `200`, `accessToken` 존재 |
| 2026-06-12 | Pod 안에서 외부 NLB DNS로 `/auth/login` 호출 | `code=000`, `Connection timed out after 8002 milliseconds` |
| 2026-06-12 | bastion node에서 외부 NLB DNS 호출 | `code=000`, timeout |
| 2026-06-12 | 로컬 환경에서 외부 NLB root 호출 | HTTP `503`, Kong 응답 수신. 외부 DNS 자체는 살아 있음 |

## Root Cause

1차 장애 원인은 `synthetic` namespace에 `synthetic-traffic-credentials` Secret이 없었던 것이다.

CronJob template은 다음처럼 Secret을 fail-fast로 요구한다.

```yaml
envFrom:
  - secretRef:
      name: synthetic-traffic-credentials
      optional: false
```

이 설정은 맞다. credential이 없는 상태에서 synthetic traffic이 성공처럼 보이면 안 되기 때문이다. 문제는 해당 Secret을 GitOps로 만드는 경로가 없었다는 점이다.

Secret 복구 후 남은 HTTP status `0`의 원인은 credential이나 auth-service가 아니다. 같은 Secret credential로 cluster 내부 Kong service를 호출하면 `/auth/login`이 HTTP `200`과 access token을 반환했다.

반면 synthetic runner가 사용하는 aws-dev 설정은 다음 외부 주소를 base URL로 쓴다.

```text
http://medikong-default-kong-nlb-c17a54e23efd293c.elb.ap-northeast-2.amazonaws.com:32407
```

이 주소는 cluster 내부 Pod와 bastion node에서 timeout이 난다. 즉 현재 synthetic Pod는 public NLB DNS와 NodePort를 통해 cluster 밖으로 나갔다가 다시 들어오는 경로를 사용하고 있으며, 이 경로가 aws-dev 내부 실행 위치에서는 응답을 주지 않는다.

확인된 분리는 다음과 같다.

- `synthetic-traffic-credentials`: 존재하고 6개 key를 가진다.
- Secret credential: 내부 Kong `/auth/login`에서 HTTP `200`으로 검증됐다.
- auth-service: `1/1 Available`, endpoint 존재.
- Kong 내부 service: `/auth/login` 요청을 auth-service로 전달한다.
- external NLB DNS: cluster 내부 Pod와 bastion node에서 timeout.

따라서 남은 실패는 인증 구조 문제가 아니라 synthetic runner의 aws-dev base URL 선택 문제다.

## Decision

Secret 문제는 SealedSecret으로 운영화한다.

- plain Kubernetes Secret manifest를 Git에 커밋하지 않는다.
- `synthetic-traffic-credentials`는 SealedSecret으로 GitOps 관리한다.
- auth-service, runner 인증 방식, `/auth/login -> JWT -> Kong -> X-User-*` 경로는 유지한다.
- CronJob의 `optional: false` fail-fast 동작도 유지한다.

HTTP timeout 문제는 별도 후속으로 분리한다.

권장 방향은 aws-dev cluster 안에서 실행되는 CronJob은 기본적으로 internal Kong service를 사용하게 하는 것이다.

```text
http://kong-kong-proxy.kong.svc.cluster.local
```

public NLB 자체의 외부 접근성을 검증하려면 cluster 밖에서 실행되는 별도 synthetic check로 분리하는 편이 낫다. cluster 내부 Pod가 public NLB DNS와 NodePort로 다시 들어오는 경로는 네트워크 정책, 보안 그룹, NAT/hairpin 특성에 묶여 있어 서비스 기능 검증과 장애 원인이 섞인다.

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | Sealed Secrets controller 설치 Application 추가 | gitops | `argo/applications/aws-dev/platform/sealed-secrets.yaml` |
| done | synthetic credential Application 추가 | gitops | `argo/applications/aws-dev/platform/synthetic-credentials.yaml` |
| done | `synthetic-traffic-credentials` SealedSecret 추가 | gitops | `platform/synthetic-credentials/synthetic-traffic-credentials.sealedsecret.yaml` |
| done | `platform:render`에 synthetic credentials kustomize 검증 추가 | gitops | `Taskfile.yml` |
| done | synthetic credential 운영 런북 업데이트 | workspace | `docs/runbooks/observability/synthetic-traffic-verification.md` |
| done | Secret 복구 후 Pod가 `Created`/`Started`로 넘어가는지 확인 | aws-dev | `kubectl -n synthetic get events` |
| done | 내부 Kong `/auth/login`이 Secret credential로 HTTP `200`을 반환하는지 확인 | aws-dev | `kubectl -n synthetic` 임시 curl Pod |
| done | 외부 NLB DNS 호출이 Pod 안에서 timeout 나는지 확인 | aws-dev | `kubectl -n synthetic` 임시 curl Pod |
| todo | aws-dev synthetic CronJob의 기본 target을 internal Kong service로 전환할지 결정 | gitops | `platform/synthetic/values/aws-dev.yaml` |
| todo | public NLB 검증을 cluster 외부 synthetic check로 분리할지 결정 | gitops/workspace | 별도 운영 설계 |

## Resolution

부분 해결.

Secret 누락으로 인한 `CreateContainerConfigError`는 해결됐다.

- `synthetic-traffic-credentials` Secret이 `synthetic` namespace에 생성됐다.
- SealedSecret은 `SYNCED=True`다.
- Secret 생성 이후 Pod event에는 `Created container`와 `Started container`가 남는다.
- 더 이상 `secret "synthetic-traffic-credentials" not found`로 멈추지 않는다.

남은 문제는 HTTP 도달성이다.

- k6가 `auth.login`에서 HTTP status `0`으로 실패한다.
- 내부 Kong service로 같은 credential을 사용하면 HTTP `200`이므로 credential/auth-service 문제는 아니다.
- Pod 내부에서 public NLB DNS를 호출하면 timeout이므로 aws-dev synthetic의 base URL 선택을 조정해야 한다.

재발 방지 기준:

- runtime Secret은 chart가 만들지 않더라도 GitOps 경로로 생성되어야 한다.
- Argo app `Healthy`만으로 synthetic 실행 성공을 판단하지 않는다.
- Job 상태, Pod event, k6 exit code, `synthetic_run_finished` 여부를 함께 본다.
- cluster 내부에서 실행되는 synthetic과 외부 public endpoint 검증은 실행 위치를 분리한다.
