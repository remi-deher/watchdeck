<template>
  <SelectButton ref="control" class="ui-segmented-control" role="tablist" :model-value="modelValue" :options="options" option-label="label"
    option-value="value" option-disabled="disabled" :aria-label="ariaLabel" @update:model-value="emit('update:modelValue', $event)">
    <template #option="{ option }"><span>{{ option.label }}</span><small v-if="option.count != null">{{ option.count }}</small></template>
  </SelectButton>
</template>
<script setup lang="ts" generic="T extends string | number">
import { nextTick, onMounted, ref, watch } from 'vue';
import SelectButton from 'primevue/selectbutton';
export interface UiSegmentedOption<T extends string | number> { value: T; label: string; count?: number; disabled?: boolean }
const props = defineProps<{ modelValue: T; options: UiSegmentedOption<T>[]; ariaLabel: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();
const control = ref<{ $el: HTMLElement } | null>(null);
function syncTabSemantics(): void {
  for (const button of control.value?.$el?.querySelectorAll('button') ?? []) {
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(button.getAttribute('aria-pressed') === 'true'));
  }
}
onMounted(syncTabSemantics);
watch(() => props.modelValue, () => nextTick(syncTabSemantics));
</script>
<style scoped lang="scss">
.ui-segmented-control :deep(.p-togglebutton-content){gap:var(--space-2)}small{min-width:18px;padding:2px 5px;border-radius:999px;background:var(--surface-1);color:inherit;font-size:var(--fs-xs);line-height:1.2}
</style>
