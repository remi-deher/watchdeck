<template>
  <div class="sticky-header">
    <div v-if="$slots.nav" class="sticky-header-nav"><slot name="nav" /></div>
    <div v-if="$slots.search" class="sticky-header-search"><slot name="search" /></div>
    <div v-if="$slots.filters" class="sticky-header-filters"><slot name="filters" /></div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped lang="scss">
.sticky-header {
  position: sticky;
  top: calc(8px + var(--safe-top));
  z-index: 20;
  display: grid;
  gap: var(--space-2);
  align-self: center;
  width: min(100%, 860px);
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.sticky-header-nav :deep(.subnav-bar) { margin: 0; }
.sticky-header-nav :deep(.subnav-mobile-select) { margin: 0; }
.sticky-header-search { border-top: 1px solid var(--border); padding-top: 6px; }
.sticky-header-filters { padding-top: 8px; border-top: 1px solid var(--border); }
@media (max-width: 640px) {
  .sticky-header { top: calc(6px + var(--safe-top)); padding: 8px 10px; }
}
</style>
