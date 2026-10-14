<!--
  Barre d'étapes numérotées (Reka UI Stepper : navigation au clavier, `aria-current`).
  L'étape en cours est mise en avant, les étapes déjà atteintes sont cochées et
  cliquables pour y revenir ; on ne saute pas en avant. `select` porte l'index (depuis 0).
-->
<template>
  <StepperRoot :model-value="current + 1" :linear="false" class="ui-stepper" aria-label="Étapes" @update:model-value="onSelect">
    <StepperItem
      v-for="(entry, index) in steps"
      :key="entry.key"
      :step="index + 1"
      :disabled="index >= furthest || complete"
      class="ui-stepper__item"
      :class="{ 'is-current': index === current && !complete, 'is-done': index < furthest || complete }"
    >
      <StepperTrigger class="ui-stepper__trigger">
        <StepperIndicator class="ui-stepper__dot">
          <Check v-if="index < furthest || complete" aria-hidden="true" /><template v-else>{{ index + 1 }}</template>
        </StepperIndicator>
        <StepperTitle as="span">{{ entry.label }}</StepperTitle>
      </StepperTrigger>
    </StepperItem>
  </StepperRoot>
</template>

<script setup lang="ts">
import { StepperIndicator, StepperItem, StepperRoot, StepperTitle, StepperTrigger } from 'reka-ui';
import { Check } from '@lucide/vue';

defineProps<{
  steps: { key: string; label: string }[];
  /** Étape affichée (index depuis 0). */
  current: number;
  /** Nombre d'étapes déjà atteintes : au-delà, on ne peut pas encore aller. */
  furthest: number;
  /** Parcours terminé : toutes les étapes sont cochées et figées. */
  complete?: boolean;
}>();

const emit = defineEmits<{ select: [index: number] }>();

function onSelect(step: number | undefined): void {
  if (step) emit('select', step - 1);
}
</script>

<style scoped lang="scss">
.ui-stepper { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); margin: 0 0 var(--space-4); padding: 0; }
.ui-stepper__trigger { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: var(--muted); font: inherit; font-size: var(--fs-sm); cursor: pointer; }
.ui-stepper__trigger:disabled { cursor: default; }
.ui-stepper__trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-xs); }
.is-current .ui-stepper__trigger { color: var(--text); font-weight: 700; }
.ui-stepper__dot { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 50%; font-size: var(--fs-xs); }
.ui-stepper__dot svg { width: 13px; height: 13px; }
.is-current .ui-stepper__dot { border-color: transparent; background: var(--accent); color: var(--on-accent); }
.is-done .ui-stepper__dot { border-color: transparent; background: color-mix(in srgb, var(--green) 18%, var(--surface)); color: var(--green-text, var(--green)); }
</style>
