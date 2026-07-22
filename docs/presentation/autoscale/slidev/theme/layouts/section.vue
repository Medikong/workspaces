<script setup lang="ts">
import BaseSlide from '../components/BaseSlide.vue'

defineProps<{ index?: string; headline?: string; subtitle?: string }>()
</script>

<template>
  <BaseSlide kind="section" :title="headline" :subtitle="subtitle">
    <p v-if="index" class="section-index">{{ index }}</p>
    <slot />
  </BaseSlide>
</template>
