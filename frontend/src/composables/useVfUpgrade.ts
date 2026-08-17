import { ref, type Ref } from 'vue';
import { api } from '@/api';
import type { VfUpgradeItem } from '@/types/vfUpgrades';

export function useVfUpgrade(
  sourceType: string,
  sourceId: number | string,
  scope: string,
  seasonNumber: number | null = null,
  episodeNumber: number | null = null
) {
  const suggestion = ref<VfUpgradeItem | null>(null);
  const loading = ref(false);
  const scanning = ref(false);
  const grabbing = ref<string | null>(null);
  const error = ref('');
  const feedback = ref('');
  const scanSummary = ref<{ matched: number; raw: number } | null>(null);

  function matches(s: VfUpgradeItem): boolean {
    return s.scope === scope && s.season_number === seasonNumber && s.episode_number === episodeNumber;
  }

  async function load({ preserveFeedback = false }: { preserveFeedback?: boolean } = {}): Promise<void> {
    loading.value = true;
    error.value = '';
    if (!preserveFeedback) feedback.value = '';
    try {
      const data = await api<{ suggestions?: VfUpgradeItem[] }>(
        `/api/vf-upgrades?source_type=${sourceType}&source_id=${sourceId}`
      );
      suggestion.value = (data.suggestions || []).find(matches) || null;
    } catch (e: any) {
      error.value = e?.message || String(e);
    } finally {
      loading.value = false;
    }
  }

  async function scan(): Promise<void> {
    scanning.value = true;
    error.value = '';
    try {
      const result = await api<any>('/api/vf-upgrades/scan', {
        method: 'POST',
        body: JSON.stringify({
          source_type: sourceType,
          source_id: sourceId,
          scope,
          season_number: seasonNumber,
          episode_number: episodeNumber,
        }),
      });
      scanSummary.value = { matched: result.found || 0, raw: result.raw_found ?? result.found ?? 0 };
      feedback.value = result.found
        ? `${result.found} release(s) VF correspondant aux critères.`
        : result.raw_found
          ? `${result.raw_found} release(s) trouvée(s), mais toutes ont été écartées par les critères VF.`
          : 'Aucune release retournée par les indexeurs.';
      await load({ preserveFeedback: true });
    } catch (e: any) {
      error.value = e?.message || String(e);
    } finally {
      scanning.value = false;
    }
  }

  async function grab(release: any, { force = true }: { force?: boolean } = {}): Promise<void> {
    if (!suggestion.value) return;
    grabbing.value = release.guid;
    error.value = '';
    try {
      const result = await api<any>(`/api/vf-upgrades/${suggestion.value.id}/grab`, {
        method: 'POST',
        body: JSON.stringify({ guid: release.guid, indexer_id: release.indexer_id, force }),
      });
      feedback.value = result.message || 'Release acceptee par Sonarr/Radarr.';
      await load({ preserveFeedback: true });
    } catch (e: any) {
      error.value = e?.message || String(e);
    } finally {
      grabbing.value = null;
    }
  }

  async function dismiss(): Promise<void> {
    if (!suggestion.value) return;
    error.value = '';
    try {
      await api(`/api/vf-upgrades/${suggestion.value.id}/dismiss`, { method: 'POST' });
      await load();
    } catch (e: any) {
      error.value = e?.message || String(e);
    }
  }

  return {
    suggestion,
    loading,
    scanning,
    grabbing,
    error,
    feedback,
    scanSummary,
    load,
    scan,
    grab,
    dismiss,
  };
}
