<template>
  <div v-if="hasMore" class="load-more">
    <UiButton :loading="loading" @click="$emit('load')">
      {{ loading ? loadingLabel : label }}
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import UiButton from './UiButton.vue';

withDefaults(
  defineProps<{
    hasMore?: boolean;
    loading?: boolean;
    label?: string;
    loadingLabel?: string;
  }>(),
  {
    hasMore: false,
    loading: false,
    label: 'Charger plus',
    loadingLabel: 'Chargement…',
  }
);

defineEmits<{
  (e: 'load'): void;
}>();
</script>
