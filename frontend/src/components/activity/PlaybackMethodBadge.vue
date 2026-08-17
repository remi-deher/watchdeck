<template>
  <span class="playback-badge" :class="normalized" :title="title || undefined">{{ label }}</span>
</template>

<script setup lang="ts">
import { playbackMethodLabel } from '@/utils/labels';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    method?: string;
    compact?: boolean;
    title?: string;
  }>(),
  {
    method: '',
    compact: false,
    title: '',
  }
);
const normalized = computed(() => (['transcode', 'direct_stream', 'direct_play'].includes(props.method) ? props.method : 'unknown'));
const label = computed(() => playbackMethodLabel(normalized.value, { compact: props.compact }));
</script>

<style scoped lang="scss">
.playback-badge{display:inline-flex;align-items:center;width:max-content;padding:4px 7px;border-radius:var(--radius-pill);background:rgba(148,163,184,.1);color:var(--muted);font-size:var(--fs-xs);font-weight:750;letter-spacing:.02em}.playback-badge.direct_play{background:rgba(34,197,94,.11);color:#4ade80}.playback-badge.direct_stream{background:rgba(59,130,246,.11);color:#60a5fa}.playback-badge.transcode{background:rgba(249,115,22,.12);color:#fb923c}
</style>
