<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="metric-statistics" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="metric-shell">
      <section class="panel"><slot name="metrics" /></section>
      <section class="panel panel-soft">
        <slot name="formula" />
        <slot name="method" />
      </section>
    </div>
    <template #footer><slot name="footer" /></template>
  </BaseSlide>
</template>
