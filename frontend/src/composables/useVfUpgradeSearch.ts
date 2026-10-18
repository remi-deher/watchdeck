import { computed, ref } from 'vue';
import { api } from '@/api';
import { humanizeError } from '@/utils/apiError';
import { isPublished, isRejected, releaseComparison, type ReleaseComparison } from '@/utils/releaseComparison';
import { releaseDecisionScore, translateRejection } from '@/utils/releaseTitle';
import type { VfUpgradeRelease } from '@/types/vfUpgrades';
import { useVfUpgrade } from '@/composables/useVfUpgrade';

/** Portée de la recherche : le média et, au besoin, sa saison ou son épisode. */
export interface VfUpgradeSearchTarget {
  sourceType: string;
  sourceId: number;
  scope: string;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  accepted: 'Acceptée par *arr',
  downloading: 'Téléchargement en cours',
  importing: 'Import en cours',
  awaiting_verification: 'Vérification VF en attente',
  verified: 'VF vérifiée',
  grabbed: 'Envoyée à *arr',
};

/* Recherche de release d'un média, en deux modes : toutes les releases (recherche *arr
   classique) ou la suggestion VF (useVfUpgrade). Tri, rejets, comparatif technique et
   grab, avec confirmation pour une release à risque. `target` est lu à chaque appel ;
   `onUpdated` prévient l'appelant après une recherche ou un grab. */
export function useVfUpgradeSearch(target: VfUpgradeSearchTarget, onUpdated: () => void) {
  const { suggestion, loading, scanning, grabbing, error, feedback, scanSummary, load, scan, grab } =
    useVfUpgrade(target.sourceType, target.sourceId, target.scope, target.seasonNumber ?? null, target.episodeNumber ?? null);
  const hideRejected = ref(false);
  const confirmRelease = ref<VfUpgradeRelease | any | null>(null);
  const mode = ref<'all' | 'vf'>('all');
  const normalReleases = ref<VfUpgradeRelease[]>([]);
  const normalLoading = ref(false);
  let loaded = false;

  const vfReleases = computed(() => (suggestion.value?.releases || []) as VfUpgradeRelease[]);
  const activeReleases = computed(() => (mode.value === 'vf' ? vfReleases.value : normalReleases.value));
  const publishedReleases = computed(() => activeReleases.value.filter(isPublished));
  const hasSuggestion = computed(() => Boolean(publishedReleases.value.length));
  const isActiveOrVerified = computed(() => ['accepted', 'downloading', 'importing', 'awaiting_verification', 'verified', 'grabbed'].includes(suggestion.value?.status || ''));
  const statusLabel = computed(() => (suggestion.value?.status && STATUS_LABELS[suggestion.value.status]) || 'Suggestion');
  const sortedReleases = computed(() => [...publishedReleases.value].sort((a, b) => releaseDecisionScore(a) - releaseDecisionScore(b)));
  const visibleReleases = computed(() => (hideRejected.value ? sortedReleases.value.filter((release) => !isRejected(release)) : sortedReleases.value));
  const modeOptions = computed(() => [
    { value: 'all' as const, label: 'Toutes les releases', count: normalReleases.value.filter(isPublished).length },
    { value: 'vf' as const, label: 'VF', count: vfReleases.value.filter(isPublished).length },
  ]);
  const rejectedCount = computed(() => sortedReleases.value.filter(isRejected).length);
  const searching = computed(() => scanning.value || normalLoading.value);
  const grabDisabled = computed(() => mode.value === 'vf' && isActiveOrVerified.value);
  const arrName = computed(() => (target.scope === 'movie' ? 'Radarr' : 'Sonarr'));
  const hasCurrentComparison = computed(() => Boolean(suggestion.value?.current_release_titles?.length));
  const emptyMessage = computed(() =>
    mode.value === 'vf' && (scanSummary.value?.raw ?? 0) > 0
      ? 'Des releases existent, mais aucune ne correspond aux critères VF configurés.'
      : 'Aucune release retournée par les indexeurs pour cette portée.'
  );
  const feedbackClass = computed(() => (scanSummary.value?.matched === 0 && !isActiveOrVerified.value ? 'warning-text' : 'success-text'));
  const confirmWarnings = computed(() =>
    confirmRelease.value
      ? [...comparisonFor(confirmRelease.value).warnings, ...(confirmRelease.value.rejections || []).map(translateRejection)]
      : []
  );

  function comparisonFor(release: any): ReleaseComparison {
    return releaseComparison(release, suggestion.value?.current_release_titles || []);
  }

  async function copyTitle(title: string | undefined): Promise<void> {
    if (!title) return;
    try {
      await navigator.clipboard.writeText(title);
      feedback.value = 'Nom de la release copié.';
    } catch {
      feedback.value = 'Impossible de copier automatiquement ce nom.';
    }
  }

  async function grabNormal(release: any): Promise<void> {
    grabbing.value = release.guid;
    error.value = '';
    try {
      const result = await api<{ message?: string }>('/api/arr/grab', {
        method: 'POST',
        body: JSON.stringify({
          media_type: target.scope === 'movie' ? 'movie' : 'show',
          guid: release.guid,
          indexer_id: release.indexer_id,
          instance_id: release.arr_instance_id,
          source_type: target.sourceType,
          source_id: target.sourceId,
          scope: target.scope,
          season_number: target.seasonNumber,
          episode_number: target.episodeNumber,
        }),
      });
      feedback.value = result.message || 'Release envoyée à *arr.';
      await load({ preserveFeedback: true });
      onUpdated();
    } catch (e: any) {
      error.value = humanizeError(e);
    } finally {
      grabbing.value = null;
    }
  }

  async function requestGrab(release: any): Promise<void> {
    if (
      isRejected(release)
      || release.vf_technical_blocked
      || (mode.value === 'vf' && comparisonFor(release).warnings.length)
    ) {
      confirmRelease.value = release;
      return;
    }
    if (mode.value === 'vf') {
      /* Volontairement SANS `force` : ce chemin est celui d'une release qu'on croit
         saine. Forcer systématiquement ici désarmait les garde-fous du serveur (release
         refusée par le profil *arr, régression technique) pour tout grab passant par
         cette interface. Une release à risque passe par la confirmation ci-dessous, qui
         est le seul endroit légitime pour forcer. */
      await grab(release);
      onUpdated();
    } else {
      await grabNormal(release);
    }
  }

  async function confirmGrab(): Promise<void> {
    const release = confirmRelease.value;
    if (!release) return;
    if (mode.value === 'vf') {
      await grab(release, { force: true });
      onUpdated();
    } else {
      await grabNormal(release);
    }
    if (!error.value) confirmRelease.value = null;
  }

  async function searchNormal(): Promise<void> {
    normalLoading.value = true;
    error.value = '';
    feedback.value = '';
    try {
      const params = new URLSearchParams({
        media_type: target.scope === 'movie' ? 'movie' : 'show',
        source_type: target.sourceType,
        source_id: String(target.sourceId),
        prefer_french: 'false',
      });
      if (target.seasonNumber != null) params.set('season_number', String(target.seasonNumber));
      if (target.episodeNumber != null) params.set('episode_number', String(target.episodeNumber));
      normalReleases.value = await api<VfUpgradeRelease[]>(`/api/arr/releases?${params}`);
    } catch (e: any) {
      error.value = humanizeError(e);
    } finally {
      normalLoading.value = false;
    }
  }

  async function runSearch(): Promise<void> {
    await Promise.allSettled([scan(), searchNormal()]);
    onUpdated();
  }

  async function selectMode(value: 'all' | 'vf'): Promise<void> {
    mode.value = value;
    if (value === 'all' && !normalReleases.value.length) await searchNormal();
    if (value === 'vf') {
      await load();
      if (!hasSuggestion.value) await scan();
    }
  }

  function handleModeChange(value: string | number): void {
    if (value === 'all' || value === 'vf') void selectMode(value);
  }

  /* Première ouverture : suggestion VF et recherche classique, une seule fois. */
  async function loadOnce(): Promise<void> {
    if (loaded) return;
    loaded = true;
    await Promise.allSettled([load(), searchNormal()]);
  }

  return {
    suggestion,
    loading,
    grabbing,
    error,
    feedback,
    mode,
    hideRejected,
    confirmRelease,
    publishedReleases,
    hasSuggestion,
    isActiveOrVerified,
    statusLabel,
    visibleReleases,
    modeOptions,
    rejectedCount,
    searching,
    grabDisabled,
    arrName,
    hasCurrentComparison,
    emptyMessage,
    feedbackClass,
    confirmWarnings,
    comparisonFor,
    copyTitle,
    requestGrab,
    confirmGrab,
    runSearch,
    handleModeChange,
    load,
    loadOnce,
  };
}
