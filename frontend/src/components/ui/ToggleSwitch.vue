<template>
  <label class="ui-switch" :class="{ 'is-on': modelValue }" :title="title">
    <span v-if="label" class="ui-switch-label">{{ label }}</span>
    <input
      type="checkbox"
      role="switch"
      :checked="modelValue"
      :disabled="disabled"
      :aria-checked="modelValue"
      :aria-label="label || title || undefined"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    >
    <span class="ui-switch-track"><span class="ui-switch-thumb" /></span>
  </label>
</template>

<script setup lang="ts">
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
.ui-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.ui-switch-track { display: flex; align-items: center; width: 42px; height: 23px; padding: 3px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface-2); transition: background .2s ease, border-color .2s ease; }
.ui-switch-thumb { width: 15px; height: 15px; border-radius: 50%; background: var(--muted); box-shadow: 0 1px 3px rgba(0, 0, 0, .35); transition: transform .2s ease, background .2s ease; }
.ui-switch input:checked + .ui-switch-track { border-color: rgba(229, 160, 13, .65); background: rgba(229, 160, 13, .24); }
.ui-switch input:checked + .ui-switch-track .ui-switch-thumb { transform: translateX(17px); }
.ui-switch input:focus-visible + .ui-switch-track { outline: 2px solid var(--accent); outline-offset: 3px; }
.ui-switch input:disabled + .ui-switch-track { cursor: wait; opacity: .6; }
</style>
