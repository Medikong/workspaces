# 나머지 단일 페이지 템플릿 제작 메타 프롬프트

이 문서는 07~22번 PNG를 순차 제작할 때 사용하는 실행용 프롬프트입니다. 각 페이지의 세부 내용은 같은 이름의 `.prompt.json`, 전체 역할은 `template-plan.json`, 공통 시각 규칙은 `DESIGN.md`를 기준으로 합니다.

## 제작 목록

| 번호 | 파일명 | 중심 구성 |
| ---: | --- | --- |
| 07 | `07-cover.png` | 표지 |
| 08 | `08-agenda.png` | 수평 목차 |
| 09 | `09-section-divider.png` | 장 전환 |
| 10 | `10-project-context.png` | 프로젝트 맥락 도식 |
| 11 | `11-problem-and-question.png` | 문제와 확인 대상 |
| 12 | `12-previous-hpa-evidence.png` | 이전 HPA 근거 수치 |
| 13 | `13-responsibility-boundary.png` | 구성 요소별 담당 범위 |
| 14 | `14-experiment-topology.png` | 실험 환경과 요청 경로 |
| 15 | `15-fixed-and-changed-conditions.png` | 고정 조건과 변경 조건 |
| 16 | `16-execution-steps.png` | 실험 실행 순서 |
| 17 | `17-experiment-matrix.png` | 비교 조건 표 |
| 18 | `18-metric-definition.png` | 시간 지표 정의 |
| 19 | `19-code-config.png` | 설정 코드와 주석 |
| 20 | `20-result-interpretation.png` | 결과 해석표 |
| 21 | `21-limitations.png` | 범위와 한계 |
| 22 | `22-conclusion-next-steps.png` | 마무리와 다음 작업 |

## 실행 프롬프트

```text
역할:
DropMong 기술 발표용 16:9 단일 페이지 이미지 제작자

입력:
- DESIGN.md
- template-plan.json
- 대상 이미지와 같은 이름의 .prompt.json
- assets/dropmong-brand.png
- assets/dropmong-mascot-character-sheet.png
- assets/dropmong-system-architecture-sheet-color.png
- assets/dropmong-system-architecture-sheet.png
- assets/dropmong-ui-ux-component-sheet.png
- 기존 01~06 PNG와 prompt JSON

작업:
1. 대상 prompt JSON의 objective, content_blocks와 layout_instructions 확인
2. DESIGN.md의 색, 글자, 선, 여백과 footer 규칙 적용
3. 한 페이지에 중심 시각물 하나만 배치
4. 기존 PNG의 header와 footer 비율을 유지하고 페이지 역할에 필요한 본문만 변경
5. 레퍼런스 에셋은 시각 규칙 참고에만 사용하고 원본 이미지 직접 삽입 금지
6. 1600×900 PNG 한 장 생성
7. 생성 결과를 1600×900 화면에서 확인하고 잘림, 작은 글자, 불필요한 빈 공간 수정

공통 화면 규칙:
- 밝은 #FCFCFD 배경
- Pretendard 계열 글꼴
- DropMong 로고는 좌측 상단
- 마스코트는 07, 09, 22에만 사용
- footer에는 프로젝트명, 발표자명과 날짜 자리
- 출처 영역과 페이지 번호 제외
- 제목 최대 2줄
- 독립 카드 최대 3개
- 설명은 한국어, 기술 용어는 원문 유지
- 화면 문구는 금지어와 동사형 종결 제외

수치 규칙:
- 12번만 이전 HPA 실험 수치 사용
- 12번에 '이전 HPA 실험 · 새 실험 결과 아님' 표시
- 다른 페이지는 000 ms, 00.0%, 000 RPS, 00m 같은 자리 표시 사용
- 설정 예시는 '설정 예시 · 운영값 아님' 표시
- 새 실험 결과, 개선율과 우열 결론 생성 금지

스타일 금지:
- 다크 테마, 네온, 글로우와 강한 그라데이션
- 컴포넌트 시트와 축소 페이지 모음
- 대시보드형 복합 차트
- 동일 카드 4개 이상
- 상품 UI와 홍보용 장식
- 레퍼런스 이미지 복제
- 워터마크

출력:
- docs/presentation/template-assets/dropmong/templates/{image_name}.png
- 이미지 파일명과 prompt JSON stem 일치
- 생성 후 PNG 크기, 읽는 순서, 대비, footer 공간 검증
```

## 제작 순서

1. 07~09: 표지와 발표 구간 페이지군
2. 10~13: 프로젝트 배경, 이전 근거와 담당 범위
3. 14~18: 실험 환경, 조건, 실행, 비교와 측정
4. 19~20: 설정과 결과 해석
5. 21~22: 범위와 마무리

각 묶음을 만든 뒤 기존 페이지와 나란히 비교하고 다음 묶음으로 이동합니다.
