<template>
  <section class="panel panel-card" :class="panelClass" :aria-busy="loading || undefined">
    <UiSectionHeader v-if="title || eyebrow || $slots.head || $slots.action" :title="title" :eyebrow="eyebrow" :description="description">
      <slot name="head" />
      <template v-if="$slots.action" #actions><slot name="action" /></template>
    </UiSectionHeader>
    <UiFeedback v-if="loading" type="loading" :message="loadingMessage" />
    <UiFeedback v-else-if="error" type="error" :message="error" :retry="retry" @retry="$emit('retry')" />
    <template v-else>
      <slot />
      <UiEmptyState v-if="empty" :title="emptyTitle" :message="empty" compact />
    </template>
  </section>
</template>

<script setup lang="ts">
import UiEmptyState from './UiEmptyState.vue';
import UiFeedback from './UiFeedback.vue';
import UiSectionHeader from './UiSectionHeader.vue';

withDefaults(
  defineProps<{
    title?: string;
    eyebrow?: string;
    description?: string;
    empty?: string;
    emptyTitle?: string;
    loading?: boolean;
    loadingMessage?: string;
    error?: string;
    retry?: boolean;
    panelClass?: string;
  }>(),
  {
    title: '',
    eyebrow: '',
    description: '',
    empty: '',
    emptyTitle: '',
    loading: false,
    loadingMessage: 'Chargement…',
    error: '',
    retry: false,
    panelClass: '',
  }
);

defineEmits<{
  (e: 'retry'): void;
}>();
</script>

<style scoped lang="scss">
.panel-card {
  container-type: inline-size;
  min-width: 0;
}
</style>
