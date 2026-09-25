<template>
  <!-- Une rangee d'onglets sans panneaux : Reka UI donne `role="tablist"`/`tab`,
       `aria-selected` et la navigation aux fleches, que le SelectButton de PrimeVue
       obligeait a recoller a la main apres chaque rendu. -->
  <TabsRoot class="ui-segmented-control" :model-value="modelValue" activation-mode="manual" @update:model-value="choisir">
    <TabsList class="ui-segmented-list" :aria-label="ariaLabel">
      <TabsTrigger v-for="option in options" :key="String(option.value)" class="ui-segmented-item" :value="option.value" :disabled="option.disabled">
        <span>{{ option.label }}</span><small v-if="option.count != null">{{ option.count }}</small>
      </TabsTrigger>
    </TabsList>
  </TabsRoot>
</template>
<script setup lang="ts" generic="T extends string | number">
import { TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
export interface UiSegmentedOption<T extends string | number> { value: T; label: string; count?: number; disabled?: boolean }
const props = defineProps<{ modelValue: T; options: UiSegmentedOption<T>[]; ariaLabel: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();
function choisir(value: string | number): void {
  if (value !== props.modelValue) emit('update:modelValue', value as T);
}
</script>
<style scoped lang="scss">
.ui-segmented-list{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-sunken,var(--surface))}
.ui-segmented-item{display:inline-flex;align-items:center;gap:var(--space-2);min-height:32px;padding:0 12px;border:0;border-radius:calc(var(--radius-md) - 3px);background:transparent;color:var(--muted);font:inherit;font-size:var(--fs-sm);font-weight:600;white-space:nowrap;cursor:pointer;transition:background-color var(--motion-duration-instant) var(--motion-ease-standard),color var(--motion-duration-instant) var(--motion-ease-standard)}
.ui-segmented-item:hover{color:var(--text)}
.ui-segmented-item[data-state="active"]{background:var(--surface-3);color:var(--text);box-shadow:0 1px 2px rgb(var(--shadow-color) / calc(0.25 * var(--shadow-scale)))}
.ui-segmented-item:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.ui-segmented-item[data-disabled]{opacity:.45;cursor:not-allowed}
small{min-width:18px;padding:2px 5px;border-radius: var(--radius-pill);background:var(--surface-1,var(--surface-2));color:inherit;font-size:var(--fs-xs);line-height:1.2}
</style>
