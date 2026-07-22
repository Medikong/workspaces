<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="hypothesis" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="hypothesis-shell">
      <section class="panel panel-soft"><slot name="h1" /></section>
      <section class="panel"><slot name="h0" /></section>
      <section class="panel panel-danger"><slot name="checks" /></section>
    </div>
    <template #footer><slot name="footer" /></template>
  </BaseSlide>
</template>
