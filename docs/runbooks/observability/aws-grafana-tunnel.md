---
title: "AWS Grafana SSH 터널 접속"
area: observability
repos:
  - workspace
  - gitops
created: 2026-06-10
updated: 2026-06-10
tags:
  - aws-dev
  - grafana
  - monitoring
  - ssh-tunnel
---

# AWS Grafana SSH 터널 접속

## 접속

```bash
ssh -i ~/.ssh/k8s-key -L 3001:127.0.0.1:13000 ubuntu@13.125.191.132 \
  'kubectl -n monitoring port-forward --address 127.0.0.1 svc/kube-prometheus-stack-grafana 13000:80'
```

브라우저:

```text
http://127.0.0.1:3001
```

## 계정 확인

```bash
ssh -i ~/.ssh/k8s-key ubuntu@13.125.191.132 \
  'kubectl -n monitoring get secret grafana-admin-credentials -o jsonpath="{.data.admin-user}" | base64 -d && echo'

ssh -i ~/.ssh/k8s-key ubuntu@13.125.191.132 \
  'kubectl -n monitoring get secret grafana-admin-credentials -o jsonpath="{.data.admin-password}" | base64 -d && echo'
```

## 포트 충돌

로컬 `3001` 또는 원격 `13000`이 이미 사용 중이면 포트를 바꾼다.

```bash
ssh -i ~/.ssh/k8s-key -L 3002:127.0.0.1:18080 ubuntu@13.125.191.132 \
  'kubectl -n monitoring port-forward --address 127.0.0.1 svc/kube-prometheus-stack-grafana 18080:80'
```

브라우저:

```text
http://127.0.0.1:3002
```
