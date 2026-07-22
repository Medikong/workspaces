# Kubernetes 오토스케일링 전략 연구

이 폴더는 기존 HPA 실험에서 확인한 한계를 출발점으로 삼아, CPU 기반 HPA를 넘어 서비스별 수요와 포화 지점에 맞는 Kubernetes 오토스케일링 전략을 선택하고 검증하기 위한 연구 문서를 관리한다.

## 문서 구성

- [HPA 지표 선택 연구 설계](hpa-metric-selection-research-design.md): CPU, 요청량, 동시 처리량, Queue 계열 지표를 비교하기 위한 세부 연구 설계
- [HPA 지표 선택 논문 원고](hpa-metric-selection-paper.md): 이전 HPA 실험 분석을 서론으로 삼은 논문 형식의 원고
- [Kubernetes 오토스케일링 전략 최상위 연구 기획](kubernetes-autoscaling-strategy-research-design.md): HPA, KEDA, 워크로드 용량과 노드 용량을 함께 다루는 최상위 연구 체계
- [Kubernetes 오토스케일링 전략 논문 초안](kubernetes-autoscaling-strategy-paper-draft.md): 최상위 연구 기획과 HPA 세부 논문의 목차를 결합한 단일 논문형 연구 원고

Kubernetes 오토스케일링 전략 기획서는 전체 연구의 목표와 실험 체계를 정의하는 최상위 문서이며, HPA 연구 설계와 논문 원고는 제어 신호 선택을 다루는 첫 번째 세부 연구다. Kubernetes 오토스케일링 전략 논문 초안은 이 내용을 학술 논문 구조의 단일 원고로 통합한다.

## 출발 문서

- [01. 프로젝트 제안](../../members/observability/live-commerce/01-proposal.md)
- [02. 검증 계획](../../members/observability/live-commerce/02-validation-plan.md)
- [03. 발표 구성안](../../members/observability/live-commerce/03-presentation-plan.md)

## 발표 자료

- [오토스케일링 연구 기획 발표](../../presentation/autoscale/README.md)
