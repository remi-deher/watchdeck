<template>
  <header class="ui-page-header">
    <div class="ui-page-heading">
      <nav v-if="eyebrow || breadcrumbs.length" class="ui-breadcrumbs" aria-label="Fil d'Ariane">
        <template v-for="(item, index) in breadcrumbs" :key="`${item.label}-${index}`">
          <RouterLink v-if="item.to" :to="item.to">{{ item.label }}</RouterLink>
          <span v-else>{{ item.label }}</span>
          <span v-if="index < breadcrumbs.length - 1" aria-hidden="true">/</span>
        </template>
        <span v-if="eyebrow">{{ eyebrow }}</span>
      </nav>
      <div class="ui-page-title-row">
        <h1>{{ title }}</h1>
        <slot name="status" />
      </div>
      <p v-if="description">{{ description }}</p>
      <slot name="meta" />
    </div>
    <div v-if="$slots.default" class="ui-page-actions"><slot /></div>
  </header>
</template>

<script setup lang="ts">
export interface BreadcrumbItem {
  label: string;
  to?: string | Record<string, any>;
}

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    eyebrow?: string;
    breadcrumbs?: BreadcrumbItem[];
  }>(),
  {
    description: '',
    eyebrow: '',
    breadcrumbs: () => [],
  }
);
</script>
