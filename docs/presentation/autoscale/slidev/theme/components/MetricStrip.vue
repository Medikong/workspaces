<script setup lang="ts">
type MetricItem = {
  value: string
  label: string
  detail?: string
  tone?: 'neutral' | 'danger' | 'success' | 'info'
}

defineProps<{ items: MetricItem[] }>()
</script>

<template>
  <div class="metric-strip" role="list">
    <article
      v-for="item in items"
      :key="`${item.label}-${item.value}`"
      class="metric-card"
      :data-tone="item.tone ?? 'neutral'"
      role="listitem"
    >
      <strong>{{ item.value }}</strong>
      <span>{{ item.label }}</span>
      <small v-if="item.detail">{{ item.detail }}</small>
    </article>
  </div>
</template>

<style scoped>
.metric-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--research-line-strong);
  border-radius: var(--research-radius-md);
  background: var(--research-surface);
}

.metric-card {
  min-width: 0;
  padding: 20px 22px;
  border-right: 1px solid var(--research-line-strong);
}

.metric-card:last-child {
  border-right: 0;
}

.metric-card strong,
.metric-card span,
.metric-card small {
  display: block;
}

.metric-card strong {
  color: var(--research-purple-ink);
  font-size: 44px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.08;
  letter-spacing: -0.035em;
}

.metric-card span {
  margin-top: 10px;
  color: var(--research-ink);
  font-size: 20px;
  font-weight: 700;
}

.metric-card small {
  margin-top: 4px;
  color: var(--research-muted);
  font-size: 18px;
  line-height: 1.3;
}

.metric-card[data-tone='danger'] strong {
  color: var(--research-danger);
}

.metric-card[data-tone='success'] strong {
  color: var(--research-success);
}

.metric-card[data-tone='info'] strong {
  color: var(--research-info);
}
</style>
