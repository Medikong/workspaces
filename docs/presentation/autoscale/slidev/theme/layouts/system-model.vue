<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="system-model" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="system-shell">
      <section class="panel"><slot /></section>
      <aside class="panel panel-soft"><slot name="boundary" /></aside>
    </div>
    <template #footer><slot name="legend" /></template>
  </BaseSlide>
</template>
