<template>
  <span class="state-badge" :class="statusClass(torrent)">{{ statusLabel(torrent) }}</span>
</template>

<script setup lang="ts">
import { statusClass, statusLabel } from '@/downloads/torrentFormat';

defineProps<{ torrent: any }>();
</script>

<style scoped>
.state-badge{display:inline-flex;max-width:100%;overflow:hidden;padding:4px 7px;border-radius:var(--radius-pill);background:var(--surface-2);color:var(--muted);font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.state-badge.active{background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
.state-badge.complete{background:color-mix(in srgb,var(--success) 14%,transparent);color:var(--success)}
.state-badge.paused{background:color-mix(in srgb,var(--warning) 14%,transparent);color:var(--warning)}
.state-badge.error{background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger)}
@media(min-width:761px){.state-badge{font-size:13px}}
</style>
