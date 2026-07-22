<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="traffic-chart" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="traffic-shell">
      <slot />
      <aside class="panel"><slot name="annotations" /></aside>
    </div>
    <template #footer><slot name="caption" /></template>
  </BaseSlide>
</template>
