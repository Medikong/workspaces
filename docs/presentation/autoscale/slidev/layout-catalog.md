---
theme: ./theme
layout: cover
title: 기술 실험 발표 레이아웃 16종
headline: 기술 실험 발표 레이아웃 16종
eyebrow: 재사용 카탈로그
subtitle: 질문, 조건, 실행 순서와 측정 방법을 분명하게 보여주는 화면 구성
aspectRatio: 16/9
canvasWidth: 1600
routerMode: hash
transition: fade
---

<div class="cover-diagram" aria-hidden="true">
  <div><b>A</b><span>무엇이 궁금한가</span></div>
  <div><b>B</b><span>무엇을 같이 둘 것인가</span></div>
  <div><b>C</b><span>무엇을 측정할 것인가</span></div>
</div>

::meta::

<span class="tag">Cover</span>
<span class="tag">제목과 발표 정보</span>

---
layout: section
index: 02 · Section
headline: 실험 방법
subtitle: 큰 장이 바뀌는 위치를 짧게 알리는 화면
---

<span class="tag">입력: index, title, detail</span>

---
layout: agenda
eyebrow: 03 · Agenda
headline: 궁금증에서 측정까지의 발표 순서
subtitle: 3~5개 항목과 시간 범위를 함께 안내
---

<div><strong>01</strong><span><b>이전 관찰</b><br/>이번 실험을 시작한 이유</span></div>
<div><strong>02</strong><span><b>실험 조건</b><br/>같이 둘 값과 바꿀 값</span></div>
<div><strong>03</strong><span><b>실행과 측정</b><br/>순서와 성공 기준</span></div>

::timing::

### 권장 입력

- 전체 발표 시간
- 슬라이드 수
- 이번에 다룰 범위
- 나중에 확인할 범위

---
layout: research-background
eyebrow: 04 · Research Background
headline: 이미 아는 내용에서 다음 질문 찾기
subtitle: 현재 상황, 아직 모르는 점, 필요한 확인을 연결
---

::context::

### 이미 확인한 내용

측정값과 실행 조건을 포함한 이전 관찰

::gap::

### 아직 모르는 점

이전 실험으로 설명하지 못한 원인이나 조건

::need::

### 다음 확인

대상과 비교 방법이 분명한 한 가지 질문

::footer::

<span>입력: context, gap, need</span><span>카드 3개 이하</span>

---
layout: preliminary-evidence
eyebrow: 05 · Preliminary Evidence
headline: 이전 결과와 새 실험을 한 화면에서 구분
subtitle: 수치, 관찰 조건, 현재 상태를 함께 표시
---

::metrics::

<MetricStrip :items="[
  { value: '3회', label: '이전 반복', detail: '같은 조건', tone: 'info' },
  { value: '12초', label: '이전 중앙값', detail: '실측', tone: 'success' },
  { value: '8%', label: '이전 오류율', detail: '기준 초과', tone: 'danger' },
  { value: '없음', label: '새 실험 결과', detail: '실험 전' },
]"/>

<div class="callout">새 실험의 결과가 아니라 다음 질문을 만든 이전 관찰</div>

---
layout: research-question
eyebrow: 06 · Research Question
headline: 청중이 기억할 한 가지 질문
subtitle: 대상, 조건, 비교군, 측정값을 문장 안에 포함
---

[대상]에서 [조건]을 같게 둘 때 [방법 A]와 [방법 B]의 [측정값]은 얼마나 다른가?

::facets::

### 꼭 넣을 내용

- 대상
- 같은 조건
- 바꿀 값
- 비교할 수치

---
layout: hypothesis
eyebrow: 07 · Hypothesis
headline: 예상과 다른 가능성을 같은 크기로 제시
subtitle: 결과를 보기 전에 틀렸다고 볼 조건까지 작성
---

::h1::

### 예상하는 결과

방법 A의 회복 시간이 방법 B보다 짧은 결과

::h0::

### 차이가 없을 가능성

두 방법의 회복 시간과 자원 사용량이 비슷한 결과

::checks::

### 예상이 틀렸다고 볼 조건

더 느린 회복, 같은 품질, 더 큰 자원 사용량

::footer::

<span>입력: expected, alternative, checks</span><span>결과 확인 전 작성</span>

---
layout: comparison
eyebrow: 08 · Comparison
headline: 같은 조건과 바꿀 값을 좌우로 구분
subtitle: 한 번에 두 묶음만 비교
---

::left::

### 같이 둘 조건

- 이미지와 설정
- 입력 데이터
- 자원 제한
- 실행 시간

::criterion::

구분

::right::

### 바꿀 값

- 방법 A의 설정
- 방법 B의 설정
- 결과 수치

---
layout: system-model
eyebrow: 09 · System Model
headline: 입력에서 결과까지 각 구성요소의 역할 표시
subtitle: 직접 조절하는 값과 단순히 측정하는 값을 구분
---

<div class="system-path panel">
  <div class="system-node"><strong>입력</strong><span>요청 또는 이벤트</span></div>
  <div class="system-node"><strong>제어기</strong><span>설정과 결정</span></div>
  <div class="system-node"><strong>처리 대상</strong><span>파드 또는 워커</span></div>
  <div class="system-node"><strong>결과</strong><span>품질과 효율</span></div>
</div>

::boundary::

### 역할 표시

- 조절 대상
- 관측 신호
- 외부 의존성
- 이번 비교의 제외 범위

---
layout: traffic-chart
eyebrow: 10 · Traffic Chart
headline: 입력의 시간 변화와 단위를 함께 표시
subtitle: 실측, 가상 입력, 예상값 가운데 하나를 명시
---

<TrafficProfile/>

::annotations::

### 차트에 필요한 설명

- x축 시간
- y축 단위
- 입력이 바뀌는 시점
- 데이터의 현재 상태

---
layout: experiment-design
eyebrow: 11 · Experiment Design
headline: 앞 단계가 통과해야 다음 단계로 이동
subtitle: 원인이 섞이지 않도록 한 단계에서 한 가지를 변경
---

<ol class="step-list">
  <li><span><strong>측정 준비</strong><br/>필요한 신호가 같은 시간으로 수집되는지 확인</span></li>
  <li><span><strong>단일 대상 기준선</strong><br/>처리 한계와 첫 품질 저하 확인</span></li>
  <li><span><strong>고정 크기 비교</strong><br/>대상을 늘렸을 때 처리량이 늘어나는지 확인</span></li>
  <li><span><strong>방법 비교</strong><br/>같은 입력에서 선택한 방법을 반복 실행</span></li>
</ol>

::controls::

### 고정 조건

데이터, 이미지, 자원, 외부 의존성, 실행 시간

---
layout: experiment-matrix
eyebrow: 12 · Experiment Matrix
headline: 비교군마다 바뀌는 값과 그대로 둘 값 정리
subtitle: 아직 정하지 못한 값은 숫자를 만들지 않고 표시
---

| 비교군 | 바꿀 값 | 같은 조건 | 상태 |
| --- | --- | --- | --- |
| 기준선 | 고정 수량 | 이미지와 입력 | 준비 완료 |
| 방법 A | 설정 A | 이미지와 입력 | 결정 필요 |
| 방법 B | 설정 B | 이미지와 입력 | 결정 필요 |

::placeholder::

<span class="status-chip" data-tone="warning">실험 전 · 결과 값 없음</span>

---
layout: metric-statistics
eyebrow: 13 · Metric / Statistics
headline: 시간, 품질, 효율을 따로 재고 함께 비교
subtitle: 평균 하나로 긴 지연과 실패를 숨기지 않는 구성
---

::metrics::

### 주요 수치

- 시작부터 회복까지 걸린 시간
- p99와 오류율
- 처리량
- 성공 작업당 자원 사용량

::formula::

$$\Delta T=t_{recovery}-t_{start}$$

::method::

### 반복 방법

- 조건별 최소 3회 준비 실행
- 중앙값과 분산 확인
- 본 반복 수는 준비 실행 뒤 결정

---
layout: limitation
eyebrow: 14 · Limitation
headline: 이번에 확인할 범위와 나중에 볼 범위 구분
subtitle: 아직 실행하지 않은 결과를 결론처럼 쓰지 않는 화면
---

::limits::

### 이번 범위

- 한 환경
- 한 가지 기본 입력
- 준비된 노드
- scale-to-zero 제외

::future::

### 나중에 확인

- 순간 증가
- 반복 peak
- 노드 자동 확장
- 다른 저장소

---
layout: conclusion
eyebrow: 15 · Conclusion
headline: 지금 알 수 있는 답과 바로 할 일을 함께 정리
subtitle: 확인한 사실과 앞으로 얻을 결과를 구분
---

지금 확인한 내용 → 먼저 준비할 항목 → 같은 조건의 비교 → 결과에 따른 다음 행동

::steps::

### 마무리 항목

- 한 문장 답
- 첫 실행
- 아직 정하지 못한 값
- 후속 확인

---
layout: references
eyebrow: 16 · References
headline: 화면의 주장과 바로 연결된 참고자료
subtitle: 파일명이나 링크를 모든 화면 아래에 반복하지 않는 구성
---

<ul class="reference-list">
  <li><strong>이전 실험</strong> 문서명, 절, 실행 조건</li>
  <li><strong>현재 구현</strong> 코드와 배포 설정</li>
  <li><strong>기술 동작</strong> 공식 문서의 버전과 링크</li>
  <li><strong>측정 방법</strong> 지표 계약과 분석 단위</li>
</ul>

::scope::

### 출처 기록

수치의 시점, 조건, 이전 결과와 새 결과의 구분
