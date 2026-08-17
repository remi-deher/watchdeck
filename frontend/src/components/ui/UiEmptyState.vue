<template>
  <div class="empty ui-empty-state" :class="{ 'ui-empty-state--compact': compact }" role="status">
    <component :is="icon" v-if="icon" class="ui-empty-state-icon" aria-hidden="true" />
    <div class="ui-empty-state-copy">
      <strong v-if="title">{{ title }}</strong>
      <p><slot>{{ message }}</slot></p>
    </div>
    <div v-if="$slots.action" class="ui-empty-state-action"><slot name="action" /></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title?: string; message?: string; icon?: any; compact?: boolean }>(), {
  title: '', message: '', icon: null, compact: false,
});
</script>

<style scoped lang="scss">
.ui-empty-state { display: grid; justify-items: center; gap: var(--space-3); width: 100%; margin: var(--space-2) 0; padding: var(--space-6) var(--space-4); border: 1px dashed var(--border); border-radius: var(--radius-md); background: var(--surface-2); color: var(--muted); text-align: center; }
.ui-empty-state--compact { margin: 0; padding: var(--space-5) var(--space-3); border: 0; background: transparent; }
.ui-empty-state-icon { width: 24px; height: 24px; }
.ui-empty-state-copy { display: grid; gap: var(--space-1); max-width: 52ch; }
.ui-empty-state strong { color: var(--text); font-size: var(--fs-sm); }
.ui-empty-state p { margin: 0; font-size: var(--fs-sm); line-height: 1.45; }
.ui-empty-state-action { margin-top: var(--space-1); }
</style>
