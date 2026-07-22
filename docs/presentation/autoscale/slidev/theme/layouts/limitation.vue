<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="limitation" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="limitation-shell">
      <section class="panel panel-danger"><slot name="limits" /></section>
      <section class="panel panel-soft"><slot name="future" /></section>
    </div>
    <template #footer><slot name="boundary" /></template>
  </BaseSlide>
</template>
