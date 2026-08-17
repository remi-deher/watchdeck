<template>
  <div class="filter-group">
    <button class="filter-group-header" type="button" :aria-expanded="open" :aria-controls="bodyId" @click="open = !open">
      <span class="group-label">{{ label }}</span>
      <ChevronDown class="filter-group-chevron" :class="{ collapsed: !open }" />
    </button>
    <div v-show="open" :id="bodyId" class="filter-group-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue';
import { ChevronDown } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    label: string;
    defaultOpen?: boolean;
  }>(),
  {
    defaultOpen: true,
  }
);

const open = ref(props.defaultOpen);
const bodyId = `filter-group-${useId()}`;
</script>

<style scoped lang="scss">
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.filter-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: none;
  padding: 2px 0 6px;
  cursor: pointer;
  width: 100%;
}
.filter-group-header:hover .filter-group-chevron {
  color: var(--accent);
}
.filter-group-chevron {
  width: 14px;
  height: 14px;
  color: var(--text-muted, #888);
  transition: transform 0.2s ease, color 0.15s;
  flex-shrink: 0;
}
.filter-group-chevron.collapsed {
  transform: rotate(-90deg);
}
.filter-group-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
