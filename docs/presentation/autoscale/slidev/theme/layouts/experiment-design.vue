<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="experiment-design" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="design-shell">
      <section class="panel"><slot /></section>
      <aside class="panel panel-soft"><slot name="controls" /></aside>
    </div>
    <template #footer><slot name="output" /></template>
  </BaseSlide>
</template>
