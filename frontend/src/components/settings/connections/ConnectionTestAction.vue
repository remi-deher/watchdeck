<template>
  <UiButton size="sm" :loading="loading" :disabled="disabled" @click.stop="$emit('test')">
    <template #icon><slot name="icon"><PlugZap /></slot></template>
    {{ loading ? loadingLabel : label }}
  </UiButton>
</template>

<script setup lang="ts">
import { PlugZap } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';

withDefaults(defineProps<{
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  loadingLabel?: string;
}>(), {
  loading: false,
  disabled: false,
  label: 'Tester',
  loadingLabel: 'Test en cours…',
});

defineEmits<{ test: [] }>();
</script>
