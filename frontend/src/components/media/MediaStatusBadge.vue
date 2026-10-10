<template>
  <span v-if="status" class="status-badge discover-status-badge" :class="status.variant">
    {{ status.label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { mediaAvailabilityBadge, type AvailabilityLike } from '@/utils/mediaAvailability';

const props = defineProps<{ item: AvailabilityLike }>();
const status = computed(() => mediaAvailabilityBadge(props.item));
</script>

<style scoped lang="scss">
.status-badge {
  display: inline-flex;
  align-items: center;
  max-width: calc(100% - 14px);
  min-height: var(--poster-badge-min-height);
  padding: 4px 10px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  box-shadow: 0 1px 5px rgba(0, 0, 0, .55);
  color: var(--on-lang);
  background: color-mix(in srgb, var(--poster-neutral) 94%, transparent);
  font-size: var(--poster-badge-font-size);
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  text-shadow: 0 1px 1px rgba(0, 0, 0, .55);
  white-space: nowrap;
}
.in-plex { background: color-mix(in srgb, var(--lang-vf) 96%, transparent); }
.partial { color: var(--on-lang-mixed); background: var(--lang-mixed); text-shadow: none; }
.downloading { background: rgba(3, 105, 161, .96); }
.sent { color: var(--on-lang-mixed); background: var(--lang-mixed); text-shadow: none; }
.requested { background: rgba(63, 63, 70, .96); }
.error { background: color-mix(in srgb, var(--lang-vo) 96%, transparent); }
</style>
