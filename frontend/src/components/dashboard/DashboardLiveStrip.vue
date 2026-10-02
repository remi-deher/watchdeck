<template>
  <!-- Bandeau « En direct » de l'accueil. La disposition suit le nombre de lectures pour
       occuper toute la largeur : une seule lecture s'affiche en banniere (fond de l'oeuvre,
       affiche en incrustation), deux a cinq en tuiles fanart cote a cote, au-dela en mur
       d'affiches. L'image porte le mode de lecture, le spectateur, le titre et la
       progression ; dessous, l'appareil et ce qui compte techniquement (qualite, son,
       reseau, raison d'une conversion). Le detail complet reste sur la page Activite, ou
       la meme lecture s'ouvre au clic. -->
  <section class="panel live-strip" :class="{ 'is-idle': !sessions.length }" aria-labelledby="live-strip-title">
    <template v-if="sessions.length">
      <header class="live-strip-head">
        <span class="live-strip-badge"><i aria-hidden="true"></i><span>En direct<span class="live-strip-badge-extra"> sur Plex</span></span></span>
        <h2 id="live-strip-title">{{ headline }}</h2>
        <p class="live-strip-summary">{{ summary }}</p>
        <RouterLink :to="{ path: '/activity', query: { view: 'live' } }" class="panel-link">Voir l’activité</RouterLink>
      </header>

      <div class="live-strip-list" :class="`is-${layout}`" :style="{ '--live-count': sessions.length }">
        <button
          v-for="session in sessions"
          :key="session.session_id"
          type="button"
          class="live-card"
          :class="{ paused: isPaused(session) }"
          :aria-label="`${displayTitle(session)}, ${session.user_name || 'Utilisateur Plex'}`"
          @click="$emit('select', session)"
        >
          <span class="live-poster">
            <template v-if="wide">
              <span class="live-backdrop">
                <MediaArtwork v-if="session.art_url" :src="session.art_url" :alt="''" :type="session.media_type" size="backdrop" />
                <span v-else-if="session.thumb_url" class="live-backdrop-blur" :style="{ backgroundImage: `url(&quot;${posterUrl(session)}&quot;)` }"></span>
              </span>
            </template>
            <MediaArtwork v-else :src="session.thumb_url" :alt="''" :type="session.media_type" size="poster" />
            <span class="live-poster-shade" aria-hidden="true"></span>
            <span v-if="isPaused(session)" class="live-poster-pause" aria-hidden="true"><Pause /></span>
            <span class="live-poster-top">
              <PlaybackMethodBadge :method="session.playback_method" compact />
              <UiAvatar :src="session.user_avatar_url" :name="session.user_name || 'Plex'" size="sm" tone="accent" />
            </span>
            <span class="live-poster-bottom">
              <span v-if="wide" class="live-inset" aria-hidden="true">
                <MediaArtwork :src="session.thumb_url" :alt="''" :type="session.media_type" size="poster" />
              </span>
              <span class="live-poster-text">
                <template v-if="wide && showLogo(session)">
                  <img class="live-logo" :src="logoUrl(session)" alt="" decoding="async" @error="brokenLogos.add(String(session.session_id))">
                  <strong class="live-logo-label">{{ logoCaption(session) }}</strong>
                </template>
                <strong v-else>{{ displayTitle(session) }}</strong>
                <small>{{ remaining(session) }}<template v-if="endLabel(session)"> · {{ endLabel(session) }}</template></small>
                <span class="live-card-track"><i :class="{ paused: isPaused(session) }" :style="{ width: `${percent(session)}%` }"></i></span>
              </span>
            </span>
          </span>
          <span class="live-card-who">{{ [session.user_name || 'Utilisateur Plex', deviceLabel(session)].join(' · ') }}</span>
          <span class="live-card-chips">
            <span v-if="qualityLabel(session)" class="live-chip">{{ qualityLabel(session) }}</span>
            <span v-if="dynamicRange(session)" class="live-chip hdr">{{ dynamicRange(session) }}</span>
            <span v-if="audioLabel(session)" class="live-chip">{{ audioLabel(session) }}</span>
            <span v-if="subtitleLabel(session)" class="live-chip">{{ subtitleLabel(session) }}</span>
            <span class="live-chip" :class="networkTone(session)">{{ networkLabel(session) }}</span>
            <span v-if="session.is_download" class="live-chip">Téléchargement</span>
            <span v-if="session.server_name" class="live-chip">{{ session.server_name }}</span>
          </span>
          <span v-if="reasonText(session)" class="live-card-reason" :title="reasonText(session)">{{ reasonText(session) }}</span>
        </button>
      </div>
    </template>

    <!-- Au repos, le bandeau tient sur une ligne : un grand cadre vide au sommet de la
         page prenait la place la plus visible pour dire qu'il ne se passait rien. -->
    <div v-else class="live-strip-idle">
      <span class="live-strip-idle-icon" :class="{ off: !collectionEnabled }">
        <PowerOff v-if="!collectionEnabled" aria-hidden="true" />
        <MonitorPlay v-else aria-hidden="true" />
      </span>
      <div class="live-strip-idle-text">
        <h2 id="live-strip-title">{{ collectionEnabled ? 'Aucune lecture en cours' : 'Lectures en direct non suivies' }}</h2>
        <p v-if="collectionEnabled">Les lectures Plex s’afficheront ici dès qu’elles démarrent.</p>
        <p v-else>La collecte des lectures en direct est désactivée.</p>
      </div>
      <UiButton v-if="!collectionEnabled" :to="{ path: '/settings', query: { tab: 'services' } }">Activer la collecte</UiButton>
      <RouterLink v-else :to="{ path: '/activity', query: { view: 'live' } }" class="panel-link">Voir l’activité</RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import { MonitorPlay, Pause, PowerOff } from '@lucide/vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import MediaArtwork from '@/components/activity/MediaArtwork.vue';
import PlaybackMethodBadge from '@/components/activity/PlaybackMethodBadge.vue';
import type { LiveSession } from '@/components/activity/LiveSessionsPanel.vue';
import { episodeLabel } from '@/utils/episode';
import { timecode } from '@/utils/playbackClock';
import { formatBandwidth } from '@/utils/format';
import { channelsLabel } from '@/utils/mediaTechnical';
import { plexPhrase } from '@/utils/plexDecisionText';
import { proxyUrl } from '@/utils/mediaImage';

const props = withDefaults(
  defineProps<{
    sessions?: LiveSession[];
    collectionEnabled?: boolean;
  }>(),
  { sessions: () => [], collectionEnabled: true }
);
defineEmits<{ (e: 'select', session: LiveSession): void }>();

/* Disposition selon le nombre de lectures : chacune prend toute la largeur du bandeau. */
type LiveLayout = 'banner' | 'fanart' | 'posters';
const layout = computed<LiveLayout>(() => {
  const total = props.sessions.length;
  if (total <= 1) return 'banner';
  return total <= 5 ? 'fanart' : 'posters';
});
const wide = computed(() => layout.value !== 'posters');

/* Logo de l'oeuvre a la place du titre quand Plex en a un ; un logo introuvable rend
   la main au titre ecrit. */
const brokenLogos = reactive(new Set<string>());
function showLogo(session: LiveSession): boolean {
  return Boolean(session.logo_url) && !brokenLogos.has(String(session.session_id));
}
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
function deviceLabel(session: LiveSession): string {
  return session.player || session.product || session.platform || 'Appareil inconnu';
}

/* Heure de fin si la lecture va au bout sans nouvelle pause ; en pause, si elle reprend
   maintenant. Rien sans duree connue. */
function endsAt(session: LiveSession): number | null {
  if (!session.duration_ms) return null;
  return now.value + Math.max(0, session.duration_ms - elapsedMs(session));
}
const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
function endLabel(session: LiveSession): string {
  const end = endsAt(session);
  if (end === null) return '';
  return isPaused(session) ? `fin vers ${clock.format(end)} si reprise` : `fin vers ${clock.format(end)}`;
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
function reasonText(session: LiveSession): string {
  if (session.playback_method !== 'transcode' && session.playback_method !== 'mixed') return '';
  const reason = session.transcode_reason;
  if (!reason?.text) return '';
  return reason.source === 'plex' ? plexPhrase(reason.text) : reason.text;
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
  return clock.format(Math.max(...(ends as number[])));
});
const summary = computed(() => [
  bandwidth.value !== '—' ? bandwidth.value : '',
  transcodeCount.value ? `${transcodeCount.value} transcodage${transcodeCount.value > 1 ? 's' : ''}` : 'aucun transcodage',
  freeAt.value ? `serveur libre vers ${freeAt.value}` : '',
].filter(Boolean).join(' · '));
</script>

<style scoped lang="scss">
.live-strip { display: grid; gap: var(--space-3); min-width: 0; }
.live-strip-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); min-width: 0; }
.live-strip-head h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-xl); line-height: 1.2; }
.live-strip-summary { margin: 0; color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.live-strip-head .panel-link { margin-left: auto; }
.live-strip-badge { display: inline-flex; align-items: center; gap: var(--space-2); padding: 3px 10px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--green) 12%, transparent); color: var(--green-text); font-size: var(--fs-xs); font-weight: 700; }
.live-strip-badge i { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }

/* Mur d'affiches (six lectures et plus) : une colonne par lecture, etiree pour remplir la
   ligne ; au-dela de ce que la largeur permet, le mur defile horizontalement. La marge
   interne laisse la place au contour de focus, que le defilement rognerait. */
.live-strip-list { display: grid; grid-template-columns: repeat(var(--live-count), minmax(130px, 1fr)); gap: var(--space-4); min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity; scrollbar-width: thin; padding: 7px; margin: -7px; }
/* Tuiles fanart (deux a cinq lectures) : une colonne par lecture, sur toute la largeur. */
.live-strip-list.is-fanart { grid-template-columns: repeat(var(--live-count), minmax(0, 1fr)); }
.live-strip-list.is-banner { grid-template-columns: minmax(0, 1fr); }
.live-strip-list.is-fanart, .live-strip-list.is-banner { overflow-x: visible; }
.live-card { display: grid; gap: var(--space-2); align-content: start; min-width: 0; padding: 0; border: 0; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; scroll-snap-align: start; }
/* Contour decale de l'image : pose sur le fond du panneau et non sur l'affiche, il reste
   visible quelle que soit l'image -- une bague collee a l'affiche se perdait dans les
   affiches claires ou jaunes. */
.live-card:focus-visible { outline: none; }
.live-card:hover .live-poster, .live-card:focus-visible .live-poster { outline: 3px solid var(--accent); outline-offset: 3px; }

/* Tout ce qui est pose sur l'affiche reste clair sur voile sombre, quel que soit le theme :
   l'image est sombre ou claire selon le film, pas selon l'interface. Voile et texte en
   canaux RVB, comme `--ink`, pour garder leurs opacites sans couleur en dur. */
.live-poster { --scrim: 8 10 15; --on-poster: 255 255 255; position: relative; display: block; aspect-ratio: 2 / 3; max-width: 100%; overflow: hidden; border-radius: var(--radius-md); background: var(--media-placeholder); color: rgb(var(--on-poster)); box-shadow: 0 0 0 1px rgb(var(--ink) / 22%), 0 8px 22px -12px rgb(var(--scrim) / 70%); transition: outline-color var(--motion-duration-instant) var(--motion-ease-standard); }
/* Contour permanent : une image sombre se confondait avec le fond du panneau. Trait
   couleur du texte a l'exterieur, filet clair a l'interieur, lisibles dans les deux themes ;
   le survol garde son anneau decale. */
.live-poster::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px rgb(var(--on-poster) / 12%); pointer-events: none; }
.live-poster :deep(.media-artwork) { position: absolute; inset: 0; }
.live-poster-shade { position: absolute; inset: 0; background: linear-gradient(to top, rgb(var(--scrim) / 94%) 0%, rgb(var(--scrim) / 60%) 32%, transparent 58%), linear-gradient(to bottom, rgb(var(--scrim) / 55%), transparent 26%); }
.live-poster-pause { position: absolute; inset: 0; display: grid; place-items: center; background: rgb(var(--scrim) / 30%); }
.live-poster-pause svg { width: 40px; height: 40px; padding: 10px; border-radius: 50%; background: rgb(var(--scrim) / 60%); fill: currentColor; }
.live-poster-top { position: absolute; top: 8px; right: 8px; left: 8px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.live-poster-top :deep(.playback-badge) { background: rgb(var(--scrim) / 62%); backdrop-filter: blur(6px); color: rgb(var(--on-poster) / 88%); }
.live-poster-top :deep(.playback-badge.direct_play) { color: color-mix(in srgb, var(--green) 45%, white); }
.live-poster-top :deep(.playback-badge.direct_stream) { color: color-mix(in srgb, var(--blue) 45%, white); }
.live-poster-top :deep(.playback-badge.transcode) { color: color-mix(in srgb, var(--amber) 45%, white); }
.live-poster-top :deep(.ui-avatar) { box-shadow: 0 0 0 2px rgb(var(--scrim) / 55%); }
.live-poster-bottom { position: absolute; right: 10px; bottom: 10px; left: 10px; display: flex; align-items: flex-end; gap: var(--space-3); }
.live-poster-text { display: grid; flex: 1; gap: 5px; min-width: 0; }
.live-poster-text strong { display: -webkit-box; max-height: 2.7em; overflow: hidden; font-size: var(--fs-sm); line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.live-poster-text small { color: rgb(var(--on-poster) / 78%); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.live-card-track { display: block; height: 4px; overflow: hidden; border-radius: var(--radius-pill); background: rgb(var(--on-poster) / 22%); }
.live-card-track i { display: block; height: 100%; background: var(--plex); transition: width 1s linear; }
.live-card-track i.paused { background: rgb(var(--on-poster) / 60%); transition: none; }

/* Dispositions larges : fond de l'oeuvre, affiche en incrustation a gauche du titre. */
.is-fanart .live-poster { aspect-ratio: 16 / 9; }
.is-banner .live-poster { aspect-ratio: auto; height: clamp(220px, 22vw, 340px); }
.live-backdrop { position: absolute; inset: 0; overflow: hidden; }
.live-backdrop :deep(.media-artwork) { position: absolute; inset: 0; }
.live-backdrop-blur { position: absolute; inset: -24px; background-position: center; background-size: cover; filter: blur(22px) saturate(1.2); opacity: .7; }
.is-fanart .live-poster-shade, .is-banner .live-poster-shade { background: linear-gradient(to top, rgb(var(--scrim) / 92%) 0%, rgb(var(--scrim) / 55%) 40%, transparent 72%), linear-gradient(to right, rgb(var(--scrim) / 55%), transparent 55%), linear-gradient(to bottom, rgb(var(--scrim) / 50%), transparent 30%); }
.live-inset { flex: none; position: relative; width: clamp(56px, 22%, 96px); aspect-ratio: 2 / 3; overflow: hidden; border-radius: var(--radius-sm); box-shadow: 0 6px 18px rgb(var(--scrim) / 55%), 0 0 0 1px rgb(var(--on-poster) / 14%); }
.live-inset :deep(.media-artwork) { position: absolute; inset: 0; }
.live-logo { display: block; max-width: min(100%, 240px); max-height: 56px; object-fit: contain; object-position: left bottom; filter: drop-shadow(0 2px 6px rgb(var(--scrim) / 70%)); }
.live-poster-text strong.live-logo-label { font-size: var(--fs-xs); color: rgb(var(--on-poster) / 86%); }
.is-banner .live-poster-bottom { right: var(--space-5); bottom: var(--space-4); left: var(--space-4); gap: var(--space-4); }
.is-banner .live-inset { width: clamp(96px, 11%, 150px); }
.is-banner .live-poster-text { max-width: 640px; }
.is-banner .live-poster-text strong { font-family: var(--font-display); font-size: var(--fs-xl); }
.is-banner .live-poster-text strong.live-logo-label { font-family: inherit; font-size: var(--fs-sm); }
.is-banner .live-logo { max-width: min(100%, 360px); max-height: 96px; }
.is-banner .live-poster-text small { font-size: var(--fs-sm); }
.is-banner .live-card-track { height: 5px; }

.live-card-who { overflow: hidden; color: var(--text); font-size: var(--fs-xs); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.live-card-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.live-chip { padding: 2px 7px; border-radius: var(--radius-xs); background: rgb(var(--ink) / 7%); color: var(--muted); font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; }
.live-chip.hdr { background: color-mix(in srgb, var(--violet) 12%, transparent); color: var(--violet-text); }
.live-chip.remote { background: color-mix(in srgb, var(--blue) 11%, transparent); color: var(--blue-text); }
.live-chip.warn { background: color-mix(in srgb, var(--amber) 12%, transparent); color: var(--amber-text); }
.live-card-reason { display: -webkit-box; overflow: hidden; color: var(--amber-text); font-size: var(--fs-xs); line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }

@media (prefers-reduced-motion: reduce) { .live-card-track i, .live-poster { transition: none; } }

.live-strip.is-idle { display: block; }
.live-strip-idle { display: flex; align-items: center; gap: var(--space-3) var(--space-4); flex-wrap: wrap; min-width: 0; }
.live-strip-idle-icon { display: grid; flex: none; place-items: center; width: 40px; height: 40px; border-radius: var(--radius-md); background: var(--surface-2); color: var(--muted); }
.live-strip-idle-icon svg { width: 20px; height: 20px; }
.live-strip-idle-icon.off { color: var(--amber-text); background: color-mix(in srgb, var(--amber) 12%, transparent); }
.live-strip-idle-text { display: grid; gap: 2px; flex: 1; min-width: min(240px, 100%); }
.live-strip-idle-text h2 { margin: 0; font-size: var(--fs-md); }
.live-strip-idle-text p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }

@container page (max-width: 700px) {
  .live-strip-head { gap: var(--space-1) var(--space-3); }
  .live-strip-head h2 { font-size: var(--fs-lg); }
  .live-strip-badge-extra { display: none; }
  /* Badge et lien sur la premiere ligne, le compte et le resume dessous : a 360 px,
     badge, titre et lien ne tiennent pas cote a cote. */
  .live-strip-head .panel-link { order: 2; }
  .live-strip-head h2 { order: 3; }
  .live-strip-summary { order: 4; }
  /* En largeur etroite, tuiles et affiches defilent horizontalement ; la banniere garde
     toute la largeur. */
  .live-strip-list.is-fanart, .live-strip-list.is-posters { grid-template-columns: none; grid-auto-flow: column; overflow-x: auto; scroll-snap-type: x mandatory; gap: var(--space-3); }
  .live-strip-list.is-fanart { grid-auto-columns: 86%; }
  .live-strip-list.is-posters { grid-auto-columns: minmax(150px, 46%); }
  .is-banner .live-poster { height: auto; aspect-ratio: 4 / 3; }
}
</style>
