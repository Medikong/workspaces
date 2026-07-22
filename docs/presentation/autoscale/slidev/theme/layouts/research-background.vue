<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="research-background" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <div class="background-shell">
      <section class="panel"><slot name="context" /></section>
      <section class="panel panel-danger"><slot name="gap" /></section>
      <section class="panel panel-soft"><slot name="need" /></section>
    </div>
    <template #footer><slot name="footer" /></template>
  </BaseSlide>
</template>
