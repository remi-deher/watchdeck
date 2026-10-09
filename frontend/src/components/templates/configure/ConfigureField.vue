<template>
  <!-- Un reglage : son nom, ce qu'il change (en une phrase, avec un exemple concret au
       besoin), puis le controle. L'explication peut suivre la valeur choisie. -->
  <div class="configure-field" :class="{ 'is-stacked': stacked }">
    <div class="configure-field__text">
      <label v-if="forId" :for="forId" class="configure-field__label">{{ label }}</label>
      <span v-else class="configure-field__label">{{ label }}</span>
      <small v-if="help">{{ help }}</small>
    </div>
    <div class="configure-field__control"><slot /></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    /** Effet du reglage. */
    help?: string;
    /** Identifiant du champ, pour relier le libelle. */
    forId?: string;
    /** Controle sous le texte (champs larges) plutot qu'a cote. */
    stacked?: boolean;
  }>(),
  { help: '', forId: '', stacked: false },
);
</script>

<style scoped lang="scss">
.configure-field { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); min-width: 0; }
.configure-field.is-stacked { display: grid; }
.configure-field__text { display: grid; flex: 1 1 16rem; gap: 2px; min-width: 0; }
.configure-field__label { font-weight: 600; }
.configure-field__text small { color: var(--muted); font-size: var(--fs-sm); }
.configure-field__control { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); min-width: 0; }
.configure-field.is-stacked .configure-field__control > * { flex: 1 1 auto; }
</style>
