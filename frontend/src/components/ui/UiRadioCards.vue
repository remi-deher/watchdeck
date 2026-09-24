<template>
  <!-- Choix exclusif presente en cartes (titre + explication), sur le RadioGroup de Reka
       UI : fleches pour passer d'une carte a l'autre, etat annonce, un seul arret de
       tabulation pour tout le groupe. -->
  <RadioGroupRoot
    class="ui-radio-cards"
    :model-value="cleCourante"
    :disabled="disabled"
    :aria-label="label"
    @update:model-value="(k) => emit('update:modelValue', valeurDe(k))"
  >
    <RadioGroupItem
      v-for="(option, index) in options"
      :key="cle(index)"
      :value="cle(index)"
      :disabled="option.disabled"
      class="ui-radio-card"
    >
      <span class="ui-radio-card__dot" aria-hidden="true"><RadioGroupIndicator class="ui-radio-card__fill" /></span>
      <span class="ui-radio-card__copy">
        <strong>{{ option.label }}</strong>
        <small v-if="option.description">{{ option.description }}</small>
      </span>
    </RadioGroupItem>
  </RadioGroupRoot>
</template>

<script setup lang="ts" generic="V extends string | number">
import { computed } from 'vue';
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from 'reka-ui';

export interface UiRadioCardOption<Value = string> {
  value: Value;
  label: string;
  description?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<{
  modelValue: V;
  options: UiRadioCardOption<V>[];
  /** Nom accessible du groupe. */
  label: string;
  disabled?: boolean;
}>(), { disabled: false });

const emit = defineEmits<{ (e: 'update:modelValue', value: V): void }>();

// Cles internes : Reka confond la chaine vide avec « rien de choisi ».
const cle = (index: number) => `o${index}`;
const valeurDe = (k: unknown) => props.options[Number(String(k).slice(1))]?.value as V;
const cleCourante = computed(() => {
  const i = props.options.findIndex((option) => option.value === props.modelValue);
  return i >= 0 ? cle(i) : undefined;
});
</script>

<style scoped>
.ui-radio-cards{display:grid;gap:var(--space-2)}
.ui-radio-card{display:grid;grid-template-columns:18px minmax(0,1fr);align-items:start;gap:var(--space-3);width:100%;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2);color:var(--text);font:inherit;text-align:left;cursor:pointer;transition:border-color var(--motion-duration-fast) var(--motion-ease-standard),background-color var(--motion-duration-fast) var(--motion-ease-standard)}
.ui-radio-card:hover:not([data-disabled]){border-color:color-mix(in srgb,var(--accent) 45%,var(--border))}
.ui-radio-card[data-state="checked"]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,var(--surface-2))}
.ui-radio-card[data-disabled]{opacity:.55;cursor:not-allowed}
.ui-radio-card:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ui-radio-card__dot{display:grid;place-items:center;width:18px;height:18px;margin-top:1px;border:1.5px solid color-mix(in srgb,var(--text) 30%,transparent);border-radius:50%}
.ui-radio-card[data-state="checked"] .ui-radio-card__dot{border-color:var(--accent)}
.ui-radio-card__fill{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.ui-radio-card__copy{display:grid;gap:3px;min-width:0}
.ui-radio-card__copy strong{font-size:var(--fs-sm)}
.ui-radio-card__copy small{color:var(--muted);font-size:var(--fs-xs);line-height:1.45}
</style>
