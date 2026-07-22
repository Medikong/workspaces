# 기술 실험 발표 레이아웃 카탈로그

Slidev와 Reveal.js는 아래 16개 레이아웃 이름과 입력 계약을 공유합니다. 레이아웃은 내용을 담는 그릇이며 KEDA에 종속되지 않습니다.

| 이름 | 목적 | 슬롯 또는 입력 | 사용 예시 |
| --- | --- | --- | --- |
| `cover` | 제목과 발표 정보 소개 | `eyebrow`, `title`, `subtitle`, `meta` | 실험 질문과 발표자 placeholder |
| `section` | 큰 장 전환 | `index`, `title`, `detail` | `02 실험 방법` |
| `agenda` | 발표 순서와 시간 안내 | `items`, `timing` | 궁금증, 준비, 비교, 측정 |
| `research-background` | 이미 아는 내용과 남은 질문 연결 | `context`, `gap`, `need` | 파드 증가 이후 남은 오류 |
| `preliminary-evidence` | 이전 결과와 새 실험 구분 | `metrics`, `observation`, `source` | 이전 HPA 수치 네 개 |
| `research-question` | 확인할 질문 한 가지 제시 | `question`, `facets` | 대기 신호가 CPU보다 빠른지 확인 |
| `hypothesis` | 예상, 다른 가능성, 틀렸다고 볼 조건 비교 | `h1`, `h0`, `checks` | KEDA와 CPU HPA의 차이 예상 |
| `comparison` | 같은 조건에서 두 항목 비교 | `left`, `right`, `criterion` | 고정 조건과 바꿀 설정 |
| `system-model` | 입력, 제어기, 처리 대상의 관계 설명 | `diagram`, `legend`, `boundary` | Kafka, KEDA, worker, DB |
| `traffic-chart` | 시간에 따른 입력 변화 표시 | `chart`, `annotations`, `caption` | 분산형 일상 이벤트 입력 |
| `experiment-design` | 실행 순서와 고정 조건 분리 | `steps`, `controls`, `output` | 기준선부터 자동 확장 비교까지 |
| `experiment-matrix` | 비교군별 차이 정리 | `matrix`, `legend`, `placeholder` | 고정 용량, CPU HPA, KEDA |
| `metric-statistics` | 시간, 품질, 효율 측정법 제시 | `metrics`, `formula`, `method` | lag 회복과 pod-seconds |
| `limitation` | 현재 알 수 없는 범위 구분 | `limits`, `future`, `boundary` | scale-to-zero와 burst 후속 확인 |
| `conclusion` | 현재 답과 다음 행동 정리 | `takeaway`, `steps`, `status` | 먼저 분리하고 세 방법 비교 |
| `references` | 주장과 연결된 출처 정리 | `sources`, `scope` | 연구 문서와 공식 기술 문서 |

## 공통 입력 규칙

- `eyebrow`: 화면의 위치나 상태를 짧게 표시
- `title`: 한 화면에서 전달할 질문이나 결론 한 가지
- `subtitle`: 대상, 조건 또는 비교 범위를 한 문장으로 보충
- `status`: `이전 실험`, `실험 전`, `결정 필요`, `확인 완료` 중 하나
- `source`: 일반 화면의 footer가 아니라 발표자 노트와 마지막 참고자료에 기록

## 프레임워크 대응

| 공통 개념 | Slidev | Reveal.js |
| --- | --- | --- |
| 레이아웃 | `layout: experiment-design` | `<section class="research-slide layout-experiment-design">` |
| 입력 영역 | `::controls::` | `.design-controls` 또는 semantic `aside` |
| 차례대로 공개 | `v-click`, `v-clicks` | `.fragment` |
| 발표자 노트 | Markdown HTML comment | `<aside class="notes">` |
| 다이어그램 | Mermaid, Vue component | semantic HTML, SVG |
| 수식 | LaTeX/KaTeX | HTML 수식과 CSS |

## 짧은 사용 예시

Slidev:

```md
---
layout: experiment-matrix
eyebrow: 비교군
headline: 같은 입력에서 세 가지 확장 방법 비교
subtitle: 이미지, 자원 제한, 노드 용량은 같은 값 유지
---

| 방법 | 늘리는 신호 | 범위 |
| --- | --- | --- |
| 고정 용량 | 없음 | 준비 실험에서 찾은 안전 파드 수 |
| CPU HPA | CPU 사용률 | 1~N개 |
| KEDA | Kafka consumer lag | 1~N개 |
```

Reveal.js:

```html
<section class="research-slide layout-experiment-matrix">
  <header class="slide-header">...</header>
  <div class="slide-body matrix-shell">...</div>
</section>
```

실제 렌더링 예시는 `slidev/layout-catalog.md`와 `revealjs/catalog.html`에 있습니다.
