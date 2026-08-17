<template>
  <label v-if="useMobileSelect" class="adaptive-tabs-select">
    <span>{{ ariaLabel }}</span>
    <select :value="modelValue" :aria-label="ariaLabel" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
      <option v-for="tab in tabs" :key="tab.value" :value="tab.value">{{ optionLabel(tab) }}</option>
    </select>
  </label>
  <nav ref="navRef" class="detail-tabs" :class="{ 'has-mobile-select': useMobileSelect }" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.value"
      :tabindex="modelValue === tab.value ? 0 : -1"
      :class="{ active: modelValue === tab.value }"
      @click="$emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
      <span v-if="tab.count" class="tab-badge" :class="tab.badgeClass">{{ tab.count }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

export interface TabItem {
  value: string;
  label: string;
  count?: number | string;
  badgeClass?: string;
}

const props = withDefaults(
  defineProps<{
    tabs: TabItem[];
    modelValue: string;
    ariaLabel?: string;
    mobileSelectThreshold?: number;
  }>(),
  {
    ariaLabel: 'Onglets',
    mobileSelectThreshold: 3,
  }
);

defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const navRef = ref<HTMLElement | null>(null);
const useMobileSelect = computed(() => props.tabs.length >= props.mobileSelectThreshold);

function optionLabel(tab: TabItem): string {
  return tab.count ? `${tab.label} (${tab.count})` : tab.label;
}

watch(
  () => props.modelValue,
  async () => {
    await nextTick();
    navRef.value
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
);
</script>

<style scoped lang="scss">
.adaptive-tabs-select { display: none; }
@media (max-width: 767.98px) {
  .detail-tabs.has-mobile-select { display: none; }
  .adaptive-tabs-select { display: grid; gap: 5px; width: 100%; margin: 12px 0; }
  .adaptive-tabs-select > span { color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
  .adaptive-tabs-select select { width: 100%; min-width: 0; min-height: 44px; padding: 0 38px 0 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background-color: var(--surface-2); color: var(--text); font: inherit; font-weight: 650; }
}
</style>
