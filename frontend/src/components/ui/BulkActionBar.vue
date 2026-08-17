<template>
  <aside v-if="count > 0" class="bulk-bar" role="toolbar" :aria-label="ariaLabel">
    <strong class="bulk-action-count">{{ count }} {{ count === 1 ? singular : plural }}</strong>
    <slot />
    <UiButton
      variant="ghost"
      size="sm"
      icon-only
      :title="clearLabel"
      :aria-label="clearLabel"
      @click="$emit('clear')"
    >
      <X />
    </UiButton>
  </aside>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue';
import UiButton from './UiButton.vue';

withDefaults(defineProps<{
  count: number;
  singular?: string;
  plural?: string;
  ariaLabel?: string;
  clearLabel?: string;
}>(), {
  singular: 'élément sélectionné',
  plural: 'éléments sélectionnés',
  ariaLabel: 'Actions groupées',
  clearLabel: 'Désélectionner',
});

defineEmits<{ clear: [] }>();
</script>

<style scoped lang="scss">
.bulk-bar { overflow-x: auto; padding-bottom: max(8px, env(safe-area-inset-bottom)); }
.bulk-action-count { flex: 0 0 auto; }
</style>
