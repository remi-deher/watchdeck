import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { mediaDetailPath } from '@/mediaUrl';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { chipsFromGroups } from '@/composables/useFiltersDrawer';
import { LIBRARY_SCROLL_KEY, libraryFilterGroups } from '@/composables/library/libraryRules';
import { useLibraryFilters } from '@/composables/library/useLibraryFilters';
import { useLibraryBrowse } from '@/composables/library/useLibraryBrowse';
import { useLibraryGrid } from '@/composables/library/useLibraryGrid';

// L'overview d'une piste porte le titre de son album ("Artiste / Album: {titre}", voir
// plex_finder._plex_item_to_dict) -- une piste n'a pas de page de fiche dediee (pas de
// codec/duree affiches hors contexte album), on redirige donc vers l'album parent plutot
// que d'ouvrir la fiche de la piste elle-meme.
async function openTrackAlbum(item: any): Promise<any> {
  const match = /^Artiste \/ Album: (.+)$/m.exec(item.overview || '');
  const albumTitle = match ? match[1].trim() : '';
  if (albumTitle) {
    try {
      const albums = await api(`/api/library?media_types=album&query=${encodeURIComponent(albumTitle)}&limit=5`);
      const album = albums.find((a: any) => a.title === albumTitle) || albums[0];
      if (album) return album;
    } catch {
      // Recherche d'album impossible (reseau, Plex indisponible...) : on retombe sur la
      // fiche de la piste plutot que de bloquer la navigation.
    }
  }
  return null;
}

/**
 * Donnees et etat de la Bibliotheque (gabarits Parcourir et Explorer) : filtres portes par
 * l'adresse (`library/useLibraryFilters`), hubs de depart (`library/useLibraryBrowse`),
 * grille paginee -- medias Plex, demandes, orphelins *arr (`library/useLibraryGrid`).
 * La page n'en tire que de quoi afficher : aucune action n'est decidee ici.
 */
export function useLibraryExplorer() {
  const route = useRoute();
  const router = useRouter();

  async function openDetail(item: any): Promise<void> {
    sessionStorage.setItem(LIBRARY_SCROLL_KEY, String(window.scrollY));
    if (item.media_type === 'track') {
      const album = await openTrackAlbum(item);
      if (album) {
        ouvrirFiche(router, mediaDetailPath(album, 'library'), route.fullPath);
        return;
      }
    }
    ouvrirFiche(router, mediaDetailPath(item, item._kind), route.fullPath);
  }

  const error = ref('');
  const filters = useLibraryFilters();
  const { query, activeFilterCount, resetFilters } = filters;
  const { activeHub, isMusicShape, hubLoading, refreshActiveHub, hubRows, heroItems, onHubTitleClick } =
    useLibraryBrowse(filters, (message) => { error.value = message; });
  const {
    items, loading, loadingMore, hasMore, sources, requesters, libraryServers, serverNamesFor,
    primeFromCache, refreshRequestData, gridUpToDate, load, loadMore,
  } = useLibraryGrid({ filters, activeHub, hubLoading, refreshActiveHub, error });

  filters.watchChanges(() => { void load(); });

  useRealtime(['request.updated'], (type?: string, event?: any) => {
    if (!type || ['plex-sync', 'plex-sync-recent'].includes(event?.job) || event?.library_changed) {
      return load();
    }
    return refreshRequestData().catch(() => {});
  });
  onMounted(async () => {
    primeFromCache();
    await load();
  });

  /* La frappe relit la grille apres 250 ms : une lecture devenue obsolete est annulee par
     TanStack Query au changement de cle. Rien a relire si la requete n'a pas change (la
     route vient de poser la meme valeur). */
  const scheduleLoad = useDebounceFn(() => {
    if (gridUpToDate()) return;
    void load();
  }, 250);
  watch(query, () => { scheduleLoad(); });

  const libraryItemKey = (item: any): string => `${item._kind}-${item.id}`;

  const filterGroups = computed(() => libraryFilterGroups(filters.fields(), {
    music: isMusicShape.value,
    sources: sources.value,
    requesters: requesters.value,
    servers: libraryServers.value,
  }));
  /* Filtres actifs, en pastilles retirables au-dessus des resultats. */
  const chips = computed(() => chipsFromGroups(filterGroups.value));

  return {
    query, activeHub, isMusicShape, filterGroups, chips, activeFilterCount, resetFilters,
    hubRows, heroItems, onHubTitleClick,
    items, loading, loadingMore, hasMore, error, load, loadMore,
    libraryItemKey, serverNamesFor, openDetail,
  };
}
