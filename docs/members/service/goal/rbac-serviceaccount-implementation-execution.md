# RBAC와 ServiceAccount 구현 기록

## 목적

서비스별 Pod 권한과 사람 역할 권한을 분리한다.

요구사항 기준:

- 개발자는 조회 전용 권한을 갖는다.
- 운영자는 Deployment 수정 권한을 갖는다.
- SRE는 namespace 전체 권한을 갖는다.
- ClusterRole 대신 Role + RoleBinding을 사용한다.
- 서비스별 ServiceAccount는 최소 권한 원칙을 따른다.

## 확인한 현재 구조

서비스 chart에는 이미 ServiceAccount, Role, RoleBinding 템플릿이 있다.

```text
gitops/charts/medikong-service/templates/serviceaccount.yaml
gitops/charts/medikong-service/templates/role.yaml
gitops/charts/medikong-service/templates/rolebinding.yaml
```

기본값:

```yaml
serviceAccount:
  create: true
  automountServiceAccountToken: false

rbac:
  create: true
  rules: []
```

의미:

- 각 서비스는 전용 ServiceAccount를 사용한다.
- 기본적으로 Kubernetes API token을 Pod에 자동 mount하지 않는다.
- 기본 Role rules는 비어 있으므로 서비스 Pod는 Kubernetes API 권한을 갖지 않는다.

## 구현한 내용

사람 역할 RBAC는 `platform/policies`에 추가했다.

추가 파일:

```text
gitops/argo/applications/aws-dev/platform/policies.yaml
gitops/platform/policies/kustomization.yaml
gitops/platform/policies/human-rbac.yaml
```

수정 파일:

```text
gitops/platform/policies/README.md
gitops/Taskfile.yml
```

## 역할 기준

| Group | Role | 권한 |
| --- | --- | --- |
| `medikong:developers` | `medikong-developer-readonly` | Pod, log, Service, Deployment, Ingress, NetworkPolicy, HPA, PDB, ServiceMonitor 조회 |
| `medikong:operators` | `medikong-operator-deployment-manager` | 조회 권한 + Deployment/scale patch/update |
| `medikong:sres` | `medikong-sre-namespace-admin` | namespace 안의 전체 리소스 관리 |

적용 namespace:

```text
ticketing-auth
ticketing-concert
ticketing-reservation
ticketing-payment
ticketing-ticket
ticketing-notification
ticketing-dashboard
ticketing-messaging
```

## ArgoCD 반영 구조

새 Application:

```text
medikong-platform-policies
```

경로:

```text
platform/policies
```

sync-wave:

```text
-10
```

의미:

- namespace 생성 이후, 서비스 배포 전에 policy가 적용되는 순서를 의도한다.
- 서비스별 Helm release가 관리하는 Pod용 ServiceAccount와 분리한다.

## 검증 결과

실행한 검증:

```bash
task rbac:render
task argo:validate
task helm:template:all
git diff --check
```

결과:

```text
task rbac:render -> 통과
task argo:validate -> 통과
task helm:template:all -> 통과
git diff --check -> 통과
```

렌더링 결과:

```text
Role: 24개
RoleBinding: 24개
```

계산:

```text
8 namespaces * 3 roles = 24 Roles
8 namespaces * 3 rolebindings = 24 RoleBindings
```

## AWS dev에서 확인할 명령

적용 후 확인:

```bash
kubectl get applications -n argocd medikong-platform-policies
kubectl get role -n ticketing-payment
kubectl get rolebinding -n ticketing-payment
```

권한 확인:

```bash
kubectl auth can-i get pods \
  -n ticketing-payment \
  --as=rbac-test \
  --as-group=medikong:developers

kubectl auth can-i patch deployment/payment-service \
  -n ticketing-payment \
  --as=rbac-test \
  --as-group=medikong:operators

kubectl auth can-i delete namespace ticketing-payment \
  --as=rbac-test \
  --as-group=medikong:sres
```

기대:

- developers는 조회 가능, 수정 불가
- operators는 Deployment 수정 가능
- sres는 namespace 내부 admin 가능
- sres도 cluster-wide namespace 삭제 권한은 없어야 한다.

## 남은 일

실제 사용자와 group 매핑은 아직 별도 작업이다.

남은 결정:

```text
IAM/OIDC/인증서 중 어떤 방식으로 Kubernetes 사용자 group을 부여할지
실제 팀원 계정을 medikong:developers/operators/sres 중 어디에 매핑할지
argocd namespace 접근 권한도 별도로 줄지
```

이번 구현은 Kubernetes RBAC 리소스 구조를 먼저 마련한 것이다.
