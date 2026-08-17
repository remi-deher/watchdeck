<template>
  <header class="ui-section-header panel-head" :class="{ 'ui-section-header--compact': compact }">
    <div class="ui-section-heading">
      <span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span>
      <component :is="headingTag" v-if="title">{{ title }}</component>
      <p v-if="description">{{ description }}</p>
      <slot />
    </div>
    <div v-if="$slots.meta" class="ui-section-meta"><slot name="meta" /></div>
    <div v-if="$slots.actions" class="ui-section-actions"><slot name="actions" /></div>
  </header>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string;
  description?: string;
  eyebrow?: string;
  headingTag?: 'h2' | 'h3' | 'h4' | string;
  compact?: boolean;
}>(), {
  title: '', description: '', eyebrow: '', headingTag: 'h2', compact: false,
});
</script>

<style scoped lang="scss">
.ui-section-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); min-width: 0; }
.ui-section-heading { display: grid; gap: var(--space-1); min-width: 0; }
.ui-section-heading :is(h2,h3,h4),.ui-section-heading p { margin: 0; }
.ui-section-heading p { max-width: 68ch; color: var(--muted); font-size: var(--fs-sm); line-height: 1.45; }
.ui-section-meta { margin-left: auto; color: var(--muted); font-size: var(--fs-sm); }
.ui-section-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-2); flex-wrap: wrap; }
.ui-section-header--compact { gap: var(--space-3); }
@media (max-width: 640px) { .ui-section-header { align-items: stretch; flex-wrap: wrap; } .ui-section-actions { width: 100%; justify-content: flex-start; } }
</style>
