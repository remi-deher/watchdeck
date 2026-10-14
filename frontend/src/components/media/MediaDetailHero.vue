<template>
  <!-- La fiche d'un média (gabarit Fiche) : l'en-tête, l'état, les dates clés et les actions sont ceux de
       DetailTemplate ; ce composant ne fait que dire quoi y mettre pour un film, une série ou un
       artiste. Les onglets (`tab-<clé>`) et ce qui accompagne la fiche (`after`) viennent de la page. -->
  <DetailTemplate
    :variant="variant"
    back
    :eyebrow="typeLabel"
    :title="detail.title || ''"
    :icon="isMusic ? Music2 : Film"
    :media="detail"
    :poster-shape="isMusic ? 'square' : 'portrait'"
    :meta="factsLine ? [factsLine] : []"
    :summary="preview && !detail.overview ? '' : overviewText"
    :loading="preview"
    :badges="badges"
    :dates="isMusic ? [] : releaseDates"
    :actions="actions"
    :alert="alert"
    :tabs="tabs"
    :tab="tab"
    @update:tab="$emit('update:tab', $event)"
    @back="$emit('back')"
    @action="onAction"
  >
    <template #identity>
      <!-- Une série détaille sa langue par saison ; un film la porte avec ses badges. -->
      <div v-if="isShow && showLanguageSummary && !preview" class="mdh-language-summary">
        <span v-if="seasonSummary.vf.length" class="badge available">VF : {{ formatSeasonLabel(seasonSummary.vf) }}</span>
        <span v-if="seasonSummary.vfSecondary.length" class="badge language-tag vf-secondary">VF secondaire : {{ formatSeasonLabel(seasonSummary.vfSecondary) }}</span>
        <span v-if="seasonSummary.partial.length" class="badge pending_approval">Partielle : {{ formatSeasonLabel(seasonSummary.partial) }}</span>
        <span v-if="seasonSummary.vo.length" class="badge">VO : {{ formatSeasonLabel(seasonSummary.vo) }}</span>
      </div>
      <!-- La recherche de release d'un film est une fenêtre portée par ce composant ; son bouton
           (une action de l'en-tête) l'ouvre, il n'a donc pas de déclencheur à lui. -->
      <VfUpgradeButton
        v-if="canSearchReleases && !isShow && !preview"
        ref="releaseSearch"
        hide-trigger
        :source-type="releaseSourceType!"
        :source-id="releaseSourceId!"
        scope="movie"
        :media-title="detail.title"
      />
    </template>
    <template v-if="movieLanguage" #badges>
      <li class="is-plain"><MediaLanguageBadge class="badge" :state="detail" /></li>
    </template>
    <template v-for="name in forwarded" :key="name" #[name]="slotProps"><slot :name="name" v-bind="slotProps || {}" /></template>
  </DetailTemplate>
</template>

<script setup lang="ts">
import { isInPlex, mediaAvailabilityBadge } from "@/utils/mediaAvailability";
import { mediaTypeLabel, isMusicType } from '@/utils/labels';
import MediaLanguageBadge from './MediaLanguageBadge.vue';
import { computed, onMounted, ref, useSlots } from 'vue';
import { Download, ExternalLink, Film, Flag, Headphones, Music2, PlusCircle, RefreshCw } from '@lucide/vue';
import { formatPlexWebUrl, openPlexLink } from '@/mediaUrl';
import { formatDateLong } from '@/utils/format';
import { useDownloadSources } from '@/composables/useDownloadSources';
import VfUpgradeButton from '@/components/media/VfUpgradeButton.vue';
import DetailTemplate from '@/components/templates/DetailTemplate.vue';
import type { DetailAction, DetailBadge, DetailTab } from '@/components/templates/DetailTemplate.vue';

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
    /** Parties de la fiche (onglets) et celle qui est ouverte ; leur contenu vient des emplacements `tab-<cle>`. */
    tabs?: DetailTab[];
    tab?: string;
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
    tabs: () => [],
    tab: '',
  }
);

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


const plexWebUrl = computed(() => formatPlexWebUrl(props.detail?.plex_guid));
const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'report-issue'): void;
  (e: 'scan'): void;
  (e: 'open-audio'): void;
  (e: 'request'): void;
  (e: 'update:tab', key: string): void;
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

/* Le gabarit parle en tons ; la fiche, en variantes de pastilles. */
function toneOf(variant?: string): DetailBadge['tone'] {
  const value = String(variant || '');
  if (/in-plex|available/.test(value)) return 'success';
  if (/failed|rejected|error/.test(value)) return 'danger';
  if (/pending|sent|download|importing|approval/.test(value)) return 'warning';
  return 'neutral';
}
/* L'état de la demande, puis la présence dans Plex : les badges de l'en-tête. */
const badges = computed<DetailBadge[]>(() => [
  ...(kickerStatus.value ? [{ key: 'status', label: kickerStatus.value.label, tone: toneOf(kickerStatus.value.variant) }] : []),
  ...(plexStatus.value ? [{ key: 'plex', label: plexStatus.value.label, tone: toneOf(plexStatus.value.variant) }] : []),
]);
const alert = computed(() => (waitingReason.value && !isMusic.value ? { tone: 'info' as const, message: String(waitingReason.value) } : null));

/* Les actions : la demande ou Plex en avant, le téléchargement ensuite ; le reste (analyse, liens
   externes, signalement) dans le menu. Rien tant que la fiche complète n'est pas là. */
const actions = computed<DetailAction[]>(() => {
  if (props.preview) return [];
  const list: DetailAction[] = [];
  if (canRequest.value && !isMusic.value) list.push({ key: 'request', label: isShow.value ? 'Demander la série' : 'Demander ce film', icon: PlusCircle, disabled: props.busy });
  if (plexWebUrl.value) list.push({ key: 'plex', label: isMusic.value ? 'Écouter sur Plex' : 'Regarder sur Plex', icon: isMusic.value ? Headphones : Film });
  if (canDownload.value) list.push({ key: 'download', label: isShow.value ? 'Télécharger la série' : 'Télécharger le film', icon: Download, count: releaseCount.value || undefined });
  if (!isMusic.value) {
    list.push({ key: 'scan', label: 'Analyser', icon: RefreshCw, menu: true, disabled: props.busy || !props.available });
    externalLinks.value.forEach((link, index) => list.push({ key: `link-${link.label}`, label: link.label, icon: ExternalLink, href: link.href, menu: true, separated: index === 0 }));
    list.push({ key: 'report-issue', label: 'Signaler un problème', icon: Flag, danger: true, menu: true, separated: true });
  }
  return list;
});
function onAction(key: string): void {
  if (key === 'request') emit('request');
  else if (key === 'plex') openPlexLink(props.detail?.plex_guid);
  else if (key === 'download') searchReleases();
  else if (key === 'scan') emit('scan');
  else if (key === 'report-issue') emit('report-issue');
}

const slots = useSlots();
const forwarded = computed(() => Object.keys(slots).filter((name) => name.startsWith('tab-') || name === 'after'));
</script>
<style scoped lang="scss">
/* Le détail par saison, sous le résumé (une série). */
.mdh-language-summary { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
