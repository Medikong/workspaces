import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const workspaceDir = resolve(rootDir, '../../..')
const tempkongDir = resolve(workspaceDir, '..')

const sourcePaths = {
  strategy: join(workspaceDir, 'docs/research/autoscale/kubernetes-autoscaling-strategy-research-design.md'),
  hpaDesign: join(workspaceDir, 'docs/research/autoscale/hpa-metric-selection-research-design.md'),
  paper: join(workspaceDir, 'docs/research/autoscale/hpa-metric-selection-paper.md'),
  notificationRuntime: join(tempkongDir, 'service/services/notification-service/app/db.py'),
  notificationMessaging: join(tempkongDir, 'service/services/notification-service/app/messaging.py'),
  eventContract: join(tempkongDir, 'service/packages/contracts/src/contracts/events.py'),
  notificationValues: join(tempkongDir, 'gitops/values/services/notification.yaml'),
  kafkaManifest: join(tempkongDir, 'gitops/platform/data/chart/templates/kafka.yaml'),
  gitopsPrd: join(tempkongDir, 'gitops/docs/PRD.md'),
  monitoringReadme: join(tempkongDir, 'gitops/platform/monitoring/README.md'),
}

const deckPaths = {
  slidev: join(rootDir, 'slidev/slides.md'),
  reveal: join(rootDir, 'revealjs/index.html'),
}

const catalogPaths = {
  slidev: join(rootDir, 'slidev/layout-catalog.md'),
  reveal: join(rootDir, 'revealjs/catalog.html'),
}

const sources = Object.fromEntries(
  await Promise.all(Object.entries(sourcePaths).map(async ([name, path]) => [name, await readFile(path, 'utf8')])),
)
const decks = Object.fromEntries(
  await Promise.all(Object.entries(deckPaths).map(async ([name, path]) => [name, await readFile(path, 'utf8')])),
)
const catalogs = Object.fromEntries(
  await Promise.all(Object.entries(catalogPaths).map(async ([name, path]) => [name, await readFile(path, 'utf8')])),
)

const failures = []

function assert(condition, message) {
  if (!condition) failures.push(message)
}

assert(sources.strategy.includes('약 11~14초'), '06 연구 기획서의 decision 이후 Ready 11~14초 근거 누락')
assert(sources.strategy.includes('34.64%'), '06 연구 기획서의 실패율 34.64% 근거 누락')
assert(sources.strategy.includes('14,885.30ms'), '06 연구 기획서의 p99 14,885.30ms 근거 누락')
assert(sources.strategy.includes('`1 -> 4`'), '06 연구 기획서의 concert 1 -> 4 근거 누락')
assert(sources.paper.includes('새 연구의 결과로 재사용하지 않는다'), '05 논문의 이전 결과 사용 범위 누락')
assert(sources.hpaDesign.includes('HPA 동작과 SLO 회복이 별도로 판정됐다'), '04 연구 설계의 HPA와 SLO 구분 근거 누락')

const p99Match = sources.paper.match(/p99 응답시간 \| `([\d,]+(?:\.\d+)?)ms`/)
assert(Boolean(p99Match), '05 논문의 concert p99 원시 수치 파싱 실패')
if (p99Match) {
  const p99Seconds = Number(p99Match[1].replaceAll(',', '')) / 1000
  assert(Math.abs(p99Seconds - 14.9) < 0.05, 'p99 약 14.9초 정규화 불일치: ' + p99Seconds.toFixed(3) + '초')
}

assert(sources.eventContract.includes('NOTIFICATION_REQUESTED_TOPIC: Final = "notification.requested"'), '알림 토픽 계약 확인 실패')
assert(sources.notificationMessaging.includes('group_id="notification-service-notification-requested"'), '알림 consumer group 확인 실패')
assert(sources.notificationRuntime.includes('task_group.start_soon(runtime.notification_requested_consumer.run)'), '알림 소비자의 API lifespan 결합 확인 실패')
assert(!sources.notificationValues.includes('\nworkers:'), '알림 서비스에 별도 worker 배포가 생겼으므로 발표 근거 재검토 필요')
assert(sources.kafkaManifest.includes('--topic notification.requested --partitions 1'), '알림 토픽의 현재 파티션 1개 확인 실패')
assert(sources.gitopsPrd.includes('KEDA(Kafka consumer lag 기반)'), 'GitOps PRD의 Kafka lag KEDA 요구 확인 실패')
assert(sources.monitoringReadme.includes('consumer lag 같은 항목'), 'consumer lag metric 계약 부재 근거 확인 실패')

for (const [name, deck] of Object.entries(decks)) {
  for (const required of ['11–14초', '1 → 4', '34.64%', '약 14.9초']) {
    assert(deck.includes(required), name + ' 발표자료의 이전 HPA 수치 누락: ' + required)
  }
  for (const required of [
    'notification.requested',
    'notification-service-notification-requested',
    'Kafka consumer lag',
    '고정 용량',
    'CPU HPA',
    'KEDA',
    '소비자를 별도 Deployment로 분리',
    '실험 전',
    '결정 필요',
  ]) {
    assert(deck.includes(required), name + ' 발표자료의 KEDA 실험 조건 누락: ' + required)
  }
  for (const sourceFile of [
    'kubernetes-autoscaling-strategy-research-design.md',
    'hpa-metric-selection-research-design.md',
    'hpa-metric-selection-paper.md',
  ]) {
    assert(deck.includes(sourceFile), name + ' 발표자료의 참고자료 누락: ' + sourceFile)
  }
  assert(deck.includes('https://keda.sh/docs/2.20/scalers/apache-kafka/'), name + ' 발표자료의 KEDA Kafka 공식 문서 누락')
  assert(deck.includes('https://keda.sh/docs/2.20/concepts/scaling-deployments/'), name + ' 발표자료의 KEDA 동작 공식 문서 누락')
  for (const forbiddenImage of [
    'dropmong-system-architecture-sheet-color.png',
    'dropmong-system-architecture-sheet.png',
    'dropmong-ui-ux-component-sheet.png',
  ]) {
    assert(!deck.includes(forbiddenImage), name + ' 발표자료의 디자인 레퍼런스 직접 삽입: ' + forbiddenImage)
  }
}

const slidevSlideCount = (decks.slidev.match(/^layout:/gm) ?? []).length
const revealSlideCount = (decks.reveal.match(/<section class="research-slide layout-/g) ?? []).length
const slidevNoteCount = (decks.slidev.match(/<!--/g) ?? []).length
const revealNoteCount = (decks.reveal.match(/<aside class="notes">/g) ?? []).length
const revealTimings = [...decks.reveal.matchAll(/data-timing="(\d+)"/g)].map((match) => Number(match[1]))
const slidevTimings = [...decks.slidev.matchAll(/\[(\d{2}):(\d{2})–(\d{2}):(\d{2})\]/g)].map((match) => ({
  start: Number(match[1]) * 60 + Number(match[2]),
  end: Number(match[3]) * 60 + Number(match[4]),
}))

assert(slidevSlideCount === 12, 'Slidev 발표 장수 불일치: ' + slidevSlideCount)
assert(revealSlideCount === 12, 'Reveal.js 발표 장수 불일치: ' + revealSlideCount)
assert(slidevNoteCount === 12, 'Slidev 발표자 노트 수 불일치: ' + slidevNoteCount)
assert(revealNoteCount === 12, 'Reveal.js 발표자 노트 수 불일치: ' + revealNoteCount)
assert(revealTimings.length === 12, 'Reveal.js 슬라이드 시간 입력 수 불일치: ' + revealTimings.length)
assert(revealTimings.reduce((sum, seconds) => sum + seconds, 0) === 600, 'Reveal.js 발표 시간 합계가 10분과 불일치')
assert(slidevTimings.length === 12, 'Slidev 발표자 노트 시간 구간 누락: ' + slidevTimings.length)
assert(slidevTimings[0]?.start === 0, 'Slidev 발표 시작 시간이 00:00과 불일치')
assert(slidevTimings.at(-1)?.end === 600, 'Slidev 발표 종료 시간이 10:00과 불일치')
assert(
  slidevTimings.every((timing, index) => index === 0 || timing.start === slidevTimings[index - 1].end),
  'Slidev 발표자 노트 시간 구간의 공백 또는 중첩',
)

const layoutNames = [
  'cover', 'section', 'agenda', 'research-background', 'preliminary-evidence', 'research-question',
  'hypothesis', 'comparison', 'system-model', 'traffic-chart', 'experiment-design', 'experiment-matrix',
  'metric-statistics', 'limitation', 'conclusion', 'references',
]

for (const layout of layoutNames) {
  assert(new RegExp('^layout: ' + layout + '$', 'm').test(catalogs.slidev), 'Slidev 카탈로그 레이아웃 누락: ' + layout)
  assert(catalogs.reveal.includes('layout-' + layout), 'Reveal.js 카탈로그 레이아웃 누락: ' + layout)
}

if (failures.length > 0) {
  console.error('근거와 구성 검증 실패')
  for (const failure of failures) console.error('- ' + failure)
  process.exitCode = 1
} else {
  console.log('근거와 구성 검증 통과 · 이전 HPA 수치 4개 · KEDA 대상 1개 · 10분×2 · 12장×2 · 레이아웃 16종×2')
}
