<template>
  <section v-balanced-grid="{ min: 150 }" class="metric-grid shared-metric-grid" :class="gridClass" :aria-label="ariaLabel">
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

/* Vise la carte qui contient la grille, pas la grille elle-meme : une container query
   interroge toujours un ancetre. Hors d'une carte, la grille garde ses colonnes. */
@container card (max-width: 419px) {
  .shared-metric-grid { grid-template-columns: 1fr; }
}
</style>
