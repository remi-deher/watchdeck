<template>
  <section class="metric-grid shared-metric-grid" :class="gridClass" :aria-label="ariaLabel">
    <slot />
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    gridClass?: string;
    ariaLabel?: string;
  }>(),
  {
    gridClass: 'compact-metrics',
    ariaLabel: '',
  }
);
</script>

<style scoped lang="scss">
.shared-metric-grid {
  container-type: inline-size;
  min-width: 0;
}

@container (max-width: 419px) {
  .shared-metric-grid { grid-template-columns: 1fr; }
}
</style>
