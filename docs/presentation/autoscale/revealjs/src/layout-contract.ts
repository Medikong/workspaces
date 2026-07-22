export const layoutNames = [
  'cover',
  'section',
  'agenda',
  'research-background',
  'preliminary-evidence',
  'research-question',
  'hypothesis',
  'comparison',
  'system-model',
  'traffic-chart',
  'experiment-design',
  'experiment-matrix',
  'metric-statistics',
  'limitation',
  'conclusion',
  'references',
] as const

export type LayoutName = (typeof layoutNames)[number]

const layoutSet: ReadonlySet<string> = new Set(layoutNames)

export function validateLayoutContract(root: Document): void {
  const slides = root.querySelectorAll<HTMLElement>('.slides > section.research-slide')

  if (slides.length === 0) {
    throw new Error('research-slide section이 없습니다.')
  }

  for (const slide of slides) {
    const layoutClass = [...slide.classList].find((className) => className.startsWith('layout-'))
    const layoutName = layoutClass?.slice('layout-'.length)

    if (!layoutName || !layoutSet.has(layoutName)) {
      throw new Error(`지원하지 않는 연구 레이아웃: ${layoutName ?? '미지정'}`)
    }

    slide.dataset.layout = layoutName as LayoutName
  }
}

