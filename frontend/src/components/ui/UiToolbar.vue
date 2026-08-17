<template>
  <div class="ui-toolbar" :class="[`ui-toolbar--${align}`, { 'ui-toolbar--wrap': wrap, 'ui-toolbar--mobile-stack': mobileStack }]" :role="role" :aria-label="ariaLabel || undefined">
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  align?: 'start' | 'between' | 'end';
  wrap?: boolean;
  role?: 'toolbar' | 'group' | string;
  ariaLabel?: string;
  mobileStack?: boolean;
}>(), {
  align: 'start', wrap: true, role: 'toolbar', ariaLabel: '', mobileStack: false,
});
</script>

<style scoped lang="scss">
.ui-toolbar { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.ui-toolbar--wrap { flex-wrap: wrap; }
.ui-toolbar--between { justify-content: space-between; }
.ui-toolbar--end { justify-content: flex-end; }
@media (max-width: 767.98px) {
  .ui-toolbar--mobile-stack { align-items: stretch; flex-direction: column; width: 100%; }
  .ui-toolbar--mobile-stack > :deep(*) { width: 100%; min-width: 0; }
}
</style>
