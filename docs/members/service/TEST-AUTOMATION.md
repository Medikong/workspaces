# 테스트 시나리오 분산 및 자동화 설계

## 문서 목적

이 문서는 공연 티켓 예매 서비스의 검증 시나리오를 팀원들이 파일 단위로 나누어 정의하고, AWS 환경에서 순차 또는 선택 실행한 뒤, 결과 보고서를 수집하고 리소스를 다시 중지하는 자동화 구조를 정리한다.

목표는 단위 테스트처럼 `테스트 파일을 추가하면 자동 검증 대상에 포함되는 구조`를 만드는 것이다. 다만 일반 단위 테스트와 달리 이 검증은 Kubernetes, Gateway, Service Mesh, AWS 리소스, 부하 테스트, 장애 주입까지 포함한다.

## 핵심 방향

- 테스트 시나리오는 파일로 관리한다.
- 팀원은 담당 시나리오 YAML과 k6/Newman 스크립트를 추가한다.
- 공통 실행기는 시나리오 파일을 읽어 순서대로 실행한다.
- 테스트는 AWS에 배포된 실제 클러스터와 서비스를 대상으로 수행한다.
- 실행이 끝나면 보고서를 외부 저장소에 남긴다.
- 비용 절감을 위해 가능한 리소스는 삭제하지 않고 중지한다.
- 항상 유지해야 하는 리소스와 실행 때만 켜는 리소스를 분리한다.

## 추천 기술 스택

- **상위 실행기**: GitHub Actions
- **인프라 관리**: Terraform
- **클러스터 방식**: EC2 + kubeadm 기반 Kubernetes
- **서비스 배포**: Helm, ArgoCD
- **테스트 오케스트레이션**: Testkube
- **부하 테스트**: k6
- **API/E2E 테스트**: Postman Collection, Newman
- **Kubernetes 검증**: kubectl, istioctl
- **관측성**: Prometheus, Grafana, Loki, Tempo, Alertmanager
- **보고서 저장**: S3, GitHub Actions artifacts

## EKS 대신 EC2+kubeadm을 우선 고려하는 이유

이 프로젝트는 테스트가 끝난 뒤 인스턴스를 삭제하지 않고 중지하는 운영 방식을 원한다. 이 경우 EKS보다 EC2+kubeadm 클러스터가 더 단순하다.

- EKS control plane은 일반 EC2 인스턴스처럼 중지하는 모델이 아니다.
- EKS를 쓰면 worker node는 줄이거나 종료할 수 있지만, control plane 자체는 유지 비용과 수명 관리가 별도로 남는다.
- EC2+kubeadm 방식은 control-plane node와 worker node를 모두 EC2 인스턴스로 두고, 테스트 종료 후 stop/start 방식으로 관리하기 쉽다.
- 이미 클러스터를 kubeadm 기반으로 구성하려는 방향과도 잘 맞는다.

단, EC2+kubeadm은 클러스터 운영 책임이 커진다. kubelet, container runtime, 인증서, CNI, 노드 재시작 후 상태 복구를 직접 검증해야 한다.

## 리소스 수명 주기 분리

### 상시 유지 리소스

자주 바뀌지 않고, 매 테스트마다 삭제하면 비효율적인 리소스다.

- Terraform state backend
- IAM role, policy
- VPC, subnet, route table
- Security Group
- ECR repository
- S3 report bucket
- Route53 hosted zone 또는 고정 DNS 후보
- AMI 또는 EC2 launch template
- 고정 EBS volume 후보
- ArgoCD/Testkube/Grafana 설정 백업

### 실행 때 시작하고 끝나면 중지할 리소스

테스트 실행 시간에만 켜두고, 종료 후 stop 상태로 돌릴 리소스다.

- Kubernetes control-plane EC2 instance
- Kubernetes worker EC2 instances
- Bastion 또는 CI runner EC2 instance 후보
- RDS PostgreSQL instance 후보
- 테스트용 Redis/MongoDB/Kafka EC2 instance 후보

RDS는 중지할 수 있지만 장기간 정지 상태를 영구 유지하는 모델은 아니다. AWS 문서 기준으로 RDS DB instance는 일정 기간 정지 후 자동으로 다시 시작될 수 있으므로, 장기 비용 절감을 원하면 별도 스케줄러나 재중지 자동화가 필요하다.

### 실행 때 생성하고 끝나면 삭제할 리소스

중지 개념이 없거나, 유지 비용이 커서 매번 정리하는 편이 나은 리소스다.

- 임시 LoadBalancer
- 임시 test namespace
- 테스트 실행 pod/job
- Testkube test run resource
- k6 distributed runner pod
- 임시 Grafana snapshot job
- 임시 로그 수집 job

NAT Gateway처럼 중지할 수 없고 시간 비용이 발생하는 리소스는 가능하면 피하거나, 테스트 실행 중에만 생성하고 종료 시 삭제하는 후보로 둔다.

## 전체 실행 흐름

```text
수동 실행 또는 GitHub Actions dispatch
-> Terraform으로 상시 리소스 상태 확인
-> 중지된 EC2/RDS 리소스 시작
-> Kubernetes 노드 Ready 확인
-> ArgoCD/Helm으로 서비스 동기화
-> Testkube로 시나리오 목록 실행
-> k6/Newman/kubectl/istioctl 검증 수행
-> Prometheus/Grafana/Loki/Alertmanager 증거 수집
-> 시나리오별 보고서 생성
-> S3/GitHub Actions artifacts에 보고서 업로드
-> EC2/RDS 리소스 중지
```

실패가 발생해도 `보고서 수집`과 `리소스 중지` 단계는 반드시 실행해야 한다.

## 권장 폴더 구조

```text
validation/
├── README.md
├── suites/
│   ├── p0-core.yaml
│   ├── p1-resilience.yaml
│   └── p2-extended.yaml
├── scenarios/
│   ├── p0-normal-e2e.yaml
│   ├── p0-seat-query-spike.yaml
│   ├── p0-payment-circuit-breaker.yaml
│   ├── p0-notification-isolation.yaml
│   ├── p1-rate-limit.yaml
│   └── p1-canary-rollback.yaml
├── k6/
│   ├── seat-query-spike.js
│   ├── seat-contention.js
│   └── long-running-stability.js
├── postman/
│   └── reservation-flow.postman_collection.json
├── workflows/
│   ├── testkube-p0-core.yaml
│   └── collect-report.yaml
└── reports/
```

`reports/`는 로컬 확인용이고, 실제 장기 보관은 S3 또는 GitHub Actions artifact를 기준으로 둔다.

## 시나리오 파일 설계

각 시나리오는 하나의 YAML 파일로 정의한다.

```yaml
id: p0-payment-circuit-breaker
title: 결제 서비스 장애 시 Circuit Breaker 검증
priority: P0
owner: service-team
target:
  cluster: aws-kubeadm
  namespace: ticketing-payment
tools:
  - k6
  - kubectl
  - istioctl
  - grafana
setup:
  - name: payment-service 지연 모드 적용
    command: kubectl -n ticketing-payment set env deploy/payment-service PAYMENT_MODE=delay
run:
  - name: 예약 부하 실행
    type: k6
    script: validation/k6/seat-contention.js
assertions:
  - reservation_5xx_rate <= 1
  - payment_pending_ratio >= 95
  - circuit_breaker_open_count > 0
evidence:
  - k6_result
  - grafana_snapshot
  - loki_query
  - alertmanager_history
cleanup:
  - name: payment-service 정상 모드 복구
    command: kubectl -n ticketing-payment set env deploy/payment-service PAYMENT_MODE=normal
report:
  format:
    - markdown
    - json
  upload:
    - s3
    - github-actions-artifact
```

이 파일은 사람이 읽을 수 있어야 하고, 자동 실행기가 해석할 수 있어야 한다. 처음부터 완전한 엔진을 만들기보다 Testkube Workflow와 GitHub Actions에서 이 구조를 점진적으로 맞춰가는 방식이 좋다.

## 테스트 Suite 구성

팀원이 시나리오를 추가하더라도 실행 순서는 suite 파일에서 관리한다.

```yaml
id: p0-core
title: P0 핵심 검증 묶음
mode: sequential
scenarios:
  - p0-normal-e2e
  - p0-seat-query-spike
  - p0-payment-circuit-breaker
  - p0-notification-isolation
  - p0-hpa-scale-out
  - p0-observability-trace
stop_on_failure: false
collect_report_always: true
stop_resources_always: true
```

P0는 순차 실행을 기본으로 둔다. 부하 테스트와 장애 주입은 서로 영향을 줄 수 있으므로 병렬 실행을 기본값으로 두지 않는다.

## 검증 가능한 시나리오 예시

### 조회 폭주 검증

- 대상: `concert-service`, `reservation-service`, Kong Gateway
- 실행: k6로 좌석 조회 API에 200 VU 이상 부하
- 검증: P99, 5xx, HPA scale-out, Rate Limiting, Grafana 지표
- 증거: k6 report, HPA describe, Grafana screenshot, Kong log

### Circuit Breaker 검증

- 대상: `payment-service`, `reservation-service`, Istio
- 실행: payment-service 지연/실패 모드 적용
- 검증: 예약 유실 0건, reservation 5xx 1% 이하, `payment_pending` 전환
- 증거: Grafana, Loki, Alertmanager, reservation 상태 조회

### 서비스 차단 검증

- 대상: NetworkPolicy, ServiceAccount/RBAC, Istio AuthorizationPolicy 후보
- 실행: 허용되지 않은 pod 또는 외부 호출로 payment-service 직접 접근
- 검증: 비정상 접근 차단
- 증거: kubectl output, policy manifest, 서비스 로그

### Canary/Rollback 검증

- 대상: ArgoCD, Istio traffic split, Argo Rollouts 후보
- 실행: reservation-service 신규 버전 20%, 50%, 100% 전환
- 검증: 신규 버전 에러율, latency, rollback 시간
- 증거: ArgoCD sync history, rollout event, Grafana before/after

## 보고서 생성 방식

각 시나리오가 끝날 때 다음 보고서를 남긴다.

- 시나리오 ID
- 실행 시각
- 실행자 또는 trigger 정보
- 대상 commit/image tag
- 테스트 대상 endpoint
- 성공/실패 결과
- 주요 지표 요약
- 실패 assertion 목록
- 관련 로그 쿼리
- Grafana snapshot 또는 dashboard export
- k6/Newman 원본 결과
- cleanup 결과

보고서는 최소 Markdown과 JSON 두 종류로 남긴다.

- Markdown: 사람이 읽고 발표 자료에 옮기기 좋음
- JSON: 후속 자동 집계와 trend 비교에 좋음

## 자동화 실행기 역할 분리

### GitHub Actions

- 실행 trigger 제공
- AWS credential 주입
- Terraform plan/apply 호출
- EC2/RDS start 호출
- Testkube suite 실행 호출
- report artifact 업로드
- 실패 여부와 관계없이 stop 단계 호출

### Terraform

- 상시 리소스 생성
- EC2, EBS, security group, IAM, S3 bucket 관리
- 삭제보다 유지/중지 가능한 구조로 설계
- 테스트 실행용 tag 부여

### Testkube

- 클러스터 내부 테스트 실행
- k6/Newman/kubectl step 실행
- 시나리오별 결과 수집
- webhook 또는 dashboard로 결과 전달

### ArgoCD

- 서비스와 테스트 도구 배포 상태 유지
- Helm chart sync
- Canary/Rollback 시나리오의 배포 상태 증거 제공

## 비용과 안전장치

- 모든 테스트 리소스에는 `Project`, `Owner`, `Environment`, `AutoStop` tag를 붙인다.
- 실행 파이프라인은 동시에 하나만 돌도록 lock을 둔다.
- 테스트 시작 전에 예상 실행 시간을 기록한다.
- 테스트가 실패해도 report 수집과 stop 단계는 실행한다.
- stop 실패 시 Slack/GitHub 알림을 보낸다.
- 장시간 실행 방지를 위해 timeout을 둔다.
- report bucket은 destroy 대상에서 제외한다.
- RDS는 자동 재시작 가능성을 고려해 주기적 stop 자동화가 필요하다.
- NAT Gateway, LoadBalancer처럼 중지할 수 없는 비용 리소스는 사용 시간을 최소화한다.

## 팀원 작업 방식

팀원은 공통 실행 파이프라인을 수정하지 않고 시나리오 파일만 추가한다.

- 시나리오 YAML 추가
- 필요한 k6 script 또는 Postman collection 추가
- 성공 기준과 증거 항목 작성
- suite 파일에 시나리오 ID 추가
- PR에서 테스트 목적과 예상 비용/시간 명시

이렇게 하면 각 팀원이 `조회 폭주`, `결제 장애`, `알림 장애`, `서비스 차단`, `Canary/Rollback`을 독립적으로 맡아도 같은 자동화 체계에서 실행할 수 있다.

## 우선 구현 순서

- 상시 리소스와 중지 대상 리소스 분리
- S3 report bucket과 Terraform state backend 구성
- EC2+kubeadm 클러스터 start/stop 절차 검증
- ArgoCD, Testkube, Prometheus/Grafana/Loki 설치 자동화
- P0 정상 예매 E2E 시나리오 추가
- P0 조회 폭주 k6 시나리오 추가
- P0 결제 장애 Circuit Breaker 시나리오 추가
- 보고서 Markdown/JSON 생성과 S3 업로드 추가
- GitHub Actions에서 start -> run -> report -> stop 연결

## 참고

- AWS EC2 stop/start: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/Stop_Start.html
- AWS RDS stop/start: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_StopInstance.html
- Grafana k6 Operator: https://grafana.com/docs/k6/latest/testing-guides/running-distributed-tests/
- Testkube: https://docs.testkube.io/
- Argo Workflows: https://argoproj.github.io/workflows/
