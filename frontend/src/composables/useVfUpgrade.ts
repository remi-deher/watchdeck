import { ref, type Ref } from 'vue';
import { humanizeError } from '@/utils/apiError';
import { api } from '@/api';
import type { VfUpgradeItem } from '@/types/vfUpgrades';

/* Une fiche de serie porte un bouton par saison et par episode, et chacun lisait les
   suggestions du meme media a son montage : des dizaines de requetes identiques, chacune
   rafraichissant l'etat cote serveur. Les lectures simultanees d'un meme media partagent
   desormais une seule requete ; un rechargement apres une action (`fresh`) en relance une. */
const enCours = new Map<string, Promise<{ suggestions?: VfUpgradeItem[] }>>();

function lireSuggestions(sourceType: string, sourceId: number | string, fresh: boolean) {
  const cle = `${sourceType}:${sourceId}`;
  const partagee = enCours.get(cle);
  if (partagee && !fresh) return partagee;
  const requete = api<{ suggestions?: VfUpgradeItem[] }>(
    `/api/vf-upgrades?source_type=${sourceType}&source_id=${sourceId}`
  ).finally(() => { if (enCours.get(cle) === requete) enCours.delete(cle); });
  enCours.set(cle, requete);
  return requete;
}

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

  async function load({ preserveFeedback = false, fresh = false }: { preserveFeedback?: boolean; fresh?: boolean } = {}): Promise<void> {
    loading.value = true;
    error.value = '';
    if (!preserveFeedback) feedback.value = '';
    try {
      const data = await lireSuggestions(sourceType, sourceId, fresh);
      suggestion.value = (data.suggestions || []).find(matches) || null;
    } catch (e: any) {
      error.value = humanizeError(e);
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
      await load({ preserveFeedback: true, fresh: true });
    } catch (e: any) {
      error.value = humanizeError(e);
    } finally {
      scanning.value = false;
    }
  }

  /* `force` est faux par defaut : il desarme les garde-fous du serveur (release refusee
     par le profil *arr, regression technique -- voir services/vf_technical_guard.py) et
     ne doit donc etre demande que par un appelant qui vient d'obtenir une confirmation
     explicite de l'utilisateur. */
  async function grab(release: any, { force = false }: { force?: boolean } = {}): Promise<void> {
    if (!suggestion.value) return;
    grabbing.value = release.guid;
    error.value = '';
    try {
      const result = await api<any>(`/api/vf-upgrades/${suggestion.value.id}/grab`, {
        method: 'POST',
        body: JSON.stringify({ guid: release.guid, indexer_id: release.indexer_id, force }),
      });
      feedback.value = result.message || 'Release acceptee par Sonarr/Radarr.';
      await load({ preserveFeedback: true, fresh: true });
    } catch (e: any) {
      error.value = humanizeError(e);
    } finally {
      grabbing.value = null;
    }
  }

  async function dismiss(): Promise<void> {
    if (!suggestion.value) return;
    error.value = '';
    try {
      await api(`/api/vf-upgrades/${suggestion.value.id}/dismiss`, { method: 'POST' });
      await load({ fresh: true });
    } catch (e: any) {
      error.value = humanizeError(e);
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
