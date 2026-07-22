import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-chromium'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const reportDir = join(rootDir, 'visual-report/latest')
const axeSource = await readFile(resolve(rootDir, 'node_modules/axe-core/axe.min.js'), 'utf8')

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function createStaticServer(directory) {
  const root = resolve(directory)
  const server = createServer(async (request, response) => {
    try {
      const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
      const normalizedPath = normalize(requestPath).replace(/^[/\\]+/, '')
      let candidate = resolve(root, normalizedPath || 'index.html')

      if (!candidate.startsWith(root)) {
        response.writeHead(403).end('Forbidden')
        return
      }

      if (existsSync(candidate) && (await stat(candidate)).isDirectory()) {
        candidate = join(candidate, 'index.html')
      }
      if (!existsSync(candidate)) {
        candidate = join(root, 'index.html')
      }

      const body = await readFile(candidate)
      response.writeHead(200, { 'Content-Type': mime[extname(candidate)] ?? 'application/octet-stream' })
      response.end(body)
    } catch (error) {
      response.writeHead(500).end(error instanceof Error ? error.message : 'Unknown error')
    }
  })

  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('임시 서버 포트 확인 실패')
      resolveServer({ server, url: 'http://127.0.0.1:' + address.port })
    })
  })
}

const allLayouts = [
  'cover', 'section', 'agenda', 'research-background', 'preliminary-evidence', 'research-question',
  'hypothesis', 'comparison', 'system-model', 'traffic-chart', 'experiment-design', 'experiment-matrix',
  'metric-statistics', 'limitation', 'conclusion', 'references',
]

const pageSpecs = [
  {
    name: 'slidev-presentation',
    framework: 'slidev',
    directory: join(rootDir, 'slidev/dist'),
    entry: '/',
    count: 12,
    start: 1,
    expectedLayouts: null,
  },
  {
    name: 'slidev-catalog',
    framework: 'slidev',
    directory: join(rootDir, 'slidev/dist-catalog'),
    entry: '/',
    count: 16,
    start: 1,
    expectedLayouts: allLayouts,
  },
  {
    name: 'reveal-presentation',
    framework: 'reveal',
    directory: join(rootDir, 'revealjs/dist'),
    entry: '/index.html',
    count: 12,
    start: 0,
    expectedLayouts: null,
  },
  {
    name: 'reveal-catalog',
    framework: 'reveal',
    directory: join(rootDir, 'revealjs/dist'),
    entry: '/catalog.html',
    count: 16,
    start: 0,
    expectedLayouts: allLayouts,
  },
]

for (const spec of pageSpecs) {
  if (!existsSync(spec.directory)) {
    throw new Error('정적 빌드 디렉터리 누락: ' + spec.directory)
  }
}

await mkdir(reportDir, { recursive: true })

const servers = await Promise.all(pageSpecs.map((spec) => createStaticServer(spec.directory)))
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
})

const results = []
const failures = []

try {
  for (let specIndex = 0; specIndex < pageSpecs.length; specIndex += 1) {
    const spec = pageSpecs[specIndex]
    const serverInfo = servers[specIndex]
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
    await page.goto(serverInfo.url + spec.entry + '#/' + spec.start, { waitUntil: 'networkidle' })
    if (spec.framework === 'reveal') {
      await page.waitForFunction(() => Boolean(Reflect.get(window, 'researchDeck')))
      await page.evaluate(() => {
        Reflect.get(window, 'researchDeck').configure({
          transition: 'none',
          backgroundTransition: 'none',
        })
      })
      await page.addScriptTag({ content: axeSource })
    }
    await page.waitForTimeout(400)

    const layouts = []
    for (let offset = 0; offset < spec.count; offset += 1) {
      const slideIndex = spec.start + offset
      if (spec.framework === 'slidev') {
        await page.goto(serverInfo.url + spec.entry + '#/' + slideIndex, { waitUntil: 'networkidle' })
        await page.addScriptTag({ content: axeSource })
      } else {
        await page.evaluate(async (index) => {
          Reflect.get(window, 'researchDeck').slide(index)
          await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))
        }, slideIndex)
      }
      await page.waitForTimeout(400)

      const inspection = await page.evaluate(async () => {
        document.querySelectorAll('.fragment').forEach((element) => {
          element.classList.add('visible')
        })
        document.querySelectorAll('.slidev-vclick-target').forEach((element) => {
          element.classList.remove('slidev-vclick-hidden')
          element.classList.add('slidev-vclick-prior')
        })

        const candidates = [...document.querySelectorAll('.research-slide')]
        const explicitActive = document.querySelector('.research-slide.present')
        const active = explicitActive ?? candidates
          .map((element) => {
            const rect = element.getBoundingClientRect()
            const overlapX = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left))
            const overlapY = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top))
            return { element, area: overlapX * overlapY }
          })
          .sort((a, b) => b.area - a.area)[0]?.element

        if (!active) return { error: '활성 연구 슬라이드 없음' }

        const slideRect = active.getBoundingClientRect()
        const slideStyle = getComputedStyle(active)
        const visibleText = [...active.childNodes]
          .filter((node) => !(node instanceof HTMLElement && node.matches('aside.notes')))
          .map((node) => node.textContent ?? '')
          .join('')
          .replace(/\s/g, '')
        const inViewport =
          slideRect.left >= -5 &&
          slideRect.top >= -5 &&
          slideRect.right <= innerWidth + 5 &&
          slideRect.bottom <= innerHeight + 5
        if (!inViewport || slideStyle.visibility === 'hidden' || Number(slideStyle.opacity) < 0.99 || visibleText.length < 12) {
          return { error: '활성 슬라이드의 최종 표시 상태 확인 실패' }
        }

        const overflow = []
        const smallText = []
        const occupiedRects = []

        for (const element of active.querySelectorAll('*')) {
          if (element.closest('aside.notes')) continue
          const style = getComputedStyle(element)
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue
          const rect = element.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) continue

          const tolerance = 5
          if (
            rect.left < slideRect.left - tolerance ||
            rect.right > slideRect.right + tolerance ||
            rect.top < slideRect.top - tolerance ||
            rect.bottom > slideRect.bottom + tolerance
          ) {
            overflow.push({
              tag: element.tagName.toLowerCase(),
              className: String(element.className ?? '').slice(0, 100),
              text: element.textContent?.trim().slice(0, 80) ?? '',
            })
          }

          const directText = [...element.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? '')
            .join('')
            .replace(/[\s\u200b-\u200d\ufeff]/g, '')
          const fontSize = Number.parseFloat(style.fontSize)
          if (directText.length > 0 || element.matches('svg, img, canvas, table')) {
            occupiedRects.push(rect)
          }
          if (directText.length > 0 && fontSize < 18) {
            smallText.push({
              tag: element.tagName.toLowerCase(),
              size: fontSize,
              text: element.textContent?.trim().slice(0, 80) ?? '',
            })
          }
        }

        const axeResult = await window.axe.run(active, {
          runOnly: { type: 'rule', values: ['color-contrast'] },
        })

        const layoutClass = [...active.classList].find((className) => className.startsWith('layout-'))
        const layout = layoutClass?.slice('layout-'.length) ?? 'unknown'
        const header = active.querySelector('.slide-header')
        const title = header?.querySelector('h1')
        const subtitle = header?.querySelector('.subtitle')
        const body = active.querySelector('.slide-body')
        const titleSubtitleGap = title && subtitle
          ? Math.round(subtitle.getBoundingClientRect().top - title.getBoundingClientRect().bottom)
          : null
        const headerBodyGap = header && body
          ? Math.round(body.getBoundingClientRect().top - header.getBoundingClientRect().bottom)
          : null
        const spacing = {
          titleSubtitleGap,
          headerBodyGap,
          valid:
            (titleSubtitleGap === null || (titleSubtitleGap >= 6 && titleSubtitleGap <= 24)) &&
            (headerBodyGap === null || (headerBodyGap >= 20 && headerBodyGap <= 48)),
        }
        const occupiedBottom = occupiedRects.length > 0
          ? Math.max(...occupiedRects.map((rect) => rect.bottom))
          : slideRect.top
        const bottomGap = Math.round(slideRect.bottom - occupiedBottom)
        const blankSpace = {
          bottomGap,
          excessive: !['cover', 'section'].includes(layout) && bottomGap > 300,
        }
        return {
          error: null,
          layout,
          overflow: overflow.slice(0, 12),
          smallText: smallText.slice(0, 12),
          spacing,
          blankSpace,
          contrast: axeResult.violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            nodes: violation.nodes.length,
          })),
          slideSize: {
            width: Math.round(slideRect.width),
            height: Math.round(slideRect.height),
          },
        }
      })

      const screenshotPath = join(reportDir, spec.name + '-' + String(offset + 1).padStart(2, '0') + '.png')
      await page.screenshot({ path: screenshotPath })

      if (inspection.error) failures.push(spec.name + ' #' + (offset + 1) + ': ' + inspection.error)
      if (inspection.overflow?.length) failures.push(spec.name + ' #' + (offset + 1) + ': overflow ' + JSON.stringify(inspection.overflow))
      if (inspection.smallText?.length) failures.push(spec.name + ' #' + (offset + 1) + ': 18px 미만 문구 ' + JSON.stringify(inspection.smallText))
      if (inspection.spacing && !inspection.spacing.valid) failures.push(spec.name + ' #' + (offset + 1) + ': 제목 간격 ' + JSON.stringify(inspection.spacing))
      if (inspection.blankSpace?.excessive) failures.push(spec.name + ' #' + (offset + 1) + ': 과도한 아래 빈 공간 ' + JSON.stringify(inspection.blankSpace))
      if (inspection.contrast?.length) failures.push(spec.name + ' #' + (offset + 1) + ': 대비 ' + JSON.stringify(inspection.contrast))

      layouts.push(inspection.layout)
      results.push({ page: spec.name, slide: offset + 1, screenshotPath, ...inspection })
    }

    if (spec.expectedLayouts) {
      const missing = spec.expectedLayouts.filter((layout) => !layouts.includes(layout))
      if (missing.length) failures.push(spec.name + ': 미렌더링 레이아웃 ' + missing.join(', '))
    }

    await page.close()
  }
} finally {
  await browser.close()
  await Promise.all(servers.map(({ server }) => new Promise((resolveClose) => server.close(resolveClose))))
}

await writeFile(
  join(reportDir, 'report.json'),
  JSON.stringify({ viewport: '1600x900', slides: results.length, failures, results }, null, 2),
  'utf8',
)

if (failures.length > 0) {
  console.error('16:9 시각 검증 실패 · ' + failures.length + '건')
  for (const failure of failures) console.error('- ' + failure)
  process.exitCode = 1
} else {
  console.log('16:9 시각 검증 통과 · ' + results.length + '장 · overflow 0 · 18px 미만 0 · 제목 간격 위반 0 · 과도한 빈 공간 0 · 대비 위반 0')
  console.log('검증 보고서 · ' + join(reportDir, 'report.json'))
}
