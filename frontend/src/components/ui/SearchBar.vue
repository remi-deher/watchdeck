<template>
  <div class="search-bar">
    <Search aria-hidden="true" class="search-icon" />
    <input
      :value="modelValue"
      type="search"
      v-bind="$attrs"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value); $emit('search', $event)"
    >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { Search } from '@lucide/vue';

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    modelValue?: string;
  }>(),
  {
    modelValue: '',
  }
);

defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'search', event: Event): void;
}>();
</script>

<style scoped lang="scss">
.search-bar { display: flex; align-items: center; gap: var(--space-2); min-height: 36px; }
.search-icon { flex: none; width: 17px; color: var(--muted); }
.search-bar input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: var(--fs-sm);
  outline: 0;
}
</style>
