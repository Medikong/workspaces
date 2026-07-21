# DropMong 발표 템플릿 이미지 에셋

이 폴더는 DropMong 기술 발표에서 사용할 화면 구성과 컴포넌트를 이미지 시트로 보관합니다. 기존 브랜드, 아키텍처, 관측성, 서비스 구성도와 UI 컴포넌트 시트에서 색, 선, 모서리, 간격 규칙을 가져왔습니다. 원본 이미지를 잘라 붙이지 않고 16:9 발표 화면에 맞는 새 구성으로 만들었습니다.

## 구성

| 파일 | 용도 |
| --- | --- |
| `foundations/01-foundations-grid.png` | 색, 글자, 간격, 선, 모서리, 안전 여백과 화면 밀도 |
| `brand/02-brand-slide-chrome.png` | 로고, 표지, 장 전환, 발표 정보와 마스코트 사용 범위 |
| `components/03-content-components.png` | 사실, 미정 항목, 선행 조건, 정의, 비교와 단계 표현 |
| `components/04-metrics-tables.png` | 핵심 수치, 이전 값, 표, 비교군과 상태 표시 |
| `components/05-charts-timeline.png` | 입력, lag, 처리량, 지연, 임계값과 t0~t5 기록 |
| `components/06-architecture-diagrams.png` | 서비스, 데이터, 메시징, 확장 제어와 관측 연결선 |
| `templates/README.md` | 한 파일에 한 페이지로 구성한 발표 템플릿 목록과 사용 규칙 |
| `templates/DESIGN.md` | 22개 단일 페이지가 공유하는 색, 글자, 여백과 구성 규칙 |
| `templates/REMAINING-META-PROMPT.md` | 07~22번 이미지의 제작 목록과 실행 프롬프트 |
| `templates/01-sequence-diagram.png` | 주문부터 알림까지의 전체 화면 시퀀스 다이어그램 |
| `templates/02-system-architecture.png` | DropMong 서비스의 전체 시스템 구성도 |
| `templates/03-before-after-architecture.png` | 동기 호출과 event 분리 구성 비교 |
| `templates/04-bar-comparison.png` | API 응답 시간 가로 막대 비교 예시 |
| `templates/05-line-chart.png` | 시간대별 주문 요청량 선 그래프 예시 |
| `templates/06-threshold-timeline.png` | Queue lag 임계값과 회복 시간 예시 |

## 공통 원칙

- 중심색 `#6C3DF5`, 보조색 `#B69BFF`, 잉크색 `#111827`
- 기본 선 1px, 도식 연결선 2px, 핵심 연결선 3px
- 8px 단위 간격, 8·12·16px 중심의 모서리
- 일반 화면의 보라색 면적 15~20% 이내
- 한 화면의 독립 카드 최대 3개
- 수치 4개는 카드 4장이 아닌 하나의 수치 스트립으로 표현
- 마스코트는 표지, 장 전환, 마무리에만 제한적으로 사용
- 앱 버튼과 내비게이션을 PPT에 그대로 옮기지 않고 선, 간격, 상태 표현만 재사용

## 사용 방법

1. `templates/`에서 발표 목적과 가까운 단일 페이지 PNG를 선택합니다.
2. 같은 이름의 `.prompt.json`을 열어 화면 구조, 문구와 데이터 변경 지시를 확인합니다.
3. 새 PNG 제작은 `templates/DESIGN.md`와 `templates/REMAINING-META-PROMPT.md`를 먼저 확인합니다.
4. `foundations/`, `brand/`, `components/`는 디자인 규칙 참고 자료로 사용합니다.
5. 실제 발표에서는 템플릿의 예시 문구와 수치를 프로젝트 내용으로 교체합니다.
6. 오토스케일링 발표 문구는 `../../autoscale/LANGUAGE-POLICY.json`과 `npm run lint:language`로 확인합니다.
7. 실제 값, 이전 실험 값, 앞으로 측정할 값은 문구와 선 모양까지 다르게 표시합니다.

`templates/`의 PNG는 완성 화면을 보여 주는 한 페이지 템플릿입니다. 나머지 폴더의 PNG는 디자인 규칙을 모아 놓은 참고 시트입니다.

## 기반 에셋

- `assets/dropmong-brand.png`
- `assets/dropmong-mascot-character-sheet.png`
- `assets/dropmong-observability-overview.png`
- `assets/dropmong-service-overview.png`
- `assets/dropmong-system-architecture-sheet-color.png`
- `assets/dropmong-system-architecture-sheet.png`
- `assets/dropmong-ui-ux-component-sheet.png`

원본 에셋은 수정하지 않았습니다.
