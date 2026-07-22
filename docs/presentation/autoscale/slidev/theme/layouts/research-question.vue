<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="research-question" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="question-shell">
      <section class="question-focus"><slot /></section>
      <aside class="panel"><slot name="facets" /></aside>
    </div>
    <template #footer><slot name="footer" /></template>
  </BaseSlide>
</template>
