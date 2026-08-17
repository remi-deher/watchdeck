import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { api } from '@/api';

export interface SeasonEpisodesTarget {
  source: string;
  id: number | string;
  mediaType: string;
}

export function useSeasonEpisodes(resolveTarget: () => SeasonEpisodesTarget | null) {
  const envelope = ref<any>(null);
  const availability = ref<any>(null);
  const vfStatus = ref<any>(null);
  const movieVfDetail = ref<any>(null);

  const envelopeError = ref(false);
  const availabilityError = ref(false);
  const vfStatusError = ref(false);

  const seasonEpisodes = ref<Record<number, any[]>>({});
  const seasonLoading = ref<Record<number, boolean>>({});
  const seasonErrors = ref<Record<number, boolean>>({});

  const isShow = (): boolean => resolveTarget()?.mediaType === 'show';
  const basePath = (): string | null => {
    const target = resolveTarget();
    return target ? `/api/${target.source}/${target.id}` : null;
  };

  function reset(): void {
    envelope.value = null;
    availability.value = null;
    vfStatus.value = null;
    movieVfDetail.value = null;
    envelopeError.value = false;
    availabilityError.value = false;
    vfStatusError.value = false;
    seasonEpisodes.value = {};
    seasonLoading.value = {};
    seasonErrors.value = {};
  }

  /** Films uniquement : scan Plex des pistes audio. */
  async function loadMovieVf(): Promise<void> {
    movieVfDetail.value = await api(`${basePath()}/vf-detail`);
  }

  async function loadEnvelope(): Promise<void> {
    if (!isShow()) return;
    envelopeError.value = false;
    try {
      envelope.value = await api(`${basePath()}/episodes`);
    } catch {
      envelopeError.value = true;
    }
  }

  async function loadAvailability(force = false): Promise<void> {
    if (!isShow()) return;
    availabilityError.value = false;
    try {
      availability.value = await api(`${basePath()}/episodes-availability${force ? '?force=true' : ''}`);
    } catch {
      availabilityError.value = true;
    }
  }

  async function loadVfStatus(): Promise<void> {
    if (!isShow()) return;
    vfStatusError.value = false;
    try {
      vfStatus.value = await api(`${basePath()}/episodes-vf-status`);
    } catch {
      vfStatusError.value = true;
    }
  }

  /** Déplie une saison : ses épisodes ne sont demandés à TMDB qu'à ce moment-là. */
  async function loadSeason(seasonNumber: number): Promise<void> {
    if (seasonEpisodes.value[seasonNumber] || seasonLoading.value[seasonNumber]) return;
    seasonLoading.value = { ...seasonLoading.value, [seasonNumber]: true };
    seasonErrors.value = { ...seasonErrors.value, [seasonNumber]: false };
    try {
      const data = await api<{ episodes: any[] }>(`${basePath()}/episodes/${seasonNumber}`);
      seasonEpisodes.value = { ...seasonEpisodes.value, [seasonNumber]: data.episodes };
    } catch {
      seasonErrors.value = { ...seasonErrors.value, [seasonNumber]: true };
    } finally {
      seasonLoading.value = { ...seasonLoading.value, [seasonNumber]: false };
    }
  }

  /** Relance un scan VF (série entière, une saison, ou un épisode précis) et rafraîchit ce qui en dépend. */
  async function rescan(seasonNumber?: number, episodeNumber?: number): Promise<void> {
    const params = new URLSearchParams();
    if (seasonNumber != null) params.set('season', String(seasonNumber));
    if (episodeNumber != null) params.set('episode', String(episodeNumber));
    const qs = params.toString();
    await api(`${basePath()}/vff-scan${qs ? `?${qs}` : ''}`, { method: 'POST' });
    if (isShow()) await Promise.all([loadAvailability(true), loadVfStatus()]);
    else await loadMovieVf();
  }

  /** Charge en parallèle les trois sources d'une série. */
  function loadAll(): Promise<any[]> {
    return Promise.all([loadEnvelope(), loadAvailability(), loadVfStatus()]);
  }

  function episodeStatus(episode: any, availabilityInfo: any, knownVfEntry: any): string {
    if (knownVfEntry) return knownVfEntry.status;
    const hasFile = availabilityInfo?.has_file;
    if (hasFile === undefined) return 'unknown';
    if (hasFile) return 'present';
    const airDate = availabilityInfo?.air_date_utc || episode.air_date;
    const hasAired = !airDate || new Date(airDate) <= new Date();
    return hasAired ? 'absent' : 'tba';
  }

  function computeSeasonCounts(availEps: Record<string | number, any>, vfEps: Record<string | number, any>) {
    const episodeNumbers = new Set([
      ...Object.keys(availEps).map(Number),
      ...Object.keys(vfEps).map(Number),
    ]);
    const counts: Record<string, number> = {
      vf: 0,
      vf_secondary: 0,
      vo: 0,
      present: 0,
      absent: 0,
      tba: 0,
      unknown: 0,
      sub_fr_no_track: 0,
      sub_fr_absent: 0,
      sub_fr_not_default: 0,
      forced_fr_not_default: 0,
    };
    for (const epNum of episodeNumbers) {
      const vfEntry = vfEps[epNum];
      if (vfEntry?.is_known_episode === false) continue;
      const status = episodeStatus({ air_date: null }, availEps[epNum], vfEntry);
      counts[status] = (counts[status] || 0) + 1;

      if (!vfEntry) continue;
      const isFrancophone = status === 'vf' || status === 'vf_secondary';

      if (!isFrancophone) {
        if (!vfEntry.has_full_fr_sub) {
          if (!vfEntry.has_any_sub_track) counts.sub_fr_no_track++;
          else counts.sub_fr_absent++;
        } else if (!vfEntry.full_fr_sub_is_default) {
          counts.sub_fr_not_default++;
        }
      }
      if (isFrancophone && vfEntry.has_forced_fr_sub && !vfEntry.forced_fr_sub_is_default) {
        counts.forced_fr_not_default++;
      }
    }
    return counts;
  }

  const detail = computed(() => {
    if (!isShow()) return movieVfDetail.value;
    if (!envelope.value) return null;

    const availBySeason = Object.fromEntries(
      (availability.value?.seasons || []).map((s: any) => [s.season_number, s.episodes])
    );
    const vfBySeason = Object.fromEntries(
      (vfStatus.value?.seasons || []).map((s: any) => [s.season_number, s.episodes])
    );

    const seasons = envelope.value.seasons.map((season: any) => {
      const episodes = seasonEpisodes.value[season.season_number];
      const availEps = availBySeason[season.season_number] || {};
      const vfEps = vfBySeason[season.season_number] || {};
      if (!episodes) {
        return {
          season_number: season.season_number,
          name: season.name,
          episode_count: season.episode_count,
          loaded: false,
          loading: !!seasonLoading.value[season.season_number],
          error: !!seasonErrors.value[season.season_number],
          counts: computeSeasonCounts(availEps, vfEps),
          episodes: [],
        };
      }

      const counts: Record<string, number> = {
        vf: 0,
        vf_secondary: 0,
        vo: 0,
        present: 0,
        absent: 0,
        tba: 0,
        unknown: 0,
      };
      const merged = episodes.map((episode) => {
        const availInfo = availEps[episode.episode_number];
        const vfEntry = vfEps[episode.episode_number];
        const status = episodeStatus(episode, availInfo, vfEntry);
        const isKnownEpisode = vfEntry?.is_known_episode !== false;
        if (isKnownEpisode) counts[status] = (counts[status] || 0) + 1;
        return {
          episode: episode.episode_number,
          title: episode.title,
          air_date: availInfo?.air_date_utc || episode.air_date,
          status,
          isKnownEpisode,
          has_file: availInfo?.has_file,
          overview: episode.overview,
          still_url: episode.still_url,
          tracks: episode.tracks || [],
          subtitles: episode.subtitles || [],
          hasForcedFrenchSubtitle: Boolean(episode.has_forced_french_subtitle),
          has_any_sub_track: vfEntry?.has_any_sub_track ?? null,
          has_full_fr_sub: vfEntry?.has_full_fr_sub ?? null,
          full_fr_sub_is_default: vfEntry?.full_fr_sub_is_default ?? null,
          has_forced_fr_sub: vfEntry?.has_forced_fr_sub ?? null,
          forced_fr_sub_is_default: vfEntry?.forced_fr_sub_is_default ?? null,
        };
      });
      return {
        season_number: season.season_number,
        name: season.name,
        episode_count: season.episode_count,
        loaded: true,
        counts,
        episodes: merged,
      };
    });

    return { enabled: true, media_type: 'show', vf_available: true, seasons };
  });

  const seasonSummary = computed(() => {
    if (!isShow() || !detail.value) return { vf: [], vfSecondary: [], vo: [], partial: [] };
    const groups: { vf: number[]; vfSecondary: number[]; vo: number[]; partial: number[] } = {
      vf: [],
      vfSecondary: [],
      vo: [],
      partial: [],
    };
    for (const season of detail.value.seasons || []) {
      const c = season.counts || {};
      const vfTotal = (c.vf || 0) + (c.vf_secondary || 0);
      const resolvedTotal = vfTotal + (c.vo || 0);
      if (resolvedTotal === 0) continue;
      if (vfTotal === resolvedTotal) {
        if (c.vf_secondary > 0) groups.vfSecondary.push(season.season_number);
        else groups.vf.push(season.season_number);
      } else if (c.vo === resolvedTotal) {
        groups.vo.push(season.season_number);
      } else {
        groups.partial.push(season.season_number);
      }
    }
    return groups;
  });

  return {
    detail,
    seasonSummary,
    envelopeError,
    availabilityError,
    vfStatusError,
    reset,
    loadAll,
    loadMovieVf,
    loadSeason,
    rescan,
  };
}
