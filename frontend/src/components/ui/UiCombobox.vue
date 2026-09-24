<template>
  <!-- Liste de choix avec recherche, sur le Combobox de Reka UI : pour les filtres trop
       longs pour des pastilles (utilisateurs, taches, bibliotheques). Clavier, filtrage a
       la frappe et placement dans l'ecran sont pris en charge par Reka. -->
  <ComboboxRoot
    class="ui-combobox"
    :model-value="cleCourante"
    :multiple="multiple"
    :disabled="disabled"
    open-on-click
    reset-search-term-on-blur
    @update:model-value="choisir"
  >
    <ComboboxAnchor class="ui-combobox__anchor">
      <ComboboxInput
        class="ui-combobox__input"
        :aria-label="label"
        :placeholder="resume"
        :display-value="() => ''"
      />
      <button v-if="effacable" type="button" class="ui-combobox__clear" :aria-label="`Effacer : ${label}`" @click="effacer"><X aria-hidden="true" /></button>
      <ComboboxTrigger class="ui-combobox__trigger" :aria-label="`Ouvrir : ${label}`"><ChevronDown aria-hidden="true" /></ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent class="ui-combobox__content" position="popper" :side-offset="6">
        <ComboboxViewport class="ui-combobox__viewport">
          <ComboboxEmpty class="ui-combobox__empty">Aucun résultat</ComboboxEmpty>
          <ComboboxItem
            v-for="(option, index) in options"
            :key="cle(index)"
            :value="cle(index)"
            :text-value="option.label"
            :disabled="option.disabled"
            class="ui-combobox__item"
          >
            <ComboboxItemIndicator class="ui-combobox__check"><Check aria-hidden="true" /></ComboboxItemIndicator>
            <span class="ui-combobox__label">{{ option.label }}</span>
            <span v-if="option.count != null" class="ui-combobox__count">{{ option.count }}</span>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>

<script setup lang="ts" generic="V extends string | number">
import { computed } from 'vue';
import {
  ComboboxAnchor, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxItemIndicator,
  ComboboxPortal, ComboboxRoot, ComboboxTrigger, ComboboxViewport,
} from 'reka-ui';
import { Check, ChevronDown, X } from '@lucide/vue';

export interface UiComboboxOption<Value = string> {
  value: Value;
  label: string;
  count?: number | string | null;
  disabled?: boolean;
}

const props = withDefaults(defineProps<{
  /** Valeur choisie (chaine vide : aucune) ; un tableau en choix multiple. */
  modelValue: V | '' | null | V[];
  options: UiComboboxOption<V>[];
  /** Nom accessible du champ (« Utilisateur », « Tâche »…). */
  label: string;
  multiple?: boolean;
  /** Ce que dit le champ sans choix : « Tous les utilisateurs »… */
  placeholder?: string;
  disabled?: boolean;
}>(), { multiple: false, placeholder: 'Tous', disabled: false });

const emit = defineEmits<{ (e: 'update:modelValue', value: any): void }>();

/* Comme UiChipGroup : chaque option recoit une cle interne, la chaine vide servant
   ailleurs de « Tous » et Reka la confondant avec « rien de choisi ». */
const cle = (index: number) => `o${index}`;
const indexDe = (value: unknown) => props.options.findIndex((option) => option.value === value);
const valeurDe = (k: unknown) => props.options[Number(String(k).slice(1))]?.value;

const choisies = computed(() => {
  if (props.multiple) return ((props.modelValue as V[]) || []).map(indexDe).filter((i) => i >= 0);
  const i = indexDe(props.modelValue);
  return i >= 0 ? [i] : [];
});
const cleCourante = computed(() => props.multiple ? choisies.value.map(cle) : (choisies.value[0] != null ? cle(choisies.value[0]) : undefined));
const effacable = computed(() => choisies.value.length > 0 && !props.disabled);
const resume = computed(() => {
  if (!choisies.value.length) return props.placeholder;
  if (choisies.value.length === 1) return props.options[choisies.value[0]].label;
  return `${choisies.value.length} sélectionnés`;
});

function choisir(next: unknown): void {
  if (props.multiple) emit('update:modelValue', ((next as unknown[]) || []).map(valeurDe));
  else emit('update:modelValue', next == null ? '' : valeurDe(next));
}
function effacer(): void {
  emit('update:modelValue', props.multiple ? [] : '');
}
</script>

<style scoped>
.ui-combobox{width:100%}
.ui-combobox__anchor{display:flex;align-items:center;width:100%;min-height:38px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)}
.ui-combobox__anchor:focus-within{border-color:var(--accent)}
.ui-combobox__input{flex:1;min-width:0;min-height:36px;padding:0 10px;border:0;background:transparent;color:var(--text);font:inherit;font-size:var(--fs-sm)}
.ui-combobox__input:focus{outline:none;box-shadow:none}
.ui-combobox__input::placeholder{color:var(--text)}
.ui-combobox__clear,.ui-combobox__trigger{display:grid;place-items:center;width:30px;min-height:36px;padding:0;border:0;background:transparent;color:var(--muted);cursor:pointer}
.ui-combobox__clear:hover,.ui-combobox__trigger:hover{color:var(--text)}
.ui-combobox__clear svg,.ui-combobox__trigger svg{width:15px;height:15px}
</style>

<!-- Le contenu est teleporte dans <body> : ses styles ne peuvent pas etre scoped. -->
<style>
.ui-combobox__content{z-index:var(--z-popover);width:var(--reka-combobox-trigger-width);max-height:min(320px,var(--reka-combobox-content-available-height));overflow:hidden;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);box-shadow:var(--shadow-lg, 0 12px 32px rgb(0 0 0 / 35%))}
.ui-combobox__viewport{max-height:inherit;padding:4px;overflow-y:auto}
.ui-combobox__item{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:6px;min-height:34px;padding:4px 8px;border-radius:var(--radius-sm);color:var(--text);font-size:var(--fs-sm);cursor:pointer;user-select:none}
.ui-combobox__item[data-highlighted]{background:var(--surface-3)}
.ui-combobox__item[data-disabled]{opacity:.5;cursor:not-allowed}
.ui-combobox__check{grid-column:1;display:grid;place-items:center;color:var(--accent)}
.ui-combobox__check svg{width:14px;height:14px}
.ui-combobox__label{grid-column:2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ui-combobox__count{color:var(--muted);font-size:var(--fs-xs);font-variant-numeric:tabular-nums}
.ui-combobox__empty{padding:10px;color:var(--muted);font-size:var(--fs-sm)}
@media (pointer:coarse){.ui-combobox__item{min-height:44px}.ui-combobox__anchor{min-height:44px}}
</style>
