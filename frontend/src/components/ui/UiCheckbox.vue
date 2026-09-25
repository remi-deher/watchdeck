<template>
  <!-- Case a cocher seule, sur le Checkbox de Reka UI : pour les selections de lignes et
       les cellules de tableau, ou le nom vient d'un `aria-label` ou d'un <label for>.
       Avec un libelle visible, preferer UiCheckboxField. -->
  <CheckboxRoot
    :id="id || undefined"
    class="ui-checkbox"
    :model-value="modelValue"
    :disabled="disabled"
    @update:model-value="(v) => emit('update:modelValue', v === 'indeterminate' ? false : v === true)"
    @click.stop
  >
    <CheckboxIndicator class="ui-checkbox-indicator">
      <Minus v-if="modelValue === 'indeterminate'" :size="13" aria-hidden="true" />
      <Check v-else :size="13" aria-hidden="true" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>

<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui';
import { Check, Minus } from '@lucide/vue';

withDefaults(defineProps<{
  /** `indeterminate` : une partie seulement est cochee (« tout selectionner »). */
  modelValue: boolean | 'indeterminate';
  disabled?: boolean;
  id?: string;
}>(), { disabled: false, id: '' });

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<style scoped>
.ui-checkbox{display:inline-grid;flex:none;place-items:center;width:18px;height:18px;min-height:0;padding:0;border:1.5px solid color-mix(in srgb,var(--text) 55%,transparent);border-radius:var(--radius-xs);background:var(--surface-2);color:#0b0b0e;cursor:pointer;transition:background-color var(--motion-duration-instant) var(--motion-ease-standard),border-color var(--motion-duration-instant) var(--motion-ease-standard)}
.ui-checkbox[data-state="checked"],.ui-checkbox[data-state="indeterminate"]{border-color:var(--accent);background:var(--accent)}
.ui-checkbox:hover:not(:disabled):not([data-state="checked"]){border-color:var(--text)}
.ui-checkbox:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ui-checkbox:disabled{cursor:not-allowed;opacity:.55}
.ui-checkbox-indicator{display:grid;place-items:center;color:inherit}
.ui-checkbox-indicator :deep(svg){color:#0b0b0e;stroke-width:3.5}
/* Au doigt, la zone d'appui depasse la case sans l'agrandir a l'oeil. */
@media (pointer:coarse){.ui-checkbox{position:relative}.ui-checkbox::after{content:"";position:absolute;inset:-13px}}
</style>
