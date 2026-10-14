import { computed, ref, watch, type WritableComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import {
  IN_PROGRESS_STATUSES, LIBRARY_FILTERS_KEY, REQUESTED_SORT_STATUSES, queryList,
  type LibraryFilterFields, type LibraryFilterValues,
} from './libraryRules';

const field = (source: Ref<string> | WritableComputedRef<string>) => ({
  value: source.value,
  set: (v: string) => { source.value = v; },
});

/**
 * Filtres de la Bibliotheque : portes par l'adresse, retenus en session (sauf retour au
 * hub, `?hub=1`), resynchronises quand l'adresse change.
 */
export function useLibraryFilters() {
  const route = useRoute();
  const router = useRouter();

  // La modale Filtres modifie aussi le sous-type musical (Artistes/Albums/Pistes) -- on passe
  // par l'URL plutot que d'assigner typeFilters.value directement, pour rester coherent avec
  // la sidebar Bibliotheque (spaces.js) qui pilote deja le type de media via route.query.type. Le
  // watcher sur route.query se charge ensuite de mettre typeFilters a jour et de recharger.
  const savedFilters = JSON.parse(sessionStorage.getItem(LIBRARY_FILTERS_KEY) || '{}');
  const hubRequested = route.query.hub === '1';

  const query = ref(String(route.query.query || (!hubRequested && savedFilters.query) || ''));
  const statusFilters = ref<string[]>(
    route.query.status
      ? queryList(route.query.status)
      : (route.query.sort === 'requested_desc' ? [...REQUESTED_SORT_STATUSES] : ((!hubRequested && savedFilters.statusFilters) || ['library']))
  );
  const typeFilters = ref<string[]>(
    route.query.type
      ? queryList(route.query.type)
      : (!hubRequested && savedFilters.typeFilters) || []
  );
  const vf = ref(String(route.query.vf || (!hubRequested && savedFilters.vf) || ''));
  const subtitle = ref(String(route.query.subtitle || (!hubRequested && savedFilters.subtitle) || ''));
  const sourceFilters = ref<string[]>((!hubRequested && savedFilters.sourceFilters) || []);
  const requesterFilters = ref<string[]>((!hubRequested && savedFilters.requesterFilters) || []);
  const decade = ref(String(route.query.decade || (!hubRequested && savedFilters.decade) || ''));
  const sort = ref(String(route.query.sort || (!hubRequested && savedFilters.sort) || ''));
  const genre = ref(String(route.query.genre || (!hubRequested && savedFilters.genre) || ''));
  const audioFormat = ref(String(route.query.audio_format || (!hubRequested && savedFilters.audioFormat) || ''));
  const releaseType = ref(String(route.query.release_type || (!hubRequested && savedFilters.releaseType) || ''));
  const hiRes = ref(String(route.query.hi_res || (!hubRequested && savedFilters.hiRes) || ''));
  // Serveur Plex (Bibliotheque multi-serveurs) : ne montre que les medias vus sur lui.
  const plexServer = ref(String(route.query.server || (!hubRequested && savedFilters.plexServer) || ''));
  // La sidebar Bibliotheque (spaces.js) derive son onglet actif uniquement de
  // route.query.type -- si on arrive sur /library sans query et que typeFilters a ete
  // restaure depuis sessionStorage, la query ne le reflete pas encore : l'onglet actif
  // n'apparaitrait pas au premier rendu bien que le filtrage soit deja correct. On pousse
  // une seule fois la valeur restauree dans l'URL pour que la sidebar la reflete direct.
  if (!hubRequested && !route.query.type && typeFilters.value.length) {
    router.replace({ query: { ...route.query, type: typeFilters.value } });
  }

  const statusSingle = computed({
    get: (): string => {
      if (!statusFilters.value.length) return '';
      if (statusFilters.value.some(s => IN_PROGRESS_STATUSES.includes(s))) return 'in_progress';
      return statusFilters.value[0] || 'library';
    },
    set: (v: string) => {
      if (!v) statusFilters.value = [];
      else if (v === 'in_progress') statusFilters.value = [...IN_PROGRESS_STATUSES];
      else statusFilters.value = [v];
    },
  });
  const sourceSingle = computed({
    get: (): string => sourceFilters.value[0] || '',
    set: (v: string) => { sourceFilters.value = v ? [v] : []; },
  });
  const requesterSingle = computed({
    get: (): string => requesterFilters.value[0] || '',
    set: (v: string) => { requesterFilters.value = v ? [v] : []; },
  });

  const { activeCount: activeFilterCount, reset: resetFilters } = useFiltersDrawer(
    { statusFilters, vf, subtitle, sourceFilters, requesterFilters, decade, sort, genre, audioFormat, releaseType, hiRes, plexServer, query },
    {
      statusFilters: ['library'],
      vf: '',
      subtitle: '',
      sourceFilters: [],
      requesterFilters: [],
      decade: '',
      sort: '',
      genre: '',
      audioFormat: '',
      releaseType: '',
      hiRes: '',
      plexServer: '',
      query: '',
    }
  );

  /** Valeurs courantes, lues par les parametres envoyes au serveur et retenues en session. */
  function values(): LibraryFilterValues {
    return {
      query: query.value,
      statusFilters: statusFilters.value,
      typeFilters: typeFilters.value,
      vf: vf.value,
      subtitle: subtitle.value,
      sourceFilters: sourceFilters.value,
      requesterFilters: requesterFilters.value,
      decade: decade.value,
      sort: sort.value,
      genre: genre.value,
      audioFormat: audioFormat.value,
      releaseType: releaseType.value,
      hiRes: hiRes.value,
      plexServer: plexServer.value,
    };
  }

  /** Valeur et modification de chaque groupe de la feuille Filtres. */
  function fields(): LibraryFilterFields {
    return {
      sort: field(sort), genre: field(genre), audioFormat: field(audioFormat), releaseType: field(releaseType),
      hiRes: field(hiRes), decade: field(decade), status: field(statusSingle), vf: field(vf), subtitle: field(subtitle),
      source: field(sourceSingle), requester: field(requesterSingle), server: field(plexServer),
    };
  }

  function syncFromRoute(): void {
    const value: any = route.query;
    const returningToHub = value.hub === '1';
    query.value = value.query || '';
    statusFilters.value = value.status
      ? queryList(value.status)
      : (value.sort === 'requested_desc' ? [...REQUESTED_SORT_STATUSES] : ['library']);
    typeFilters.value = value.type ? queryList(value.type) : [];
    // Les titres des rangees naviguent avec des query params (genre, tri, etc.).
    // Resynchroniser tous les filtres pilotes par l'URL est indispensable : sinon
    // l'adresse changeait bien, mais le hub restait affiche avec les anciennes valeurs.
    vf.value = value.vf || '';
    decade.value = value.decade || '';
    sort.value = value.sort || '';
    genre.value = value.genre || '';
    audioFormat.value = value.audio_format || '';
    releaseType.value = value.release_type || '';
    hiRes.value = value.hi_res || '';
    // Comme les sous-titres : le serveur choisi survit aux changements d'onglet de type.
    if (value.server) plexServer.value = String(value.server);
    if (returningToHub) {
      sourceFilters.value = [];
      requesterFilters.value = [];
    }
  }

  /** Relance `onChange` quand l'adresse ou un filtre change (apres l'avoir retenu en session). */
  function watchChanges(onChange: () => void): void {
    /* Surveille l'adresse, pas l'objet `route.query`. Posee derriere une fiche, la page lit
       la route de fond (RouteScope), puis la route courante a la fermeture : deux objets
       differents pour la meme adresse. Chacun relancait ce watcher, qui reassignait les
       filtres et rechargeait la grille -- la page se rafraichissait et remontait en haut a
       chaque ouverture et fermeture de fiche. */
    watch(() => route.fullPath, () => {
      syncFromRoute();
      onChange();
    });
    // `vf` fait partie de la liste depuis que le filtre est applique en SQL : tant qu'il ne
    // servait qu'au filtrage client, le changer suffisait a recalculer la liste sans
    // rechargement -- ce n'est plus le cas.
    watch(
      [statusFilters, typeFilters, sourceFilters, requesterFilters, vf, subtitle, decade, sort, genre, audioFormat, releaseType, hiRes, plexServer],
      () => {
        sessionStorage.setItem(LIBRARY_FILTERS_KEY, JSON.stringify(values()));
        onChange();
      },
      { deep: true },
    );
  }

  return {
    query, statusFilters, typeFilters, vf, sourceFilters, requesterFilters, decade, sort, genre,
    audioFormat, releaseType, hiRes, plexServer,
    values, fields, activeFilterCount, resetFilters, watchChanges,
  };
}

export type LibraryFilters = ReturnType<typeof useLibraryFilters>;
