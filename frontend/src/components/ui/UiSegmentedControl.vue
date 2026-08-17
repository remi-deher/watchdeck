<template>
  <div class="ui-segmented-control" role="tablist" :aria-label="ariaLabel">
    <button v-for="option in options" :key="option.value" type="button" role="tab"
      :class="{ active: option.value === modelValue }" :aria-selected="option.value === modelValue"
      :disabled="option.disabled" @click="emit('update:modelValue', option.value)">
      <span>{{ option.label }}</span><small v-if="option.count != null">{{ option.count }}</small>
    </button>
  </div>
</template>
<script setup lang="ts" generic="T extends string | number">
export interface UiSegmentedOption<T extends string | number> { value: T; label: string; count?: number; disabled?: boolean }
defineProps<{ modelValue: T; options: UiSegmentedOption<T>[]; ariaLabel: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();
</script>
<style scoped lang="scss">
.ui-segmented-control{display:inline-flex;align-items:center;gap:3px;padding:3px;border:1px solid var(--border);border-radius:var(--btn-radius);background:var(--surface-2)}button{display:inline-flex;align-items:center;justify-content:center;gap:var(--space-2);min-height:32px;padding:0 11px;border:0;border-radius:calc(var(--btn-radius) - 3px);background:transparent;color:var(--muted);font:inherit;font-size:var(--fs-xs);font-weight:700;cursor:pointer}button:hover:not(:disabled),button.active{background:var(--surface-3);color:var(--text)}button.active{box-shadow:0 1px 3px rgba(0,0,0,.2)}button:disabled{cursor:not-allowed;opacity:.45}small{min-width:18px;padding:2px 5px;border-radius:999px;background:var(--surface-1);color:inherit;font-size:10px;line-height:1.2}
</style>
