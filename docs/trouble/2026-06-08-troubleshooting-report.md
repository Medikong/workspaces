# 서비스 배포 트러블슈팅 - Day 3

## Day 2에서 이어진 이슈

### 1. ServiceMonitor CRD 없음으로 Sync 실패

**증상**
```
The Kubernetes API could not find monitoring.coreos.com/ServiceMonitor
Make sure the "ServiceMonitor" CRD is installed on the destination cluster.
```

**원인**
Prometheus Operator가 설치되기 전에 서비스 배포 시도. ServiceMonitor CRD가 없어서 Sync 실패

**해결**
monitoring-aws-dev(Prometheus 스택) 먼저 배포 완료 후 서비스 배포

**작동 원리**
```
Prometheus Operator 설치
    ↓
ServiceMonitor CRD 자동 생성
    ↓
서비스 Sync 성공
```

---

### 2. exec format error (아키텍처 불일치)

**증상**
```
exec /opt/venv/bin/uvicorn: exec format error
```

**원인**
EC2 인스턴스는 ARM64(Graviton)인데 이미지가 AMD64로 빌드됨

**해결**
수정 파일: `medikong/service/Taskfile.yml`

```bash
# 변경 전
docker build -f "services/${service}/Dockerfile" ...

# 변경 후
docker buildx build --platform linux/amd64,linux/arm64 --push \
  -f "services/${service}/Dockerfile" ...
```

수정 파일: `medikong/service/.github/workflows/image-publish.yml`

```yaml
- name: Docker Buildx 설정
  uses: docker/setup-buildx-action@v3
```

**작동 원리**
```
멀티 플랫폼 빌드
    ↓
amd64 + arm64 이미지 동시 빌드
    ↓
ECR에 멀티 플랫폼 manifest 저장
    ↓
EC2 Graviton(ARM64) → arm64 이미지 자동 선택
```

---

### 3. ECR Secret 없음으로 이미지 Pull 실패

**증상**
```
ImagePullBackOff
```

**원인**
각 ticketing 네임스페이스에 ECR 인증 Secret이 없어서 이미지 pull 불가

**해결**
마스터 노드에서 7개 네임스페이스에 Secret 생성

```bash
ECR_PASSWORD=$(aws ecr get-login-password --region ap-northeast-2)

for ns in ticketing-auth ticketing-concert ticketing-reservation \
          ticketing-payment ticketing-ticket ticketing-notification ticketing-dashboard; do
  kubectl delete secret ecr-registry -n ${ns} --ignore-not-found
  kubectl create secret docker-registry ecr-registry \
    --docker-server=941141115079.dkr.ecr.ap-northeast-2.amazonaws.com \
    --docker-username=AWS \
    --docker-password=${ECR_PASSWORD} \
    -n ${ns}
done
```

**작동 원리**
```
ECR → 프라이빗 레지스트리 (인증 필요)
K8s Pod 이미지 pull 시 → ecr-registry Secret 참조
Secret에 ECR 토큰 포함 → 인증 성공 → 이미지 pull
```

**한계**
ECR 토큰 12시간마다 만료 → crontab으로 자동 갱신 설정 (Day4에서 K8s CronJob 시도 후 crontab으로 최종 결정)

---

## Day 3 신규 이슈

### 4. Docker push step 중복으로 이미지 없음 에러

**증상**
```
An image does not exist locally with the tag: ...
```

**원인**
`docker buildx build --push`로 빌드 시 로컬에 이미지 저장 안 됨. 별도 `docker push` step이 로컬 이미지를 찾다가 실패

**해결**
수정 파일: `medikong/service/.github/workflows/image-publish.yml`

```yaml
# 삭제
- name: Docker 이미지 push
  shell: bash
  run: |
    docker push "${image_ref}"
```

---

### 5. gitops values 파일 이름 불일치

**증상**
```
skip: values/services/auth-service.yaml not found
```

**원인**
image-publish.yml에서 파일 이름을 `auth-service.yaml`로 찾았으나 실제 파일명은 `auth.yaml`

**해결**
수정 파일: `medikong/service/.github/workflows/image-publish.yml`

```bash
# 변경 전
service_file="values/services/${image%.service}.yaml"

# 변경 후
service_file="values/services/${image%-service}.yaml"
```

**작동 원리**
```
auth-service → ${image%-service} → auth → auth.yaml 찾음 ✅
```

---

### 6. Kafka CPU 부족으로 Pod Pending

**증상**
```
0/3 nodes are available: Insufficient cpu
```

**원인**
워커 노드 CPU가 80~95% 사용 중으로 Kafka Pod 스케줄링 불가

**해결**
마스터 노드 다운그레이드 + 워커 노드 1개 추가

수정 파일: `~/terraform-aws/terraform.tfvars`
```hcl
# 변경 전
master_instance_type = "r6g.large"
worker_count         = 2

# 변경 후
master_instance_type = "r6g.medium"
worker_count         = 3
```

수정 파일: `medikong/infra/infra/cluster/provision/ansible/inventories/aws/dev.ini`
```ini
# 추가
worker-3 ansible_host=54.116.140.54 node_ip=172.31.63.39 ...
```

워커 3번 K8s 클러스터 조인
```bash
make CLUSTER_PROVIDER=aws servers-bootstrap
LOCAL_REGISTRY_ENABLED=false make CLUSTER_PROVIDER=aws cluster-bootstrap
```

**작동 원리**
```
Terraform → EC2 추가 생성
Ansible servers-bootstrap → kubeadm 등 설치
Ansible cluster-bootstrap → 클러스터 조인
```

---

### 7. Bitnami Kafka 이미지 유료화

**증상**
```
⚠ WARNING: Since August 28th, 2025, only a limited subset of images/charts are available for free.
Init:ImagePullBackOff
```

**원인**
Bitnami Kafka 이미지가 2025년 8월부터 유료화

**해결**
apache/kafka 공식 이미지로 직접 Deployment 배포

```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka
  namespace: ticketing-messaging
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kafka
  template:
    metadata:
      labels:
        app: kafka
    spec:
      containers:
      - name: kafka
        image: apache/kafka:3.7.0
        ports:
        - containerPort: 9092
        env:
        - name: KAFKA_NODE_ID
          value: "1"
        - name: KAFKA_PROCESS_ROLES
          value: "broker,controller"
        - name: KAFKA_LISTENERS
          value: "PLAINTEXT://:9092,CONTROLLER://:9093"
        - name: KAFKA_ADVERTISED_LISTENERS
          value: "PLAINTEXT://kafka.ticketing-messaging.svc.cluster.local:9092"
        - name: KAFKA_CONTROLLER_LISTENER_NAMES
          value: "CONTROLLER"
        - name: KAFKA_LISTENER_SECURITY_PROTOCOL_MAP
          value: "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT"
        - name: KAFKA_CONTROLLER_QUORUM_VOTERS
          value: "1@localhost:9093"
        - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
          value: "1"
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: kafka
  namespace: ticketing-messaging
spec:
  selector:
    app: kafka
  ports:
  - port: 9092
    targetPort: 9092
EOF
```

---

### 8. DB 없음으로 서비스 CrashLoopBackOff

**증상**
```
failed to resolve host 'auth-db': Name or service not known
```

**원인**
각 서비스가 연결할 DB Pod가 없음

**해결**
PostgreSQL 5개, MongoDB 1개 수동 배포

```bash
# PostgreSQL
for svc in auth concert reservation payment ticket; do
  kubectl run ${svc}-db \
    --image=postgres:16 \
    --env="POSTGRES_USER=user" \
    --env="POSTGRES_PASSWORD=password" \
    --env="POSTGRES_DB=${svc}_db" \
    --port=5432 \
    -n ticketing-${svc}
  kubectl expose pod ${svc}-db --port=5432 --name=${svc}-db -n ticketing-${svc}
done

# MongoDB
kubectl run notification-db \
  --image=mongo:7 \
  --env="MONGO_INITDB_DATABASE=notification_db" \
  --port=27017 \
  -n ticketing-notification
kubectl expose pod notification-db --port=27017 --name=notification-db -n ticketing-notification
```

**작동 원리**
```
서비스 values.yaml
→ DATABASE_URL: postgresql+psycopg://user:password@auth-db:5432/auth_db
→ K8s DNS: auth-db.ticketing-auth.svc.cluster.local
→ Service 이름이 auth-db → Pod로 트래픽 전달
```

---

### 9. ECR Secret 자동갱신 CronJob 이미지 문제

**증상**
```
/bin/sh: kubectl: command not found
```

**원인**
`amazon/aws-cli` 이미지에 kubectl이 없음

**해결 (임시)**
마스터 노드 crontab으로 10시간마다 자동 갱신

```bash
crontab -e
# 추가
0 */10 * * * /bin/bash -c 'ECR_PASSWORD=$(aws ecr get-login-password --region ap-northeast-2) && for ns in ticketing-auth ticketing-concert ticketing-reservation ticketing-payment ticketing-ticket ticketing-notification ticketing-dashboard; do kubectl delete secret ecr-registry -n ${ns} --ignore-not-found; kubectl create secret docker-registry ecr-registry --docker-server=941141115079.dkr.ecr.ap-northeast-2.amazonaws.com --docker-username=AWS --docker-password=${ECR_PASSWORD} -n ${ns}; done'
```

EC2 재생성 시에도 자동 등록되도록 Terraform user_data에 추가

수정 파일: `~/terraform-aws/main.tf`
```hcl
resource "aws_instance" "master" {
  ...
  user_data = <<-USERDATA
    #!/bin/bash
    (crontab -l 2>/dev/null; echo "0 */10 * * * /bin/bash -c '...'") | crontab -
  USERDATA
}
```

**최종 결정**
K8s CronJob은 Day4에서 실패 확인 후 제거. crontab + Terraform user_data 방식으로 최종 결정.
→ K8s CronJob: gitops에서 삭제
→ crontab: Terraform user_data에 등록하여 EC2 재생성 시에도 자동 적용

---

## 수정/생성된 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `service/.github/workflows/image-publish.yml` | Docker Buildx 추가, docker push step 제거, gitops 태그 업데이트 파일명 수정 |
| `service/Taskfile.yml` | 멀티 플랫폼(amd64/arm64) 빌드 적용 |
| `gitops/platform/ecr-secret-refresher/ecr-secret-refresher.yaml` | ECR Secret 자동갱신 CronJob 생성 |
| `gitops/argo/applications/aws-dev/platform/ecr-secret-refresher.yaml` | ArgoCD Application 등록 |
| `infra/infra/cluster/provision/ansible/inventories/aws/dev.ini` | 워커 IP 업데이트, worker-3 추가 |
| `~/terraform-aws/terraform.tfvars` | 마스터 r6g.large → r6g.medium, worker_count 2 → 3 |
| `~/terraform-aws/main.tf` | user_data crontab 추가 |
