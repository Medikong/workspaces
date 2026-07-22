<script setup lang="ts">
defineProps<{
  label?: string
  source: string
}>()
</script>

<template>
  <span class="source-note">
    <strong>{{ label ?? '출처' }}</strong> · {{ source }}
  </span>
</template>

