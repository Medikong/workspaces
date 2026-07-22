<script setup lang="ts">
withDefaults(defineProps<{
  kind?: string
  eyebrow?: string
  title?: string
  subtitle?: string
}>(), {
  kind: 'default',
  eyebrow: '',
  title: '',
  subtitle: '',
})
</script>

<template>
  <div class="slidev-layout research-slide" :class="`layout-${kind}`">
    <header v-if="eyebrow || title || subtitle" class="slide-header">
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <h1 v-if="title">{{ title }}</h1>
      <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
    </header>
    <main class="slide-body">
      <slot />
    </main>
    <footer v-if="$slots.footer" class="slide-footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

