<template>
  <span v-if="status" class="status-badge discover-status-badge" :class="status.variant">
    {{ status.label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  item: any;
}>();

const status = computed(() => {
  const item = props.item;
  if (!item) return null;
  const rawStatus = item.request_status || item.status;
  if (item.in_library || item.library_id || item.available || rawStatus === 'available') {
    return { label: 'Dans Plex', variant: 'in-plex' };
  }
  if (rawStatus === 'partially_available') {
    return { label: 'Partiellement disponible', variant: 'partial' };
  }
  if (item.is_downloading || rawStatus === 'downloading') {
    return { label: 'En téléchargement', variant: 'downloading' };
  }
  if (rawStatus === 'pending_approval') {
    return { label: 'À approuver', variant: 'partial' };
  }
  if (rawStatus === 'failed') {
    return { label: 'Échec', variant: 'error' };
  }
  if (item.requested || item.request_id || rawStatus) {
    return { label: 'Demandé', variant: 'requested' };
  }
  return null;
});
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
  color: #fff;
  background: rgba(39, 39, 42, .94);
  font-size: var(--poster-badge-font-size);
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  text-shadow: 0 1px 1px rgba(0, 0, 0, .55);
  white-space: nowrap;
}
.in-plex { background: rgba(22, 101, 52, .96); }
.partial { color: #1a1200; background: rgba(245, 179, 26, .97); }
.downloading { background: rgba(3, 105, 161, .96); }
.requested { background: rgba(63, 63, 70, .96); }
.error { background: rgba(185, 28, 28, .96); }
</style>
