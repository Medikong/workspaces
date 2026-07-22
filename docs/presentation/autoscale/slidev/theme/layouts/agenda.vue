<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="agenda" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="agenda-shell">
      <div class="agenda-list"><slot /></div>
      <aside class="panel panel-soft"><slot name="timing" /></aside>
    </div>
    <template #footer><slot name="footer" /></template>
  </BaseSlide>
</template>
