<template>
  <div class="page" :class="[pageClass, { 'page-sticky-header': sticky, 'page-motion': motion }]">
    <PageHeader :title="title" :description="description" :eyebrow="eyebrow" :breadcrumbs="breadcrumbs">
      <template v-if="$slots.status" #status><slot name="status" /></template>
      <template v-if="$slots.meta" #meta><slot name="meta" /></template>
      <slot name="actions" />
    </PageHeader>

    <UiFeedback
      v-if="error"
      type="error"
      :title="errorTitle"
      :message="error"
      :retry="retry"
      @retry="$emit('retry')"
    />
    <UiFeedback
      v-if="success"
      type="success"
      :message="success"
      dismissible
      @dismiss="$emit('dismiss-success')"
    />
    <UiFeedback v-if="loading" type="loading" :message="loadingMessage" />
    <slot name="feedback" />

    <slot />
  </div>
</template>

<script setup lang="ts">
import PageHeader, { type BreadcrumbItem } from './PageHeader.vue';
import UiFeedback from './UiFeedback.vue';

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    eyebrow?: string;
    breadcrumbs?: BreadcrumbItem[];
    pageClass?: string;
    sticky?: boolean;
    motion?: boolean;
    error?: string;
    errorTitle?: string;
    retry?: boolean;
    loading?: boolean;
    loadingMessage?: string;
    success?: string;
  }>(),
  {
    description: '',
    eyebrow: '',
    breadcrumbs: () => [],
    pageClass: '',
    sticky: false,
    motion: true,
    error: '',
    errorTitle: '',
    retry: false,
    loading: false,
    loadingMessage: 'Chargement…',
    success: '',
  }
);

defineEmits<{
  (e: 'retry'): void;
  (e: 'dismiss-success'): void;
}>();
</script>

<style scoped lang="scss">
.page-sticky-header :deep(.ui-page-header) {
  position: sticky;
  top: var(--safe-top);
  z-index: 20;
  padding: 10px 0;
  background: color-mix(in srgb, #09090b 94%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
</style>
