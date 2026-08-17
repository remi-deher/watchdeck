<template>
  <SubnavBar :items="items" :active="active" aria-label="Sections des notifications" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SubnavBar from '@/components/ui/SubnavBar.vue';
import { notificationSections } from '@/notificationSections';

const props = withDefaults(
  defineProps<{
    active?: string;
    pendingCount?: number | null;
  }>(),
  {
    active: 'history',
    pendingCount: null,
  }
);

const items = computed(() => notificationSections.map((section: any) => (
  section.key === 'pending' && props.pendingCount
    ? { ...section, count: props.pendingCount }
    : section
)));
</script>
