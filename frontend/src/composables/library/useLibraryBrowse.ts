import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { REQUEST_STATUSES } from '@/utils/labels';
import { useLibraryHubs, type LibraryHub } from '@/composables/useLibraryHubs';
import type { LibraryFilters } from './useLibraryFilters';

/**
 * Pages d'atterrissage de la Bibliotheque (gabarit Parcourir) : quel hub remplace la grille
 * selon les filtres actifs, sa banniere, ses rangees et ou mene le titre de chacune.
 */
export function useLibraryBrowse(filters: LibraryFilters, onError: (message: string) => void) {
  const route = useRoute();
  const router = useRouter();
  const {
    query, statusFilters, typeFilters, vf, sourceFilters, requesterFilters,
    decade, sort, genre, audioFormat, releaseType, hiRes, plexServer,
  } = filters;

  // Atterrissage "hub" sur Musiques : seulement quand aucun filtre n'affine la vue par
  // defaut (les 3 sous-types de musique tous selectionnes, aucun autre critere) -- des
  // qu'un filtre est pose, la grille classique (deja filtree) est plus utile qu'un hub qui
  // ne saurait pas quoi mettre en avant.
  const isMusicShape = computed(() =>
    typeFilters.value.length === 3 && ['artist', 'album', 'track'].every(t => typeFilters.value.includes(t))
  );
  const isMusicHub = computed(() => {
    if (!isMusicShape.value) return false;
    return !query.value.trim() && !decade.value && !genre.value && !audioFormat.value
      && !releaseType.value && !hiRes.value && !sort.value && !plexServer.value;
  });

  // Meme principe pour Films/Series : atterrissage "hub" (derniers ajouts + dernieres
  // demandes) quand un seul type est choisi et qu'aucun autre filtre n'est pose --
  // contrairement a la musique, un seul sous-type existe ici (pas d'Artistes/Albums/
  // Pistes), donc pas de sous-navigation, juste les deux rangees.
  const singleType = computed(() => (typeFilters.value.length === 1 ? typeFilters.value[0] : ''));
  const isMovieShowShape = computed(() => ['movie', 'show'].includes(singleType.value));
  const isMovieShowHub = computed(() => {
    if (!isMovieShowShape.value) return false;
    return !query.value.trim()
      && statusFilters.value.length === 1 && statusFilters.value[0] === 'library'
      && !vf.value && !sourceFilters.value.length && !requesterFilters.value.length
      && !sort.value && !decade.value && !genre.value && !plexServer.value;
  });

  // Hub "Tout" : meme principe pour la vue d'atterrissage sans type selectionne --
  // hero + une rangee par bibliotheque + dernieres demandes, façon accueil Plex.
  const isAllShape = computed(() => !typeFilters.value.length);
  const isAllHub = computed(() => {
    if (!isAllShape.value) return false;
    return !query.value.trim()
      && statusFilters.value.length === 1 && statusFilters.value[0] === 'library'
      && !vf.value && !sourceFilters.value.length && !requesterFilters.value.length
      && !sort.value && !decade.value && !genre.value && !plexServer.value;
  });

  // Rangees des trois pages d'atterrissage. Les predicats isAllHub/isMusicHub/
  // isMovieShowHub restent ici : ils dependent des filtres actifs, pas du chargement.
  /** Hub affiche a la place de la grille, s'il y en a un. */
  const activeHub = computed<LibraryHub>(() =>
    isAllHub.value ? 'all' : isMusicHub.value ? 'music' : isMovieShowHub.value ? 'type' : null);
  const { music: musicHub, all: allHub, type: typeHub, refreshActiveHub } =
    useLibraryHubs({ activeHub, hubMediaType: singleType, onError });
  const { recent: musicHubRecent, artists: musicHubArtists, albums: musicHubAlbums, tracks: musicHubTracks, loading: musicHubLoading } = musicHub;
  const { recent: allHubRecent, movies: allHubMovies, shows: allHubShows, music: allHubMusic, requests: allHubRequests, loading: allHubLoading } = allHub;
  const { recent: typeHubRecent, requests: typeHubRequests, genreRows: typeHubGenreRows, loading: typeHubLoading } = typeHub;
  /** Chargement du hub affiche. */
  const hubLoading = computed(() => {
    if (activeHub.value === 'all') return allHub.loading.value;
    if (activeHub.value === 'music') return musicHub.loading.value;
    if (activeHub.value === 'type') return typeHub.loading.value;
    return false;
  });

  function detailQuery(): Record<string, any> {
    const query: Record<string, any> = { ...route.query };
    delete query.hub;
    return query;
  }
  // Cible d'un clic sur l'en-tete d'une rangee du hub -- meme mecanisme que
  // la sidebar Bibliotheque (spaces.js, libraryTarget) : clone la query active pour ne pas ecraser d'autres
  // filtres, ne fixe que "type".
  function musicFilterTarget(types: string[]) {
    return { path: '/library', query: { ...detailQuery(), type: types } };
  }
  function allRequestsTarget() {
    return { path: '/library', query: { ...detailQuery(), status: REQUEST_STATUSES } };
  }
  function genreFilterTarget(g: string) {
    return { path: '/library', query: { ...detailQuery(), genre: g } };
  }
  // Clic sur "Derniers ajouts" : pas un sous-type a filtrer (musique comme films/series
  // gardent le meme typeFilters), juste un tri explicite qui fait sortir du hub -- sort
  // est porte dans l'URL pour que la grille reste selectionnee apres navigation retour.
  function showAllByRecent() {
    router.push({ path: '/library', query: { ...detailQuery(), sort: 'added_desc' } });
  }
  // "Dernieres demandes" filtre sur les statuts "en cours" (meme raccourci que la modale
  // Filtres, voir onDraftStatusChange) plutot que sur un statut "in_progress" litteral :
  // route.query.status est lu tel quel par le watcher de route.query, sans l'expansion que
  // fait la modale sur son propre brouillon.
  function typeRequestsTarget() {
    return { path: '/library', query: { ...detailQuery(), type: [singleType.value], status: REQUEST_STATUSES } };
  }

  /* Pages d'atterrissage (gabarit Parcourir) : banniere et rangees de chaque hub. */
  const hubRows = computed<any[]>(() => {
    const empty = 'Aucun média.';
    if (activeHub.value === 'all') {
      return [
        { kind: 'posters', key: 'recent', title: 'Derniers ajouts', items: allHubRecent.value, loading: allHubLoading.value, clickable: true, emptyMessage: empty },
        { kind: 'posters', key: 'requests', title: 'Dernières demandes', items: allHubRequests.value, loading: allHubLoading.value, moreTo: allRequestsTarget(), emptyMessage: empty },
        { kind: 'posters', key: 'movies', title: 'Films', items: allHubMovies.value, loading: allHubLoading.value, moreTo: musicFilterTarget(['movie']), emptyMessage: empty },
        { kind: 'posters', key: 'shows', title: 'Séries', items: allHubShows.value, loading: allHubLoading.value, moreTo: musicFilterTarget(['show']), emptyMessage: empty },
        { kind: 'posters', key: 'music', title: 'Musique', items: allHubMusic.value, loading: allHubLoading.value, moreTo: musicFilterTarget(['artist', 'album', 'track']), size: 'music', emptyMessage: empty },
      ];
    }
    if (activeHub.value === 'music') {
      return [
        { kind: 'posters', key: 'recent', title: 'Derniers ajouts', items: musicHubRecent.value, loading: musicHubLoading.value, clickable: true, size: 'music', emptyMessage: empty },
        { kind: 'posters', key: 'artists', title: 'Artistes', items: musicHubArtists.value, loading: musicHubLoading.value, moreTo: musicFilterTarget(['artist']), size: 'music', emptyMessage: empty },
        { kind: 'posters', key: 'albums', title: 'Albums', items: musicHubAlbums.value, loading: musicHubLoading.value, moreTo: musicFilterTarget(['album']), size: 'music', emptyMessage: empty },
        { kind: 'posters', key: 'tracks', title: 'Titres', items: musicHubTracks.value, loading: musicHubLoading.value, moreTo: musicFilterTarget(['track']), size: 'music', emptyMessage: empty },
      ];
    }
    if (activeHub.value === 'type') {
      return [
        { kind: 'posters', key: 'recent', title: 'Derniers ajouts', items: typeHubRecent.value, loading: typeHubLoading.value, clickable: true, emptyMessage: empty },
        { kind: 'posters', key: 'requests', title: 'Dernières demandes', items: typeHubRequests.value, loading: typeHubLoading.value, moreTo: typeRequestsTarget(), emptyMessage: empty },
        ...typeHubGenreRows.value.map((row: any) => ({ kind: 'posters', key: `genre-${row.genre}`, title: row.genre, items: row.items, loading: typeHubLoading.value, moreTo: genreFilterTarget(row.genre), emptyMessage: empty })),
      ];
    }
    return [];
  });
  const heroItems = computed<any[]>(() => {
    if (activeHub.value === 'all') return allHubRecent.value.slice(0, 5);
    if (activeHub.value === 'type') return typeHubRecent.value.slice(0, 5);
    return [];
  });
  /** Le titre « Derniers ajouts » mene a la grille triee par ajout. */
  function onHubTitleClick(rowKey: string): void {
    if (rowKey === 'recent') showAllByRecent();
  }

  return { activeHub, isMusicShape, hubLoading, refreshActiveHub, hubRows, heroItems, onHubTitleClick };
}
