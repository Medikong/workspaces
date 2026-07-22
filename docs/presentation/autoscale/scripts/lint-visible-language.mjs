import { readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = join(scriptDir, '..')
const policy = JSON.parse(await readFile(join(rootDir, 'LANGUAGE-POLICY.json'), 'utf8'))

for (const rule of policy.forbiddenVerbEndings) {
  const pattern = new RegExp(rule.pattern)
  for (const example of rule.examples) {
    if (!pattern.test(example)) {
      throw new Error('동사 종결 규칙 예시 불일치: ' + rule.name + ' · ' + example)
    }
  }
}

const targets = [
  { path: join(rootDir, 'slidev/slides.md'), type: 'markdown' },
  { path: join(rootDir, 'slidev/layout-catalog.md'), type: 'markdown' },
  { path: join(rootDir, 'revealjs/index.html'), type: 'html' },
  { path: join(rootDir, 'revealjs/catalog.html'), type: 'html' },
]

const visibleFrontmatterKeys = new Set(['title', 'headline', 'eyebrow', 'subtitle'])

function stripMarkup(line) {
  return line
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|lt|gt|amp|quot);/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~#>|]/g, ' ')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function visibleMarkdownLines(lines) {
  const visible = []
  let inComment = false
  let inFrontmatter = false

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index]
    const trimmed = line.trim()

    if (inComment) {
      if (line.includes('-->')) {
        inComment = false
        line = line.slice(line.indexOf('-->') + 3)
      } else {
        continue
      }
    }

    if (line.includes('<!--')) {
      const beforeComment = line.slice(0, line.indexOf('<!--'))
      inComment = !line.slice(line.indexOf('<!--') + 4).includes('-->')
      line = beforeComment
    }

    if (trimmed === '---') {
      if (inFrontmatter) {
        inFrontmatter = false
      } else {
        const next = lines.slice(index + 1).find((candidate) => candidate.trim() !== '')
        inFrontmatter = Boolean(next && /^[a-zA-Z][\w-]*\s*:/.test(next.trim()))
      }
      continue
    }

    if (inFrontmatter) {
      const match = line.match(/^([\w-]+):\s*(.+)$/)
      if (match && visibleFrontmatterKeys.has(match[1])) {
        visible.push({ line: index + 1, text: stripMarkup(match[2]) })
      }
      continue
    }

    if (/^::[\w-]+::$/.test(trimmed)) continue

    const text = stripMarkup(line)
    if (text) visible.push({ line: index + 1, text })
  }

  return visible
}

function visibleHtmlLines(lines) {
  const visible = []
  let inNotes = false
  let inScriptOrStyle = false

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index]

    if (/<(?:script|style)\b/i.test(line)) inScriptOrStyle = true
    if (inScriptOrStyle) {
      if (/<\/(?:script|style)>/i.test(line)) inScriptOrStyle = false
      continue
    }

    if (/<aside\b[^>]*class=["'][^"']*notes/i.test(line)) inNotes = true
    if (inNotes) {
      if (/<\/aside>/i.test(line)) inNotes = false
      continue
    }

    line = line.replace(/<!--.*?-->/g, '')
    for (const segment of line.split(/<[^>]*>/g)) {
      const text = stripMarkup(segment)
      if (text) visible.push({ line: index + 1, text })
    }
  }

  return visible
}

const violations = []
const warnings = []
let visibleLineCount = 0

for (const target of targets) {
  const source = await readFile(target.path, 'utf8')
  const lines = source.split(/\r?\n/)
  const visible = target.type === 'markdown' ? visibleMarkdownLines(lines) : visibleHtmlLines(lines)
  visibleLineCount += visible.length

  for (const entry of visible) {
    for (const rule of policy.forbiddenPhrases.filter((item) => item.scope === 'screen')) {
      if (entry.text.includes(rule.phrase)) {
        violations.push({
          file: target.path,
          line: entry.line,
          phrase: rule.phrase,
          replacement: rule.replacement,
          reason: rule.reason,
          text: entry.text,
        })
      }
    }

    for (const rule of policy.forbiddenVerbEndings.filter((item) => item.scope === 'screen')) {
      if (new RegExp(rule.pattern).test(entry.text)) {
        violations.push({
          file: target.path,
          line: entry.line,
          phrase: rule.name,
          replacement: rule.replacement,
          reason: rule.reason,
          text: entry.text,
        })
      }
    }

    for (const rule of policy.warningPatterns) {
      const pattern = new RegExp(rule.pattern, 'g')
      const count = [...entry.text.matchAll(pattern)].length
      if (count > rule.maxPerLine) {
        warnings.push({ file: target.path, line: entry.line, message: rule.message, text: entry.text })
      }
    }
  }
}

if (warnings.length > 0) {
  console.warn('번역체 후보 수동 확인 · ' + warnings.length + '건')
  for (const warning of warnings) {
    console.warn('- ' + relative(rootDir, warning.file) + ':' + warning.line + ' ' + warning.message + ' · ' + warning.text)
  }
}

if (violations.length > 0) {
  console.error('화면 금지 표현 감지 · ' + violations.length + '건')
  for (const violation of violations) {
    console.error(
      '- ' + relative(rootDir, violation.file) + ':' + violation.line +
      ' [' + violation.phrase + ' → ' + violation.replacement + '] ' + violation.reason +
      ' · ' + violation.text,
    )
  }
  process.exitCode = 1
} else {
  console.log(
    '화면 문구 검사 통과 · 4개 화면 소스 · ' + visibleLineCount +
    '개 표시 줄 · 금지 표현·동사 종결 0건 · 번역체 후보 ' + warnings.length + '건 수동 확인 대상',
  )
}
