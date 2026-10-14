/* Alignement des pistes Plex d'un media : sur quoi (serie entiere ou episodes), quelles pistes
   (choix automatique ou libre, avec ce qui change), pour quels profils. La page fournit le media
   et la lecture des saisons ; la definition garde l'analyse Plex en direct, relue a chaque arrivee
   sur l'etape des pistes pour suivre la portee choisie. */
import { ref, type Ref } from 'vue';
import { api } from '@/api';
import type { CreateCompareRow, CreateDefinition, CreateField, CreateGroup, CreateOption, CreateValues } from '@/components/templates/create/types';
import type { useSeasonEpisodes } from '@/composables/useSeasonEpisodes';
import { episodeFilters } from '@/utils/episodeFilters';

export interface AlignStreamsContext {
  item: any;
  initialScope: 'series' | 'season' | 'episode' | 'selection';
  initialSeasonNumber: number | null;
  initialEpisodeNumber: number | null;
  seasons: ReturnType<typeof useSeasonEpisodes>;
  onApplied: (res: any) => void;
}

const epKey = (season: number, episode: number): string => `${season}:${episode}`;

export function alignStreamsCreation(ctx: AlignStreamsContext): CreateDefinition {
  const isShow = ctx.item?.media_type === 'show';
  const preview: Ref<any | null> = ref(null);
  let loaded = false;

  const seasonsData = (): any[] => ctx.seasons.detail.value?.seasons || [];
  const visible = (values: CreateValues) => (ep: any): boolean => Boolean(values.showAll) || episodeFilters.needsAlignment(ep);

  function defaultSelection(): string[] {
    const keys: string[] = [];
    for (const season of seasonsData()) {
      for (const ep of season.episodes || []) if (episodeFilters.needsAlignment(ep)) keys.push(epKey(season.season_number, ep.episode));
    }
    return keys;
  }

  /** Charge le scan VF en cache puis ouvre les saisons ciblees. */
  async function loadScope(values: CreateValues): Promise<void> {
    if (loaded) return;
    loaded = true;
    ctx.seasons.reset();
    await ctx.seasons.loadAll();
    if (ctx.initialScope === 'season' && ctx.initialSeasonNumber != null) {
      values.scope = 'selection';
      await ctx.seasons.loadSeason(ctx.initialSeasonNumber);
      const season = seasonsData().find((entry) => entry.season_number === ctx.initialSeasonNumber);
      values.episodes = (season?.episodes || []).map((ep: any) => epKey(ctx.initialSeasonNumber as number, ep.episode));
      return;
    }
    if (ctx.initialScope === 'episode' && ctx.initialSeasonNumber != null && ctx.initialEpisodeNumber != null) {
      values.scope = 'selection';
      await ctx.seasons.loadSeason(ctx.initialSeasonNumber);
      values.episodes = [epKey(ctx.initialSeasonNumber, ctx.initialEpisodeNumber)];
      return;
    }
    if (ctx.initialScope === 'series') {
      values.scope = 'series';
      return;
    }
    let targets = seasonsData().filter((season) => {
      const c = season.counts || {};
      return (c.vf_secondary || 0) > 0 || (c.sub_fr_not_default || 0) > 0 || (c.forced_fr_not_default || 0) > 0 || (c.partial || 0) > 0;
    });
    if (!targets.length) targets = seasonsData();
    await Promise.all(targets.map((season) => ctx.seasons.loadSeason(season.season_number)));
    values.episodes = defaultSelection();
  }

  const episodeRefs = (values: CreateValues): string[] | undefined => (!isShow || values.scope === 'series' ? undefined : [...(values.episodes as string[] || [])]);

  async function fetchPreview(values: CreateValues): Promise<void> {
    const params = new URLSearchParams();
    for (const ref of episodeRefs(values) || []) params.append('episodes', ref);
    const qs = params.toString();
    const data = await api<any>(`/api/vf-upgrades/audit/${ctx.item.id}/preview${qs ? `?${qs}` : ''}`);
    preview.value = data;
    values.users = (data.available_users || []).map((user: any) => user.name);
    if (!values.audioId) values.audioId = String(data.target_audio?.id ?? data.current_audio?.id ?? data.all_audio_streams?.[0]?.id ?? '');
    if (!values.subtitleId) values.subtitleId = String(data.target_subtitle ? data.target_subtitle.id : 0);
  }

  const streamName = (stream: any, fallback: string): string => stream?.title || stream?.language?.toUpperCase() || fallback;
  const streamTech = (stream: any): string => [stream?.codec, stream?.channels].filter(Boolean).join(' • ');
  const targetAudio = (values: CreateValues): any => (values.mode === 'custom'
    ? (preview.value?.all_audio_streams || []).find((s: any) => String(s.id) === String(values.audioId)) || null
    : preview.value?.target_audio);
  const targetSubtitle = (values: CreateValues): any => {
    if (values.mode !== 'custom') return preview.value?.target_subtitle;
    if (String(values.subtitleId) === '0') return null;
    return (preview.value?.all_subtitle_streams || []).find((s: any) => String(s.id) === String(values.subtitleId)) || null;
  };

  function compareRows(values: CreateValues): CreateCompareRow[] {
    const p = preview.value;
    if (!p) return [];
    const audio = targetAudio(values);
    const subtitle = targetSubtitle(values);
    const audioChanges = Boolean(audio?.id && p.current_audio?.id !== audio.id);
    let subtitleChanges: boolean;
    if (values.mode !== 'custom') subtitleChanges = Boolean(p.subtitle_will_change);
    else if (String(values.subtitleId) === '0') subtitleChanges = Boolean(p.current_subtitle?.id);
    else subtitleChanges = Boolean(subtitle?.id && p.current_subtitle?.id !== subtitle.id);
    const subName = (stream: any): string => `${streamName(stream, 'Sous-titres')}${stream.forced ? ' (Forcés)' : ''}`;
    return [
      {
        key: 'audio',
        label: 'Piste audio',
        current: p.current_audio ? streamName(p.current_audio, 'Piste audio') : 'Inconnue',
        currentDetail: streamTech(p.current_audio),
        target: audio ? streamName(audio, 'Piste audio') : 'Aucun changement',
        targetDetail: streamTech(audio),
        changed: audioChanges,
      },
      {
        key: 'subtitle',
        label: 'Sous-titres',
        current: p.current_subtitle ? subName(p.current_subtitle) : 'Désactivés',
        currentDetail: p.current_subtitle?.codec || '',
        target: subtitle ? subName(subtitle) : 'Désactivés',
        targetDetail: subtitle?.codec || '',
        changed: subtitleChanges,
      },
    ];
  }

  const audioOptions = (): CreateOption[] => (preview.value?.all_audio_streams || []).map((stream: any) => ({
    value: String(stream.id),
    label: `${streamName(stream, 'Audio')} ${stream.codec ? `(${stream.codec.toUpperCase()}${stream.channels ? ' ' + stream.channels : ''})` : ''} ${stream.id === preview.value?.current_audio?.id ? ' — [Actuelle]' : ''}`.trim(),
  }));
  const subtitleOptions = (): CreateOption[] => [
    { value: '0', label: 'Désactivés (Aucun sous-titre)' },
    ...(preview.value?.all_subtitle_streams || []).map((stream: any) => ({
      value: String(stream.id),
      label: `${stream.title || stream.language?.toUpperCase() || 'Sous-titre'} ${stream.forced ? '(Forcé)' : ''} ${stream.codec ? `[${stream.codec.toUpperCase()}]` : ''} ${stream.id === preview.value?.current_subtitle?.id ? ' — [Actuel]' : ''}`.trim(),
    })),
  ];

  const scopeFields: CreateField[] = [
    {
      key: 'scope',
      type: 'cards',
      label: 'Portée de l’alignement',
      options: [
        { value: 'selection', label: 'Sélection ciblée', description: 'Choisir précisément les épisodes/saisons — présélectionné : ce qui a besoin d’être réaligné' },
        { value: 'series', label: 'Toute la série', description: 'Aligne tous les épisodes de toutes les saisons, sans distinction' },
      ],
    },
    { key: 'showAll', type: 'toggle', label: 'Afficher tous les épisodes (pas seulement ceux à réaligner)', when: (values) => values.scope === 'selection' },
    {
      key: 'episodes',
      type: 'checklist',
      label: 'Épisodes à aligner',
      when: (values) => values.scope === 'selection',
      summary: 'hide',
      actions: [{
        label: 'Réanalyser toute la série',
        run: async (values) => { await ctx.seasons.rescan(); values.episodes = defaultSelection(); },
      }],
      groups: (values) => seasonsData().map((season) => {
        const count = (season.episodes || []).filter(visible(values)).length;
        return { key: String(season.season_number), label: `Saison ${season.season_number}`, badge: count || undefined, action: 'Réanalyser', loading: Boolean(season.loading), open: count > 0 } as CreateGroup;
      }),
      onGroupOpen: (group) => ctx.seasons.loadSeason(Number(group)),
      onGroupAction: (group) => ctx.seasons.rescan(Number(group)),
      options: (values) => seasonsData().flatMap((season) => (season.episodes || []).filter(visible(values)).map((ep: any) => ({
        value: epKey(season.season_number, ep.episode),
        label: `${ep.episode}. ${ep.title}`,
        group: String(season.season_number),
        action: 'Réanalyser',
      }))),
      onAction: (value) => { const [season, episode] = value.split(':').map(Number); return ctx.seasons.rescan(season, episode); },
      empty: () => (seasonsData().length ? 'Aucun épisode ne correspond à ce filtre.' : 'Chargement du scan VF…'),
      validate: (value) => (Array.isArray(value) && value.length ? undefined : 'Choisissez au moins un épisode.'),
    },
  ];

  return {
    noun: 'un alignement',
    another: 'un autre alignement',
    editTitle: `Alignement Plex : ${ctx.item?.title || 'Média'}`,
    subtitle: ctx.item ? `${ctx.item.media_type === 'movie' ? 'Film' : 'Série'}${ctx.item.year ? ' • ' + ctx.item.year : ''}` : '',
    submitLabel: 'Appliquer l’alignement',
    quick: true,
    initial: () => {
      /* Chaque ouverture relit les saisons et l'analyse : rien de perime d'une fois sur l'autre. */
      loaded = false;
      preview.value = null;
      return {
        scope: ctx.initialScope === 'series' ? 'series' : 'selection',
        showAll: false,
        episodes: [] as string[],
        mode: 'auto',
        audioId: '',
        subtitleId: '',
        targetMode: 'all',
        users: [] as string[],
      };
    },
    steps: [
      {
        key: 'scope',
        label: 'Portée',
        title: 'Sur quoi aligne-t-on ?',
        when: () => isShow,
        loading: 'Chargement du scan VF…',
        onEnter: loadScope,
        fields: scopeFields,
      },
      {
        key: 'streams',
        label: 'Pistes',
        title: 'Quelles pistes vise-t-on ?',
        loading: 'Analyse des flux Plex en direct…',
        onEnter: fetchPreview,
        fields: [
          {
            key: 'scopeNotice',
            type: 'note',
            label: 'Portée',
            text: () => {
              const parts = preview.value?.total_parts || 1;
              return `Alignement prévu sur ${parts} ${parts > 1 ? (preview.value?.media_type === 'show' ? 'épisodes' : 'parties') : 'média'}.`;
            },
          },
          {
            key: 'mode',
            type: 'cards',
            label: 'Mode d’alignement',
            options: [
              { value: 'auto', label: 'Automatique intelligent (PASTA)', description: 'Sélectionne automatiquement la meilleure piste française (VFF prioritaire) et les sous-titres adaptés' },
              { value: 'custom', label: 'Personnalisé (Choix libre)', description: 'Choisir manuellement n’importe quelle piste audio et sous-titre parmi les flux disponibles' },
            ],
          },
          { key: 'audioId', type: 'select', label: 'Piste audio souhaitée', options: audioOptions, when: (values) => values.mode === 'custom' },
          { key: 'subtitleId', type: 'select', label: 'Sous-titres souhaités', options: subtitleOptions, when: (values) => values.mode === 'custom' },
          { key: 'comparison', type: 'compare', label: 'Comparatif des flux', compareRows },
        ],
      },
      {
        key: 'profiles',
        label: 'Profils',
        title: 'Pour quels profils Plex ?',
        fields: [
          {
            key: 'targetMode',
            type: 'cards',
            label: 'Profils Plex cibles',
            options: [
              { value: 'all', label: 'Tous les profils', description: 'Applique automatiquement ces pistes pour l’administrateur et tous les utilisateurs partagés (Plex Home et invités)' },
              { value: 'custom', label: 'Profils spécifiques', description: 'Choisir manuellement les utilisateurs Plex concernés' },
            ],
          },
          {
            key: 'users',
            type: 'checklist',
            label: 'Profils concernés',
            when: (values) => values.targetMode === 'custom',
            summary: 'hide',
            options: () => (preview.value?.available_users || [{ name: 'Admin', title: 'Administrateur', is_admin: true }]).map((user: any) => ({
              value: user.name,
              label: user.title || user.name,
              description: user.is_admin ? 'Admin' : user.is_home ? 'Home' : 'Invité',
            })),
            validate: (value) => (Array.isArray(value) && value.length ? undefined : 'Choisissez au moins un profil.'),
          },
        ],
      },
    ],
    submit: async (values) => {
      const users = values.users as string[];
      const payload: Record<string, unknown> = {
        users: values.targetMode === 'all' ? ['all'] : [...users],
        include_home_users: values.targetMode === 'all' || users.length > 1,
        mode: values.mode,
      };
      if (values.mode === 'custom') {
        const audio = targetAudio(values);
        const subtitle = targetSubtitle(values);
        payload.audio_stream_id = Number(values.audioId);
        payload.audio_language = audio?.language;
        payload.subtitle_stream_id = Number(values.subtitleId);
        payload.subtitle_language = subtitle?.language;
        payload.subtitle_forced = subtitle?.forced;
      }
      const refs = episodeRefs(values);
      if (refs?.length) payload.episodes = refs.map((ref) => ref.split(':').map(Number));
      const res = await api(`/api/vf-upgrades/audit/${ctx.item.id}/fix-streams`, { method: 'POST', body: JSON.stringify(payload) });
      ctx.onApplied(res);
      return { message: 'Alignement appliqué' };
    },
  };
}
