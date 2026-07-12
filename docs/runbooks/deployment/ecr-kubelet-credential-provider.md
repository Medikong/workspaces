# ECR kubelet credential provider 도입

관련 trouble: [../../trouble/ecr-registry-403/README.md](../../trouble/ecr-registry-403/README.md)

## 목적

private-dev 클러스터의 ECR image pull 인증을 Kubernetes Secret 갱신 방식에서 kubelet credential provider 방식으로 바꾼다.

현재 `ecr-registry` imagePullSecret은 ECR authorization token을 담고 있고, 이 token은 12시간마다 만료된다. crontab, CronJob, 수동 갱신은 모두 같은 문제를 반복해서 따라잡는 방식이다. 근본 해결은 Pod namespace의 Secret이 아니라 **노드 kubelet이 image pull 시점에 ECR credential을 직접 가져오게 하는 것**이다.

## 목표 상태

- kubelet이 ECR image pull 요청을 만나면 `ecr-credential-provider` exec plugin을 호출한다.
- plugin은 노드 IAM Role을 통해 ECR 인증 token을 가져온다.
- workload manifest에는 더 이상 `imagePullSecrets: ecr-registry`가 필수 조건이 아니다.
- `ecr-registry` Secret 갱신 crontab은 제거 대상이 된다.
- 신규 namespace를 만들 때 ECR Secret 생성 여부를 신경 쓰지 않는다.

## 적용 범위

| 항목 | 기준 |
| --- | --- |
| 환경 | private-dev self-managed Kubernetes |
| registry | `941141115079.dkr.ecr.ap-northeast-2.amazonaws.com` |
| 인증 주체 | EC2 node IAM Role |
| 적용 위치 | 모든 Kubernetes node의 kubelet |
| 제외 | 이미지 tag 부재, repository 부재, architecture manifest 불일치 |

## 전제 조건

노드 IAM Role에 ECR pull 권한이 있어야 한다.

```text
ecr:GetAuthorizationToken
ecr:BatchCheckLayerAvailability
ecr:BatchGetImage
ecr:GetDownloadUrlForLayer
```

노드에서 AWS credential chain이 동작해야 한다.

```bash
aws sts get-caller-identity
aws ecr get-login-password --region ap-northeast-2 >/dev/null
```

Kubernetes node는 kubelet credential provider를 지원해야 한다. private-dev에서 확인한 kubelet은 `v1.34.x`이므로 기능 조건은 충족한다.

```bash
kubectl get nodes -o custom-columns=NAME:.metadata.name,VERSION:.status.nodeInfo.kubeletVersion,ARCH:.status.nodeInfo.architecture
```

## 설계

각 node에 같은 파일을 배포한다.

```text
/etc/kubernetes/image-credential-provider/bin/ecr-credential-provider
/etc/kubernetes/image-credential-provider/config.yaml
```

kubelet에는 다음 두 flag를 추가한다.

```text
--image-credential-provider-bin-dir=/etc/kubernetes/image-credential-provider/bin
--image-credential-provider-config=/etc/kubernetes/image-credential-provider/config.yaml
```

credential provider config 예시:

```yaml
apiVersion: kubelet.config.k8s.io/v1
kind: CredentialProviderConfig
providers:
  - name: ecr-credential-provider
    matchImages:
      - "941141115079.dkr.ecr.ap-northeast-2.amazonaws.com"
      - "*.dkr.ecr.ap-northeast-2.amazonaws.com"
      - "*.dkr.ecr.*.amazonaws.com"
    defaultCacheDuration: "12h"
    apiVersion: credentialprovider.kubelet.k8s.io/v1
```

주의:

- `providers[].name`은 binary 파일명과 같아야 한다.
- `matchImages`는 ECR registry와 정확히 맞아야 한다.
- plugin binary와 config는 kubelet이 실행되는 host filesystem에 있어야 한다.
- container 안에 넣는 방식이 아니라 node bootstrap/Ansible/systemd 관리 대상이다.

## 도입 순서

1. 노드 IAM Role 확인

```bash
ssh -i ~/.ssh/k8s-key ubuntu@13.125.191.132
aws sts get-caller-identity
aws ecr get-login-password --region ap-northeast-2 >/dev/null
```

2. kubelet 실행 방식 확인

```bash
systemctl cat kubelet
ps -ef | grep '[k]ubelet'
```

3. `ecr-credential-provider` binary를 node architecture별로 배포

```text
arm64 node -> linux arm64 binary
amd64 node -> linux amd64 binary
```

4. `CredentialProviderConfig`를 모든 node에 배포

```bash
sudo mkdir -p /etc/kubernetes/image-credential-provider/bin
sudo install -m 0755 ecr-credential-provider /etc/kubernetes/image-credential-provider/bin/ecr-credential-provider
sudo install -m 0644 config.yaml /etc/kubernetes/image-credential-provider/config.yaml
```

5. kubelet flag 추가

kubeadm 기반이면 systemd drop-in 또는 kubelet env 파일에 다음 값을 추가한다.

```text
--image-credential-provider-bin-dir=/etc/kubernetes/image-credential-provider/bin
--image-credential-provider-config=/etc/kubernetes/image-credential-provider/config.yaml
```

6. node를 하나씩 재시작

```bash
kubectl cordon <node>
sudo systemctl daemon-reload
sudo systemctl restart kubelet
systemctl status kubelet --no-pager
kubectl uncordon <node>
```

서비스 영향이 큰 node는 `kubectl drain` 가능 여부를 먼저 판단한다. private-dev처럼 실험 클러스터이면 cordon 후 kubelet restart부터 진행할 수 있다.

7. 테스트 Pod로 검증

기존 `ecr-registry` Secret 없이도 ECR image를 pull할 수 있어야 한다.

```bash
kubectl create namespace ecr-provider-smoke --dry-run=client -o yaml | kubectl apply -f -
kubectl -n ecr-provider-smoke delete secret ecr-registry --ignore-not-found
kubectl -n ecr-provider-smoke run ecr-pull-smoke \
  --image=941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/notification-service:v0.1.2 \
  --restart=Never \
  --command -- python -c 'print("ok")'
kubectl -n ecr-provider-smoke wait --for=condition=Ready pod/ecr-pull-smoke --timeout=120s
kubectl -n ecr-provider-smoke get pod ecr-pull-smoke
```

정상 기준:

```text
Pod가 ErrImagePull/ImagePullBackOff 없이 image pull을 완료한다.
Event에 403 Forbidden이 없다.
```

8. 기존 Secret 의존 제거

검증 후 GitOps values와 Helm chart에서 `imagePullSecrets: ecr-registry` 의존을 단계적으로 제거한다.

```text
1차: 새 namespace와 신규 workload에서 imagePullSecrets를 제거
2차: 기존 service values에서 imagePullSecrets 제거
3차: ecr-registry Secret refresh crontab 제거
4차: ecr-registry Secret 삭제 또는 fallback 용도로만 보관
```

## 실패 시 확인

plugin이 호출되지 않는 경우:

```bash
journalctl -u kubelet -n 200 --no-pager | grep -Ei 'credential|ecr|image'
ps -ef | grep '[k]ubelet'
ls -l /etc/kubernetes/image-credential-provider/bin/
```

credential provider config가 잘못된 경우:

```bash
sudo cat /etc/kubernetes/image-credential-provider/config.yaml
journalctl -u kubelet -n 200 --no-pager
```

IAM 권한이 부족한 경우:

```bash
aws sts get-caller-identity
aws ecr batch-get-image \
  --region ap-northeast-2 \
  --repository-name notification-service \
  --image-ids imageTag=v0.1.2
```

registry match가 빗나간 경우:

```bash
kubectl describe pod -n <namespace> <pod>
```

Event에 계속 `403 Forbidden`이 보이면 kubelet이 credential provider를 호출하지 못했거나, 호출했지만 IAM/ECR 권한이 부족한 것이다.

## 롤백

문제가 있으면 kubelet flag를 제거하고 kubelet을 재시작한다.

```bash
sudo systemctl daemon-reload
sudo systemctl restart kubelet
```

그 뒤 기존 방식으로 `ecr-registry` Secret을 재발급한다.

```bash
ECR_PASSWORD=$(aws ecr get-login-password --region ap-northeast-2)
kubectl -n ticketing-notification create secret docker-registry ecr-registry \
  --docker-server=941141115079.dkr.ecr.ap-northeast-2.amazonaws.com \
  --docker-username=AWS \
  --docker-password="${ECR_PASSWORD}" \
  --dry-run=client -o yaml | kubectl apply -f -
```

롤백은 일시 복구 수단이다. Secret token 만료 구조가 그대로 남기 때문에 최종 상태로 두지 않는다.

## 운영 판정

| 상태 | 판정 |
| --- | --- |
| crontab으로 Secret 갱신 | 임시 조치 |
| Kubernetes CronJob으로 Secret 갱신 | 개선된 임시 조치 |
| External Secrets로 Secret 갱신 | 운영성은 낫지만 Secret 만료 구조는 유지 |
| kubelet ECR credential provider | 목표 상태 |
| EKS managed node/Fargate | 관리형 대안 |

## 참고 자료

- [AWS ECR private registry authentication](https://docs.aws.amazon.com/AmazonECR/latest/userguide/registry_auth.html)
- [Kubernetes kubelet image credential provider](https://kubernetes.io/docs/tasks/administer-cluster/kubelet-credential-provider/)
- [Kubernetes AWS Cloud Provider credential provider](https://cloud-provider-aws.sigs.k8s.io/credential_provider/)
