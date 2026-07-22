# KEDA 실험 발표자료

이 폴더에는 같은 내용을 두 가지 발표 도구로 구현한 자료와 재사용 가능한 디자인 규칙이 있습니다.

- `slidev/`: Markdown, Vue 레이아웃, Mermaid, 발표자 노트를 활용한 Slidev 버전
- `revealjs/`: Vite, TypeScript, semantic HTML, fragment를 활용한 Reveal.js 버전
- `DESIGN-SPEC.md`: 색, 글자, 간격, 카드와 표의 공통 규칙
- `LAYOUT-CATALOG.md`: 16종 레이아웃의 목적, 입력 영역, 사용 예시
- `LANGUAGE-POLICY.json`: 화면 금지 표현, 동사 종결 목록과 자연스러운 대체안
- `scripts/`: 문구, 근거, 빌드 결과와 16:9 화면을 검사하는 도구

## 발표가 답하려는 질문

이 발표는 이전 HPA 실험의 결과를 KEDA의 성과처럼 소개하지 않습니다. 이전 실험에서 파드는 늘었지만 사용자 품질이 회복되지 않았다는 사실을 출발점으로 삼고, 다음 KEDA 실험을 어떻게 준비하고 비교할지 설명합니다.

현재 코드와 배포 설정에서 확인한 KEDA 적용 후보는 `notification.requested`를 처리하는 알림 소비자입니다. 다만 소비자가 API 파드 안에서 실행되고 토픽 파티션이 1개이므로 바로 KEDA를 붙이지 않습니다. 먼저 소비자를 별도 Deployment로 분리하고, 파티션 수와 단일 워커 처리량을 확인한 뒤 고정 용량, CPU HPA, Kafka lag 기반 KEDA를 같은 입력에서 비교합니다.

쉽게 말하면 CPU HPA가 주방의 열기를 보고 직원을 부르는 방식이라면, 이번 KEDA 실험은 밀린 주문표 수를 보고 직원을 부르는 방식입니다. 주문표를 나눠 맡을 작업대가 한 개뿐이면 직원을 늘려도 소용이 없으므로 Kafka 파티션 수도 함께 확인합니다.

## 설치와 실행

루트 의존성과 두 프로젝트의 의존성을 한 번에 설치합니다.

```bash
cd /Users/danghamo/Documents/gituhb/tempkong/workspaces/docs/presentation/autoscale
npm run setup
```

Slidev 발표자료:

```bash
npm run dev:slidev
```

- 발표 화면: `http://localhost:3030/`
- 발표자 화면: 발표 화면에서 `p` 입력

Slidev 레이아웃 카탈로그:

```bash
npm run dev:slidev:catalog
```

- 카탈로그: `http://localhost:3031/`

Reveal.js 발표자료:

```bash
npm run dev:reveal
```

- 발표 화면: `http://localhost:4173/`
- 발표자 화면: 발표 화면에서 `s` 입력
- 카탈로그: `http://localhost:4173/catalog.html`

## 정적 빌드와 검증

```bash
npm run lint:language
npm run verify:evidence
npm run build:slidev
npm run build:reveal
npm run verify:visual
npm run check
```

- `lint:language`: `LANGUAGE-POLICY.json`의 화면 금지 표현, 동사 종결과 번역체 후보 검사
- `verify:evidence`: 이전 HPA 수치, KEDA 대상, 12장 구성, 10분 노트, 출처 일치 검사
- `build:slidev`: 발표자료와 카탈로그의 Slidev 정적 빌드
- `build:reveal`: Reveal.js TypeScript 검사와 두 HTML 진입점 정적 빌드
- `verify:visual`: 1600×900에서 발표 24장과 카탈로그 32장의 overflow, 글자 크기, 대비, 제목 간격, 과도한 빈 공간 검사

시각 검사 이미지는 `visual-report/latest/`에 저장됩니다. 디자인 레퍼런스와 대표 슬라이드는 다음처럼 나란히 열어 수동으로 비교합니다.

```bash
open /Users/danghamo/Documents/gituhb/tempkong/workspaces/assets/dropmong-system-architecture-sheet-color.png
open /Users/danghamo/Documents/gituhb/tempkong/workspaces/docs/presentation/autoscale/visual-report/latest/slidev-presentation-06.png
```

## 문구 검수

문자열 검사는 어색한 한국어를 모두 찾지 못합니다. 발표 화면을 고친 뒤 다음 순서로 한 번 더 읽습니다.

1. 한 문장을 소리 내어 읽고 한 번에 뜻이 들어오는지 확인
2. 명사가 세 개 이상 이어지면 짧은 문장으로 분리
3. 가운데점이 한 줄에 두 번 넘게 나오면 문장이나 표로 변경
4. `기반`, `통해`, `대상`, `관점`, `측면`이 없어도 뜻이 같은지 확인
5. 영어 어순을 그대로 옮긴 수식어와 수동 표현 삭제
6. 화면의 계획과 이미 확인한 결과를 서로 다른 라벨로 표시
7. 발표자 노트를 실제 발표 속도로 읽어 10분 이내인지 확인

`LANGUAGE-POLICY.json`의 `forbiddenVerbEndings`가 화면용 동사 종결 목록입니다. `-습니다/-ㅂ니다`, `-다`, `-해요/-예요`, 질문형, 명령형, `-하기/-보기` 제목형을 각각 정규식과 예시로 관리합니다. `forbiddenPhrases`에는 쓰지 않을 표현, 권장 대체안, 이유와 적용 범위를 기록합니다.

`scope`가 `screen`인 규칙은 두 발표자료와 두 레이아웃 카탈로그의 제목, 부제, 본문, 표와 카드에 적용됩니다. 발표자 노트와 README 본문은 자연스러운 `-습니다`체를 허용합니다. 새 동사 종결을 발견하면 `forbiddenVerbEndings`에 이름, 정규식, 실제 예시, 대체 원칙, 금지 이유를 추가한 뒤 `npm run lint:language`를 실행합니다.

## 콘텐츠 수정

- 두 발표자료의 주장과 수치는 함께 수정합니다.
  - Slidev: `slidev/slides.md`
  - Reveal.js: `revealjs/index.html`
- 이전 실험 수치를 바꿀 때는 세 연구 문서와 `scripts/verify-evidence.mjs`를 함께 확인합니다.
- 아직 실행하지 않은 결과는 `실험 전` 또는 `결정 필요`로 표시합니다.
- KEDA threshold, 처리 지연 SLO, 본 실험 반복 횟수는 준비 실행의 분산과 단일 워커 용량을 확인한 뒤 정합니다.

## 테마와 레이아웃 재사용

다른 기술 실험 발표에서는 다음 순서로 재사용합니다.

1. `DESIGN-SPEC.md`와 `LANGUAGE-POLICY.json`을 새 발표 폴더에 복사
2. Slidev의 `theme/` 또는 Reveal.js의 `src/theme.css`와 `src/layout-contract.ts` 복사
3. `LAYOUT-CATALOG.md`에서 질문에 맞는 레이아웃 선택
4. 예시 문구를 실제 대상, 고정 조건, 바꿀 조건, 측정값으로 교체
5. 문구 검사, 정적 빌드, 1600×900 시각 검사 실행

레이아웃 이름은 두 도구에서 같습니다. Slidev는 named slot을 사용하고 Reveal.js는 같은 뜻의 semantic class를 사용합니다. 레이아웃은 발표 내용을 모르는 상태에서도 재사용할 수 있고, 구체적인 KEDA 내용은 각 발표 파일에만 둡니다.

## 근거와 범위

- `../../research/autoscale/hpa-metric-selection-research-design.md`
- `../../research/autoscale/hpa-metric-selection-paper.md`
- `../../research/autoscale/kubernetes-autoscaling-strategy-research-design.md`
- KEDA 2.20 공식 문서의 Apache Kafka scaler와 Deployment scaling 설명

세 디자인 레퍼런스 이미지는 색, 선, 간격, 모서리 규칙을 확인하는 용도로만 사용합니다. 발표 화면에는 삽입하지 않습니다.
