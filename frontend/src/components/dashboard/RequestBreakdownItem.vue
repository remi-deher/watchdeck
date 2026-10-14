<template>
  <div class="breakdown-card" :class="`${kind}-card`">
    <div class="breakdown-icon"><slot name="icon" /></div>
    <div class="breakdown-info"><strong>{{ counts.total ?? 0 }}</strong><span>{{ label }}</span></div>
    <div class="breakdown-sub">
      <span class="bsub-item"><span class="dot green" />{{ counts.available ?? 0 }} dispos</span>
      <span class="bsub-item"><span class="dot yellow" />{{ counts.sent_to_arr ?? 0 }} en cours</span>
      <span class="bsub-item"><span class="dot red" />{{ counts.failed ?? 0 }} échoués</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RequestTypeCount } from './RequestsBreakdownPanel.vue';
withDefaults(defineProps<{ kind: 'movie' | 'show'; label: string; counts?: RequestTypeCount }>(), { counts: () => ({}) });
</script>

<style scoped lang="scss">
.breakdown-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 14px;
  border-radius: var(--panel-radius);
  border: 1px solid var(--border);
  background: rgb(var(--ink) / 0.02);
}

.breakdown-icon {
  color: var(--muted);
  display: flex;
}

.breakdown-icon svg {
  width: 20px;
  height: 20px;
}

.breakdown-info strong {
  display: block;
  font-size: var(--fs-2xl);
  font-weight: 800;
  color: var(--text);
  line-height: 1;
}

.breakdown-info span {
  font-size: var(--fs-sm);
  color: var(--muted);
}

.breakdown-sub {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.bsub-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-xs);
  color: var(--muted);
}
</style>
