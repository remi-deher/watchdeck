<template>
  <!-- Fiche technique d'un fichier du catalogue analyse. L'instantane de l'analyse donne
       l'essentiel tout de suite ; la fiche Plex (`technical`), lue a la demande, ajoute
       l'affiche, les profils, le HDR, les debits et le detail de chaque piste. -->
  <div class="analytics-item">
    <SheetHero
      class="item-banner"
      :banner-class="{ 'is-poster-fallback': bannerIsPoster }"
      :image-url="bannerUrl"
      :variant="enSurface ? 'sheet' : 'card'"
      min-height="clamp(160px, 26vw, 250px)"
      bleed
    >
      <!-- L'affiche mene a la fiche du media, dans la feuille : pas de bouton en plus. -->
      <template #poster>
        <component
          :is="mediaPath ? 'button' : 'div'"
          class="item-poster"
          :type="mediaPath ? 'button' : undefined"
          :title="mediaPath ? 'Ouvrir la fiche du média' : undefined"
          :aria-label="mediaPath ? `Ouvrir la fiche de ${displayTitle}` : undefined"
          @click="openMedia"
        >
          <MediaArtwork :src="technical?.poster_url || item.thumb_url || ''" :alt="displayTitle" :type="item.media_type" size="large" />
        </component>
      </template>
      <div class="item-heading">
        <span>{{ eyebrow }}</span>
        <h2>{{ item.title }}</h2>
        <ul class="item-tags" aria-label="Caractéristiques">
          <li v-if="resolution" class="is-accent">{{ resolution }}</li>
          <li v-if="technical?.video?.dynamic_range && technical.video.dynamic_range !== 'SDR'" class="is-accent">{{ technical.video.dynamic_range }}</li>
          <li v-if="known(item.video_codec)">{{ codecLabel(item.video_codec) }}</li>
          <li v-if="known(item.container)">{{ String(item.container).toUpperCase() }}</li>
          <li v-if="known(item.audio_codec)">{{ codecLabel(item.audio_codec) }}<template v-if="item.audio_channels"> {{ channelsLabel(item.audio_channels) }}</template></li>
        </ul>
      </div>
    </SheetHero>

    <div class="item-toolbar" role="toolbar" aria-label="Actions sur le fichier">
      <UiButton v-if="hasPrevious || hasNext" variant="ghost" icon-only title="Fichier précédent (k)" aria-label="Fichier précédent" :disabled="!hasPrevious" @click="emit('navigate', -1)"><ChevronLeft /></UiButton>
      <UiButton v-if="hasPrevious || hasNext" variant="ghost" icon-only title="Fichier suivant (j)" aria-label="Fichier suivant" :disabled="!hasNext" @click="emit('navigate', 1)"><ChevronRight /></UiButton>
      <UiButton variant="ghost" size="sm" @click="copy(itemLink, 'Lien du fichier copié.')"><Link2 />Copier le lien</UiButton>
    </div>

    <div class="item-kpis">
      <article><span>Poids</span><strong>{{ bytes(item.size_bytes) }}</strong><small>{{ averageBitrate ? `débit moyen ${averageBitrate}` : 'débit inconnu' }}</small></article>
      <article><span>Lectures</span><strong>{{ item.play_count || 0 }}</strong><small>{{ viewersLabel }}</small></article>
      <article><span>Temps visionné</span><strong>{{ item.watch_time_ms ? duration(item.watch_time_ms) : '0 h' }}</strong><small>{{ item.last_viewed_at ? `dernière le ${formatDateShort(item.last_viewed_at)}` : item.play_count ? 'date inconnue' : 'jamais visionné' }}</small></article>
    </div>

    <section class="item-section" aria-labelledby="item-file-title">
      <header>
        <h3 id="item-file-title">Fichier</h3>
        <small v-if="technicalLoading">Lecture de la fiche Plex…</small>
        <small v-else-if="technicalError" class="is-warning">Plex n’a pas répondu : détails limités à l’analyse</small>
      </header>
      <dl class="item-facts">
        <div v-for="fact in facts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div>
      </dl>
      <div v-if="technical?.file?.path" class="item-path">
        <FolderOpen aria-hidden="true" />
        <code :title="technical.file.path">{{ technical.file.path }}</code>
        <UiButton variant="ghost" icon-only size="sm" title="Copier le chemin" aria-label="Copier le chemin du fichier" @click="copy(technical.file.path, 'Chemin copié.')"><Copy /></UiButton>
      </div>
    </section>

    <section class="item-section" aria-labelledby="item-tracks-title">
      <header><h3 id="item-tracks-title">Pistes</h3></header>
      <div class="item-tracks">
        <div class="track-group">
          <header class="track-kind"><Volume2 aria-hidden="true" />Audio<small v-if="technical?.audio?.length">{{ technical.audio.length }}</small></header>
          <ul v-if="technical?.audio?.length">
            <li v-for="(track, index) in technical.audio" :key="`a${index}`">
              <strong>{{ track.language || 'Langue inconnue' }}<em v-if="track.default">par défaut</em></strong>
              <span>{{ audioTrackDetail(track) || '—' }}</span>
              <small v-if="track.title">{{ track.title }}</small>
            </li>
          </ul>
          <p v-else-if="(item.audio_languages || []).length">{{ item.audio_languages.join(', ') }}</p>
          <p v-else class="is-empty">Aucune piste audio.</p>
        </div>
        <div class="track-group">
          <header class="track-kind"><Captions aria-hidden="true" />Sous-titres<small v-if="technical?.subtitles?.length">{{ technical.subtitles.length }}</small></header>
          <ul v-if="technical?.subtitles?.length">
            <li v-for="(track, index) in technical.subtitles" :key="`s${index}`">
              <strong>{{ track.language || 'Langue inconnue' }}<em v-if="track.default">par défaut</em></strong>
              <span>{{ subtitleTrackDetail(track) }}</span>
              <small v-if="track.title">{{ track.title }}</small>
            </li>
          </ul>
          <p v-else-if="!technical && (item.subtitle_types || []).length">{{ item.subtitle_types.join(', ') }}</p>
          <p v-else class="is-empty">Aucun sous-titre.</p>
        </div>
      </div>
    </section>

    <section class="item-section" aria-labelledby="item-views-title">
      <header>
        <h3 id="item-views-title">Visionnages</h3>
        <small v-if="views.length">{{ views.some((view: any) => view.session_id) ? 'Ouvrez une lecture pour voir sa session' : `${views.length} lecture(s)` }}</small>
      </header>
      <ol v-if="views.length" class="view-log">
        <li v-for="(view, index) in views" :key="`${view.at}-${index}`">
          <component
            :is="view.session_id ? 'RouterLink' : 'div'"
            class="view-row"
            :to="view.session_id ? sessionPath(view) : undefined"
            @click="view.session_id && openSession($event, view)"
          >
            <UiAvatar :name="view.user || 'Plex'" size="sm" />
            <span class="view-main">
              <span class="view-line">
                <strong>{{ view.user || 'Utilisateur Plex' }}</strong>
                <span class="view-amount"><b v-if="percentOf(view) != null">{{ percentOf(view) }} %</b><span>{{ duration(view.watched_ms) }}</span></span>
              </span>
              <span v-if="percentOf(view) != null" class="view-track" aria-hidden="true"><i :class="{ 'is-complete': (percentOf(view) || 0) >= 90 }" :style="{ width: `${percentOf(view)}%` }"></i></span>
              <span class="view-meta">
                <time :datetime="view.at">{{ formatDate(view.at) }}</time>
                <span v-if="view.player || view.platform" class="view-device"><MonitorSmartphone aria-hidden="true" />{{ [view.player, view.platform].filter(Boolean).join(' · ') }}</span>
              </span>
            </span>
            <ChevronRight v-if="view.session_id" class="view-chevron" aria-hidden="true" />
          </component>
        </li>
      </ol>
      <p v-else class="view-log-empty">Aucun visionnage enregistré pour ce fichier.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Captions, ChevronLeft, ChevronRight, Copy, FolderOpen, Link2, MonitorSmartphone, Volume2 } from '@lucide/vue';
import MediaArtwork from '@/components/activity/MediaArtwork.vue';
import SheetHero from '@/components/ui/SheetHero.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { useToast } from '@/composables/useToast';
import { etatDeVoisins, ouvrirFiche, useMediaOverlay, useOuvrirFiche } from '@/composables/useMediaOverlay';
import { mediaDetailPath } from '@/mediaUrl';
import { proxyUrl } from '@/utils/mediaImage';
import { codecLabel } from '@/utils/conversionVerdict';
import { mediaTypeLabel } from '@/utils/labels';
import {
  audioTrackDetail,
  bitrateLabel,
  channelsLabel,
  frameRateLabel,
  resolutionLabel,
  subtitleTrackDetail,
  watchedPercent,
} from '@/utils/mediaTechnical';
import {
  formatDateShort,
  formatDateTime as formatDate,
  formatDurationRoundHours as duration,
  formatFileSize as bytes,
} from '@/utils/format';

const props = withDefaults(defineProps<{
  item: Record<string, any>;
  /** Fiche Plex du fichier (voir `/technical`) ; absente tant qu'elle charge ou si Plex echoue. */
  technical?: Record<string, any> | null;
  technicalLoading?: boolean;
  technicalError?: boolean;
  hasPrevious?: boolean;
  hasNext?: boolean;
}>(), { technical: null, technicalLoading: false, technicalError: false, hasPrevious: false, hasNext: false });

const emit = defineEmits<{ navigate: [direction: number] }>();

const route = useRoute();
const router = useRouter();
const { addToast } = useToast();
const { actif: enSurface, routeDeFond } = useMediaOverlay();
const { ouvrir } = useOuvrirFiche();

const known = (value: unknown): boolean => Boolean(value) && !/^inconnue?$/i.test(String(value));
const displayTitle = computed(() => (props.item.grandparent_title ? `${props.item.grandparent_title} · ${props.item.title}` : props.item.title));
const eyebrow = computed(() => [
  props.item.grandparent_title || mediaTypeLabel(props.item.media_type),
  props.item.year,
  props.item.duration_ms ? duration(props.item.duration_ms) : '',
  known(props.item.studio) ? props.item.studio : '',
].filter(Boolean).join(' · '));
const resolution = computed(() => resolutionLabel(props.item.video_resolution));

/* Bandeau : le fond Plex du media (serie pour un episode), connu des l'instantane, sinon
   celui de la fiche Plex ou de la bibliotheque. Sans fond du tout, l'affiche floutee
   plutot qu'un bandeau vide. Les vignettes Plex sont demandees a la largeur du bandeau. */
const bannerSource = computed(() => props.technical?.art_url || props.item.art_url || '');
const bannerIsPoster = computed(() => !bannerSource.value && Boolean(props.technical?.poster_url || props.item.thumb_url));
const bannerUrl = computed<string | null>(() => {
  const raw = bannerSource.value || props.technical?.poster_url || props.item.thumb_url || '';
  if (!raw) return null;
  if (raw.startsWith('/api/playback/thumb')) return `${raw}&width=${bannerIsPoster.value ? 400 : 1600}`;
  return proxyUrl(raw, { width: 1600 });
});

/* Debit moyen : celui de Plex quand on l'a, sinon deduit du poids et de la duree. */
const averageBitrate = computed(() => {
  const fromPlex = props.technical?.file?.bitrate_kbps;
  if (fromPlex) return bitrateLabel(fromPlex);
  const size = Number(props.item.size_bytes || 0);
  const seconds = Number(props.item.duration_ms || 0) / 1000;
  return size && seconds ? bitrateLabel((size * 8) / seconds / 1000) : '';
});
const viewersLabel = computed(() => {
  const count = (props.item.viewers || []).length;
  if (!count) return 'aucun spectateur';
  return count === 1 ? `par ${props.item.viewers[0]}` : `par ${count} spectateurs`;
});

interface Fact { label: string; value: string }
const facts = computed<Fact[]>(() => {
  const item = props.item;
  const video = props.technical?.video || null;
  const file = props.technical?.file || null;
  const rows: Array<[string, unknown]> = [
    ['Résolution', video?.width && video?.height ? `${video.width} × ${video.height}${resolution.value ? ` (${resolution.value})` : ''}` : resolution.value],
    ['Codec vidéo', known(item.video_codec) ? [codecLabel(video?.codec || item.video_codec), video?.profile ? video.profile.toUpperCase() : ''].filter(Boolean).join(' · ') : ''],
    ['Plage dynamique', video?.dynamic_range],
    ['Couleur', [video?.bit_depth ? `${video.bit_depth} bits` : '', video?.chroma_subsampling].filter(Boolean).join(' · ')],
    ['Images', [frameRateLabel(video?.frame_rate), video?.scan_type && video.scan_type !== 'progressive' ? video.scan_type : ''].filter(Boolean).join(' · ')],
    ['Débit vidéo', bitrateLabel(video?.bitrate_kbps)],
    ['Conteneur', known(item.container) ? String(file?.container || item.container).toUpperCase() : ''],
    ['Débit total', averageBitrate.value],
    ['Durée', item.duration_ms ? duration(item.duration_ms) : ''],
    ['Bibliothèque', item.library],
    ['Ajouté le', item.added_at ? formatDateShort(item.added_at) : ''],
    ['Versions', file?.versions > 1 ? `${file.versions} fichiers` : ''],
  ];
  return rows.filter(([, value]) => Boolean(value)).map(([label, value]) => ({ label, value: String(value) }));
});

const mediaPath = computed(() => {
  const libraryId = props.technical?.library_item_id;
  return libraryId ? mediaDetailPath({ library_id: libraryId }, 'library') : '';
});
function openMedia(): void {
  if (mediaPath.value) ouvrir(mediaPath.value);
}

const views = computed<any[]>(() => props.item.views || []);
const percentOf = (view: any): number | null => watchedPercent(view.watched_ms, props.item.duration_ms);
const sessionPath = (view: any): string => `/activity/session/${encodeURIComponent(view.session_id)}`;
/* La session s'ouvre dans la feuille, par-dessus la meme page de fond : « retour »
   ramene a ce fichier. Ses fleches parcourent les visionnages du fichier. */
function openSession(event: MouseEvent, view: any): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
  event.preventDefault();
  const ids = views.value.filter((entry) => entry.session_id).map((entry) => entry.session_id);
  void ouvrirFiche(router, sessionPath(view), routeDeFond.value?.fullPath ?? route.fullPath, etatDeVoisins(ids));
}

const itemLink = computed(() => `${window.location.origin}/analytics/item/${encodeURIComponent(props.item.rating_key)}`);
async function copy(text: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    addToast({ type: 'success', message });
  } catch {
    addToast({ type: 'error', message: 'Copie impossible : le presse-papier est refusé par le navigateur.' });
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.analytics-item { display: grid; gap: var(--space-5); min-width: 0; }
.item-poster { display: block; width: 116px; padding: 0; border: 0; border-radius: var(--radius-md); background: none; box-shadow: var(--shadow-md); overflow: hidden; }
button.item-poster { cursor: pointer; transition: transform var(--motion-duration-fast) var(--motion-ease-standard); }
button.item-poster:hover { transform: translateY(-2px); }
button.item-poster:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.item-heading { display: grid; gap: 6px; min-width: 0; }
.item-heading > span { color: var(--muted); font-size: var(--fs-sm); }
.item-heading h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-2xl); line-height: 1.15; overflow-wrap: anywhere; }
.item-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 0; padding: 0; list-style: none; }
.item-tags li { display: inline-flex; align-items: center; min-height: 24px; padding: 0 8px; border-radius: var(--radius-xs); background: var(--surface-3); color: var(--text-secondary, var(--text)); font-size: var(--fs-xs); font-weight: 650; }
.item-tags li.is-accent { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
.item-toolbar { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: calc(-1 * var(--space-3)); }

.item-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
.item-kpis article { display: grid; gap: 2px; padding: 12px 14px; border-radius: var(--radius-md); background: var(--surface-2); }
.item-kpis span, .item-kpis small { color: var(--muted); font-size: var(--fs-xs); }
.item-kpis strong { font-family: var(--font-display); font-size: var(--fs-xl); font-variant-numeric: tabular-nums; }

.item-section { display: grid; gap: var(--space-3); }
.item-section > header { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.item-section h3 { margin: 0; font-family: var(--font-display); font-size: var(--fs-lg); }
.item-section header small { color: var(--muted); font-size: var(--fs-xs); }
.item-section header small.is-warning { color: var(--amber-text, var(--accent)); }

/* Grille de faits separes d'un filet : lisible d'un coup d'oeil, sans cartes empilees. */
.item-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 0; overflow: hidden; border-radius: var(--radius-md); background: var(--border); }
.item-facts div { padding: 10px 14px; background: var(--surface-2); }
.item-facts dt { color: var(--muted); font-size: var(--fs-xs); }
.item-facts dd { margin: 3px 0 0; font-weight: 650; overflow-wrap: anywhere; }
.item-path { display: flex; align-items: center; gap: var(--space-2); padding: 6px 6px 6px 12px; border-radius: var(--radius-md); background: var(--surface-2); color: var(--muted); }
.item-path > svg { flex: none; width: 16px; }
.item-path code { flex: 1; min-width: 0; overflow: hidden; font-family: var(--font-mono); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }

/* Audio et sous-titres cote a cote : deux listes courtes qu'on compare d'un regard
   (« VF 5.1 et des sous-titres francais ? »). Empilees sur une feuille etroite. */
.item-tracks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); align-items: start; }
.track-group { display: grid; gap: 10px; align-content: start; min-width: 0; height: 100%; padding: 12px 14px; border-radius: var(--radius-md); background: var(--surface-2); }
.track-kind { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: var(--fs-sm); font-weight: 650; }
.track-kind svg { width: 16px; }
.track-kind small { margin-left: auto; min-width: 20px; padding: 1px 7px; border-radius: var(--radius-pill); background: var(--surface-3); color: var(--text); font-size: var(--fs-xs); text-align: center; font-variant-numeric: tabular-nums; }
.track-group ul { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.track-group li { display: grid; gap: 1px; min-width: 0; }
.track-group li strong { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); }
.track-group li strong em { padding: 0 6px; border-radius: var(--radius-xs); background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); font-size: var(--fs-xs); font-style: normal; font-weight: 650; }
.track-group li span { font-size: var(--fs-sm); overflow-wrap: anywhere; }
.track-group li small, .track-group p.is-empty { color: var(--muted); font-size: var(--fs-xs); }
.track-group p { margin: 0; font-size: var(--fs-sm); }

/* Repli du bandeau sur l'affiche : agrandie et floutee, elle ne donne que l'ambiance. */
.item-banner :deep(.is-poster-fallback .ui-hero-backdrop__image) { filter: blur(28px) saturate(1.3); transform: scale(1.25); }

.view-log { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.view-row { display: flex; align-items: center; gap: var(--space-3); padding: 10px 8px; border-radius: var(--radius-md); color: var(--text); text-decoration: none; }
a.view-row { transition: background-color var(--motion-duration-instant) var(--motion-ease-standard); }
a.view-row:hover { background: var(--surface-2); }
a.view-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.view-main { display: grid; flex: 1; gap: 6px; min-width: 0; }
.view-line { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.view-line strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.view-amount { display: inline-flex; gap: 6px; font-size: var(--fs-sm); font-variant-numeric: tabular-nums; white-space: nowrap; }
.view-amount span { color: var(--muted); }
.view-track { height: 4px; overflow: hidden; border-radius: var(--radius-pill); background: var(--surface-3); }
.view-track i { display: block; height: 100%; border-radius: inherit; background: var(--accent); }
.view-track i.is-complete { background: var(--green); }
.view-meta { display: flex; flex-wrap: wrap; gap: 4px var(--space-3); color: var(--muted); font-size: var(--fs-xs); }
.view-meta time { font-variant-numeric: tabular-nums; }
.view-device { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.view-device svg { flex: none; width: 13px; }
.view-chevron { flex: none; width: 16px; color: var(--muted); }
.view-log-empty { margin: 0; color: var(--muted); font-size: var(--fs-sm); }

@container sheet (max-width: 482px) {
  .item-facts { grid-template-columns: 1fr; }
  .item-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .item-kpis article { padding: 10px; }
  .item-tracks { grid-template-columns: 1fr; }
}
@include bp.until(tablet) {
  .item-poster { width: 84px; }
  .item-heading h2 { font-size: var(--fs-xl); }
}
</style>
