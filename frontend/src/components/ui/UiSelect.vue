<template>
  <!-- Liste deroulante, sur le Select de Reka UI : meme apparence partout (la liste native
       changeait d'un navigateur et d'un systeme a l'autre), clavier complet, placement
       dans l'ecran. Pour une longue liste a filtrer, preferer UiCombobox. -->
  <SelectRoot
    :model-value="cleCourante"
    :disabled="disabled"
    @update:model-value="choisir"
  >
    <SelectTrigger :id="id || undefined" class="ui-select-trigger" :class="$attrs.class" :aria-label="ariaLabel || undefined">
      <SelectValue class="ui-select-value" :placeholder="placeholder" />
      <ChevronDown class="ui-select-chevron" aria-hidden="true" />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent class="ui-select-content" position="popper" :side-offset="6">
        <SelectViewport class="ui-select-viewport">
          <SelectGroup v-for="section in sections" :key="section.key">
            <SelectLabel v-if="section.label" class="ui-select-group-label">{{ section.label }}</SelectLabel>
            <SelectItem
              v-for="{ option, index } in section.items"
              :key="cle(index)"
              :value="cle(index)"
              :disabled="option.disabled"
              class="ui-select-item"
            >
              <SelectItemIndicator class="ui-select-check"><Check aria-hidden="true" /></SelectItemIndicator>
              <SelectItemText>{{ option.label }}</SelectItemText>
            </SelectItem>
          </SelectGroup>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  SelectContent, SelectGroup, SelectItem, SelectItemIndicator, SelectItemText, SelectLabel, SelectPortal, SelectRoot,
  SelectTrigger, SelectValue, SelectViewport,
} from 'reka-ui';
import { Check, ChevronDown } from '@lucide/vue';

export interface UiSelectOption {
  value: unknown;
  label: string;
  disabled?: boolean;
  /** Intitule de groupe : les options consecutives du meme groupe sont reunies. */
  group?: string;
}

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  modelValue?: unknown;
  options: UiSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}>(), { modelValue: undefined, placeholder: 'Choisir…', disabled: false, id: '', ariaLabel: '' });

const emit = defineEmits<{ (e: 'update:modelValue', value: any): void }>();

/* Cles internes : Reka refuse la chaine vide comme valeur d'option, et plusieurs listes
   s'en servent pour « Aucun » ou « Tous ». Les valeurs d'origine -- nombres compris --
   reviennent telles quelles au parent. La comparaison passe par le texte : `3` et `"3"`
   designent la meme option, comme dans une liste native. */
const cle = (index: number) => `o${index}`;
const cleCourante = computed(() => {
  const i = props.options.findIndex((option) => String(option.value ?? '') === String(props.modelValue ?? ''));
  return i >= 0 ? cle(i) : undefined;
});

const sections = computed(() => {
  const out: { key: string; label: string; items: { option: UiSelectOption; index: number }[] }[] = [];
  props.options.forEach((option, index) => {
    const label = option.group || '';
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push({ option, index });
    else out.push({ key: `g${out.length}`, label, items: [{ option, index }] });
  });
  return out;
});

function choisir(k: unknown): void {
  const option = props.options[Number(String(k).slice(1))];
  if (option) emit('update:modelValue', option.value);
}
</script>

<style scoped>
.ui-select-trigger{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:38px;padding:0 10px 0 12px;border:1px solid var(--border);border-radius:var(--btn-radius);background:var(--surface-2);color:var(--text);font:inherit;font-size:var(--fs-sm);text-align:left;cursor:pointer}
.ui-select-trigger:hover:not(:disabled){border-color:color-mix(in srgb,var(--border) 65%,white)}
.ui-select-trigger:focus-visible,.ui-select-trigger[data-state="open"]{outline:none;border-color:var(--accent)}
.ui-select-trigger:disabled{opacity:.55;cursor:not-allowed}
.ui-select-value{overflow:hidden;min-width:0;text-overflow:ellipsis;white-space:nowrap}
.ui-select-trigger[data-placeholder] .ui-select-value{color:var(--muted)}
.ui-select-chevron{flex:none;width:15px;height:15px;color:var(--muted);transition:transform var(--motion-duration-fast) var(--motion-ease-standard)}
.ui-select-trigger[data-state="open"] .ui-select-chevron{transform:rotate(180deg)}
@media (pointer:coarse){.ui-select-trigger{min-height:44px}}
</style>

<!-- Le contenu est teleporte dans <body> : ses styles ne peuvent pas etre scoped. -->
<style>
.ui-select-content{z-index:var(--z-popover);min-width:var(--reka-select-trigger-width);max-height:min(360px,var(--reka-select-content-available-height));overflow:hidden;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);box-shadow:var(--shadow-lg, 0 12px 32px rgb(var(--shadow-color) / calc(0.35 * var(--shadow-scale))))}
.ui-select-viewport{padding:4px}
.ui-select-item{position:relative;display:flex;align-items:center;min-height:34px;padding:4px 10px 4px 28px;border-radius:var(--radius-sm);color:var(--text);font-size:var(--fs-sm);cursor:pointer;user-select:none;outline:none}
.ui-select-item[data-highlighted]{background:var(--surface-3)}
.ui-select-item[data-disabled]{opacity:.5;cursor:not-allowed}
.ui-select-check{position:absolute;left:8px;display:grid;place-items:center;color:var(--accent)}
.ui-select-check svg{width:14px;height:14px}
.ui-select-group-label{padding:8px 10px 4px;color:var(--muted);font-size:var(--fs-xs);font-weight:700;text-transform:uppercase;letter-spacing:.04em}
@media (pointer:coarse){.ui-select-item{min-height:44px}}
</style>
