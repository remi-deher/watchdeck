import type { FilterGroupDefinition } from '@/composables/useFiltersDrawer';

/* Regles et donnees fixes de la Bibliotheque : statuts, parametres envoyes au serveur,
   filtrage local des orphelins et definitions des filtres. Rien ici ne lit l'etat de la
   page : chaque fonction recoit les valeurs dont elle a besoin. */

/** Cles de sessionStorage : filtres retenus, position de defilement a restaurer. */
export const LIBRARY_FILTERS_KEY = 'library.active_filters';
export const LIBRARY_SCROLL_KEY = 'library.scroll_position';

export const IN_PROGRESS_STATUSES = ['pending_approval', 'pending', 'sent_to_arr', 'partially_available'];
/** Statuts couverts par le tri « Dernieres demandes » (`sort=requested_desc`) sans statut explicite. */
export const REQUESTED_SORT_STATUSES = ['pending_approval', 'pending', 'sent_to_arr', 'partially_available', 'failed'];

// Une page de 200 cartes represente ~47 ecrans de defilement sur un telephone (mesure
// a 375x812) : le chargement incremental existe, mais son grain etait pense pour un
// grand ecran. Le lot est reduit sous 640px, la sentinelle de defilement se chargeant
// d'enchainer. Fige au montage : changer la taille de lot en cours de session
// desalignerait les offsets deja demandes.
export function libraryPageSize(): number {
  return window.matchMedia('(max-width: 640px)').matches ? 60 : 200;
}

/** Valeurs des filtres, telles que retenues en session et envoyees au serveur. */
export interface LibraryFilterValues {
  query: string;
  statusFilters: string[];
  typeFilters: string[];
  vf: string;
  subtitle: string;
  sourceFilters: string[];
  requesterFilters: string[];
  decade: string;
  sort: string;
  genre: string;
  audioFormat: string;
  releaseType: string;
  hiRes: string;
  plexServer: string;
}

/** Parametre d'adresse a valeurs multiples (`?type=a&type=b` ou `?type=a`). */
export function queryList(value: any): string[] {
  return Array.isArray(value) ? value : [String(value)];
}

// Les medias Plex et les demandes sont filtres en SQL (voir libraryParams et
// requestListParams) : les refiltrer cote client donnait un resultat faux des que la
// liste depassait une page -- « VF uniquement » ne filtrait que les 200 premiers medias
// charges et masquait tout le reste de la bibliotheque.
export function libraryParams(f: LibraryFilterValues, offset: number, pageSize: number): URLSearchParams {
  const p = new URLSearchParams();
  if (f.query.trim()) p.set('query', f.query.trim());
  if (f.typeFilters.length) p.set('media_types', f.typeFilters.join(','));
  if (f.vf) p.set('vf', f.vf);
  if (f.subtitle) p.set('subtitle', f.subtitle);
  if (f.requesterFilters.length) p.set('requesters', f.requesterFilters.join(','));
  if (f.decade) p.set('decade', f.decade);
  if (f.sort) p.set('sort', f.sort);
  if (f.genre) p.set('genre', f.genre);
  if (f.audioFormat) p.set('audio_format', f.audioFormat);
  if (f.releaseType) p.set('release_type', f.releaseType);
  if (f.hiRes) p.set('hi_res', f.hiRes);
  if (f.plexServer) p.set('server_id', f.plexServer);
  p.set('limit', String(pageSize));
  p.set('offset', String(offset));
  return p;
}

export function requestListParams(f: LibraryFilterValues): URLSearchParams {
  const p = new URLSearchParams({ limit: '500' });
  const q = f.query.trim();
  if (q) p.set('query', q);
  // « Dans Plex » exige un lien vers la bibliothèque synchronisée.
  if (f.statusFilters.length === 1 && f.statusFilters[0] === 'library') p.set('in_plex', 'true');
  const selectedStatuses = f.statusFilters.includes('library')
    ? [...new Set([...f.statusFilters.filter(value => value !== 'library'), 'available', 'partially_available'])]
    : f.statusFilters;
  if (selectedStatuses.length) p.set('statuses', selectedStatuses.join(','));
  // Une serie garde le statut « partiellement disponible » tant qu'elle n'a pas fini de
  // diffuser, meme a jour sur tout ce qui est sorti. Ce raffinement ne s'applique que si
  // l'utilisateur a explicitement choisi ce statut : sous « Dans Plex », une serie a jour
  // doit rester visible.
  if (f.statusFilters.includes('partially_available') && !f.statusFilters.includes('library')) {
    p.set('strict_partial', 'true');
  }
  if (f.typeFilters.length) p.set('media_types', f.typeFilters.join(','));
  if (f.sourceFilters.length) p.set('sources', f.sourceFilters.join(','));
  if (f.requesterFilters.length) p.set('requesters', f.requesterFilters.join(','));
  if (f.vf) p.set('vf', f.vf);
  return p;
}

type OrphanFilterValues = Pick<LibraryFilterValues, 'statusFilters' | 'typeFilters' | 'vf' | 'sourceFilters' | 'requesterFilters'>;

// Les orphelins restent filtres localement : ils viennent de Sonarr/Radarr en un seul
// bloc, sans pagination, donc le filtrage client y est exact.
export function matchesOrphanFilters(item: any, f: OrphanFilterValues): boolean {
  if (f.statusFilters.length && !f.statusFilters.includes('orphan')) return false;
  if (f.typeFilters.length && !f.typeFilters.includes(item.media_type)) return false;
  if (f.vf === 'vf' && item.has_vf !== true) return false;
  if (f.vf === 'vo' && item.has_vf !== false) return false;
  if (f.vf === 'unchecked' && item.has_vf != null) return false;
  if (f.sourceFilters.length && !f.sourceFilters.includes(item.source)) return false;
  if (f.requesterFilters.length && !f.requesterFilters.includes(item.plex_user_id)) return false;
  return true;
}

/** Valeur d'un groupe de filtres et moyen de la changer. */
interface FilterField { value: string; set: (v: string) => void }
type FilterFieldKey = 'sort' | 'genre' | 'audioFormat' | 'releaseType' | 'hiRes' | 'decade'
  | 'status' | 'vf' | 'subtitle' | 'source' | 'requester' | 'server';
export type LibraryFilterFields = Record<FilterFieldKey, FilterField>;

interface FilterGroupContext {
  /** Forme « musique » (Artistes / Albums / Pistes) : elle n'a pas les memes criteres. */
  music: boolean;
  sources: string[];
  requesters: Array<{ id: string; label: string }>;
  servers: any[];
}

/* Filtres : des definitions (donnees), rendues par le meme composant que les autres pages.
   La forme « musique » n'a pas les memes criteres que films et series. */
const ALL = { value: '', label: 'Tous' };
function group(key: string, label: string, options: Array<{ value: string; label: string }>, field: FilterField, fallback = ''): FilterGroupDefinition {
  return { key, label, options, value: field.value, set: field.set, fallback };
}
const fromPairs = (pairs: string[][]) => pairs.map(([value, label]) => ({ value, label }));

export function libraryFilterGroups(fields: LibraryFilterFields, { music, sources, requesters, servers }: FilterGroupContext): FilterGroupDefinition[] {
  const groups: FilterGroupDefinition[] = music
    ? [
      group('sort', 'Tri', [{ value: '', label: 'Ajouts récents' }, { value: 'title_asc', label: 'Titre (A-Z)' }, { value: 'title_desc', label: 'Titre (Z-A)' }, { value: 'year_desc', label: 'Année (récent → ancien)' }], fields.sort),
      group('genre', 'Genre', [ALL, ...['Rock', 'Pop', 'Jazz', 'Electronic', 'Hip-Hop', 'Metal', 'Classical', 'Blues', 'Folk', 'Indie'].map((g) => ({ value: g, label: g }))], fields.genre),
      group('audioFormat', 'Format', [ALL, ...fromPairs([['FLAC', 'FLAC'], ['ALAC', 'ALAC'], ['WAV', 'WAV'], ['MP3', 'MP3'], ['AAC', 'AAC / M4A'], ['OGG', 'OGG']])], fields.audioFormat),
      group('releaseType', 'Type', [ALL, ...fromPairs([['album', 'Album Studio'], ['single', 'Single / EP'], ['live', 'Concert / Live'], ['compilation', 'Compilation']])], fields.releaseType),
      group('hiRes', 'Qualité', [{ value: '', label: 'Toutes' }, { value: 'hi_res', label: 'Hi-Res (24-bit / 96kHz+)' }, { value: 'standard', label: 'CD Standard (16-bit)' }], fields.hiRes),
      group('decade', 'Époque', [{ value: '', label: 'Toutes' }, ...fromPairs([['2020s', '2020+'], ['2010s', 'Années 2010'], ['2000s', 'Années 2000'], ['90s', 'Années 90'], ['80s', 'Années 80'], ['70s', 'Années 70 et avant']])], fields.decade),
    ]
    : [
      group('status', 'Statut', [{ value: '', label: 'Tous les statuts' }, { value: 'library', label: 'Dans Plex' }, { value: 'in_progress', label: 'En cours' }, { value: 'partially_available', label: 'Partiellement dispo' }, { value: 'orphan', label: 'Suivi Sonarr/Radarr' }, { value: 'pending_approval', label: 'À approuver' }, { value: 'pending', label: 'En attente' }, { value: 'sent_to_arr', label: 'Transmise' }, { value: 'failed', label: 'Échec' }, { value: 'rejected', label: 'Refusée' }], fields.status, 'library'),
      group('vf', 'Version', [{ value: '', label: 'Toutes les langues' }, { value: 'vf', label: 'VF uniquement' }, { value: 'vf_secondary', label: 'VF secondaire' }, { value: 'vo', label: 'VO uniquement' }, { value: 'mixed', label: 'Mixte (VF + VO)' }, { value: 'unchecked', label: 'Non analysée' }], fields.vf),
      group('subtitle', 'Sous-titres', [ALL, { value: 'any_issue', label: 'Problème sous-titre FR' }, { value: 'sub_fr_absent', label: 'Sous-titre FR absent' }, { value: 'sub_fr_no_track', label: 'Sous-titres incrustés' }, { value: 'sub_fr_not_default', label: 'Sous-titre FR non activé' }, { value: 'forced_fr_not_default', label: 'Sous-titre forcé FR non activé' }], fields.subtitle),
      ...(sources.length ? [group('source', 'Source', [{ value: '', label: 'Toutes' }, ...sources.map((value: string) => ({ value, label: value }))], fields.source)] : []),
      ...(requesters.length > 1 ? [group('requester', 'Demandeur', [ALL, ...requesters.map((r: any) => ({ value: r.id, label: r.label }))], fields.requester)] : []),
    ];
  if (servers.length > 1) {
    groups.push(group('server', 'Serveur', [ALL, ...servers.map((server: any) => ({ value: String(server.id), label: server.name }))], fields.server));
  }
  return groups;
}
