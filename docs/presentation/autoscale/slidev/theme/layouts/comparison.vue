<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="comparison" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="comparison-shell">
      <section class="panel panel-success"><slot name="left" /></section>
      <div class="comparison-divider"><slot name="criterion">≠</slot></div>
      <section class="panel panel-danger"><slot name="right" /></section>
    </div>
    <template #footer><slot name="footer" /></template>
  </BaseSlide>
</template>
