# Grafana 대시보드 코드화 방식 검토

관련 문서:

- `system-metrics.md`: 시스템/Kubernetes 메트릭 수집 기준
- `service-metrics.md`: 서비스 공통/서비스별 애플리케이션 메트릭 구현 기준
- `../implementation/README.md`: 관측성 구현 진입점

이 문서는 Grafana dashboard를 코드로 관리하는 방식을 비교한 기록이다. Medikong의 현재 확정 방식은 `ConfigMap + dashboard JSON`이다. 운영 기준은 `system-metrics.md`와 이후 `gitops/platform/monitoring` 구현 문서를 따른다.

## 확정 방식

| 방법 | 방식 | 장점 | 단점 | Medikong 판단 |
|---|---|---|---|---|
| ConfigMap + dashboard JSON | Grafana dashboard JSON을 ConfigMap에 넣고 `grafana_dashboard=1` label을 붙인다. | kube-prometheus-stack sidecar와 바로 맞고 GitOps로 관리하기 쉽다. | JSON이 길고 손으로 편집하기 어렵다. | 확정 |

확정 이유:

- 현재 `kube-prometheus-stack` values가 이미 Grafana dashboard sidecar를 사용한다.
- sidecar가 `grafana_dashboard=1` label이 붙은 ConfigMap을 `monitoring` namespace에서 찾도록 설정되어 있다.
- `allowUiUpdates: false`로 UI 수동 변경을 운영 기준으로 삼지 않는 방향과 맞다.
- Argo CD가 ConfigMap을 동기화하므로 대시보드도 GitOps 변경 이력에 남는다.

## 대안

| 방법 | 방식 | 장점 | 단점 | 현재 판단 |
|---|---|---|---|---|
| Jsonnet/grafonnet | Jsonnet으로 dashboard를 작성하고 JSON/ConfigMap을 생성한다. | 반복 패널, 변수, 공통 query 재사용이 쉽다. | 빌드 단계와 생성물 관리 규칙이 필요하다. | dashboard가 여러 개로 늘고 중복이 커질 때 재검토 |
| Helm values 내 dashboard 정의 | chart values에 dashboard provider 또는 dashboard JSON을 넣는다. | chart 하나로 배포할 수 있다. | values가 커지고 review가 어렵다. | 작은 실험 외에는 비권장 |
| Terraform Grafana provider | Grafana HTTP API를 Terraform state로 관리한다. | Grafana Cloud나 외부 Grafana 운영에는 익숙하다. | cluster 내부 GitOps와 인증/state 관리가 별도로 생긴다. | 현재 Kubernetes GitOps에는 비우선 |
| Grafana Operator | Dashboard를 Kubernetes CRD로 관리한다. | dashboard/datasource/folder를 K8s 리소스로 다룰 수 있다. | Operator가 하나 더 필요하고 운영면이 늘어난다. | 필요해질 때 검토 |
| Grafana API import script | CI나 Taskfile에서 API로 dashboard를 import한다. | 기존 dashboard 이관에는 빠르다. | 최종 상태가 GitOps보다 API 실행 이력에 묶이기 쉽다. | 마이그레이션 보조 수단 |

## 재검토 조건

다음 조건이 생기기 전까지는 `ConfigMap + dashboard JSON`을 유지한다.

- dashboard JSON 중복이 커져 review가 어려워진다.
- 공통 변수, 공통 panel, 공통 datasource 설정을 여러 dashboard에서 반복한다.
- 환경별 dashboard 변형이 많아져 생성 도구가 필요해진다.
- Grafana가 Kubernetes cluster 밖으로 이동하거나 Grafana Cloud 운영이 확정된다.

이 조건이 생기면 Jsonnet/grafonnet을 먼저 검토한다. Terraform, Grafana Operator, API import script는 운영 경계가 바뀌었을 때만 다시 본다.
