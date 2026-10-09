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
    :link="{ label: 'Voir l’activité', to: { path: '/activity', query: { view: 'live' } } }"
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
import { Captions, Globe, Monitor, MonitorPlay, PowerOff, Server, Sparkles, Volume2, Wifi } from '@lucide/vue';
import LiveStrip, { type LiveFact, type LiveIdle, type LiveItem } from '@/components/ui/LiveStrip.vue';
import PlaybackMethodBadge from '@/components/activity/PlaybackMethodBadge.vue';
import type { LiveSession } from '@/components/activity/LiveSessionsPanel.vue';
import { episodeLabel } from '@/utils/episode';
import { timecode } from '@/utils/format';
import { formatBandwidth, formatTime } from '@/utils/format';
import { channelsLabel } from '@/utils/mediaTechnical';
import { proxyUrl } from '@/utils/mediaImage';

const props = withDefaults(
  defineProps<{
    sessions?: LiveSession[];
    collectionEnabled?: boolean;
    loading?: boolean;
    failed?: boolean;
  }>(),
  { sessions: () => [], collectionEnabled: true, loading: false, failed: false }
);
defineEmits<{ (e: 'select', session: LiveSession): void }>();

/* Logo de l'oeuvre : le bandeau commun rend la main au titre si l'image manque. */
function logoUrl(session: LiveSession): string {
  return `${session.logo_url}${String(session.logo_url).includes('?') ? '&' : '?'}width=600`;
}
/* Sous le logo, ce qu'il ne dit pas : l'episode, ou l'annee d'un film. Le titre complet
   reste lisible par les lecteurs d'ecran via l'etiquette de la carte. */
function logoCaption(session: LiveSession): string {
  if (session.grandparent_title) return episodeLabel(session) || session.title || '';
  return session.year ? String(session.year) : '';
}
/* Affiche floutee en fond quand l'oeuvre n'a pas de fanart : petite largeur suffit. */
function posterUrl(session: LiveSession): string {
  const src = String(session.thumb_url || '');
  if (src.startsWith('/api/playback/thumb')) return `${src}${src.includes('?') ? '&' : '?'}width=300`;
  return proxyUrl(src, { width: 300 }) ?? src;
}

/* Meme interpolation que la page Activite : la position avance entre deux relevés. */
const receivedAt = ref(Date.now());
const now = ref(Date.now());
watch(() => props.sessions, () => { receivedAt.value = Date.now(); now.value = Date.now(); });
useIntervalFn(() => { if (!document.hidden) now.value = Date.now(); }, 1000);

function isPaused(session: LiveSession): boolean {
  return ['paused', 'buffering'].includes(String(session.state || '').toLowerCase());
}
function elapsedMs(session: LiveSession): number {
  const base = session.progress_ms || 0;
  if (String(session.state || 'playing').toLowerCase() !== 'playing') return base;
  const projected = base + (now.value - receivedAt.value);
  return session.duration_ms ? Math.min(projected, session.duration_ms) : projected;
}
function percent(session: LiveSession): number {
  if (session.duration_ms) return Math.min(100, Math.round((elapsedMs(session) / session.duration_ms) * 100));
  return Math.min(100, Math.round(session.progress || 0));
}
function remaining(session: LiveSession): string {
  if (String(session.state || '').toLowerCase() === 'paused') return 'En pause';
  if (String(session.state || '').toLowerCase() === 'buffering') return 'Mise en mémoire tampon';
  if (!session.duration_ms) return `${percent(session)} %`;
  const left = Math.max(0, session.duration_ms - elapsedMs(session));
  return left < 1000 ? 'Bientôt terminé' : `${timecode(left)} restantes`;
}
function displayTitle(session: LiveSession): string {
  if (!session.grandparent_title) return session.title || '';
  const episode = episodeLabel(session);
  return episode ? `${session.grandparent_title} · ${episode}` : session.grandparent_title;
}
/* Heure de fin si la lecture va au bout sans nouvelle pause ; en pause, si elle reprend
   maintenant. Rien sans duree connue. */
function endsAt(session: LiveSession): number | null {
  if (!session.duration_ms) return null;
  return now.value + Math.max(0, session.duration_ms - elapsedMs(session));
}
function endLabel(session: LiveSession): string {
  const end = endsAt(session);
  if (end === null) return '';
  return isPaused(session) ? `fin vers ${formatTime(end)} si reprise` : `fin vers ${formatTime(end)}`;
}

/* Plex note la hauteur du flux : 1080 pour un 1920x800 recadre se lit par la largeur. */
function sourceResolution(video: Record<string, any> | undefined): string {
  const width = Number(video?.width || 0);
  const height = Number(video?.height || 0);
  if (width >= 3200 || height >= 2000) return '4K';
  if (width >= 1800 || height >= 1000) return '1080p';
  if (width >= 1200 || height >= 700) return '720p';
  return height ? `${height}p` : '';
}
function qualityLabel(session: LiveSession): string {
  const video = session.stream_details?.tracks?.video;
  const raw = String(session.quality || '').trim();
  const fallback = !raw ? '' : /^\d+$/.test(raw) ? `${raw}p` : raw.toUpperCase();
  const source = sourceResolution(video?.from) || fallback;
  if (String(video?.decision || '').toLowerCase() !== 'transcode') return source;
  const output = sourceResolution({ height: video?.to?.height });
  return source && output && output !== source ? `${source} → ${output}` : source || output;
}
function dynamicRange(session: LiveSession): string {
  const range = session.stream_details?.dynamic_range || {};
  const source = range.source && range.source !== 'SDR' ? String(range.source) : '';
  if (!source) return '';
  return range.output === 'SDR' ? `${source} → SDR` : source;
}
/* « Français », « fre », « fr-FR » -> FR ; une langue inconnue garde ses deux premieres lettres. */
function languageCode(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(fr|fre|fra)\b|^fran/i.test(raw)) return 'FR';
  if (/^(en|eng)\b|^engl|^angl/i.test(raw)) return 'EN';
  return raw.slice(0, 2).toUpperCase();
}
function audioLabel(session: LiveSession): string {
  const from = session.stream_details?.tracks?.audio?.from;
  return [channelsLabel(from?.channels), languageCode(from?.language)].filter(Boolean).join(' · ');
}
function subtitleLabel(session: LiveSession): string {
  const subtitles = session.stream_details?.tracks?.subtitles?.languages || [];
  const selected = subtitles.find((item: Record<string, any>) => item.selected);
  if (!selected) return '';
  return `ST ${languageCode(selected.language) || 'actifs'}${session.subtitle_decision === 'burn' ? ' incrustés' : ''}`;
}
function networkLabel(session: LiveSession): string {
  if (session.stream_details?.relayed) return 'Relais Plex';
  if (session.location === 'lan' || session.stream_details?.local) return 'Local';
  return session.geo_city ? `Distant · ${session.geo_city}` : 'Distant';
}
function networkTone(session: LiveSession): string {
  if (session.stream_details?.relayed) return 'warn';
  return networkLabel(session) === 'Local' ? '' : 'remote';
}
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
  const ends = props.sessions.map(endsAt);
  if (!ends.length || ends.some((end) => end === null)) return '';
  return formatTime(Math.max(...(ends as number[])));
});
/* Une lecture traduite en carte du bandeau commun. */
function facts(session: LiveSession): LiveFact[] {
  const out: LiveFact[] = [];
  const push = (key: string, label: string, icon: any, tone?: LiveFact['tone']) => { if (label) out.push({ key, label, icon, tone }); };
  push('quality', qualityLabel(session), Monitor);
  push('hdr', dynamicRange(session), Sparkles, 'hdr');
  push('audio', audioLabel(session), Volume2);
  push('subtitles', subtitleLabel(session), Captions);
  const tone = networkTone(session);
  push('network', networkLabel(session), tone === 'remote' ? Globe : Wifi, tone === 'warn' ? 'warn' : tone === 'remote' ? 'remote' : undefined);
  if (session.is_download) push('download', 'Téléchargement', MonitorPlay);
  push('server', session.server_name || '', Server);
  return out;
}
const items = computed<LiveItem[]>(() => props.sessions.map((session) => ({
  key: String(session.session_id),
  session,
  title: displayTitle(session),
  logo: session.logo_url ? logoUrl(session) : null,
  logoCaption: logoCaption(session),
  status: `${remaining(session)}${endLabel(session) ? ` · ${endLabel(session)}` : ''}`,
  progress: percent(session),
  paused: isPaused(session),
  backdrop: session.art_url || null,
  poster: session.thumb_url ? posterUrl(session) : null,
  corner: { person: session },
  person: session,
  client: session,
  facts: facts(session),
})));
const idle = computed<LiveIdle>(() => {
  if (props.loading) return { title: 'Lectures en direct', message: 'Récupération des lectures Plex…', icon: MonitorPlay };
  if (props.failed) return { title: 'Lectures momentanément indisponibles', message: 'La connexion sera réessayée automatiquement.', icon: MonitorPlay };
  if (!props.collectionEnabled) return { title: 'Lectures en direct non suivies', message: 'La collecte des lectures en direct est désactivée.', icon: PowerOff, warn: true, action: { label: 'Activer la collecte', to: '/settings/services/integrations', primary: true } };
  return { title: 'Aucune lecture en cours', message: 'Les lectures Plex s’afficheront ici dès qu’elles démarrent.', icon: MonitorPlay, action: { label: 'Voir l’activité', to: { path: '/activity', query: { view: 'live' } } } };
});

const summary = computed(() => [
  bandwidth.value !== '—' ? bandwidth.value : '',
  transcodeCount.value ? `${transcodeCount.value} transcodage${transcodeCount.value > 1 ? 's' : ''}` : 'aucun transcodage',
  freeAt.value ? `serveur libre vers ${freeAt.value}` : '',
].filter(Boolean).join(' · '));
</script>
