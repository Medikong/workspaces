# ArgoCD 배포 트러블슈팅 - Day 2

## 1. port-forward 실패

**증상**
```
error: error upgrading connection: no preferred addresses found; known addresses: []
```

**원인**
워커 노드의 INTERNAL-IP가 `<none>`으로 등록되어 있어 port-forward가 동작하지 않음

**해결**
Ansible inventory에 `node_ip` 설정 후 `cluster-bootstrap` 재실행

수정 파일: `medikong/infra/infra/cluster/provision/ansible/inventories/aws/dev.ini`
```ini
worker-1 ansible_host=43.202.76.215 node_ip=172.31.49.159
worker-2 ansible_host=3.39.242.83   node_ip=172.31.61.179
```

```bash
LOCAL_REGISTRY_ENABLED=false make CLUSTER_PROVIDER=aws cluster-bootstrap
```

**작동 원리**
```
node_ip 설정
    ↓
kubelet이 해당 IP를 노드 내부 IP로 등록
    ↓
K8s API가 노드 IP를 인식
    ↓
port-forward 정상 동작
```

---

## 2. WSL에서 port-forward 접속 불가

**증상**
WSL에서 port-forward 실행 후 브라우저에서 `localhost:9090` 접속 실패

**원인**
WSL 내부 포트가 Windows 브라우저와 연결되지 않음

**해결**
Git Bash에서 port-forward 실행

```bash
ssh -i ~/.ssh/k8s-key -L 9090:localhost:9090 ubuntu@13.125.191.132 \
  "kubectl port-forward svc/argocd-server -n argocd 9090:443"
```

**작동 원리**
```
Git Bash (Windows)
    ↓ SSH 터널링 (-L 9090:localhost:9090)
마스터 EC2의 9090 포트
    ↓
브라우저에서 https://localhost:9090 접속 가능
```

---

## 3. 포트 이미 사용 중 (Address already in use)

**증상**
```
Unable to listen on port 9090: bind: address already in use
```

**원인**
EC2에 이미 port-forward 프로세스가 실행 중

**해결**
```bash
ssh -i ~/.ssh/k8s-key ubuntu@13.125.191.132 "sudo lsof -i :9090"
ssh -i ~/.ssh/k8s-key ubuntu@13.125.191.132 "sudo kill <PID>"
```

---

## 4. monitoring 배포 hang (21시간 대기)

**증상**
```
waiting for completion of hook batch/Job/kube-prometheus-stack-admission-create
Duration: 21h22m
```

**원인**
`kube-prometheus-stack.yaml`에 로컬 레지스트리 주소(`10.10.10.10:5000`)가 남아있어 이미지 pull 실패

**해결**
수정 파일: `medikong/gitops/platform/monitoring/values/kube-prometheus-stack.yaml`

```bash
sed -i 's|10.10.10.10:5000/||g' \
  platform/monitoring/values/kube-prometheus-stack.yaml
```

ArgoCD에서 기존 Job 강제 삭제 후 재배포

```bash
kubectl delete job kube-prometheus-stack-admission-create -n monitoring --force --grace-period=0
```

---

## 5. nodeSelector 불일치로 Pod Pending

**증상**
```
0/3 nodes are available: 2 node(s) didn't match Pod's node affinity/selector
```

**원인**
`kube-prometheus-stack.yaml`에 Vagrant 로컬 환경용 nodeSelector가 남아있음

```yaml
nodeSelector:
  workload.medical-platform.io/tier: platform  # AWS 노드에 없는 라벨
```

**해결**
수정 파일: `medikong/gitops/platform/monitoring/values/kube-prometheus-stack.yaml`

```bash
sed -i '/nodeSelector:/,/workload.medical-platform.io\/tier: platform/{/workload.medical-platform.io\/tier: platform/d}' \
  platform/monitoring/values/kube-prometheus-stack.yaml
```

---

## 6. PVC Pending (StorageClass 없음)

**증상**
```
no persistent volumes available for this claim and no storage class is set
```

**원인**
EBS CSI 드라이버 및 StorageClass가 설치되지 않음

**해결**
EBS CSI 드라이버 설치

```bash
kubectl apply -k "github.com/kubernetes-sigs/aws-ebs-csi-driver/deploy/kubernetes/overlays/stable/?ref=release-1.38"
```

StorageClass 생성

```bash
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-sc
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
parameters:
  type: gp3
EOF
```

**작동 원리**
```
EBS CSI 드라이버
    ↓
PVC 생성 요청 감지
    ↓
AWS EBS 볼륨 자동 생성
    ↓
Pod에 마운트
```

---

## 7. EBS 볼륨 생성 권한 없음 (403)

**증상**
```
UnauthorizedOperation: You are not authorized to perform: ec2:CreateVolume
```

**원인**
EC2 IAM Role에 EBS 생성 권한 없음

**해결**
수정 파일: `~/terraform-aws/main.tf`

```hcl
resource "aws_iam_role_policy" "ebs_csi" {
  name = "${local.name_prefix}-ebs-csi-policy"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ec2:CreateVolume",
        "ec2:DeleteVolume",
        "ec2:AttachVolume",
        "ec2:DetachVolume",
        "ec2:DescribeVolumes",
        "ec2:DescribeInstances",
        "ec2:CreateTags"
      ]
      Resource = "*"
    }]
  })
}
```

---

## 8. PVC Terminating stuck

**증상**
PVC 삭제 후 계속 Terminating 상태 유지

**원인**
`kubernetes.io/pvc-protection` finalizer가 삭제를 막고 있음

**해결**
finalizer 강제 제거

```bash
kubectl patch pvc <pvc-name> -n monitoring \
  -p '{"metadata":{"finalizers":[]}}' --type=merge
```

**작동 원리**
```
finalizer → 리소스 삭제 전 처리할 작업 정의
→ Pod가 PVC 사용 중이면 삭제 막음
→ finalizer 제거 시 즉시 삭제
```

---

## 9. Grafana Secret 없음 (CreateContainerConfigError)

**증상**
```
Reason: CreateContainerConfigError
secret 'grafana-admin-credentials' not found
```

**원인**
Grafana admin 계정 Secret이 K8s에 없음

**해결**
```bash
kubectl create secret generic grafana-admin-credentials \
  --from-literal=admin-user=admin \
  --from-literal=admin-password=admin123 \
  -n monitoring
```

---

## 수정/생성된 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `infra/infra/cluster/provision/ansible/inventories/aws/dev.ini` | 워커 node_ip 추가, IP 업데이트 |
| `gitops/platform/monitoring/values/kube-prometheus-stack.yaml` | 로컬 레지스트리 주소 제거, nodeSelector 제거 |
| `~/terraform-aws/main.tf` | EBS CSI IAM 정책 추가 |
