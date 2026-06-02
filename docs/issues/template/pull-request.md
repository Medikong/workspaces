# Pull Request 작성 기준

PR 본문은 변경 설명서가 아니라 리뷰어가 머지 가능 여부를 판단하는 운영 기록이다. 기능 요약만 쓰지 않고, 영향 범위와 검증 근거를 함께 남긴다.

## 기본 원칙

- 변경 내용은 파일 목록이 아니라 기능 단위로 쓴다.
- 배경에는 이슈, 요구사항, 장애, 설계 결정 중 이 변경을 만든 이유를 적는다.
- 범위에는 포함한 것과 제외한 것을 함께 적는다.
- 운영 영향에는 namespace, CRD, Helm chart, secret, storage, network policy, 리소스 사용량을 확인한다.
- 검증에는 실제 실행한 명령과 사람이 확인한 결과를 분리해 적는다.
- 롤백에는 PR revert 외에 운영 환경에서 임시로 되돌릴 방법이 있으면 함께 적는다.

## 작성 템플릿

```markdown
## 변경 내용

-

## 배경

-

## 범위

포함:

-

제외:

-

## 운영 영향

- Namespace/CRD/Helm chart/storage/secret/network policy 변경:
- 배포 순서 또는 의존성:
- 리소스 사용량 또는 비용 영향:

## 배포 참고

- 배포 전 준비:
- 배포 후 확인:

## 검증

- [ ] `task validate`
- [ ] `git diff --check`
- [ ] 로컬 또는 대상 클러스터에서 핵심 동작 확인

확인 내용:

-

## 롤백

-

## 리스크와 후속 작업

-

## 관련 이슈

- Closes #
```

## GitOps PR 추가 기준

GitOps, Kubernetes, Helm, Argo CD 변경은 다음 항목을 별도로 확인한다.

- CRD 설치 여부와 설치 주체
- Argo CD Application 위치와 sync wave
- Helm chart version과 values 파일 위치
- namespace, secret, PVC, NetworkPolicy 영향
- 로컬 values와 운영 values의 차이
- 로컬 검증과 실제 클러스터 검증의 차이

## 예시

```markdown
## 변경 내용

- `platform/monitoring`에 `kube-prometheus-stack` GitOps 경로 추가
- backend 서비스 `/metrics`를 Prometheus `ServiceMonitor` scrape 대상으로 등록
- 로컬 `task dev`에서 Prometheus stack과 서비스 scrape 검증 경로 연결

## 배경

- GitOps issue #4의 Prometheus 배포와 서비스 metric scrape 등록 요구사항

## 범위

포함:

- Prometheus 기본 스택
- ServiceMonitor 기반 서비스 scrape 등록
- 로컬 개발환경 검증 경로

제외:

- Loki
- Tempo
- Alloy
- Alert rule
- Grafana dashboard

## 운영 영향

- `monitoring` namespace 생성
- `kube-prometheus-stack` CRD 설치
- Prometheus가 `release: kube-prometheus-stack` 라벨의 `ServiceMonitor` 선택
- 서비스 NetworkPolicy에 `monitoring` namespace scrape 허용 추가

## 검증

- [x] `task validate`
- [x] `git diff --check`
- [x] 로컬 Docker Desktop에서 `/healthz` 요청 후 `http_requests_total` 증가 확인

## 롤백

- 이 PR revert
- 로컬 환경은 `task dev:down`으로 정리

## 리스크와 후속 작업

- AWS dev cluster sync는 별도 확인 필요
- pod 상태 감지 alert rule은 후속 observability 이슈에서 진행

## 관련 이슈

- Closes #4
```
