<template>
  <label class="ui-switch" :class="{ 'is-on': modelValue }" :title="title">
    <span v-if="label" class="ui-switch-label">{{ label }}</span>
    <PvToggleSwitch :model-value="modelValue" :disabled="disabled" :aria-label="label || title || undefined"
      @update:model-value="$emit('update:modelValue', $event)" />
  </label>
</template>

<script setup lang="ts">
import PvToggleSwitch from 'primevue/toggleswitch';
withDefaults(
  defineProps<{
    modelValue?: boolean;
    label?: string;
    title?: string;
    disabled?: boolean;
  }>(),
  {
    modelValue: false,
    label: '',
    title: '',
    disabled: false,
  }
);

defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();
</script>

<style scoped lang="scss">
.ui-switch { position: relative; display: inline-flex; align-items: center; gap: .5rem; cursor: pointer; }
.ui-switch-label { color: var(--text); font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; }
.ui-switch :deep(.p-toggleswitch) { flex:none; }
.ui-switch :deep(.p-toggleswitch-slider) { position:absolute; inset:0; }
</style>
