---
id: TROUBLE-008
title: "Grafana dashboard UID 길이 초과로 Load 50 미노출"
status: resolved
priority: p2
severity: medium
area: observability
repos:
  - gitops
  - workspace
owner: unassigned
created: 2026-06-15
updated: 2026-06-15
resolved: 2026-06-15
tags:
  - grafana
  - dashboard
  - loadtest
  - gitops
  - provisioning
related:
  - gitops/platform/monitoring/dashboards/load/load-50-service-resource-and-traffic.json
  - gitops/platform/monitoring/kustomization.yaml
links: []
---

# Grafana dashboard UID 길이 초과로 Load 50 미노출

## Context

부하 테스트 관측을 위해 `gitops/platform/monitoring/dashboards/load/load-50-service-resource-and-traffic.json` 대시보드를 추가했다. 로컬 환경에서는 `kubectl apply -k gitops/platform/monitoring`으로 ConfigMap을 갱신하고, Grafana sidecar가 ConfigMap의 dashboard JSON을 `/tmp/dashboards/Load` 아래에 동기화한다.

Kubernetes 리소스와 sidecar 동기화는 정상처럼 보였지만, Grafana UI와 API에서는 `Load 50 - Service Resource and Traffic` 대시보드가 보이지 않았다.

## Symptoms

- 관찰된 현상:
  - `medikong-load-dashboards` ConfigMap에 `load-50-service-resource-and-traffic.json`이 들어 있었다.
  - Grafana sidecar 로그에는 해당 파일을 `/tmp/dashboards/Load/load-50-service-resource-and-traffic.json`로 썼다는 기록이 남았다.
  - sidecar의 dashboard reload 요청은 HTTP `200`으로 응답했다.
  - Grafana UI와 `/api/dashboards/uid/...` API에서는 `Load 50` 대시보드가 조회되지 않았다.
- 재현 조건:
  - dashboard JSON의 `uid`가 `medikong-load-50-service-resource-and-traffic`처럼 40자를 넘는 상태로 Grafana provisioning을 수행한다.
- 기대 동작:
  - ConfigMap에 포함된 dashboard JSON이 Grafana `Load` 폴더에 등록된다.
- 실제 동작:
  - Kubernetes apply와 sidecar reload는 성공처럼 보이지만 Grafana 내부 저장 단계에서 dashboard가 거부된다.

## Impact

- 영향 범위:
  - 로컬 Grafana의 Load 대시보드 확인.
  - 부하 테스트 중 CPU, 메모리, RPS, 레이턴시를 한 화면에서 보는 운영 확인.
- 우선 처리 이유:
  - ConfigMap 적용 성공을 dashboard 배포 성공으로 오해하기 쉽다.
  - 대시보드가 보이지 않는 원인이 JSON 파일 누락인지, sidecar 문제인지, Grafana provisioning 제약인지 빠르게 구분해야 한다.
- 우회 방법:
  - Grafana 로그에서 provisioning error를 직접 확인한다.
  - dashboard `title`은 설명적으로 유지하되 `uid`는 40자 이하의 짧고 안정적인 값으로 둔다.

## Investigation

| 시간 | 확인 내용 | 결과 |
| --- | --- | --- |
| 2026-06-15 KST | `kubectl apply -k gitops/platform/monitoring` 실행 | ConfigMap 적용은 성공 |
| 2026-06-15 KST | `kubectl -n monitoring get cm medikong-load-dashboards -o yaml` 확인 | `load-50-service-resource-and-traffic.json` 데이터 존재 |
| 2026-06-15 KST | Grafana sidecar 로그 확인 | `/tmp/dashboards/Load/load-50-service-resource-and-traffic.json` 파일 작성, reload HTTP `200` |
| 2026-06-15 KST | Grafana API에서 기존 UID 조회 | `medikong-load-50-service-resource-and-traffic` 조회가 HTTP `404` 반환 |
| 2026-06-15 KST | Grafana 컨테이너 로그 확인 | `failed to save dashboard`와 `uid too long, max 40 characters` 에러 확인 |
| 2026-06-15 KST | dashboard UID를 `medikong-load-50-service-traffic`으로 단축 | Grafana API에서 대시보드 조회 성공 |

## Commands

문제 식별은 Kubernetes apply 성공 여부에서 시작해 ConfigMap, sidecar, Grafana API, Grafana provisioning 로그 순서로 좁혔다. Grafana 인증값은 문서에 남기지 않고 환경변수로 주입한다.

1. monitoring kustomize 적용 상태를 확인한다.

```bash
kubectl apply -k gitops/platform/monitoring
```

2. Load dashboard JSON이 ConfigMap에 들어갔는지 확인한다.

```bash
kubectl -n monitoring get configmap medikong-load-dashboards \
  -o jsonpath='{.data.load-50-service-resource-and-traffic\.json}' \
  | jq '.uid, .title'
```

3. Grafana dashboard sidecar가 ConfigMap 파일을 실제 파일로 썼는지 확인한다.

```bash
kubectl -n monitoring logs deployment/kube-prometheus-stack-grafana \
  -c grafana-sc-dashboard \
  --tail=300 \
  | rg -i 'load-50|dashboards/Load|reload|error'
```

4. Grafana API 접근을 위해 로컬 port-forward를 연다.

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80
```

5. 기존 긴 UID가 Grafana에 등록됐는지 확인한다. 이 조회는 HTTP `404`로 실패했다.

```bash
curl -fsS \
  -u "${GRAFANA_USER}:${GRAFANA_PASSWORD}" \
  http://127.0.0.1:3000/api/dashboards/uid/medikong-load-50-service-resource-and-traffic \
  | jq '.dashboard.uid, .dashboard.title'
```

6. Grafana 컨테이너 로그에서 provisioning 실패 원인을 확인한다. 여기서 `uid too long, max 40 characters`가 확인됐다.

```bash
kubectl -n monitoring logs deployment/kube-prometheus-stack-grafana \
  -c grafana \
  --tail=300 \
  | rg -i 'load-50|uid too long|failed to save dashboard|provision'
```

7. UID를 줄인 뒤 실제 등록 여부를 다시 확인한다.

```bash
curl -fsS \
  -u "${GRAFANA_USER}:${GRAFANA_PASSWORD}" \
  http://127.0.0.1:3000/api/dashboards/uid/medikong-load-50-service-traffic \
  | jq '.dashboard.uid, .dashboard.title, .meta.folderTitle, .meta.url'
```

## Root Cause

Grafana dashboard UID는 최대 40자까지만 허용된다. `Load 50` 대시보드의 기존 UID인 `medikong-load-50-service-resource-and-traffic`은 이 제한을 넘었다.

이때 Kubernetes 관점에서는 ConfigMap apply가 성공하고, sidecar도 파일 동기화와 reload 요청까지 수행한다. 하지만 Grafana가 dashboard를 저장하는 단계에서 UID 길이 제한으로 거부하기 때문에 UI와 API에는 대시보드가 나타나지 않는다.

따라서 원인은 GitOps ConfigMap 누락이나 sidecar 동기화 실패가 아니라 Grafana provisioning 단계의 dashboard UID 제약 위반이다.

## Decision

- dashboard `title`과 파일명은 사람이 알아보기 쉽게 길게 둘 수 있다.
- dashboard `uid`는 URL과 API 조회에 쓰이므로 40자 이하의 짧고 안정적인 값으로 정한다.
- dashboard 배포 검증은 Kubernetes apply 성공만으로 끝내지 않는다.
- 신규 또는 변경 dashboard는 Grafana API 조회와 Grafana provisioning 로그를 함께 확인한다.

## Actions

| 상태 | 작업 | 담당 | 링크 |
| --- | --- | --- | --- |
| done | `Load 50` dashboard UID를 `medikong-load-50-service-traffic`으로 단축 | gitops | `gitops/platform/monitoring/dashboards/load/load-50-service-resource-and-traffic.json` |
| done | 로컬 monitoring kustomize를 다시 적용 | gitops | `gitops/platform/monitoring/kustomization.yaml` |
| done | Grafana API에서 `Load 50` dashboard 조회 성공 확인 | gitops | `/grafana/d/medikong-load-50-service-traffic/load-50-service-resource-and-traffic` |
| done | 같은 배포 묶음의 `Load 60` dashboard도 API 조회 성공 확인 | gitops | `/grafana/d/medikong-load-60-k6-runner-execution/load-60-k6-runner-execution` |
| done | 원인과 확인 절차를 trouble 문서로 기록 | workspace | `workspace/docs/trouble/2026-06-15-grafana-dashboard-uid-too-long.md` |

## Resolution

`Load 50` 대시보드는 UID를 `medikong-load-50-service-traffic`으로 줄인 뒤 로컬 Grafana에 정상 등록됐다. Grafana API에서도 다음 URL로 조회됐다.

```text
/grafana/d/medikong-load-50-service-traffic/load-50-service-resource-and-traffic
```

재발 방지를 위해 dashboard 추가 시 다음 순서로 확인한다.

1. dashboard JSON의 `uid`가 40자 이하인지 확인한다.
2. `kubectl apply -k gitops/platform/monitoring` 성공 여부를 확인한다.
3. `medikong-load-dashboards` ConfigMap에 파일이 들어갔는지 확인한다.
4. Grafana sidecar가 파일을 썼는지 확인한다.
5. Grafana API에서 UID로 dashboard가 실제 조회되는지 확인한다.
6. 조회되지 않으면 Grafana 컨테이너 로그에서 provisioning error를 먼저 확인한다.
