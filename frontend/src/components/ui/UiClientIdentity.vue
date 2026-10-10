<template>
  <span class="ui-client-identity" :aria-label="showLabel ? undefined : label">
    <component :is="icon" aria-hidden="true" /><span v-if="showLabel">{{ label }}</span>
  </span>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { plexClientIcon, plexClientName, type PlexClientRef } from '@/utils/plexClient';
const props = withDefaults(defineProps<{ client: PlexClientRef; showLabel?: boolean }>(), { showLabel: true });
const label = computed(() => plexClientName(props.client));
const icon = computed(() => plexClientIcon(props.client));
</script>
<style scoped>
.ui-client-identity { display: inline-flex; align-items: center; gap: var(--space-2); min-width: 0; }
.ui-client-identity svg { flex: none; width: 1em; height: 1em; }
.ui-client-identity > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
