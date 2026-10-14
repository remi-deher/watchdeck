<template>
  <!-- Bandeau « En direct » de l'accueil : les lectures Plex, sur le bandeau commun
       (LiveStrip). Ici, seulement ce qui est propre a Plex : la position qui avance entre
       deux releves, l'heure de fin, la qualite, le son, les sous-titres, le reseau et la
       raison d'une conversion. Le detail complet reste sur la page Activite. -->
  <LiveStrip
    :items="items"
    :title="headline"
    :summary="summary"
    live-extra="sur Plex"
    :link="showLink ? { label: 'Voir l’activité', to: { path: '/activity', query: { view: 'live' } } } : undefined"
    :idle="idle"
    :loading="loading"
    @select="(item) => $emit('select', item.session)"
  >
    <template #note="{ item }"><PlaybackMethodBadge :playback="item.session" reason-only /></template>
    <template #badge="{ item }"><PlaybackMethodBadge :playback="item.session" compact /></template>
  </LiveStrip>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import { MonitorPlay, PowerOff } from '@lucide/vue';
import LiveStrip, { type LiveIdle, type LiveItem } from '@/components/ui/LiveStrip.vue';
import { endsAt, liveItemOf, type LiveClock } from '@/activity/liveSessions';
import PlaybackMethodBadge from '@/components/activity/PlaybackMethodBadge.vue';
import type { LiveSession } from '@/components/activity/LiveSessionsPanel.vue';
import { formatBandwidth, formatTime } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    sessions?: LiveSession[];
    collectionEnabled?: boolean;
    loading?: boolean;
    failed?: boolean;
    /** Faux sur la page Activité elle-même : le lien vers l'activité n'y mène nulle part. */
    showLink?: boolean;
  }>(),
  { sessions: () => [], collectionEnabled: true, loading: false, failed: false, showLink: true }
);
defineEmits<{ (e: 'select', session: LiveSession): void }>();

/* Meme interpolation que la page Activite : la position avance entre deux relevés. */
const receivedAt = ref(Date.now());
const now = ref(Date.now());
watch(() => props.sessions, () => { receivedAt.value = Date.now(); now.value = Date.now(); });
useIntervalFn(() => { if (!document.hidden) now.value = Date.now(); }, 1000);
const clock = computed<LiveClock>(() => ({ now: now.value, receivedAt: receivedAt.value }));

const headline = computed(() => {
  const total = props.sessions.length;
  if (!total) return 'Aucune lecture';
  return `${total} lecture${total > 1 ? 's' : ''}`;
});
const bandwidth = computed(() => formatBandwidth(props.sessions.reduce((sum, s) => sum + (s.bandwidth_kbps || 0), 0) || null));
const transcodeCount = computed(() => props.sessions.filter((s) => s.playback_method === 'transcode').length);
/* Quand le serveur sera libre (pour un redemarrage) : la fin la plus tardive, a
   condition de connaitre la duree de toutes les lectures. */
const freeAt = computed(() => {
  const ends = props.sessions.map((session) => endsAt(session, clock.value));
  if (!ends.length || ends.some((end) => end === null)) return '';
  return formatTime(Math.max(...(ends as number[])));
});
const items = computed<LiveItem[]>(() => props.sessions.map((session) => liveItemOf(session, clock.value)));
const idle = computed<LiveIdle>(() => {
  if (props.loading) return { title: 'Lectures en direct', message: 'Récupération des lectures Plex…', icon: MonitorPlay };
  if (props.failed) return { title: 'Lectures momentanément indisponibles', message: 'La connexion sera réessayée automatiquement.', icon: MonitorPlay };
  if (!props.collectionEnabled) return { title: 'Lectures en direct non suivies', message: 'La collecte des lectures en direct est désactivée.', icon: PowerOff, warn: true, action: { label: 'Activer la collecte', to: '/settings/services/integrations', primary: true } };
  return { title: 'Aucune lecture en cours', message: 'Les lectures Plex s’afficheront ici dès qu’elles démarrent.', icon: MonitorPlay, ...(props.showLink ? { action: { label: 'Voir l’activité', to: { path: '/activity', query: { view: 'live' } } } } : {}) };
});

const summary = computed(() => [
  bandwidth.value !== '—' ? bandwidth.value : '',
  transcodeCount.value ? `${transcodeCount.value} transcodage${transcodeCount.value > 1 ? 's' : ''}` : 'aucun transcodage',
  freeAt.value ? `serveur libre vers ${freeAt.value}` : '',
].filter(Boolean).join(' · '));
</script>
