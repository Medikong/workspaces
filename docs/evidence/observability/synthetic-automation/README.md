---
title: Synthetic 자동 실행 증빙
date: 2026-06-19
tags: [observability, synthetic, k6, proof]
---

# Synthetic 자동 실행 증빙

작성일: 2026-06-19

목표 항목: `workspace/docs/members/service/goal/2026-06-15-goal-review/goal-functional-equivalence-checklist-2026-06-15.md`

## 1. 정기 실행 주기

- AWS 환경 synthetic 실행 주기는 `*/5 * * * *`(5분 주기)로 정의되어 있다.
- 근거:
  - `gitops/platform/synthetic/values/aws-dev.yaml:12` `cronJob.schedule`
  - `gitops/platform/synthetic/values.yaml:22`(공통 기본값) `cronJob.schedule`

## 2. 실행 정의 YAML 증빙

- Argo CD 배포 단위
  - `gitops/argo/applications/aws-dev/platform/synthetic.yaml`
- Helm value
  - `gitops/platform/synthetic/values/aws-dev.yaml`
- CronJob 템플릿
  - `gitops/platform/synthetic/templates/cronjob.yaml`
- synthetic 설정 템플릿(ConfigMap 기반 env)
  - `gitops/platform/synthetic/templates/configmap.yaml`

## 3. 실행 결과 보고

- synthetic run 보고서(예시): `workspace/docs/evidence/observability/payment-ticket-trace-context/README.md`
- 로그/요약 기준:
  - `task dev:synthetic:run` 실행
  - `synthetic_run_started`, `synthetic_run_finished` 이벤트가 함께 남는지 확인
  - run 예시: `Synthetic run id = 1781165898850-1-0`, `Checks 8/8`, `HTTP failed 0.00%`

## 4. Screenshots

- `assets/synthetic-run-success.png`

![synthetic run success](assets/synthetic-run-success.png)

## 5. 결과 대시보드 증빙

- 대시보드 정의: `gitops/platform/monitoring/dashboards/logs/logs-50-synthetic.json`
- Dashboard 적용 경로: `gitops/platform/monitoring/kustomization.yaml`
- 대상: synthetic runner의 `run_started`, `run_finished`, `run_failed`, step 이벤트
