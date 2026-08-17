<template>
  <span class="ui-badge ui-status" :class="[`is-${tone}`, { 'ui-badge--pill': pill }]">
    <span v-if="dot" class="ui-status-dot" aria-hidden="true" />
    <span><slot /></span>
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | string; dot?: boolean; pill?: boolean }>(), {
  tone: 'neutral', dot: false, pill: false,
});
</script>

<style scoped lang="scss">
.ui-badge { display: inline-flex; flex: none; align-items: center; gap: var(--space-1); max-width: 100%; min-height: 24px; padding: 0 8px; border: 1px solid var(--border); border-radius: var(--radius-xs); background: var(--surface-2); color: var(--muted); font-size: var(--fs-xs); font-weight: 650; white-space: nowrap; }
.ui-badge--pill,.ui-badge:has(.ui-status-dot) { min-height: 26px; padding-inline: 9px; border-radius: var(--radius-pill); }
.ui-status-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px color-mix(in srgb,currentColor 14%,transparent); }
.is-success { color: var(--green-text); border-color: rgba(34,197,94,.35); background: rgba(34,197,94,.08); }
.is-info { color: #60a5fa; border-color: rgba(96,165,250,.35); background: rgba(96,165,250,.08); }
.is-warning { color: var(--accent); border-color: rgba(229,160,13,.4); background: rgba(229,160,13,.08); }
.is-danger { color: var(--red-text); border-color: rgba(239,68,68,.4); background: rgba(239,68,68,.08); }
</style>
