<template>
  <!-- Champ numerique Reka UI : boutons − et + (utiles au doigt, ou le clavier numerique
       d'iOS n'a pas de signe moins), bornes et pas respectes, fleches haut/bas, format
       francais (virgule decimale). Un champ vide vaut `null` : « aucune limite ». -->
  <NumberFieldRoot
    class="ui-number-field"
    :model-value="modelValue ?? undefined"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :format-options="formatOptions"
    locale="fr-FR"
    :disable-wheel-change="true"
    @update:model-value="(v) => emit('update:modelValue', v === undefined || Number.isNaN(v) ? null : v)"
  >
    <!-- Le champ vient en premier dans le document : un <label> active le premier element
         interactif qu'il contient, et ce ne doit pas etre le bouton « − ». La grille remet
         ce bouton a gauche a l'ecran. -->
    <NumberFieldInput :id="id || undefined" class="ui-number-field__input" :placeholder="placeholder" :aria-label="ariaLabel || undefined" />
    <NumberFieldDecrement class="ui-number-field__step ui-number-field__minus" aria-label="Diminuer"><Minus :size="14" aria-hidden="true" /></NumberFieldDecrement>
    <NumberFieldIncrement class="ui-number-field__step" aria-label="Augmenter"><Plus :size="14" aria-hidden="true" /></NumberFieldIncrement>
  </NumberFieldRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NumberFieldDecrement, NumberFieldIncrement, NumberFieldInput, NumberFieldRoot } from 'reka-ui';
import { Minus, Plus } from '@lucide/vue';

const props = withDefaults(defineProps<{
  modelValue?: number | null;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
}>(), { modelValue: null, min: undefined, max: undefined, step: 1, disabled: false, placeholder: '', ariaLabel: '', id: '' });

const emit = defineEmits<{ (e: 'update:modelValue', value: number | null): void }>();

// Autant de decimales que le pas en demande : 0,1 Go garde sa decimale, un port n'en a pas.
const formatOptions = computed(() => {
  const decimals = String(props.step).includes('.') ? String(props.step).split('.')[1].length : 0;
  return { maximumFractionDigits: decimals, useGrouping: false };
});
</script>

<style scoped lang="scss">
.ui-number-field {
  display: inline-grid;
  grid-template-columns: 36px minmax(56px, 1fr) 36px;
  grid-template-areas: "moins valeur plus";
  align-items: stretch;
  max-width: 220px;
  border: 1px solid var(--border);
  border-radius: var(--btn-radius);
  background: var(--surface-2);
  overflow: hidden;
}
.ui-number-field:focus-within { border-color: var(--accent); }
.ui-number-field[data-disabled] { opacity: .55; }
.ui-number-field__input {
  grid-area: valeur;
  min-width: 0;
  min-height: 38px;
  padding: 0 6px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.ui-number-field__input:focus { outline: none; box-shadow: none; }
.ui-number-field__step {
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.ui-number-field__minus { grid-area: moins; }
.ui-number-field__step:not(.ui-number-field__minus) { grid-area: plus; }
.ui-number-field__step:hover:not(:disabled) { background: var(--surface-3); color: var(--text); }
.ui-number-field__step:disabled { opacity: .35; cursor: not-allowed; }
</style>
