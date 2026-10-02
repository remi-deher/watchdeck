import { ref } from 'vue';
import { api } from '@/api';
import type {
  AuditEpisode, AuditSeason, AuditShowDetail, EpisodeAvailability, EpisodeVfState, SeasonCounts,
} from './types';

type BySeason<T> = { seasons?: Array<{ season_number: number; episodes?: Record<number, T> }> };

const emptySeasonCounts = (): SeasonCounts => ({
  vf: 0, vf_secondary: 0, vo: 0, present: 0, absent: 0, tba: 0, unknown: 0,
  sub_fr_no_track: 0, sub_fr_absent: 0, sub_fr_not_default: 0, forced_fr_not_default: 0,
});

/** Episode diffuse plus tard : annonce, pas manquant. */
function airsLater(availability?: EpisodeAvailability): boolean {
  return Boolean(availability?.air_date_utc && new Date(availability.air_date_utc) > new Date());
}

/** Decompte d'une saison : etat VF selon Plex, a defaut disponibilite selon *arr. */
export function computeSeasonCounts(
  availability: Record<number, EpisodeAvailability> = {},
  vfStates: Record<number, EpisodeVfState> = {},
): SeasonCounts {
  const keys = new Set([...Object.keys(availability).map(Number), ...Object.keys(vfStates).map(Number)]);
  const counts = emptySeasonCounts();
  for (const key of keys) {
    const vf = vfStates[key];
    const avail = availability[key];
    if (vf?.status === 'vf') counts.vf++;
    else if (vf?.status === 'vf_secondary') counts.vf_secondary++;
    else if (vf?.status === 'vo') counts.vo++;
    else if (avail?.has_file) counts.present++;
    else if (airsLater(avail)) counts.tba++;
    else if (avail?.has_file === false) counts.absent++;

    if (vf) {
      const isFr = vf.status === 'vf' || vf.status === 'vf_secondary';
      if (!isFr) {
        if (vf.has_full_fr_sub) {
          if (!vf.full_fr_sub_is_default) counts.sub_fr_not_default++;
        } else if (vf.has_any_sub_track) {
          counts.sub_fr_absent++;
        } else {
          counts.sub_fr_no_track++;
        }
      }
      if (isFr && vf.has_forced_fr_sub && !vf.forced_fr_sub_is_default) counts.forced_fr_not_default++;
    }
  }
  return counts;
}

function episodesOf<T>(payload: BySeason<T> | undefined, seasonNumber: number): Record<number, T> {
  return payload?.seasons?.find((season) => season.season_number === seasonNumber)?.episodes || {};
}

/**
 * Saisons et episodes des series de l'audit, charges a la premiere ouverture.
 *
 * La disponibilite (*arr) et l'etat VF (Plex) sont facultatifs : une serie dont l'un
 * des deux est injoignable s'affiche quand meme, avec ce qu'on sait.
 */
export function useAuditShowDetails() {
  const expanded = ref(new Set<number>());
  const details = ref(new Map<number, AuditShowDetail>());

  const isExpanded = (id: number): boolean => expanded.value.has(id);
  const isLoading = (id: number): boolean => Boolean(details.value.get(id)?.loading);
  const hasError = (id: number): boolean => Boolean(details.value.get(id)?.error);
  const seasonsOf = (id: number): AuditSeason[] => details.value.get(id)?.seasons || [];

  function setDetail(id: number, detail: AuditShowDetail): void {
    const next = new Map(details.value);
    next.set(id, detail);
    details.value = next;
  }

  async function loadSeason(showId: number, seasonNumber: number): Promise<void> {
    const season = details.value.get(showId)?.seasons.find((entry) => entry.season_number === seasonNumber);
    if (!season || season.loading) return;
    season.loading = true;
    try {
      const res = await api<{ episodes?: Array<{ episode_number: number; title?: string; tracks?: unknown[]; subtitles?: unknown[] }> }>(
        `/api/library/${showId}/episodes/${seasonNumber}`,
      );
      const [availability, vfStatus] = await Promise.all([
        api<BySeason<EpisodeAvailability>>(`/api/library/${showId}/episodes-availability`).catch(() => ({})),
        api<BySeason<EpisodeVfState>>(`/api/library/${showId}/episodes-vf-status`).catch(() => ({})),
      ]);
      const avail = episodesOf(availability as BySeason<EpisodeAvailability>, seasonNumber);
      const vf = episodesOf(vfStatus as BySeason<EpisodeVfState>, seasonNumber);
      season.episodes = (res.episodes || []).map((ep): AuditEpisode => {
        const av = avail[ep.episode_number];
        const v = vf[ep.episode_number];
        let status = 'unknown';
        if (v) status = v.status || 'unknown';
        else if (av?.has_file) status = 'present';
        else if (airsLater(av)) status = 'tba';
        else if (av?.has_file === false) status = 'absent';
        return {
          episode: ep.episode_number,
          title: ep.title,
          status,
          tracks: ep.tracks || [],
          subtitles: ep.subtitles || [],
          has_forced_fr_sub: v?.has_forced_fr_sub ?? false,
          forced_fr_sub_is_default: v?.forced_fr_sub_is_default ?? false,
          has_full_fr_sub: v?.has_full_fr_sub ?? false,
          full_fr_sub_is_default: v?.full_fr_sub_is_default ?? false,
          has_any_sub_track: v?.has_any_sub_track ?? true,
        };
      });
      season.loaded = true;
    } catch {
      season.error = true;
    } finally {
      season.loading = false;
    }
  }

  async function loadShow(id: number): Promise<void> {
    setDetail(id, { loading: true, error: false, seasons: [] });
    try {
      const [envelope, availability, vfStatus] = await Promise.all([
        api<{ seasons?: Array<{ season_number: number; name?: string; episode_count?: number }> }>(`/api/library/${id}/episodes`),
        api<BySeason<EpisodeAvailability>>(`/api/library/${id}/episodes-availability`).catch(() => ({})),
        api<BySeason<EpisodeVfState>>(`/api/library/${id}/episodes-vf-status`).catch(() => ({})),
      ]);
      const seasons = (envelope?.seasons || []).map((season): AuditSeason => ({
        season_number: season.season_number,
        name: season.name,
        episode_count: season.episode_count,
        loaded: false,
        loading: false,
        error: false,
        open: true,
        counts: computeSeasonCounts(
          episodesOf(availability as BySeason<EpisodeAvailability>, season.season_number),
          episodesOf(vfStatus as BySeason<EpisodeVfState>, season.season_number),
        ),
        episodes: [],
      }));
      setDetail(id, { loading: false, error: false, seasons });
      await Promise.all(seasons.map((season) => loadSeason(id, season.season_number)));
    } catch {
      setDetail(id, { loading: false, error: true, seasons: [] });
    }
  }

  async function toggle(id: number): Promise<void> {
    const next = new Set(expanded.value);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!details.value.has(id)) await loadShow(id);
    }
    expanded.value = next;
  }

  return { isExpanded, isLoading, hasError, seasonsOf, toggle, loadSeason };
}
