# 발표 템플릿 컴포넌트 시트 생성 프롬프트

이미지는 Codex 내장 이미지 생성 도구로 만들었습니다. 기반 에셋은 시각 언어를 맞추기 위한 참고 자료로만 사용했으며 원본 이미지를 콜라주하지 않았습니다. 최종 시트는 `foundations/`, `brand/`, `components/`, `templates/` 폴더에서 개별 PNG로 관리합니다.

## 공통 프롬프트

```text
Use case: productivity-visual
Asset type: DropMong PowerPoint presentation design-system component sheet
Scene/backdrop: clean white 16:9 presentation canvas
Style/medium: precise vector-like editorial design-system board, Pretendard-like sans serif
Color palette: #6C3DF5, #B69BFF, #111827, #374151, #6B7280, #F2F4F7
Composition: broad outer margins, aligned baselines, asymmetric modular grid, clear breathing room
Components: 1–2px lines, 8–16px corners, no or nearly no shadow, restrained semantic colors
Constraints: short exact labels only, no paragraphs, no lorem ipsum, no watermark
Avoid: dark mode, neon glow, heavy gradients, glossy 3D, repeated equal cards, dashboard look, product UI
```

## 시트별 요청

### 01 Foundations

색상, Pretendard 글자 단계, 8px 간격 체계, 선, 모서리, 80px 안전 여백과 적정 화면 밀도 비교

### 02 Brand & Slide Chrome

로고 크기, 표지와 장 전환 머리글, 발표자 정보, 장 표시, 진행 표시, 마스코트의 허용 크기와 기술 발표 사용 범위

### 03 Content Components

확인한 사실, 아직 정하지 못한 항목, 선행 조건, 정의, 결론, 좌우 비교, 3항목 비교, 단계 목록과 짧은 강조 문구

### 04 Metrics & Tables

수치 스트립, 이전 값과 비교 값, 단위가 있는 큰 숫자, 비교표, 실험 행렬, 결과 해석표와 상태 라벨

### 05 Charts & Timeline

트래픽 입력, consumer lag, 처리량과 지연, 임계값 영역, t0~t5 시간 기록, 막대 비교와 오차 범위

### 06 Architecture & Diagrams

Client, Ingress, API, Worker, Kafka, KEDA, HPA, Prometheus, DB, Redis 노드와 동기·비동기·이벤트·관측·제어 연결선

## 단일 페이지 템플릿

`templates/`에서는 여러 축소 화면을 한 장에 모으지 않고 하나의 파일에 하나의 완성된 16:9 페이지를 관리합니다. 현재 01~06번 PNG 제작이 끝났고, 07~22번은 같은 이름의 prompt JSON까지 준비했습니다.

1. 전체 화면 시퀀스 다이어그램
2. 전체 시스템 구성도
3. 변경 전후 아키텍처 비교
4. 가로 막대 비교
5. 핵심 선 그래프
6. 임계값 시계열

07~22번은 표지, 목차, 장 전환, 프로젝트 배경, 이전 근거, 담당 범위, 실험 환경, 조건, 실행 순서, 비교표, 시간 지표, 설정 코드, 결과 해석, 범위와 마무리 페이지입니다.

공통 시각 규칙은 `templates/DESIGN.md`, 공통 입력 규칙은 `templates/META-PROMPT.md`, 페이지 역할은 `templates/template-plan.json`에서 관리합니다. 07~22번 제작 순서는 `templates/REMAINING-META-PROMPT.md`, 각 페이지의 생성·구조 변경 지시는 PNG와 같은 이름의 `.prompt.json`에서 개별 관리합니다.
