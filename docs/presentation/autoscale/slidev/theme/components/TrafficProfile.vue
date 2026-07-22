<script setup lang="ts">
type Point = {
  label: string
  value: number
}

const props = withDefaults(defineProps<{
  points?: Point[]
  max?: number
}>(), {
  points: () => [
    { label: '00시', value: 90 },
    { label: '06시', value: 100 },
    { label: '10시', value: 180 },
    { label: '14시', value: 190 },
    { label: '18시', value: 280 },
    { label: '20시', value: 320 },
    { label: '24시', value: 110 },
  ],
  max: 350,
})

const left = 72
const top = 36
const width = 820
const height = 360

const coordinate = (point: Point, index: number) => {
  const x = left + (index / Math.max(1, props.points.length - 1)) * width
  const y = top + height - (point.value / props.max) * height
  return { x, y }
}

const polyline = props.points
  .map((point, index) => {
    const { x, y } = coordinate(point, index)
    return `${x},${y}`
  })
  .join(' ')
</script>

<template>
  <div class="traffic-profile">
    <svg viewBox="0 0 960 470" role="img" aria-labelledby="traffic-title traffic-desc">
      <title id="traffic-title">다상품·분산형 가상 일일 트래픽</title>
      <desc id="traffic-desc">하루 전체의 기본 수요와 오전, 점심, 저녁의 분산 피크를 표현한 가상 입력</desc>
      <g class="grid-lines">
        <line v-for="tick in [0, 100, 200, 300]" :key="tick" x1="72" x2="892" :y1="396 - (tick / max) * 360" :y2="396 - (tick / max) * 360"/>
      </g>
      <g class="axis-labels">
        <text v-for="tick in [0, 100, 200, 300]" :key="tick" x="56" :y="402 - (tick / max) * 360" text-anchor="end">{{ tick }}</text>
        <text x="20" y="26">RPS</text>
      </g>
      <path :d="`M ${left} ${top + height} L ${polyline.replaceAll(' ', ' L ')} L ${left + width} ${top + height} Z`" class="area"/>
      <polyline :points="polyline" class="line"/>
      <g v-for="(point, index) in points" :key="point.label">
        <circle :cx="coordinate(point, index).x" :cy="coordinate(point, index).y" r="6"/>
        <text :x="coordinate(point, index).x" y="438" text-anchor="middle">{{ point.label }}</text>
      </g>
    </svg>
    <div class="chart-status">가상 입력 · 실측 결과 아님</div>
  </div>
</template>

<style scoped>
.traffic-profile {
  position: relative;
  height: 100%;
  min-height: 430px;
  padding: 16px 20px;
  border: 1px solid var(--research-line);
  border-radius: 24px;
  background: var(--research-surface);
  box-shadow: var(--research-shadow);
}

svg {
  display: block;
  width: 100%;
  height: 100%;
}

.grid-lines line {
  stroke: #d9dde8;
  stroke-width: 1;
}

.axis-labels text,
svg > g > text {
  fill: #667085;
  font-family: Pretendard, sans-serif;
  font-size: 18px;
  font-weight: 600;
}

.area {
  fill: rgba(182, 155, 255, 0.2);
}

.line {
  fill: none;
  stroke: #6038d8;
  stroke-linejoin: round;
  stroke-linecap: round;
  stroke-width: 6;
}

circle {
  fill: #ffffff;
  stroke: #40208f;
  stroke-width: 4;
}

.chart-status {
  position: absolute;
  top: 22px;
  right: 26px;
  padding: 6px 12px;
  border: 1px solid #d9ccff;
  border-radius: 999px;
  color: #40208f;
  background: #eee9ff;
  font-size: 18px;
  font-weight: 750;
}
</style>
