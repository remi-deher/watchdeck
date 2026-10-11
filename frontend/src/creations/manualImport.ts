/* Associer / importer a la main un telechargement que *arr n'a pas pu rattacher : quel
   media (celui que la detection a trouve, ou un autre cherche dans Radarr / Sonarr), puis,
   pour une serie, quelle saison et quel episode, et quel fichier. Une seule fabrique par
   telechargement : elle garde ce qu'elle a lu (fichiers, episodes) entre les etapes. */
import { api } from '@/api';
import type { CreateDefinition, CreateOption, CreateValues, LookupItem } from '@/components/templates/create/types';
import { formatImportSize } from '@/utils/format';

const episodeNumber = (season?: number | null, episode?: number | null) => (season == null || episode == null ? '' : `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`);
const fileName = (candidate: any) => String(candidate?.relativePath || candidate?.name || candidate?.path || '').split(/[\\/]/).pop() || '';
const fileDetails = (candidate: any) => [
  candidate?.quality?.quality?.name,
  (candidate?.languages || []).map((lang: any) => lang?.name).filter(Boolean).join(', '),
  formatImportSize(candidate?.size),
].filter(Boolean).join(' · ');

export function manualImportCreation(row: Record<string, any>): CreateDefinition {
  const isMovie = row.arr_type === 'radarr';
  const tool = isMovie ? 'Radarr' : 'Sonarr';
  const targets = { arrId: null as number | string | null, candidates: [] as any[], episodes: [] as any[] };

  const seasons = () => [...new Set(targets.episodes.map((entry) => entry.seasonNumber).filter((n) => n != null && n > 0))].sort((a, b) => a - b);
  const episodesOf = (season: number | string | null) => targets.episodes.filter((entry) => entry.seasonNumber === Number(season)).sort((a, b) => a.episodeNumber - b.episodeNumber);
  const willImport = () => targets.candidates.length > 0;

  /* Choisir un fichier dans un pack, c'est choisir un episode : on realigne la saison et
     l'episode, sinon le fichier de l'E03 serait importe comme E12. */
  function alignWithCandidate(values: CreateValues): void {
    if (isMovie) return;
    const candidate = targets.candidates[Number(values.candidate)];
    if (candidate?.suggested_season == null || candidate?.suggested_episode == null) return;
    const match = targets.episodes.find((entry) => entry.seasonNumber === candidate.suggested_season && entry.episodeNumber === candidate.suggested_episode);
    if (!match) return;
    values.season = String(candidate.suggested_season);
    values.episode_id = String(match.id);
  }

  async function loadTargets(values: CreateValues): Promise<void> {
    const media = values.media as LookupItem | null;
    const arrId = media?.payload?.arr_id;
    if (!arrId || arrId === targets.arrId) return;
    const download = row.download_id ? `&download_id=${encodeURIComponent(row.download_id)}` : '';
    if (isMovie) {
      const data = await api<any>(`/api/downloads/radarr-manual-import?instance_id=${row.instance_id}&movie_id=${arrId}${download}`);
      Object.assign(targets, { arrId, candidates: data.candidates || [], episodes: [] });
      values.candidate = '0';
      return;
    }
    const data = await api<any>(`/api/downloads/sonarr-manual-import?instance_id=${row.instance_id}&series_id=${arrId}${download}`);
    Object.assign(targets, { arrId, candidates: data.candidates || [], episodes: data.episodes || [] });
    values.candidate = '0';
    const season = seasons().includes(Number(values.season)) ? Number(values.season) : seasons()[0] ?? null;
    values.season = season == null ? '' : String(season);
    const preferred = episodesOf(season).find((entry) => entry.episodeNumber === row.episode_number) || episodesOf(season)[0];
    values.episode_id = preferred ? String(preferred.id) : '';
    // Un seul fichier suffit a lever l'ambiguite : les selects s'alignent dessus d'office.
    if (targets.candidates.length === 1) alignWithCandidate(values);
  }

  const detected = (): LookupItem | null => (row.arr_media_id ? {
    key: String(row.arr_media_id),
    title: row.series_title || row.title || '',
    subtitle: [isMovie ? 'Film' : 'Série', row.year, tool].filter(Boolean).join(' · '),
    image: row.poster_url || null,
    note: 'Détecté automatiquement',
    payload: { arr_id: row.arr_media_id, title: row.series_title || row.title || '', year: row.year || null, tmdb_id: row.tmdb_id || null, tvdb_id: row.tvdb_id || null, poster_url: row.poster_url || null },
  } : null);

  const search = async (query: string): Promise<LookupItem[]> => {
    const results = await api<any[]>(`/api/media/lookup?query=${encodeURIComponent(query)}&type=${isMovie ? 'movie' : 'show'}`);
    return results.map((item) => ({
      key: `${item.title}:${item.year}`,
      title: item.title,
      subtitle: `${item.year} · ${item.arr_id ? `Déjà dans ${tool}` : `Absent de ${tool}`}`,
      image: item.poster || null,
      disabled: !item.arr_id,
      reason: `Cette fiche n'existe pas encore dans ${tool} : ajoutez-la d'abord pour pouvoir y rattacher ce téléchargement.`,
      payload: { arr_id: item.arr_id, title: item.title, year: item.year, tmdb_id: item.tmdb_id, tvdb_id: item.tvdb_id, poster_url: item.poster },
    }));
  };

  const candidateOptions = (): CreateOption[] => targets.candidates.map((candidate, index) => ({
    value: String(index),
    label: [fileName(candidate), !isMovie ? episodeNumber(candidate.suggested_season, candidate.suggested_episode) : ''].filter(Boolean).join(' · '),
    description: fileDetails(candidate),
  }));

  return {
    noun: 'une association',
    another: '',
    editTitle: 'Associer / importer',
    subtitle: row.title,
    quick: true,
    submitLabel: () => (willImport() ? 'Associer et importer' : isMovie ? 'Associer au film' : 'Associer à la série'),
    initial: () => ({ media: detected(), season: row.season_number ? String(row.season_number) : '', episode_id: '', candidate: '0' }),
    steps: [
      {
        key: 'media',
        label: 'Média',
        title: isMovie ? 'À quel film appartient ce téléchargement ?' : 'À quelle série appartient ce téléchargement ?',
        fields: [{
          key: 'media', type: 'lookup', label: isMovie ? 'Film' : 'Série', required: true, search,
          placeholder: `Chercher dans ${tool}…`,
          validate: (value) => (value?.payload?.arr_id ? null : `Sélectionnez ${isMovie ? 'le film' : 'la série'} dans la liste.`),
        }],
      },
      {
        key: 'files',
        label: 'Fichier',
        title: isMovie ? 'Que faut-il importer ?' : 'Quel épisode, et quel fichier ?',
        onEnter: loadTargets,
        fields: [
          {
            key: 'season', type: 'select', label: 'Saison', required: true, when: () => !isMovie,
            options: () => seasons().map((season) => ({ value: String(season), label: `Saison ${season}` })),
            onChange: (value, values) => {
              const episodes = episodesOf(value);
              if (!episodes.some((entry) => String(entry.id) === String(values.episode_id))) values.episode_id = episodes[0] ? String(episodes[0].id) : '';
            },
          },
          {
            key: 'episode_id', type: 'select', label: 'Épisode', required: true, when: () => !isMovie,
            options: (values) => episodesOf(values.season).map((entry) => ({ value: String(entry.id), label: `E${String(entry.episodeNumber).padStart(2, '0')} · ${entry.title || 'Sans titre'}` })),
          },
          {
            key: 'none', type: 'note', label: 'Fichier', tone: 'warning', summary: 'hide', when: () => !willImport(),
            text: `Aucun fichier importable détecté : le téléchargement sera rattaché ${isMovie ? 'au film dans Radarr' : 'à la série dans Sonarr'}, mais aucun fichier ne sera déplacé dans la bibliothèque.`,
          },
          {
            key: 'one', type: 'note', label: 'Fichier', summary: 'hide', when: () => targets.candidates.length === 1,
            text: () => `Fichier à importer : ${fileName(targets.candidates[0])}${fileDetails(targets.candidates[0]) ? ` — ${fileDetails(targets.candidates[0])}` : ''}.`,
          },
          {
            key: 'candidate', type: 'cards', label: `Fichier à importer (${targets.candidates.length})`, when: () => targets.candidates.length > 1,
            options: candidateOptions,
            onChange: (_value, values) => alignWithCandidate(values),
          },
          {
            key: 'hint', type: 'note', label: 'Import', summary: 'hide', when: willImport,
            text: `Le fichier sera déplacé dans la bibliothèque ${tool}.`,
          },
        ],
      },
    ],
    submit: async (values) => {
      const media = (values.media as LookupItem).payload;
      await api('/api/downloads/manual-import', { method: 'POST', body: JSON.stringify({ instance_id: row.instance_id, media_type: isMovie ? 'movie' : 'show', title: media.title, arr_id: media.arr_id, year: media.year, tmdb_id: media.tmdb_id, tvdb_id: media.tvdb_id, poster_url: media.poster_url }) });
      const candidate = targets.candidates[Number(values.candidate)];
      if (candidate) {
        const common = { instance_id: row.instance_id, path: candidate.path, folder_name: candidate.folderName || candidate.folder_name, download_id: row.download_id, quality: candidate.quality, languages: candidate.languages, release_group: candidate.releaseGroup, indexer_flags: candidate.indexerFlags };
        if (isMovie) await api('/api/downloads/radarr-manual-import', { method: 'POST', body: JSON.stringify({ ...common, movie_id: media.arr_id }) });
        else if (values.episode_id) await api('/api/downloads/sonarr-manual-import', { method: 'POST', body: JSON.stringify({ ...common, series_id: media.arr_id, episode_id: Number(values.episode_id) }) });
      }
      return { message: candidate ? `« ${media.title} » associé et importé.` : `« ${media.title} » associé.` };
    },
  };
}

