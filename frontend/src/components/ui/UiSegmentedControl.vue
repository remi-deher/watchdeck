<template>
  <!-- Un choix exclusif entre quelques valeurs (periode, vue, mode, theme), sur le
       ToggleGroup de Reka UI. Ce n'etait pas des onglets : les `Tabs` utilises jusque-la
       annoncaient « onglet 2 sur 4 » et promettaient un panneau qui n'existe pas. Un
       groupe de boutons bascules annonce le bouton et son etat (enfonce ou non), garde un
       seul arret de tabulation et se parcourt aux fleches. Pour des sections de page,
       voir AppSubnav. -->
  <ToggleGroupRoot
    class="ui-segmented-list"
    type="single"
    :model-value="String(modelValue)"
    :aria-label="ariaLabel"
    :loop="true"
    @update:model-value="choisir"
  >
    <ToggleGroupItem
      v-for="option in options"
      :key="String(option.value)"
      class="ui-segmented-item"
      :value="String(option.value)"
      :disabled="option.disabled"
      :aria-label="option.ariaLabel"
    >
      <span>{{ option.label }}</span><small v-if="option.count != null">{{ option.count }}</small>
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>
<script setup lang="ts" generic="T extends string | number">
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui';
export interface UiSegmentedOption<T extends string | number> { value: T; label: string; count?: number; disabled?: boolean; ariaLabel?: string }
const props = defineProps<{ modelValue: T; options: UiSegmentedOption<T>[]; ariaLabel: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();
/* Les valeurs passent en chaine (Reka compare des chaines) et reprennent ici leur type.
   Rappuyer sur la valeur choisie la deselectionnerait (Reka renvoie une valeur vide) :
   un choix exclusif en a toujours une, on l'ignore. */
function choisir(cle: unknown): void {
  if (cle === undefined || cle === null || cle === '') return;
  const option = props.options.find((o) => String(o.value) === String(cle));
  if (option && option.value !== props.modelValue) emit('update:modelValue', option.value);
}
</script>
<style scoped lang="scss">
.ui-segmented-list{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-sunken,var(--surface))}
.ui-segmented-item{display:inline-flex;align-items:center;gap:var(--space-2);min-height:32px;padding:0 12px;border:0;border-radius:calc(var(--radius-md) - 3px);background:transparent;color:var(--muted);font:inherit;font-size:var(--fs-sm);font-weight:600;white-space:nowrap;cursor:pointer;transition:background-color var(--motion-duration-instant) var(--motion-ease-standard),color var(--motion-duration-instant) var(--motion-ease-standard)}
.ui-segmented-item:hover{color:var(--text)}
.ui-segmented-item[data-state="on"]{background:var(--surface-3);color:var(--text);box-shadow:0 1px 2px rgb(var(--shadow-color) / calc(0.25 * var(--shadow-scale)))}
.ui-segmented-item:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.ui-segmented-item[data-disabled]{opacity:.45;cursor:not-allowed}
small{min-width:18px;padding:2px 5px;border-radius: var(--radius-pill);background:var(--surface-1,var(--surface-2));color:inherit;font-size:var(--fs-xs);line-height:1.2}
</style>
