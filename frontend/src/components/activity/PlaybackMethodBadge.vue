<template>
  <!-- Non tabulable : la pastille vit surtout dans des lignes et cartes deja cliquables. -->
  <span v-if="reasonOnly && reason" :title="reason">{{ reason }}</span>
  <UiTooltip v-else-if="!reasonOnly" :focusable="false" :text="description"><span class="playback-badge" :class="normalized">{{ label }}</span></UiTooltip>
</template>

<script setup lang="ts">
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { playbackMethodLabel } from '@/utils/labels';
import { computed } from 'vue';
import { plexPhrase } from '@/utils/plexDecisionText';
import type { TranscodeReasonData } from './TranscodeReason.vue';

export interface PlaybackRef {
  playback_method?: string;
  method?: string;
  video_decision?: string;
  audio_decision?: string;
  subtitle_decision?: string;
  transcode_reason?: TranscodeReasonData | null;
  transcode_remux?: string | null;
}

const props = withDefaults(
  defineProps<{
    method?: string;
    playback?: PlaybackRef;
    playbacks?: PlaybackRef[];
    reasonOnly?: boolean;
    compact?: boolean;
    title?: string;
  }>(),
  {
    method: '',
    compact: false,
    title: '',
  }
);
const method = computed(() => {
  if (props.method) return props.method;
  const methods = new Set(props.playbacks?.map((p) => p.playback_method || p.method || '') || []);
  if (methods.size > 1) return 'mixed';
  return props.playback?.playback_method || props.playback?.method || [...methods][0] || '';
});
const normalized = computed(() => (['transcode', 'direct_stream', 'direct_play', 'mixed'].includes(method.value) ? method.value : 'unknown'));
const reason = computed(() => {
  const p = props.playback;
  if (!p) return '';
  if (p.transcode_remux) return p.transcode_remux;
  const r = p.transcode_reason;
  return r?.text ? (r.source === 'plex' ? plexPhrase(r.text) : r.text) : '';
});
const decisionLabels: Record<string, string> = { transcode: 'transcodée', copy: 'copiée', directplay: 'directe' };
const description = computed(() => {
  if (props.title) return props.title;
  if (normalized.value === 'mixed' && props.playbacks?.length) {
    const counts = new Map<string, number>();
    for (const p of props.playbacks) { const m = p.playback_method || p.method || ''; counts.set(m, (counts.get(m) || 0) + 1); }
    return `Lecture mixte : ${[...counts].map(([m, count]) => `${count} × ${playbackMethodLabel(m, { fallback: 'inconnu' }).toLowerCase()}`).join(', ')}`;
  }
  const p = props.playback;
  const decisions = p ? [['Vidéo', p.video_decision], ['Audio', p.audio_decision], ['Sous-titres', p.subtitle_decision]]
    .filter(([, value]) => value).map(([label, value]) => `${label} ${decisionLabels[value!] || value}`) : [];
  return [reason.value, ...decisions].filter(Boolean).join(' · ') || (normalized.value === 'direct_stream' ? 'Direct Stream : conteneur changé, rien n’est réencodé' : undefined);
});
const label = computed(() => playbackMethodLabel(normalized.value, { compact: props.compact }));
</script>

<style scoped lang="scss">
.playback-badge{display:inline-flex;align-items:center;width:max-content;padding:4px 7px;border-radius:var(--radius-pill);background:color-mix(in srgb,var(--slate) 10%,transparent);color:var(--muted);font-size:var(--fs-xs);font-weight:750;letter-spacing:.02em}.playback-badge.direct_play{background:color-mix(in srgb, var(--green) 11%, transparent);color:var(--green-text)}.playback-badge.direct_stream{background:color-mix(in srgb, var(--blue) 11%, transparent);color:var(--blue-text)}.playback-badge.transcode{background:color-mix(in srgb,var(--amber) 12%,transparent);color:var(--amber-text)}.playback-badge.mixed{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)}
</style>
