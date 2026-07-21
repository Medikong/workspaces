# DropMong 단일 페이지 템플릿

각 PNG는 하나의 중심 시각물을 크게 보여 주는 1600×900 발표 페이지입니다. 여러 템플릿을 한 화면에 모은 카탈로그 이미지는 사용하지 않습니다.

## 이미지 제작 완료

| 이미지 | 구조 변경 프롬프트 | 중심 시각물 |
| --- | --- | --- |
| `01-sequence-diagram.png` | `01-sequence-diagram.prompt.json` | 전체 화면 시퀀스 다이어그램 |
| `02-system-architecture.png` | `02-system-architecture.prompt.json` | 전체 시스템 구성도 |
| `03-before-after-architecture.png` | `03-before-after-architecture.prompt.json` | 변경 전후 구성 비교 |
| `04-bar-comparison.png` | `04-bar-comparison.prompt.json` | 가로 막대 비교 |
| `05-line-chart.png` | `05-line-chart.prompt.json` | 핵심 선 그래프 |
| `06-threshold-timeline.png` | `06-threshold-timeline.prompt.json` | 임계값 시계열 |

수치가 있는 페이지에는 `예시 데이터 · 실제 측정값 아님`을 표시합니다. 이전 HPA 실험 수치는 별도의 근거 템플릿에서만 사용합니다.

PNG 안의 프로젝트명, 발표자명과 날짜는 배치 예시입니다. 실제 발표에서는 해당 영역을 편집 가능한 텍스트로 다시 입력합니다.

## 이미지 제작 준비

다음 16개 페이지는 개별 prompt JSON과 제작 순서를 확정한 상태입니다. PNG는 아직 만들지 않았습니다.

| 구조 변경·제작 프롬프트 | 중심 구성 |
| --- | --- |
| `07-cover.prompt.json` | 표지 |
| `08-agenda.prompt.json` | 수평 목차 |
| `09-section-divider.prompt.json` | 장 전환 |
| `10-project-context.prompt.json` | 프로젝트 맥락 도식 |
| `11-problem-and-question.prompt.json` | 문제와 확인 대상 |
| `12-previous-hpa-evidence.prompt.json` | 이전 HPA 근거 수치 |
| `13-responsibility-boundary.prompt.json` | 구성 요소별 담당 범위 |
| `14-experiment-topology.prompt.json` | 실험 환경과 요청 경로 |
| `15-fixed-and-changed-conditions.prompt.json` | 고정 조건과 변경 조건 |
| `16-execution-steps.prompt.json` | 실험 실행 순서 |
| `17-experiment-matrix.prompt.json` | 비교 조건 표 |
| `18-metric-definition.prompt.json` | 시간 지표 정의 |
| `19-code-config.prompt.json` | 설정 코드와 주석 |
| `20-result-interpretation.prompt.json` | 결과 해석표 |
| `21-limitations.prompt.json` | 범위와 한계 |
| `22-conclusion-next-steps.prompt.json` | 마무리와 다음 작업 |

## 공통 배치

- 상단: DropMong 로고, 분류 라벨, 제목과 짧은 설명
- 본문: 화면의 60~75%를 차지하는 중심 시각물 하나
- 하단: `프로젝트`, `발표자`, `날짜`를 위한 footer 공간
- 마스코트: 표지, 장 전환과 마무리 페이지에만 표시
- 출처: 템플릿 기본 화면에서 제외

`DESIGN.md`는 공통 시각 규칙, `template-plan.json`은 22개 페이지 역할, 각 이미지와 같은 이름의 `.prompt.json`은 해당 페이지의 구조 변경 지시를 관리합니다. `META-PROMPT.md`는 새 템플릿 추가 규칙, `REMAINING-META-PROMPT.md`는 07~22번 이미지 제작 순서를 관리합니다.

## 구조 변경 방법

1. 수정할 PNG와 같은 이름의 `.prompt.json`을 함께 선택합니다.
2. PNG는 현재 화면의 시각 기준, JSON은 유지할 영역과 바꿀 영역의 계약으로 사용합니다.
3. JSON의 `content_blocks`에서 문구와 데이터를, `layout_instructions`에서 배치를 수정합니다.
4. `design_constraints`와 `must_not_include`는 삭제하지 않고 새 요구사항과 함께 전달합니다.
5. 변경된 이미지도 같은 파일명 체계를 유지하고, 새로운 레이아웃이면 새 번호와 새 prompt 파일을 만듭니다.
