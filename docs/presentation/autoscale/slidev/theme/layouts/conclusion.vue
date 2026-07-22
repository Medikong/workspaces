<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="conclusion" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="conclusion-shell">
      <section class="question-focus"><slot /></section>
      <aside class="panel"><slot name="steps" /></aside>
    </div>
    <template #footer><slot name="status" /></template>
  </BaseSlide>
</template>
