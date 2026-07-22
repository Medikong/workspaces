<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="preliminary-evidence" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="evidence-shell">
      <slot name="metrics" />
      <section class="panel"><slot /></section>
    </div>
    <template #footer><slot name="source" /></template>
  </BaseSlide>
</template>
