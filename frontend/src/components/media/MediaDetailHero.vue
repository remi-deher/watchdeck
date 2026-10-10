<template>
  <!-- En-tete commun des fiches (SheetHero) : l'image seule dans la banniere, l'affiche
       qui en chevauche le bas, le texte dessous. Les classes `mdh-*` restent posees sur
       les memes elements : la feuille (MediaOverlay) et les tests s'y appuient. -->
  <SheetHero
    class="mdh"
    :class="{ 'is-music-hero': isMusic }"
    banner-class="mdh-hero"
    content-class="mdh-content"
    :row-class="['mdh-row', { 'is-music': isMusic }]"
    :image-url="backdropUrl"
    :position="variant === 'sheet' ? 'center 18%' : undefined"
    :variant="variant"
    stack-on-mobile
    fade
  >
    <template #overlay>
      <button class="mdh-back icon-button" title="Retour" aria-label="Retour" @click="$emit('back')"><ArrowLeft /></button>
    </template>
    <template #poster>
        <div class="mdh-poster" :class="{ 'is-music': isMusic }">
          <img v-if="detail.poster_url && !posterFailed" class="mdh-poster-img" @error="posterFailed = true" :src="proxyUrl(detail.poster_url, { width: 780 }) ?? undefined" :srcset="srcSetFor(detail.poster_url, { width: 780 })" alt="" loading="eager" fetchpriority="high" decoding="async" sizes="(max-width: 767px) 140px, 220px">
          <div v-else class="mdh-poster-fallback">
            <Music2 v-if="isMusic" />
            <Film v-else />
          </div>
        </div>
    </template>
        <div class="mdh-info">
          <!-- Le type, et juste a cote l'etat de la demande (Demande, En telechargement...).
               La presence dans Plex et la langue vivent sous l'affiche. -->
          <div class="mdh-kicker">
            <span class="eyebrow">{{ typeLabel }}</span>
            <span v-if="kickerStatus" class="badge mdh-status" :class="kickerStatus.variant">{{ kickerStatus.label }}</span>
          </div>
          <h1>{{ detail.title }}</h1>
          <!-- Annee, note et genres tiennent en une phrase : trois lignes de pastilles en moins.
               L'origine (demande Seerr, ajout *ARR) vit dans l'onglet Demandes, qui la detaille. -->
          <p v-if="factsLine" class="mdh-facts">{{ factsLine }}</p>
          <!-- Une serie detaille sa langue par saison ; un film la porte sous l'affiche. -->
          <div v-if="isShow && showLanguageSummary && !preview" class="mdh-language-summary">
            <span v-if="seasonSummary.vf.length" class="badge available">VF : {{ formatSeasonLabel(seasonSummary.vf) }}</span>
            <span v-if="seasonSummary.vfSecondary.length" class="badge language-tag vf-secondary">VF secondaire : {{ formatSeasonLabel(seasonSummary.vfSecondary) }}</span>
            <span v-if="seasonSummary.partial.length" class="badge pending_approval">Partielle : {{ formatSeasonLabel(seasonSummary.partial) }}</span>
            <span v-if="seasonSummary.vo.length" class="badge">VO : {{ formatSeasonLabel(seasonSummary.vo) }}</span>
          </div>
          <p v-if="waitingReason && !isMusic" class="mdh-waiting">{{ waitingReason }}</p>
          <div v-if="preview && !detail.overview" class="mdh-overview-wrapper" aria-hidden="true">
            <span class="skeleton-line" /><span class="skeleton-line" /><span class="skeleton-line is-short" />
          </div>
          <div v-else class="mdh-overview-wrapper">
            <SheetSummary class="mdh-overview" :text="overviewText" :lines="4" />
          </div>
          <!-- La recherche de release d'un film est une fenetre portee par ce composant ; son
               bouton l'ouvre, il n'a donc pas de declencheur a lui. -->
          <VfUpgradeButton
            v-if="canSearchReleases && !isShow && !preview"
            ref="releaseSearch"
            hide-trigger
            :source-type="releaseSourceType!"
            :source-id="releaseSourceId!"
            scope="movie"
            :media-title="detail.title"
          />
        </div>
    <!-- Sous l'affiche : presence Plex et langue sur une seule ligne, les dates si le resume
         les laisse la, puis les actions. -->
    <template #below>
      <div v-if="posterBadges" class="mdh-poster-badges">
        <span v-if="plexStatus" class="badge mdh-status" :class="plexStatus.variant">{{ plexStatus.label }}</span>
        <MediaLanguageBadge v-if="movieLanguage" class="badge" :state="detail" />
      </div>
      <dl v-if="releaseDates.length && !isMusic && !datesBeside" class="mdh-dates">
        <div v-for="entry in releaseDates" :key="entry.label">
          <dt>{{ entry.label }}</dt>
          <dd>{{ entry.value }}</dd>
        </div>
      </dl>
      <div v-if="preview" class="mdh-links" aria-hidden="true">
        <span class="skeleton-pill" /><span class="skeleton-pill" />
      </div>
      <div v-else class="mdh-links">
        <button
          v-if="canRequest && !isMusic"
          type="button"
          class="primary-button mdh-listen-btn mdh-request-btn"
          :disabled="busy"
          @click="$emit('request')"
        >
          <PlusCircle :size="16" /> {{ isShow ? 'Demander la série' : 'Demander ce film' }}
        </button>
        <button v-if="plexWebUrl" type="button" class="primary-button mdh-listen-btn" @click="openPlexLink(detail?.plex_guid)">
          <Headphones v-if="isMusic" :size="16" /><Film v-else :size="16" /> {{ isMusic ? 'Écouter sur Plex' : 'Regarder sur Plex' }}
        </button>
        <!-- Le bouton suit le type : Radarr pour un film, Sonarr (recherche par saison) pour une
             serie. Absent tant que l'*arr correspondant n'est pas configure. -->
        <button
          v-if="canDownload"
          type="button"
          class="mdh-download-btn"
          :title="isShow ? 'Recherche par saison dans Sonarr' : 'Recherche de versions dans Radarr'"
          @click="searchReleases"
        >
          <Download :size="16" /> {{ isShow ? 'Télécharger la série' : 'Télécharger le film' }}<small v-if="releaseCount" class="mdh-menu-count">{{ releaseCount }}</small>
        </button>
        <!-- Le reste des actions tient dans un menu : une seule action principale par fiche. -->
        <UiMenu v-if="!isMusic" class="mdh-more-menu" align="end" label="Actions">
          <template #trigger>
            <UiButton icon-only class="mdh-more" title="Plus d’actions" aria-label="Plus d’actions"><Ellipsis /></UiButton>
          </template>
          <UiMenuItem :disabled="busy || !available" @select="$emit('scan')"><RefreshCw :size="15" /> Analyser</UiMenuItem>
          <UiMenuSeparator v-if="externalLinks.length" />
          <UiMenuItem v-for="link in externalLinks" :key="link.label" @select="openExternal(link.href)">
            <ExternalLink :size="15" /> {{ link.label }}
          </UiMenuItem>
          <UiMenuSeparator />
          <UiMenuItem variant="danger" @select="$emit('report-issue')"><Flag :size="15" /> Signaler un problème</UiMenuItem>
        </UiMenu>
      </div>
    </template>
    <!-- Resume court : les dates passent a droite, au niveau de ce qui est sous l'affiche, pour
         equilibrer le haut de la feuille sans casser la separation. -->
    <template v-if="releaseDates.length && !isMusic && datesBeside" #extra>
      <dl class="mdh-dates is-beside">
        <div v-for="entry in releaseDates" :key="entry.label">
          <dt>{{ entry.label }}</dt>
          <dd>{{ entry.value }}</dd>
        </div>
      </dl>
    </template>
  </SheetHero>
</template>

<script setup lang="ts">
import { isInPlex, mediaAvailabilityBadge } from "@/utils/mediaAvailability";
import { proxyUrl, srcSetFor } from '@/utils/mediaImage';
import { mediaTypeLabel, isMusicType } from '@/utils/labels';
import MediaLanguageBadge from './MediaLanguageBadge.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { ArrowLeft, Download, Ellipsis, ExternalLink, Film, Flag, Headphones, Music2, PlusCircle, RefreshCw, Search } from '@lucide/vue';
import { formatPlexWebUrl, openPlexLink } from '@/mediaUrl';
import { formatDateLong } from '@/utils/format';
import { useDownloadSources } from '@/composables/useDownloadSources';
import VfUpgradeButton from '@/components/media/VfUpgradeButton.vue';
import SheetHero from '@/components/ui/SheetHero.vue';
import SheetSummary from '@/components/ui/SheetSummary.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue';

export interface SeasonSummaryGroup {
  vf: number[];
  vfSecondary: number[];
  vo: number[];
  partial: number[];
}

const props = withDefaults(
  defineProps<{
    detail: any;
    statusLabel?: string;
    statusClass?: string;
    admin?: boolean;
    seasonSummary?: SeasonSummaryGroup;
    busy?: boolean;
    available?: boolean;
    /** Donnees partielles de la carte touchee, en attendant la fiche : pas d'actions. */
    preview?: boolean;
    variant?: 'card' | 'sheet';
  }>(),
  {
    statusLabel: '',
    statusClass: '',
    admin: false,
    seasonSummary: () => ({ vf: [], vfSecondary: [], vo: [], partial: [] }),
    busy: false,
    available: true,
    preview: false,
    variant: 'card',
  }
);

/* Fond du hero : l'URL du serveur est une vignette de 600 px, floue une fois etiree sur
   toute la largeur. On demande une variante assez large pour l'ecran. */
const backdropUrl = computed(() => (props.detail?.backdrop_url ? proxyUrl(props.detail.backdrop_url, { kind: 'backdrop' }) : null));

/* Affiche introuvable (Plex a change son chemin, source disparue) : le repli plutot
   qu'une image cassee. */
const posterFailed = ref(false);
watch(() => props.detail?.poster_url, () => { posterFailed.value = false; });



const isMusic = computed(() => isMusicType(props.detail?.media_type));
const isShow = computed(() => props.detail?.media_type === 'show');
const availabilityStatus = computed(() => props.detail?.availability ? mediaAvailabilityBadge(props.detail) : null);
const canRequest = computed(() => !isInPlex(props.detail || {}) && !props.detail?.requested && !props.detail?.request_id);

const releaseSourceType = computed<'library_item' | 'request' | null>(() => {
  if (props.detail?.vf_source_type === 'library' || props.detail?.library_id || props.detail?._kind === 'library') {
    return 'library_item';
  }
  if (props.detail?.vf_source_type === 'request' || props.detail?.request_id || props.detail?._kind === 'request') {
    return 'request';
  }
  return null;
});

const releaseSourceId = computed<number | null>(() => {
  if (props.detail?.vf_source_id) return Number(props.detail.vf_source_id);
  if (props.detail?.library_id) return Number(props.detail.library_id);
  if (props.detail?._kind === 'library' && props.detail?.id) return Number(props.detail.id);
  if (props.detail?.request_id) return Number(props.detail.request_id);
  if (props.detail?._kind === 'request' && props.detail?.id) return Number(props.detail.id);
  return null;
});

/* Radarr pour un film, Sonarr pour une serie : le bouton « Telecharger » n'existe que si
   l'*arr du type est configure et actif. La liste n'est lue que pour un administrateur. */
const { arrInstances, load: loadArrInstances } = useDownloadSources();
onMounted(() => { if (props.admin) void loadArrInstances(); });
const hasArr = computed(() => {
  const kind = isShow.value ? 'sonarr' : 'radarr';
  return arrInstances.value.some((instance: any) => instance.arr_type === kind && instance.enabled !== false);
});
const canDownload = computed(() => canSearchReleases.value && hasArr.value && !props.preview);

const canSearchReleases = computed(() => {
  if (!props.admin || isMusic.value) return false;
  return Boolean(releaseSourceType.value && releaseSourceId.value);
});

/* « 2024 · ★ 7,8 · Science-fiction, Aventure » : ce que les pastilles d'annee, de note et de
   genres disaient, sur une ligne. */
const waitingReason = computed(() => props.detail?.journey
  ? props.detail.journey.blocker?.label || props.detail.journey.next_step?.label
  : props.detail?.waiting_reason);
const factsLine = computed(() => {
  const d = props.detail || {};
  return [d.year, d.vote ? `★ ${d.vote}` : '', d.genres?.length ? d.genres.join(', ') : '']
    .filter(Boolean)
    .join(' · ');
});
/* L'etat de la demande se lit a cote du type ; la presence dans Plex se lit sous l'affiche,
   avec la langue. */
const status = computed(() => (!isMusic.value && (availabilityStatus.value || (props.statusLabel ? { label: props.statusLabel, variant: props.statusClass } : null))) || null);
const plexStatus = computed(() => (status.value?.variant === 'in-plex' ? status.value : null));
const kickerStatus = computed(() => (status.value && !plexStatus.value ? status.value : null));
const posterBadges = computed(() => Boolean(plexStatus.value || movieLanguage.value));
/* Un film porte sa langue sous l'affiche ; une serie, le detail par saison. */
const movieLanguage = computed(() => !isShow.value && !props.preview && showLanguageSummary.value);

const releaseSearch = ref<InstanceType<typeof VfUpgradeButton> | null>(null);
const releaseCount = computed(() => releaseSearch.value?.count || 0);
function searchReleases(): void {
  if (isShow.value) emit('open-audio');
  else releaseSearch.value?.toggle();
}

const externalLinks = computed(() => {
  const d = props.detail || {};
  const links: { label: string; href: string }[] = [];
  if (d.imdb_id) links.push({ label: 'IMDb', href: `https://www.imdb.com/title/${d.imdb_id}` });
  if (d.tmdb_id) links.push({ label: 'TMDB', href: `https://www.themoviedb.org/${d.media_type === 'show' ? 'tv' : 'movie'}/${d.tmdb_id}` });
  if (props.admin && d.arr_url) links.push({ label: d.media_type === 'movie' ? 'Radarr' : 'Sonarr', href: d.arr_url });
  return links;
});
function openExternal(href: string): void {
  window.open(href, '_blank', 'noopener,noreferrer');
}


const plexWebUrl = computed(() => formatPlexWebUrl(props.detail?.plex_guid));
const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'report-issue'): void;
  (e: 'scan'): void;
  (e: 'open-audio'): void;
  (e: 'request'): void;
}>();

const hasSeasonSummary = computed(() => Boolean(
  props.seasonSummary?.vf?.length || props.seasonSummary?.vfSecondary?.length
  || props.seasonSummary?.vo?.length || props.seasonSummary?.partial?.length
));

const showLanguageSummary = computed(() => {
  if (isMusic.value) return false;
  return isShow.value ? hasSeasonSummary.value : props.detail?.has_vf != null;
});

/** "1, 2, 3, 5, 7, 8" -> "1-3, 5, 7-8" : regroupe les saisons consecutives. */
function formatSeasonLabel(seasonNumbers: number[]): string {
  const sorted = [...seasonNumbers].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = n;
  }
  const label = ranges.length > 1 ? 'Saisons' : 'Saison';
  return `${label} ${ranges.join(', ')}`;
}

const overviewText = computed(() => props.detail.overview || (isMusic.value ? 'Aucune biographie disponible pour cet artiste.' : 'Aucun résumé disponible.'));
/* Resume court : le haut de la feuille serait dechire entre une colonne chargee (sous l'affiche)
   et une colonne vide. Les dates passent alors a droite. */
const SHORT_OVERVIEW = 200;
const datesBeside = computed(() => !props.preview && overviewText.value.length < SHORT_OVERVIEW);

const typeLabel = computed(() => mediaTypeLabel(props.detail.media_type));

function formatDate(value: any): string {
  return formatDateLong(value, '');
}

const releaseDates = computed(() => {
  const d = props.detail;
  if (d.media_type === 'movie') {
    const dates = d.release_dates || {};
    return [
      { key: 'cinema', label: 'Cinéma', value: formatDate(dates.cinema) },
      { key: 'plateforme', label: 'Plateforme', value: formatDate(dates.plateforme) },
      { key: 'dvd_bluray', label: 'DVD / Blu-ray', value: formatDate(dates.dvd_bluray) },
    ].filter((entry) => entry.value);
  }
  if (d.media_type === 'show') {
    const nextEpisode = d.next_episode_to_air?.air_date;
    return [
      { key: 'next_episode', label: 'Prochain épisode', value: formatDate(nextEpisode) },
      { key: 'first_air', label: 'Première diffusion', value: formatDate(d.first_air_date) },
      { key: 'season_air', label: 'Saison en cours depuis', value: formatDate(d.current_season_air_date) },
    ].filter((entry) => entry.value);
  }
  return [];
});
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.mdh {
  margin-bottom: var(--space-6);
}
.mdh.is-sheet {
  margin-bottom: var(--space-5);
}
/* Le fondu de la banniere (UiHeroBackdrop `fade`) laisse apparaitre la teinte de la feuille
   (voir MediaDetailView) : l'image s'y retire sans bord ni flou. */
.mdh :deep(.mdh-content) {
  padding: 0 var(--space-5) var(--space-2);
  max-width: 1280px;
  margin: 0 auto;
}
/* Le contenu est ancre en bas : le retour doit rester en haut a gauche, hors du flux,
   sinon il descend avec le titre au fond de la banniere. */
.mdh-back {
  position: absolute;
  top: var(--space-4);
  left: var(--space-4);
  z-index: 3;
}
.mdh-poster {
  flex: 0 0 180px;
  width: 180px;
  aspect-ratio: 2 / 3;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0,0,0,.5);
  background: var(--surface-2);
}
.mdh-poster.is-music {
  flex: 0 0 220px;
  width: 220px;
  height: 220px;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-lg, 12px);
  box-shadow: 0 16px 40px rgba(0,0,0,.6);
}
.mdh-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mdh-poster-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
.mdh-info {
  flex: 1;
  min-width: 0;
  padding-bottom: 4px;
}
.mdh-info > .eyebrow {
  color: var(--accent);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.mdh-info h1 {
  margin: 4px 0 10px;
  color: var(--text);
  font-size: clamp(1.5rem, 3.5vw, 2.3rem);
  font-weight: 800;
  line-height: 1.15;
  text-wrap: balance;
}
.mdh-facts {
  margin: 0 0 10px;
  color: var(--muted);
  font-size: var(--fs-md);
}
.mdh-kicker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
/* Etat de la demande a cote du type, presence Plex sous l'affiche : meme habillage. */
.mdh-status.badge {
  min-height: 24px;
  padding: 2px 10px;
  border-color: color-mix(in srgb, var(--text) 22%, transparent);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-xs);
  font-weight: 800;
  line-height: 1.25;
}
.mdh-status.badge.available,
.mdh-status.badge.in-plex {
  border-color: var(--green-solid);
  background: var(--green-solid);
  color: var(--on-green-solid);
}
/* Presence Plex et langue : une seule ligne, sous l'affiche. */
.mdh-poster-badges {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}
.mdh-poster-badges > .badge { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.mdh-overview-wrapper {
  max-width: 800px;
  margin-bottom: 12px;
}
.mdh-dates {
  display: grid;
  gap: var(--space-2);
  margin: var(--space-3) 0 0;
}
/* Resume court : les dates forment un bloc a droite, au niveau de ce qui est sous l'affiche. */
.mdh-dates.is-beside {
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--space-3) var(--space-5);
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface) 70%, transparent);
}
.mdh-dates > div {
  display: grid;
  gap: 2px;
}
.mdh-dates dt {
  color: var(--muted);
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: .02em;
}
.mdh-dates dd {
  margin: 0;
  color: var(--text);
  font-size: var(--fs-sm);
  font-weight: 650;
}
.mdh-waiting {
  max-width: 760px;
  margin: 0 0 10px;
  padding: 8px 10px;
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--text);
  font-size: var(--fs-sm);
}
.mdh-links {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.mdh-links > .mdh-listen-btn,
.mdh-links > .mdh-download-btn { grid-column: 1; justify-content: center; min-width: 0; }
.mdh-links > .mdh-more-menu { grid-column: 2; grid-row: 1; }
.mdh-links > :only-child { grid-column: 1 / -1; justify-self: start; }
.mdh-language-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: 10px;
}

.mdh-menu-count {
  margin-left: auto;
  color: var(--accent);
  font-weight: 700;
}
.mdh-download-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-sm);
  font-weight: 700;
  cursor: pointer;
}
@media (hover: hover) and (pointer: fine) {
  .mdh-download-btn:hover { background: var(--surface-3); }
}
.mdh-listen-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 700;
  font-size: var(--fs-sm);
  border: 0;
  cursor: pointer;
  transition: transform var(--motion-duration-fast) var(--motion-ease-standard), background-color var(--motion-duration-fast) var(--motion-ease-standard);
}
/* Au doigt, pas de survol : le soulevement restait accroche apres un appui. */
@media (hover: hover) and (pointer: fine) {
  .mdh-listen-btn:hover {
    transform: translateY(-1px);
    background: var(--accent-hover);
  }
}

@include bp.until(tablet) {
  .mdh :deep(.mdh-content) {
    padding: 0 var(--space-4) 20px;
  }
  .mdh-back {
    top: var(--space-2);
    left: var(--space-2);
  }
  .mdh-info { display: flex; flex-direction: column; width: 100%; }
  .mdh-poster {
    flex-basis: auto;
    width: 140px;
  }
  .mdh-poster.is-music {
    width: 180px;
    height: 180px;
  }
  .mdh-kicker,
  .mdh-poster-badges,
  .mdh-language-summary {
    justify-content: center;
  }
  .mdh-facts { text-align: center; }
  .mdh-overview {
    text-align: left;
  }
  .mdh-dates { grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); text-align: left; }
  .mdh-links > .mdh-request-btn,
  .mdh-links > .mdh-listen-btn,
  .mdh-links > .mdh-download-btn { min-height: 44px; }
}

</style>
