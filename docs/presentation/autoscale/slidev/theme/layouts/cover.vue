<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ eyebrow?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="cover" :eyebrow="eyebrow" :title="headline" :subtitle="subtitle">
    <slot />
    <div class="cover-meta">
      <slot name="meta" />
    </div>
  </BaseSlide>
</template>
