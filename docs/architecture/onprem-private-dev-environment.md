# On-prem private-dev environment plan

이 문서는 제공받은 SSH 기반 온프레미스 서버 6대 위에 Medikong `private-dev` Kubernetes 환경을 추가하기 위한 `infra`와 `gitops` 작업 기준을 정리한다.

현재 문서는 두 부분으로 읽는다.

- 앞부분의 "현재 구현 상태"와 "운영 runbook"은 실제 적용된 상태를 기준으로 한다.
- 뒤쪽의 작업 목록과 설계 설명은 최초 구현 계획과 판단 배경을 보존한다.

## 현재 구현 상태

`private-dev`는 온프레미스 Kubernetes 클러스터 위에 별도 Argo CD tree로 추가되어 있다.

현재 기준:

- control-plane 접속은 로컬에서 `ssh terminal-lab`로 한다.
- node1 내부에서는 `ssh node1`부터 `ssh node6`까지 내부 alias로 접근할 수 있다.
- Kubernetes 클러스터 구성은 이미 완료된 상태로 보고, `kubeadm init`, worker join, CNI 설치는 다시 수행하지 않는다.
- `infra`는 inventory, node label, Longhorn 전제, ECR pull secret, private-dev Secret bootstrap을 담당한다.
- `gitops`는 Argo CD Application, Helm values, Kubernetes manifest 선언을 담당한다.
- ECR은 유지한다.
- AWS EBS CSI와 `medikong-aws-gp3`는 `private-dev`에서 사용하지 않는다.
- StorageClass는 `medikong-longhorn`을 사용한다.
- Longhorn replica count는 `1`이다.
- Kong은 node2에 고정하고 `hostPort`로 80/443을 직접 받는다.
- DB, Kafka, pgAdmin은 `private-dev` 클러스터 내부에 구성한다.
- pgAdmin과 DB 비밀번호는 문서나 values에 평문으로 남기지 않고 Kubernetes Secret으로 관리한다.

주요 적용 commit:

- `infra`: `95f2a9c feat: add private dev onprem bootstrap`
- `infra`: `32dd1af feat: expand private dev longhorn nodes`
- `infra`: `f81a339 fix: include private dev database urls in secrets`
- `gitops`: `781c0ef feat: add private dev gitops environment`
- `gitops`: `974702f fix: disable longhorn pre-upgrade hook for argocd`
- `gitops`: `9e0eeea fix: shrink private dev pvc requests`
- `gitops`: `b5d189f fix: load private dev database urls from secrets`

## 현재 노드 역할

| 노드 | SSH port | 내부 IP | 현재 역할 |
| --- | --- | --- | --- |
| node1 | `41093` | `10.0.2.91` | Kubernetes control-plane |
| node2 | `41038` | `10.0.1.49` | Kong ingress/gateway node |
| node3 | `41069` | `10.0.4.239` | worker, Longhorn storage 후보 |
| node4 | `41013` | `10.0.3.175` | worker, Longhorn storage 후보 |
| node5 | `41054` | `10.0.2.145` | worker, Longhorn storage 후보 |
| node6 | `41089` | `10.0.4.69` | worker, Longhorn storage 후보 |

처음 계획은 node6 하나만 Longhorn storage node로 쓰는 것이었다. 실제 배포 중 기본 root disk 여유 공간이 작아서 PVC 요구량을 줄이고 node3~node6에 storage label을 확장했다. replica count는 여전히 `1`이므로 storage HA를 제공하지 않는다.

현재 사용하는 주요 label:

```bash
kubectl label node node2 medikong.io/ingress-node=true --overwrite
kubectl label node node3 medikong.io/storage-node=true node.longhorn.io/create-default-disk=true --overwrite
kubectl label node node4 medikong.io/storage-node=true node.longhorn.io/create-default-disk=true --overwrite
kubectl label node node5 medikong.io/storage-node=true node.longhorn.io/create-default-disk=true --overwrite
kubectl label node node6 medikong.io/storage-node=true node.longhorn.io/create-default-disk=true --overwrite
```

## 현재 repo 경로

`infra` 주요 경로:

- `infra/cluster/provision/ansible-lab/inventories/lab/dev.ini`
- `infra/cluster/provision/ansible-lab/playbooks/bootstrap-node-labels.yml`
- `infra/cluster/provision/ansible-lab/playbooks/bootstrap-longhorn-node.yml`
- `infra/cluster/provision/ansible-lab/playbooks/bootstrap-ecr-secret.yml`
- `infra/cluster/provision/ansible-lab/playbooks/bootstrap-private-dev-secrets.yml`

`gitops` 주요 경로:

- `argo/applications/private-dev/root.yaml`
- `argo/applications/private-dev/platform/`
- `argo/applications/private-dev/services/`
- `values/env/private-dev.yaml`
- `values/services/private-dev/`
- `platform/storage/storageclass-longhorn.yaml`
- `platform/data-private-dev/`
- `platform/kong/values-private-dev.yaml`
- `platform/monitoring/values/kube-prometheus-stack-private-dev.yaml`
- `platform/observability/loki/values/private-dev.yaml`
- `platform/observability/tempo/values/private-dev.yaml`
- `platform/observability/collector/values/private-dev.yaml`
- `platform/synthetic/values/private-dev.yaml`

## Argo CD 배포 runbook

root Application은 `private-dev-root`가 아니라 `medikong-private-dev-apps`다.

로컬에서 root Application을 적용할 때:

```bash
ssh terminal-lab 'kubectl apply -f -' < /Users/danghamo/Documents/gituhb/medikong/gitops/argo/applications/private-dev/root.yaml
```

상태 확인:

```bash
ssh terminal-lab 'kubectl -n argocd get applications | grep private-dev'
```

root app hard refresh와 sync:

```bash
ssh terminal-lab 'kubectl -n argocd annotate application medikong-private-dev-apps argocd.argoproj.io/refresh=hard --overwrite'
ssh terminal-lab 'kubectl -n argocd patch application medikong-private-dev-apps --type merge -p "{\"operation\":{\"sync\":{\"prune\":true}}}"'
```

특정 child app sync:

```bash
ssh terminal-lab 'kubectl -n argocd annotate application <app-name> argocd.argoproj.io/refresh=hard --overwrite'
ssh terminal-lab 'kubectl -n argocd patch application <app-name> --type merge -p "{\"operation\":{\"sync\":{\"prune\":true}}}"'
```

## Longhorn 운영 기준

현재 Longhorn 설정:

- chart: `longhorn`
- namespace: `longhorn-system`
- StorageClass: `medikong-longhorn`
- provisioner: `driver.longhorn.io`
- replica count: `1`
- default data path: `/var/lib/longhorn`
- default disk는 label이 있는 node에 생성
- Argo CD 설치를 위해 `preUpgradeChecker.jobEnabled=false`
- 초기 작은 디스크 환경을 위해 reserved/minimal available percentage를 낮춰 시작

Longhorn 전제 패키지:

- RHEL 계열: `iscsi-initiator-utils`, `nfs-utils`, `util-linux`
- Debian/Ubuntu 계열 이름: `open-iscsi`, `nfs-common`, `util-linux`
- `iscsid`는 enabled/active 상태여야 한다.
- `/var/lib/longhorn` 디렉터리가 있어야 한다.

node6에서 확인했던 정상 예:

```bash
rpm -q nfs-utils iscsi-initiator-utils util-linux
test -d /var/lib/longhorn && echo longhorn-dir-ok
systemctl is-enabled iscsid
systemctl is-active iscsid
```

Longhorn 상태 확인:

```bash
ssh terminal-lab 'kubectl -n longhorn-system get pods'
ssh terminal-lab 'kubectl -n longhorn-system get volumes.longhorn.io'
ssh terminal-lab 'kubectl get storageclass medikong-longhorn'
ssh terminal-lab 'kubectl get pvc -A | grep medikong-longhorn'
```

## PVC 크기와 재생성 기준

초기 PVC 요구량이 온프레미스 root disk 크기에 비해 컸기 때문에 private-dev PVC 크기를 줄였다.

현재 기준:

- Grafana: `512Mi`
- Prometheus: `2Gi`
- Loki: `2Gi`
- Tempo: `1Gi`
- PostgreSQL DB: 각 `1Gi`
- Kafka: `2Gi`
- pgAdmin: `512Mi`

Kubernetes PVC는 기존 크기를 줄일 수 없다. values에서 `30Gi`를 `2Gi`로 바꿔도 이미 만들어진 PVC는 자동으로 작아지지 않는다. 데이터 폐기가 가능한 private-dev에서는 다음 순서로 회수하고 다시 만든다.

```bash
kubectl -n <namespace> delete deploy/<name> --ignore-not-found --wait=false
kubectl -n <namespace> delete sts/<name> --ignore-not-found --wait=false
kubectl -n <namespace> delete pvc <pvc-name> --ignore-not-found --wait=false
kubectl delete pv <pv-name> --ignore-not-found --wait=false
kubectl -n longhorn-system delete volumes.longhorn.io <pv-name> --ignore-not-found --wait=false
```

StorageClass가 `Retain`이면 PVC 삭제 후 PV와 Longhorn Volume CR이 남을 수 있다. 이 경우 PV와 `volumes.longhorn.io`를 같이 확인한다.

## ECR image pull 기준

ECR은 유지한다. 각 namespace에는 `ecr-registry` pull secret이 필요하다.

Secret 생성/갱신은 `infra` playbook에서 담당한다.

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook \
  -i /Users/danghamo/Documents/gituhb/medikong/infra/infra/cluster/provision/ansible-lab/inventories/lab/dev.ini \
  /Users/danghamo/Documents/gituhb/medikong/infra/infra/cluster/provision/ansible-lab/playbooks/bootstrap-ecr-secret.yml
```

온프레미스 노드는 `linux/amd64`다. ECR에 같은 tag가 있어도 arm64 manifest만 있으면 다음 에러가 난다.

```text
no match for platform in manifest
```

이 경우 amd64 전용 tag를 만들어 private-dev values에서 사용한다.

이미 처리한 예:

- `otel/opentelemetry-collector-contrib:0.153.0-amd64`
- `grafana/loki:3.6.7-amd64`
- `kiwigrid/k8s-sidecar:2.5.0-amd64`
- `grafana/tempo:2.9.0-amd64`

예시 명령:

```bash
docker buildx imagetools create \
  --platform linux/amd64 \
  -t 941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/grafana/tempo:2.9.0-amd64 \
  docker.io/grafana/tempo:2.9.0
```

## Secret 운영 기준

private-dev PostgreSQL Secret은 DB와 서비스가 같은 Secret을 공유한다.

각 Secret은 최소 두 key를 가진다.

- `password`: PostgreSQL `POSTGRES_PASSWORD`
- `database-url`: 서비스 `DATABASE_URL`

서비스 Deployment는 `DATABASE_URL`을 평문으로 갖지 않고 다음처럼 Secret에서 읽는다.

```yaml
valueFrom:
  secretKeyRef:
    name: postgres-auth-credentials
    key: database-url
```

`database-url`에는 URL-encoded password가 들어간다. 랜덤 비밀번호에는 `/`, `+`, `=` 같은 문자가 들어갈 수 있으므로 URL에 그대로 넣으면 파싱이 깨질 수 있다.

Secret 생성/갱신:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook \
  -i /Users/danghamo/Documents/gituhb/medikong/infra/infra/cluster/provision/ansible-lab/inventories/lab/dev.ini \
  /Users/danghamo/Documents/gituhb/medikong/infra/infra/cluster/provision/ansible-lab/playbooks/bootstrap-private-dev-secrets.yml
```

이 playbook은 필요한 값을 환경변수로 받는다. 문서나 values에는 password를 남기지 않는다.

pgAdmin 비밀번호 조회:

```bash
ssh terminal-lab 'kubectl -n ticketing-payment get secret pgadmin-private-dev-credentials -o jsonpath="{.data.password}" | base64 -d; echo'
```

## 자주 만난 문제와 해결

### 서비스 CrashLoopBackOff와 DB password mismatch

증상:

```text
FATAL: password authentication failed for user "user"
```

원인:

- DB는 Secret의 랜덤 password로 초기화됨
- 서비스는 `DATABASE_URL`에 `user:password` 고정값을 사용함

해결:

- PostgreSQL Secret에 `database-url` key 추가
- private-dev 서비스 values에서 `DATABASE_URL`을 `secretKeyRef`로 변경
- root app을 먼저 sync해서 child Application spec을 갱신
- 서비스 child app sync 후 Pod 재시작

### PostgreSQL lost+found

증상:

```text
initdb: error: directory "/var/lib/postgresql/data" exists but is not empty
```

원인:

- Longhorn/ext4 mount root에 `lost+found`가 존재함
- PostgreSQL 공식 이미지가 mount root를 직접 `PGDATA`로 쓰면 실패함

해결:

```yaml
- name: PGDATA
  value: /var/lib/postgresql/data/pgdata
```

### Kafka lost+found

증상:

```text
Found directory /var/lib/kafka/data/lost+found
```

해결:

```yaml
- name: KAFKA_LOG_DIRS
  value: /var/lib/kafka/data/kafka-logs
```

initContainer도 `/var/lib/kafka/data/kafka-logs`를 생성한다.

### pgAdmin PVC 권한

증상:

```text
Failed to create the directory /var/lib/pgadmin/sessions
Permission denied
```

해결:

- initContainer에서 `/var/lib/pgadmin`을 `5050:5050`으로 chown

### Longhorn pre-upgrade hook

증상:

- `longhorn-pre-upgrade` hook이 `longhorn-service-account`를 찾지 못하고 실패

해결:

```yaml
preUpgradeChecker:
  jobEnabled: false
```

Argo CD/GitOps 설치에서는 Longhorn pre-upgrade check job을 끄는 편이 안전하다.

## 목표

- AWS dev 환경을 없애지 않고, 온프레미스 전용 `private-dev` 환경을 추가한다.
- 서비스 Helm chart는 새로 복제하지 않고 `gitops/charts/medikong-service`를 공유한다.
- ECR은 계속 사용한다.
- AWS EBS CSI와 `gp3` StorageClass 의존성은 Longhorn CSI로 대체한다.
- node6 하나만 storage node로 사용한다.
- node2를 외부 URL이 들어오는 ingress/gateway node로 고정한다.
- node1은 이미 구성된 control-plane으로 본다.
- 온프레미스 서버 접속 정보, inventory, 노드 라벨링, Longhorn 노드 전제 작업은 `infra` repo가 담당한다.
- Kubernetes 선언, Argo CD Application, Helm values, StorageClass, Kong/observability 설정은 `gitops` repo가 담당한다.

## 제공받은 서버 정보

SSH 접속 endpoint는 다음과 같다.

```bash
ssh lab-lee89578-fdf12b@external.terminal-lab.kr -p 41038
ssh lab-lee89578-fdf12b@external.terminal-lab.kr -p 41054
ssh lab-lee89578-fdf12b@external.terminal-lab.kr -p 41093
ssh lab-lee89578-fdf12b@external.terminal-lab.kr -p 41069
ssh lab-lee89578-fdf12b@external.terminal-lab.kr -p 41089
ssh lab-lee89578-fdf12b@external.terminal-lab.kr -p 41013
```

노드와 SSH port, 내부 IP 정보는 다음과 같다.

| 노드 | SSH port | 내부 IP | 계획된 역할 |
| --- | --- | --- | --- |
| node1 | `41093` | `10.0.2.91/8` | Kubernetes control-plane |
| node2 | `41038` | `10.0.1.49/8` | 외부 URL 대상, Kong ingress/gateway node |
| node3 | `41069` | `10.0.4.239/8` | worker |
| node4 | `41013` | `10.0.3.175/8` | worker |
| node5 | `41054` | `10.0.2.145/8` | worker |
| node6 | `41089` | `10.0.4.69/8` | Longhorn storage node |

## Repo 책임 경계

### workspace

`workspace`는 이 문서처럼 repo 간 공통 결정과 설계 기준을 남긴다.

- 온프레미스 환경 추가 배경과 repo별 작업 분담을 기록한다.
- 실제 Kubernetes manifest, Ansible inventory, Terraform, playbook을 직접 소유하지 않는다.
- `service`, `gitops`, `infra` repo 내부 변경을 대신 관리하지 않는다.

### infra

`infra`는 이미 구성된 온프레미스 Kubernetes 클러스터 위에 노드 역할과 storage 전제를 추가한다.

- 온프레미스 전용 Ansible inventory 작성 또는 기존 inventory 보강
- node2 ingress 라벨 부여
- node6 Longhorn storage 라벨 부여
- node6 Longhorn data path 디렉터리 준비
- Longhorn 전제 패키지 설치
- ECR pull을 위한 Kubernetes registry secret 생성 지원
- 외부 URL이 node2의 HTTP/HTTPS endpoint로 들어오도록 서버/네트워크 전제 확인

### gitops

`gitops`는 이미 준비된 클러스터 위에 배포 선언을 동기화한다.

- `private-dev` Argo CD Application tree 추가
- `private-dev` service values 조합 추가
- AWS EBS CSI Application 제거 또는 private-dev tree에서 제외
- Longhorn Helm Application 추가
- Longhorn StorageClass 추가
- Kong private-dev values 추가
- monitoring/observability private-dev values 추가
- synthetic traffic private-dev values 추가
- `ecr-registry` imagePullSecret 이름은 유지하되, secret은 infra가 클러스터에 준비한다는 전제로 사용
- 온프레미스 전제와 라벨 요구사항을 README 또는 docs에 기록

### service

`service`는 애플리케이션 코드와 image build/push를 담당한다.

- ECR image repository와 tag 사용은 유지한다.
- Kubernetes 환경 차이를 위해 서비스 코드를 수정하지 않는다.
- 필요하면 ECR에 온프레미스에서 사용할 image tag를 게시한다.

## 현재 gitops 구조에서 유지할 것

현재 `gitops`는 공통 Helm chart와 values layering을 사용한다.

```text
values/base.yaml
-> values/env/<env>.yaml
-> values/services/<service>.yaml
-> values/overrides/<env>/<service>.yaml
```

`private-dev`에서도 이 원칙을 유지한다.

- `charts/medikong-service`는 공유한다.
- `values/services/*.yaml`은 서비스 고유 설정으로 유지한다.
- 온프레미스 차이는 `values/env/private-dev.yaml`과 `values/overrides/private-dev/*`에 둔다.
- Argo CD tree는 `argo/applications/private-dev/platform`과 `argo/applications/private-dev/services`로 분리한다.
- 기존 `aws-dev` tree는 지우지 않는다.

## 유지할 AWS 의존성

ECR은 그대로 사용한다.

- `values/env/private-dev.yaml`의 image registry는 ECR registry를 유지할 수 있다.
- 각 서비스 image repository/tag는 기존 서비스 values 또는 private-dev override를 따른다.
- `imagePullSecrets`의 secret 이름은 `ecr-registry`를 유지한다.
- 온프레미스 클러스터에는 `ecr-registry` Secret을 새로 만들어야 한다.
- ECR 접근 권한, token 갱신 방식, secret 생성 자동화는 `infra` 작업으로 둔다.

## 바꿔야 할 AWS 의존성

### EBS CSI

`aws-dev`의 `aws-ebs-csi-driver` Application은 `private-dev`에 포함하지 않는다.

대체 작업:

- Longhorn Helm Application을 `argo/applications/private-dev/platform/longhorn.yaml` 또는 유사한 위치에 추가한다.
- Longhorn namespace는 일반적으로 `longhorn-system`을 사용한다.
- Longhorn 설치는 storage sync wave에서 monitoring/observability보다 먼저 동기화되게 둔다.

### StorageClass

`medikong-aws-gp3`는 AWS EBS용이다. `private-dev`에서는 Longhorn StorageClass를 새로 둔다.

권장 이름:

```text
medikong-longhorn
```

기본 정책:

- provisioner: `driver.longhorn.io`
- replica count: `1`
- reclaim policy: `Retain`
- allow volume expansion: `true`
- volume binding: Longhorn chart/StorageClass 기본값을 확인해 명시

node6 하나만 storage node로 사용하므로 Longhorn replica 수는 반드시 1로 시작한다. replica 3을 쓰려면 storage node가 최소 3개 필요하다.

### Monitoring and observability PVC

다음 값들은 `private-dev` 전용 values에서 `medikong-longhorn`으로 바꾼다.

- Grafana PVC StorageClass
- Prometheus PVC StorageClass
- Loki PVC StorageClass
- Tempo PVC StorageClass

현재 aws-dev의 `medikong-aws-gp3` 참조는 private-dev values로 복제할 때 그대로 가져오면 안 된다.

### Grafana URL

aws-dev values에는 AWS ELB 주소가 들어 있다. `private-dev`에서는 node2에 연결된 외부 URL을 사용한다.

예시:

```yaml
grafana:
  grafana.ini:
    server:
      root_url: https://<external-url>/grafana/
      serve_from_sub_path: true
```

외부 URL이 HTTP만 사용되면 `http://`로 둔다. HTTP/HTTPS를 모두 제공한다면 최종 사용자에게 안내할 대표 URL을 하나 정한다.

### Synthetic traffic URL

`platform/synthetic/values/private-dev.yaml`을 추가하고 base URL을 private-dev 진입점에 맞춘다.

내부 검증은 Kong cluster service를 사용할 수 있다.

```yaml
synthetic:
  target: internal
  baseUrl: http://kong-kong-proxy.kong.svc.cluster.local
  internalBaseUrl: http://kong-kong-proxy.kong.svc.cluster.local
```

외부 URL 검증도 필요하면 별도 scenario나 env 값으로 외부 URL을 둔다.

```yaml
synthetic:
  externalBaseUrl: https://<external-url>
```

### SealedSecret

SealedSecret은 클러스터의 sealed-secrets public key에 묶인다. aws-dev에서 만든 `synthetic-traffic-credentials.sealedsecret.yaml`은 private-dev 클러스터에서 그대로 쓸 수 없다고 본다.

대체 작업:

- private-dev 클러스터의 sealed-secrets controller를 설치한다.
- private-dev public key 기준으로 synthetic credential Secret을 다시 sealing한다.
- 파일은 shared path를 그대로 쓰기보다 private-dev 전용 경로로 분리하는 편이 안전하다.

### Taskfile entrypoint

기존 `aws:check`, `aws:bootstrap`, `aws:status`는 AWS 이름을 가진 진입점이다.

private-dev 추가 시 권장 task:

- `private:check`
- `private:bootstrap`
- `private:status`

또는 더 명확하게:

- `onprem:check`
- `onprem:bootstrap`
- `onprem:status`

이 task는 service Helm release를 직접 배포하지 않고 Argo CD Application 진입점을 등록하거나 상태를 확인하는 역할만 맡는다.

## 외부 URL과 Kong 고정

외부 도메인/URL 제공자가 특정 서버를 대상으로 HTTP/HTTPS URL을 만들 수 있다.

결정:

- 외부 URL 대상은 node2로 둔다.
- node2에는 ingress 라벨을 붙인다.
- Kong proxy pod는 node2에 고정한다.
- node1 control-plane은 외부 진입점으로 쓰지 않는다.
- node6 storage node는 외부 진입점으로 쓰지 않는다.

필요 라벨:

```bash
kubectl label node node2 medikong.io/ingress-node=true
```

Kong private-dev values 전제:

```yaml
replicaCount: 1

nodeSelector:
  medikong.io/ingress-node: "true"
```

Kong은 node2의 80/443을 `hostPort`로 직접 받는다.

### hostPort

Kong pod만 node2에 고정하고 container port를 host port 80/443에 연결한다.

장점:

- node2의 80/443으로 들어오는 요청을 Kubernetes Pod가 바로 받을 수 있다.
- 별도 Nginx/Caddy를 둘 필요가 없다.

주의:

- Kong chart가 hostPort 설정을 어떻게 받는지 chart values를 확인해야 한다.
- node2에서 80/443을 쓰는 다른 프로세스가 없어야 한다.
- Kong replica는 1개로 둔다.
- node2 장애 시 외부 접속이 끊긴다.

현재 판단은 hostPort가 NodePort + 별도 reverse proxy보다 단순하다는 것이다. 단, "레이블만"으로 끝나는 것은 아니다. 라벨은 Kong pod를 node2에 배치하는 역할이고, 80/443을 실제로 받으려면 hostPort 설정이 필요하다.

## Longhorn storage node 고정

node6 하나만 storage node로 사용한다.

필요 라벨:

```bash
kubectl label node node6 node.longhorn.io/create-default-disk=true
```

Longhorn default setting 전제:

- labeled node에만 default disk를 만든다.
- default data path는 infra에서 준비한 node6 디렉터리로 둔다.
- replica count는 1로 둔다.
- node6 하나만 storage node이므로 storage HA는 제공하지 않는다.

infra에서 준비할 후보 디렉터리:

```text
/var/lib/longhorn
```

필요하면 node6에 별도 disk mount를 붙이고 그 mount path를 Longhorn data path로 사용한다. 제공받은 서버가 "node6을 저장공간으로 제공"한다는 조건이므로, 실제 block device와 mount 상태 확인은 infra bootstrap 초기에 수행한다.

## infra repo 작업 목록

### Inventory

온프레미스 전용 inventory를 추가한다.

예시 구조:

```ini
[control_plane]
node1 ansible_host=external.terminal-lab.kr ansible_port=41093 node_ip=10.0.2.91

[workers]
node2 ansible_host=external.terminal-lab.kr ansible_port=41038 node_ip=10.0.1.49
node3 ansible_host=external.terminal-lab.kr ansible_port=41069 node_ip=10.0.4.239
node4 ansible_host=external.terminal-lab.kr ansible_port=41013 node_ip=10.0.3.175
node5 ansible_host=external.terminal-lab.kr ansible_port=41054 node_ip=10.0.2.145
node6 ansible_host=external.terminal-lab.kr ansible_port=41089 node_ip=10.0.4.69

[k8s_cluster:children]
control_plane
workers

[ingress_nodes]
node2

[longhorn_storage_nodes]
node6

[all:vars]
ansible_user=lab-lee89578-fdf12b
ansible_ssh_common_args='-o StrictHostKeyChecking=accept-new'
```

### Existing cluster assumptions

Kubernetes 클러스터 구성은 이미 완료된 상태로 본다. 따라서 이 문서의 infra 작업은 kubeadm 초기화나 worker join을 다시 수행하지 않는다.

전제:

- node1은 control-plane으로 이미 구성되어 있다.
- node2, node3, node4, node5, node6은 worker로 이미 join되어 있다.
- 각 node는 `10.0.x.x` 내부 IP로 Kubernetes Node에 등록되어 있다.
- CNI, Helm, metrics-server, Argo CD는 이미 설치되어 있거나 별도 기존 절차로 준비되어 있다.
- 이번 infra 추가 작업은 node label, node6 Longhorn data path, Longhorn 전제 패키지, ECR pull secret 준비에 집중한다.

### Node labels

온프레미스용 별도 playbook에서 라벨을 부여한다.

```bash
kubectl label node node2 medikong.io/ingress-node=true --overwrite
kubectl label node node6 node.longhorn.io/create-default-disk=true --overwrite
```

필요하면 추가 라벨도 둔다.

```bash
kubectl label node node6 medikong.io/storage-node=true --overwrite
```

Kong values는 `medikong.io/ingress-node=true`를 사용하고, Longhorn은 `node.longhorn.io/create-default-disk=true`를 사용한다.

### Longhorn prerequisites

Longhorn 설치 전 노드 패키지와 커널 조건을 맞춘다.

후보 패키지:

- `open-iscsi`
- `nfs-common`
- `util-linux`
- `mount`

node6 준비:

- Longhorn data path 생성
- 필요한 경우 별도 disk mount
- reboot 이후 mount 유지 확인
- 디스크 여유 공간 확인

### ECR pull secret

ECR은 유지하므로 private-dev 클러스터에도 image pull secret이 필요하다.

권장 Secret 이름:

```text
ecr-registry
```

Secret namespace 정책:

- 서비스 namespace마다 `ecr-registry`를 만든다.
- 또는 imagePullSecret 복제를 자동화하는 별도 절차를 둔다.

대상 namespace:

- `ticketing-auth`
- `ticketing-concert`
- `ticketing-reservation`
- `ticketing-payment`
- `ticketing-ticket`
- `ticketing-notification`
- `ticketing-dashboard`
- `synthetic`
- `observability`에서 ECR mirror image를 계속 쓰는 경우

ECR token은 만료되므로 갱신 절차가 필요하다. 이 자동화는 infra 또는 운영 runbook에서 다룬다.

### External URL validation

외부 URL 제공자가 node2의 HTTP/HTTPS로 요청을 보낼 수 있는지 확인한다.

확인 항목:

- 외부 URL 대상 서버가 node2인지
- HTTP 80이 node2로 들어오는지
- HTTPS 443이 node2로 들어오는지
- TLS 종료가 외부 URL 제공자에서 되는지, node2/Kong에서 되는지
- node2에서 80/443을 쓰는 기존 프로세스가 없는지

## gitops repo 작업 목록

### Environment values

추가 파일:

```text
values/env/private-dev.yaml
```

포함할 내용:

- `environment: private-dev`
- ECR registry 유지
- `imagePullSecrets: ecr-registry`
- tracing endpoint는 in-cluster collector service 유지
- HPA/PDB/ServiceMonitor 정책은 aws-dev를 기준으로 시작하되 리소스는 온프레미스 서버 크기에 맞게 조정

### Argo CD tree

추가 경로:

```text
argo/applications/private-dev/root.yaml
argo/applications/private-dev/platform/
argo/applications/private-dev/services/
```

기본 원칙:

- aws-dev tree를 복제해 시작하되 AWS 전용 Application은 제외한다.
- service Application의 valueFiles는 `values/env/private-dev.yaml`을 바라보게 한다.
- releaseName은 `reservation-private-dev` 같은 이름으로 둔다.
- destination namespace는 기존 서비스 namespace를 유지한다.

### Platform Applications

private-dev platform tree 후보:

- `longhorn.yaml`
- `storage.yaml`
- `sealed-secrets.yaml`
- `kong.yaml`
- `kong-shared-resources.yaml`
- `monitoring.yaml`
- `tempo.yaml`
- `loki.yaml`
- `collector.yaml`
- `policies.yaml`
- `synthetic-credentials.yaml`
- `synthetic.yaml`
- 필요 시 `data.yaml`

private-dev에서 제외할 aws-dev Application:

- `aws-ebs-csi-driver.yaml`

### Storage

추가 파일 후보:

```text
platform/storage/storageclass-longhorn.yaml
```

또는 환경별 storage 디렉터리를 분리한다.

```text
platform/storage/private-dev/storageclass-longhorn.yaml
```

StorageClass 이름은 `medikong-longhorn`으로 둔다.

### Longhorn values

추가 파일 후보:

```text
platform/longhorn/values-private-dev.yaml
```

포함할 값:

- default replica count 1
- default data path `/var/lib/longhorn`
- labeled node에만 default disk 생성
- Longhorn UI 노출은 기본적으로 외부에 열지 않음

Longhorn UI가 필요하면 port-forward 또는 내부 접근 방식부터 사용한다. 외부 URL에 바로 노출하지 않는다.

### Kong values

추가 파일:

```text
platform/kong/values-private-dev.yaml
```

포함할 값:

- DB-less Kong 유지
- replica 1
- nodeSelector로 node2 고정
- hostPort로 HTTP/HTTPS 80/443 수신

Kong Service type은 chart 설정 방식에 따라 달라질 수 있다.

- hostPort를 쓰면 Service type은 ClusterIP 또는 NodePort 중 실제 chart 요구에 맞춘다.
- 단순 NodePort만 쓰면 외부 URL이 `32407/32443`으로 연결될 수 있어야 한다.

현재 조건은 외부 URL이 HTTP/HTTPS를 지원하므로 80/443 직접 수신 쪽이 더 단순하다.

### Monitoring values

추가 파일:

```text
platform/monitoring/values/kube-prometheus-stack-private-dev.yaml
```

변경점:

- Grafana `root_url`을 private-dev 외부 URL로 변경
- Grafana PVC StorageClass를 `medikong-longhorn`으로 변경
- Prometheus PVC StorageClass를 `medikong-longhorn`으로 변경
- nodeSelector는 처음에는 비워두거나 필요한 경우 운영 전용 라벨을 별도로 정한다.
- node6은 storage node일 뿐 observability pod 고정 대상은 아니다.

### Observability values

추가 파일:

```text
platform/observability/loki/values/private-dev.yaml
platform/observability/tempo/values/private-dev.yaml
platform/observability/collector/values/private-dev.yaml
```

변경점:

- Loki/Tempo StorageClass를 `medikong-longhorn`으로 변경
- ECR image mirror를 유지할지 upstream image를 직접 pull할지 결정
- ECR을 유지한다면 `imagePullSecrets`와 registry 값을 유지한다.
- collector는 daemonset으로 각 노드의 log path를 읽으므로 hostPath 설정은 유지한다.

### Synthetic values

추가 파일:

```text
platform/synthetic/values/private-dev.yaml
```

변경점:

- ECR registry 유지
- `image.pullSecrets: ecr-registry` 유지
- internal base URL은 Kong service DNS 사용
- external base URL은 node2에 연결된 외부 URL 사용
- synthetic credential SealedSecret은 private-dev용으로 재생성

### Data platform

현재 `platform/data`는 Docker Desktop local dev 전용으로 문서화되어 있고 aws-dev Argo CD Application에는 포함되지 않는다.

private-dev에서는 DB/Kafka를 클러스터 안에 구성한다. 외부 managed DB나 별도 DB 서버를 쓰는 방향은 현재 범위가 아니다.

필요한 작업:

- `platform/data`를 그대로 운영 경로로 승격하지 말고 private-dev 전용 data platform 경로를 만든다.
- `platform/data-private-dev` 또는 `platform/data/overlays/private-dev` 같은 환경 전용 구조를 추가한다.
- PostgreSQL, MongoDB, Kafka, pgAdmin을 private-dev Argo platform tree에 포함한다.
- PostgreSQL/MongoDB/Kafka PVC에 `storageClassName: medikong-longhorn` 명시
- pgAdmin 접속은 유지한다. 외부 접속은 node2에 고정된 Kong 경로를 기준으로 제공한다.
- pgAdmin 비밀번호가 필요할 때는 SSH로 온프레미스 클러스터에 접속해 Kubernetes Secret에서 조회한다.
- DB password는 plain value에서 Secret 참조로 전환 필요

중요: 현재 `platform/data`의 DB password는 로컬 dev용 평문 값이므로 private-dev 운영 경로에 그대로 쓰지 않는다.
pgAdmin 비밀번호도 문서나 values에 평문으로 남기지 않는다.

### Documentation

gitops repo에는 다음을 남긴다.

- private-dev 환경 구조
- node2/node6 라벨 전제
- ECR은 유지하고 EBS만 Longhorn으로 대체한다는 기준
- Longhorn replica 1의 한계
- 외부 URL이 node2에 고정된다는 운영 전제
- `aws-dev`와 `private-dev`의 차이

## 권장 구현 순서

1. infra에서 SSH port와 node 이름 매핑을 inventory에 반영한다.
2. infra에서 온프레미스 inventory를 작성하거나 기존 inventory를 보강한다.
3. infra에서 node2/node6 라벨 playbook을 추가한다.
4. infra에서 node6 Longhorn data path와 필수 패키지를 준비한다.
5. infra에서 ECR `ecr-registry` Secret 생성 절차를 마련한다.
6. gitops에서 `private-dev` Argo tree를 추가한다.
7. gitops에서 Longhorn Application과 `medikong-longhorn` StorageClass를 추가한다.
8. gitops에서 Kong private-dev values를 추가하고 node2 고정 및 hostPort 80/443 수신을 설정한다.
9. gitops에서 monitoring/observability private-dev values를 추가한다.
10. gitops에서 service Application valueFiles를 `values/env/private-dev.yaml`로 연결한다.
11. gitops에서 synthetic private-dev values와 credential 재생성 경로를 추가한다.
12. DB/Kafka/pgAdmin을 private-dev 클러스터 안에 구성하기 위한 data platform private-dev 경로를 추가한다.
13. private-dev root Application을 Argo CD에 등록한다.
14. node2 외부 URL로 `/auth`, `/concerts`, `/grafana/` 같은 대표 경로를 확인한다.

## 검증 기준

infra 검증:

- `kubectl get nodes -o wide`에서 6개 node가 Ready
- node1이 control-plane
- node2에 `medikong.io/ingress-node=true`
- node6에 `node.longhorn.io/create-default-disk=true`
- node6의 Longhorn data path가 존재하고 mount 상태가 유지됨
- `ecr-registry` Secret이 필요한 namespace에 존재
- pgAdmin 비밀번호가 Kubernetes Secret에 있고 SSH 접속 후 조회할 수 있음

gitops 검증:

- private-dev Argo root Application이 Synced/Healthy
- Longhorn manager/driver pod가 Ready
- `medikong-longhorn` StorageClass가 존재
- Grafana/Prometheus/Loki/Tempo PVC가 Bound
- Kong pod가 node2에 배치됨
- Kong이 HTTP/HTTPS 요청을 수신
- 서비스 pod가 ECR image를 pull
- synthetic job이 internal Kong endpoint를 대상으로 성공

외부 URL 검증:

- HTTP URL이 node2 Kong으로 도달
- HTTPS URL이 node2 Kong으로 도달하거나 외부 URL 제공자에서 TLS 종료 후 HTTP로 전달
- `/grafana/` root URL과 sub path가 맞음
- 인증 API와 주요 서비스 API가 Kong route를 통해 응답

## 리스크와 명시적 한계

- node6 하나만 storage node로 쓰면 Longhorn storage HA는 없다.
- node6 장애 시 Longhorn PVC를 사용하는 workload가 영향을 받는다.
- node2 하나에 외부 URL을 고정하면 node2 장애 시 외부 접속이 끊긴다.
- hostPort 방식은 node2의 80/443 port 충돌을 피해야 한다.
- ECR token은 만료되므로 pull secret 갱신 자동화가 필요하다.
- SealedSecret은 클러스터별 public key에 묶이므로 private-dev용으로 다시 생성해야 한다.
- private-dev data platform은 DB password와 Secret 관리 방식을 로컬 dev 값에서 반드시 분리해야 한다.
- pgAdmin 비밀번호는 문서와 values에 남기지 않고, 필요할 때 SSH 접속 후 Secret에서 조회해야 한다.
- `aws-dev` 문서와 values를 단순 복사하면 ELB URL, EBS StorageClass, IAM/EBS 전제가 남을 수 있다.

## 아직 확정해야 할 질문

- SSH port와 node 이름의 정확한 매핑은 무엇인가?
- 외부 URL 제공자는 TLS를 직접 종료하는가, 아니면 node2의 443으로 그대로 전달하는가?
- ECR pull secret 갱신은 infra playbook, CronJob, 수동 runbook 중 어디에서 담당할 것인가?
- Longhorn data path는 node6의 기본 disk를 쓸 것인가, 별도 mount disk를 쓸 것인가?

## 현재 결론

현재 기준의 가장 단순한 구성은 다음과 같다.

- node1: control-plane
- node2: 외부 URL 대상 ingress/gateway node
- node3~node5: 일반 worker
- node6: Longhorn storage node
- ECR: 유지
- EBS CSI: private-dev에서 제외
- StorageClass: `medikong-longhorn`
- Longhorn replica: 1
- DB/Kafka/pgAdmin: private-dev 클러스터 내부 구성
- service chart: `charts/medikong-service` 공유
- environment: `private-dev` 추가
- inventory/playbook/노드 라벨/Longhorn 노드 전제: `infra`
- Argo/Helm/Kubernetes 선언: `gitops`
