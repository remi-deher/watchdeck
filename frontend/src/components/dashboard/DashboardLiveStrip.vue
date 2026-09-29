<template>
  <!-- Bandeau « En direct » de l'accueil, sur toute la largeur : un resume a gauche, puis
       une carte compacte par lecture, qui defilent horizontalement quand elles ne tiennent
       pas. La version detaillee (reseau, pistes, raisons du transcodage) reste sur la page
       Activite, ou la meme lecture s'ouvre au clic. -->
  <section class="panel live-strip" aria-labelledby="live-strip-title">
    <div class="live-strip-summary">
      <span class="live-strip-badge" :class="{ idle: !sessions.length }"><i aria-hidden="true"></i>En direct sur Plex</span>
      <h2 id="live-strip-title">{{ headline }}</h2>
      <dl v-if="sessions.length" class="live-strip-stats">
        <div><dt>Bande passante</dt><dd>{{ bandwidth }}</dd></div>
        <div><dt>Lectures directes</dt><dd>{{ directCount }}</dd></div>
        <div><dt>Transcodages</dt><dd :class="{ warn: transcodeCount }">{{ transcodeCount }}</dd></div>
      </dl>
      <RouterLink :to="{ path: '/activity', query: { view: 'live' } }" class="panel-link">Voir l’activité</RouterLink>
    </div>

    <div v-if="sessions.length" class="live-strip-list">
      <button
        v-for="session in sessions"
        :key="session.session_id"
        type="button"
        class="live-card"
        :class="{ paused: isPaused(session) }"
        :aria-label="`${displayTitle(session)}, ${session.user_name || 'Utilisateur Plex'}`"
        @click="$emit('select', session)"
      >
        <span class="live-card-art">
          <MediaArtwork :src="session.thumb_url" :alt="''" :type="session.media_type" size="medium" />
        </span>
        <span class="live-card-main">
          <span class="live-card-badges">
            <PlaybackMethodBadge :method="session.playback_method" compact />
            <span v-if="session.quality" class="live-card-quality">{{ session.quality }}</span>
          </span>
          <strong>{{ displayTitle(session) }}</strong>
          <span class="live-card-meta">{{ [session.user_name || 'Utilisateur Plex', deviceLabel(session)].join(' · ') }}</span>
          <span class="live-card-track"><i :class="{ paused: isPaused(session) }" :style="{ width: `${percent(session)}%` }"></i></span>
          <span class="live-card-meta">{{ remaining(session) }}</span>
        </span>
      </button>
    </div>
    <div v-else-if="!collectionEnabled" class="live-strip-empty">
      <PowerOff aria-hidden="true" />
      <span>La collecte des lectures en direct est désactivée.</span>
      <UiButton :to="{ path: '/settings', query: { tab: 'services' } }">Activer la collecte</UiButton>
    </div>
    <p v-else class="live-strip-empty">Aucune lecture en cours.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import { PowerOff } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import MediaArtwork from '@/components/activity/MediaArtwork.vue';
import PlaybackMethodBadge from '@/components/activity/PlaybackMethodBadge.vue';
import type { LiveSession } from '@/components/activity/LiveSessionsPanel.vue';
import { episodeLabel } from '@/utils/episode';
import { timecode } from '@/utils/playbackClock';
import { formatBandwidth } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    sessions?: LiveSession[];
    collectionEnabled?: boolean;
  }>(),
  { sessions: () => [], collectionEnabled: true }
);
defineEmits<{ (e: 'select', session: LiveSession): void }>();

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
function deviceLabel(session: LiveSession): string {
  return session.player || session.product || session.platform || 'Appareil inconnu';
}

const headline = computed(() => {
  const total = props.sessions.length;
  if (!total) return 'Aucune lecture';
  return `${total} lecture${total > 1 ? 's' : ''}`;
});
const bandwidth = computed(() => formatBandwidth(props.sessions.reduce((sum, s) => sum + (s.bandwidth_kbps || 0), 0) || null));
const transcodeCount = computed(() => props.sessions.filter((s) => s.playback_method === 'transcode').length);
const directCount = computed(() => props.sessions.length - transcodeCount.value);
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.live-strip { display: grid; grid-template-columns: minmax(200px, 240px) minmax(0, 1fr); gap: var(--space-4); align-items: stretch; min-width: 0; }
.live-strip-summary { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; padding: 4px 4px 2px; }
.live-strip-summary h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-2xl); line-height: 1.2; }
.live-strip-summary .panel-link { margin-top: auto; }
.live-strip-badge { display: inline-flex; align-items: center; gap: var(--space-2); align-self: flex-start; padding: 3px 10px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--green) 12%, transparent); color: var(--green-text); font-size: var(--fs-xs); font-weight: 700; }
.live-strip-badge i { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
.live-strip-badge.idle { background: color-mix(in srgb, var(--slate) 12%, transparent); color: var(--muted); }
.live-strip-badge.idle i { background: var(--muted); }
.live-strip-stats { display: grid; gap: 6px; margin: var(--space-1) 0 var(--space-2); }
.live-strip-stats div { display: flex; justify-content: space-between; gap: var(--space-3); color: var(--muted); font-size: var(--fs-sm); }
.live-strip-stats dt { margin: 0; }
.live-strip-stats dd { margin: 0; color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums; }
.live-strip-stats dd.warn { color: var(--amber-text); }

.live-strip-list { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(260px, 1fr); gap: var(--space-3); min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity; scrollbar-width: thin; padding-bottom: 2px; }
.live-card { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: var(--space-3); align-items: start; min-width: 0; padding: var(--space-3); border: 1px solid transparent; border-radius: var(--inset-radius); background: var(--surface-2); color: var(--text); font: inherit; text-align: left; cursor: pointer; scroll-snap-align: start; transition: border-color var(--motion-duration-instant) var(--motion-ease-standard); }
.live-card:hover, .live-card:focus-visible { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); outline: none; }
.live-card.paused .live-card-art { opacity: .7; }
.live-card-art { display: flex; }
.live-card-main { display: grid; gap: 5px; min-width: 0; }
.live-card-main strong { overflow: hidden; font-size: var(--fs-md); text-overflow: ellipsis; white-space: nowrap; }
.live-card-badges { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.live-card-quality { color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
.live-card-meta { overflow: hidden; color: var(--muted); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.live-card-track { display: block; height: 4px; margin-top: 2px; overflow: hidden; border-radius: var(--radius-pill); background: rgb(var(--ink) / .1); }
.live-card-track i { display: block; height: 100%; background: var(--accent); transition: width 1s linear; }
.live-card-track i.paused { background: var(--muted); transition: none; }

.live-strip-empty { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin: 0; padding: var(--space-3); border-radius: var(--inset-radius); background: var(--surface-2); color: var(--muted); font-size: var(--fs-sm); }
.live-strip-empty > svg { width: 18px; height: 18px; color: var(--accent); }

@container page (max-width: 700px) {
  .live-strip { grid-template-columns: minmax(0, 1fr); }
  .live-strip-summary { flex-direction: row; flex-wrap: wrap; align-items: center; column-gap: var(--space-3); }
  .live-strip-summary h2 { font-size: var(--fs-lg); }
  .live-strip-stats { display: none; }
  .live-strip-summary .panel-link { margin: 0 0 0 auto; }
  .live-strip-list { grid-auto-columns: minmax(240px, 82%); }
}
</style>
