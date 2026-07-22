<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="experiment-matrix" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="matrix-shell">
      <slot />
      <div><slot name="placeholder" /></div>
    </div>
    <template #footer><slot name="legend" /></template>
  </BaseSlide>
</template>
