import { mediaDetailPath } from '@/mediaUrl';

/* Regles et donnees fixes d'Explorer (Decouvrir) : options des filtres, rangees de genres,
   adresses du catalogue et libelles d'une carte. Rien ici ne lit l'etat de la page. */

export const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Plus populaires' },
  { value: 'primary_release_date.desc', label: 'Plus récents' },
  { value: 'vote_average.desc', label: 'Mieux notés' },
];
export const SORT_VALUES = SORT_OPTIONS.map((option) => option.value);
export const AVAILABILITY_OPTIONS = [
  { value: '', label: 'Tous les états' },
  { value: 'available', label: 'Dans Plex' },
  { value: 'requested', label: 'Déjà demandé' },
  { value: 'new', label: 'À demander' },
];
export const AVAILABILITY_VALUES = ['available', 'requested', 'new'];
export const MEDIA_TYPES = [
  { value: 'all', label: 'Tout' },
  { value: 'movie', label: 'Films' },
  { value: 'show', label: 'Séries' },
];
export const SECTIONS = [
  { value: 'trending', label: 'Tendances' },
  { value: 'popular', label: 'Populaires' },
  { value: 'coming-soon', label: 'Bientôt' },
  { value: 'genres', label: 'Par genre' },
];
export const VALID_SECTIONS = new Set(SECTIONS.map((section) => section.value));
const VALID_MEDIA_TYPES = new Set(MEDIA_TYPES.map((type) => type.value));
export const EXPLORE_PATHS = ['/discover/explore', '/discover/movies', '/discover/shows'];

export const GENRE_RAILS = [
  { key: 'genre_action', title: 'Action & Aventure', genre: '28' },
  { key: 'genre_scifi', title: 'Science-Fiction & Fantastique', genre: '878' },
  { key: 'genre_animation', title: 'Animation', genre: '16' },
  { key: 'genre_comedy', title: 'Comédies', genre: '35' },
  { key: 'genre_thriller', title: 'Thrillers & Policiers', genre: '5388' },
  { key: 'genre_horror', title: 'Horreur & Mystère', genre: '27' },
];
/* Les plateformes n'ont pas le genre « Thrillers & Policiers » combine de l'accueil (5388). */
export const PROVIDER_GENRE_RAILS = GENRE_RAILS.map((rail) => (rail.key === 'genre_thriller' ? { ...rail, genre: '53' } : rail));
export const REQUESTABLE_ROWS = new Set(['trending', 'popular_movies', 'popular_tv', 'upcoming', 'movies', 'shows', ...GENRE_RAILS.map((rail) => rail.key)]);

export function mediaTypeFromLocation(params: URLSearchParams, path: string): string {
  if (path === '/discover/movies') return 'movie';
  if (path === '/discover/shows') return 'show';
  const type = params.get('type');
  return type && VALID_MEDIA_TYPES.has(type) ? type : 'all';
}

/** Type impose par l'adresse (pages Films et Series), sinon vide. */
export function fixedMediaTypeFor(path: string): string {
  return path === '/discover/movies' ? 'movie' : path === '/discover/shows' ? 'show' : '';
}

export function explorePathFor(fixedMediaType: string): string {
  return fixedMediaType === 'movie' ? '/discover/movies' : fixedMediaType === 'show' ? '/discover/shows' : '/discover/explore';
}

export interface CatalogRequest {
  query: string;
  mediaType: string;
  sortBy: string;
  sourceKey: string;
  section: string;
  genre: string;
}

/** Adresse d'une page du catalogue, selon la recherche, le diffuseur ou la section. */
export function catalogEndpoint(request: CatalogRequest, targetPage: number): string {
  const type = `media_type=${request.mediaType}`;
  const pagination = `page=${targetPage}&paginated=true`;
  const sortParam = request.sortBy ? `&sort_by=${request.sortBy}` : '';
  const q = request.query.trim();
  if (q) return `/api/discover/search?query=${encodeURIComponent(q)}&${type}&${pagination}`;
  if (request.sourceKey) {
    const [kind, id] = request.sourceKey.split(':');
    return `/api/discover/source/${kind}/${id}?${type}&${pagination}${sortParam}`;
  }
  // Dès qu'un genre est sélectionné ou qu'un tri spécifique est demandé, on interroge le catalogue /discover
  if (request.genre || (request.sortBy && request.sortBy !== 'popularity.desc')) {
    return `/api/discover/discover?${type}&${pagination}${request.genre ? `&genre=${request.genre}` : ''}${sortParam}`;
  }
  if (request.section === 'trending') return `/api/discover/trending?${type}&${pagination}`;
  if (request.section === 'popular') return `/api/discover/popular?${type}&${pagination}`;
  if (request.section === 'coming-soon') return `/api/discover/coming-soon?${type}&${pagination}`;
  return `/api/discover/discover?${type}&${pagination}${sortParam}`;
}

export function detailPath(item: any) {
  const kind = item.library_id ? 'library' : item.request_id ? 'request' : 'discover';
  return mediaDetailPath(item, kind, { discover: true });
}
export function cardActionLabel(item: any) {
  if (item.in_library || item.library_id) return 'Voir la fiche';
  if (item.requested || item.request_id) return 'Suivre la demande';
  return 'Demander';
}
export function canRequest(item: any) {
  return !item.in_library && !item.library_id && !item.requested && !item.request_id;
}

/** Une rangee d'affiches du gabarit Parcourir, depuis l'etat d'une section. */
export function posterRow(key: string, title: string, state: any, moreTo?: any) {
  return { kind: 'posters', key, title, items: state.items, loading: state.loading, error: state.error, moreTo: moreTo || null, emptyMessage: 'Aucun média à afficher.' };
}
