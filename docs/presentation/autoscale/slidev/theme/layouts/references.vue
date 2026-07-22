<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="references" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="references-shell">
      <section class="panel"><slot /></section>
      <aside class="panel panel-soft"><slot name="scope" /></aside>
    </div>
    <template #footer><slot name="footer" /></template>
  </BaseSlide>
</template>
