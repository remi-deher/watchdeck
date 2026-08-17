<template>
  <div class="page">
    <PageSearchHeader title="Bibliothèque" description="Catalogue Plex, demandes en cours et suivi des versions." v-model:query="query" placeholder="Rechercher un média…" has-filters :active-count="activeFilterCount" :filters-open="filtersOpen" @search="onSearch" @toggle-filters="toggleFilters" />

    <BulkActionBar v-if="canModerate" :count="selectedIds.length" singular="demande sélectionnée" plural="demandes sélectionnées" clear-label="Annuler" @clear="selectedIds=[]">
      <UiButton size="sm" @click="bulk('retry')"><template #icon><RotateCcw/></template>Relancer</UiButton>
      <UiButton size="sm" @click="bulk('mark-processed')"><template #icon><CheckCheck/></template>Traiter</UiButton>
      <UiButton variant="danger" size="sm" @click="bulk('delete')"><template #icon><Trash2/></template>Supprimer</UiButton>
    </BulkActionBar>

    <div class="psh-layout">
      <FilterSidebar :open="filtersOpen" :active-count="activeFilterCount" @close="closeFilters" @reset="resetFilters">
        <template v-if="!isMusicShape">
          <FilterGroup label="Statut">
            <button class="filter-badge" :class="{ active: !statusSingle }" @click="statusSingle = ''"><span>Tous les statuts</span></button>
            <button class="filter-badge" :class="{ active: statusSingle === 'library' }" @click="statusSingle = 'library'"><span>Dans Plex</span></button>
            <button class="filter-badge" :class="{ active: statusSingle === 'in_progress' }" @click="statusSingle = 'in_progress'"><span>En cours</span></button>
            <button class="filter-badge" :class="{ active: statusSingle === 'partially_available' }" @click="statusSingle = 'partially_available'"><span>Partiellement dispo</span></button>
            <button class="filter-badge" :class="{ active: statusSingle === 'orphan' }" @click="statusSingle = 'orphan'"><span>Suivi Sonarr/Radarr</span></button>
            <button class="filter-badge" :class="{ active: statusSingle === 'pending_approval' }" @click="statusSingle = 'pending_approval'"><span>À approuver</span></button>
            <button class="filter-badge" :class="{ active: statusSingle === 'pending' }" @click="statusSingle = 'pending'"><span>En attente</span></button>
            <button class="filter-badge" :class="{ active: statusSingle === 'sent_to_arr' }" @click="statusSingle = 'sent_to_arr'"><span>Transmise</span></button>
            <button class="filter-badge" :class="{ active: statusSingle === 'failed' }" @click="statusSingle = 'failed'"><span>Échec</span></button>
            <button class="filter-badge" :class="{ active: statusSingle === 'rejected' }" @click="statusSingle = 'rejected'"><span>Refusée</span></button>
          </FilterGroup>
          <FilterGroup label="Version">
            <button class="filter-badge" :class="{ active: !vf }" @click="vf = ''"><span>Toutes les langues</span></button>
            <button class="filter-badge" :class="{ active: vf === 'vf' }" @click="vf = 'vf'"><span>VF uniquement</span></button>
            <button class="filter-badge" :class="{ active: vf === 'vf_secondary' }" @click="vf = 'vf_secondary'"><span>VF secondaire</span></button>
            <button class="filter-badge" :class="{ active: vf === 'vo' }" @click="vf = 'vo'"><span>VO uniquement</span></button>
            <button class="filter-badge" :class="{ active: vf === 'mixed' }" @click="vf = 'mixed'"><span>Mixte (VF + VO)</span></button>
            <button class="filter-badge" :class="{ active: vf === 'unchecked' }" @click="vf = 'unchecked'"><span>Non analysée</span></button>
          </FilterGroup>
          <FilterGroup label="Sous-titres">
            <button class="filter-badge" :class="{ active: !subtitle }" @click="subtitle = ''"><span>Tous</span></button>
            <button class="filter-badge" :class="{ active: subtitle === 'any_issue' }" @click="subtitle = 'any_issue'"><span>Problème sous-titre FR</span></button>
            <button class="filter-badge" :class="{ active: subtitle === 'sub_fr_absent' }" @click="subtitle = 'sub_fr_absent'"><span>Sous-titre FR absent</span></button>
            <button class="filter-badge" :class="{ active: subtitle === 'sub_fr_no_track' }" @click="subtitle = 'sub_fr_no_track'"><span>Aucune piste ST (hardcoded?)</span></button>
            <button class="filter-badge" :class="{ active: subtitle === 'sub_fr_not_default' }" @click="subtitle = 'sub_fr_not_default'"><span>Sous-titre FR non activé</span></button>
            <button class="filter-badge" :class="{ active: subtitle === 'forced_fr_not_default' }" @click="subtitle = 'forced_fr_not_default'"><span>Sous-titre forcé FR non activé</span></button>
          </FilterGroup>
          <FilterGroup v-if="sources.length" label="Source">
            <button class="filter-badge" :class="{ active: !sourceSingle }" @click="sourceSingle = ''"><span>Toutes</span></button>
            <button v-for="s in sources" :key="s" class="filter-badge" :class="{ active: sourceSingle === s }" @click="sourceSingle = sourceSingle === s ? '' : s"><span>{{ s }}</span></button>
          </FilterGroup>
          <FilterGroup v-if="requesters.length > 1" label="Demandeur">
            <button class="filter-badge" :class="{ active: !requesterSingle }" @click="requesterSingle = ''"><span>Tous</span></button>
            <button v-for="r in requesters" :key="r.id" class="filter-badge" :class="{ active: requesterSingle === r.id }" @click="requesterSingle = requesterSingle === r.id ? '' : r.id"><span>{{ r.label }}</span></button>
          </FilterGroup>
        </template>
        <template v-else>
          <FilterGroup label="Tri">
            <button class="filter-badge" :class="{ active: !sort }" @click="sort = ''"><span>Ajouts récents</span></button>
            <button class="filter-badge" :class="{ active: sort === 'title_asc' }" @click="sort = 'title_asc'"><span>Titre (A-Z)</span></button>
            <button class="filter-badge" :class="{ active: sort === 'title_desc' }" @click="sort = 'title_desc'"><span>Titre (Z-A)</span></button>
            <button class="filter-badge" :class="{ active: sort === 'year_desc' }" @click="sort = 'year_desc'"><span>Année (récent → ancien)</span></button>
          </FilterGroup>
          <FilterGroup label="Genre">
            <button class="filter-badge" :class="{ active: !genre }" @click="genre = ''"><span>Tous</span></button>
            <button v-for="g in ['Rock','Pop','Jazz','Electronic','Hip-Hop','Metal','Classical','Blues','Folk','Indie']" :key="g" class="filter-badge" :class="{ active: genre === g }" @click="genre = genre === g ? '' : g"><span>{{ g }}</span></button>
          </FilterGroup>
          <FilterGroup label="Format">
            <button class="filter-badge" :class="{ active: !audioFormat }" @click="audioFormat = ''"><span>Tous</span></button>
            <button v-for="f in [['FLAC','FLAC'],['ALAC','ALAC'],['WAV','WAV'],['MP3','MP3'],['AAC','AAC / M4A'],['OGG','OGG']]" :key="f[0]" class="filter-badge" :class="{ active: audioFormat === f[0] }" @click="audioFormat = audioFormat === f[0] ? '' : f[0]"><span>{{ f[1] }}</span></button>
          </FilterGroup>
          <FilterGroup label="Type">
            <button class="filter-badge" :class="{ active: !releaseType }" @click="releaseType = ''"><span>Tous</span></button>
            <button v-for="t in [['album','Album Studio'],['single','Single / EP'],['live','Concert / Live'],['compilation','Compilation']]" :key="t[0]" class="filter-badge" :class="{ active: releaseType === t[0] }" @click="releaseType = releaseType === t[0] ? '' : t[0]"><span>{{ t[1] }}</span></button>
          </FilterGroup>
          <FilterGroup label="Qualité">
            <button class="filter-badge" :class="{ active: !hiRes }" @click="hiRes = ''"><span>Toutes</span></button>
            <button class="filter-badge" :class="{ active: hiRes === 'hi_res' }" @click="hiRes = hiRes === 'hi_res' ? '' : 'hi_res'"><span>Hi-Res (24-bit / 96kHz+)</span></button>
            <button class="filter-badge" :class="{ active: hiRes === 'standard' }" @click="hiRes = hiRes === 'standard' ? '' : 'standard'"><span>CD Standard (16-bit)</span></button>
          </FilterGroup>
          <FilterGroup label="Époque">
            <button class="filter-badge" :class="{ active: !decade }" @click="decade = ''"><span>Toutes</span></button>
            <button v-for="d in [['2020s','2020+'],['2010s','Années 2010'],['2000s','Années 2000'],['90s','Années 90'],['80s','Années 80'],['70s','Années 70 et avant']]" :key="d[0]" class="filter-badge" :class="{ active: decade === d[0] }" @click="decade = decade === d[0] ? '' : d[0]"><span>{{ d[1] }}</span></button>
          </FilterGroup>
        </template>
      </FilterSidebar>
      <div class="psh-main">

    <UiFeedback v-if="error" type="error" title="Impossible de charger la bibliothèque" :message="error" retry @retry="load" />

    <!-- Hub "Tout" : atterrissage façon accueil Plex quand aucun type/filtre n'est
         choisi -- hero sur le dernier ajout, puis une rangee par bibliotheque. -->
    <div v-if="isAllHub" class="music-hub">
      <MediaHeroBanner :items="allHubRecent.slice(0, 5)" :discover-context="false" @open="openDetail" />
      <MusicHubRow title="Derniers ajouts" :items="allHubRecent" :loading="allHubLoading" clickable @title-click="showAllByRecent" @open="openDetail" />
      <MusicHubRow title="Dernières demandes" :items="allHubRequests" :loading="allHubLoading" :more-to="allRequestsTarget()" @open="openDetail" />
      <MusicHubRow title="Films" :items="allHubMovies" :loading="allHubLoading" :more-to="musicFilterTarget(['movie'])" @open="openDetail" />
      <MusicHubRow title="Séries" :items="allHubShows" :loading="allHubLoading" :more-to="musicFilterTarget(['show'])" @open="openDetail" />
      <MusicHubRow title="Musique" :items="allHubMusic" :loading="allHubLoading" :more-to="musicFilterTarget(['artist','album','track'])" size="music" @open="openDetail" />
    </div>

    <!-- Hub Musique : atterrissage par defaut sur "Musiques" (aucun sous-type/filtre choisi)
         -- des rangees horizontales par categorie plutot qu'une grille melangeant
         artistes/albums/pistes. Des qu'un filtre est pose (recherche, sous-type, genre...),
         on retombe sur la grille classique ci-dessous. -->
    <div v-else-if="isMusicHub" class="music-hub">
      <MusicHubRow title="Derniers ajouts" :items="musicHubRecent" :loading="musicHubLoading" size="music" clickable @title-click="showAllByRecent" @open="openDetail" />
      <MusicHubRow title="Artistes" :items="musicHubArtists" :loading="musicHubLoading" :more-to="musicFilterTarget(['artist'])" size="music" @open="openDetail" />
      <MusicHubRow title="Albums" :items="musicHubAlbums" :loading="musicHubLoading" :more-to="musicFilterTarget(['album'])" size="music" @open="openDetail" />
      <MusicHubRow title="Titres" :items="musicHubTracks" :loading="musicHubLoading" :more-to="musicFilterTarget(['track'])" size="music" @open="openDetail" />
    </div>

    <!-- Hub Films/Series : hero + ajouts recents + demandes + rangees par genre (top
         genres reels, alimentes par le sync Plex -- voir /api/library-genres). -->
    <div v-else-if="isMovieShowHub" class="music-hub">
      <MediaHeroBanner :items="typeHubRecent.slice(0, 5)" :discover-context="false" @open="openDetail" />
      <MusicHubRow title="Derniers ajouts" :items="typeHubRecent" :loading="typeHubLoading" clickable @title-click="showAllByRecent" @open="openDetail" />
      <MusicHubRow title="Dernières demandes" :items="typeHubRequests" :loading="typeHubLoading" :more-to="typeRequestsTarget()" @open="openDetail" />
      <MusicHubRow
        v-for="row in typeHubGenreRows"
        :key="row.genre"
        :title="row.genre"
        :items="row.items"
        :loading="typeHubLoading"
        :more-to="genreFilterTarget(row.genre)"
        @open="openDetail"
      />
    </div>

    <template v-else>
      <p class="library-result-count" aria-live="polite">{{ filtered.length }} média{{ filtered.length>1?'s':'' }} affiché{{ filtered.length>1?'s':'' }}</p>

      <MediaPosterCollection
        :items="filtered"
        :loading="loading"
        :loading-more="loadingMore"
        :has-more="hasMoreLibrary"
        empty-message="Aucun média."
        :size="isMusicShape ? 'music' : 'standard'"
        @load-more="loadMore"
        @retry="load"
      >
        <LibraryCard
          v-for="item in filtered"
          :key="`${item._kind}-${item.id}`"
          :item="item"
          view="grid"
          :can-moderate="canModerate"
          :busy="busy"
          :selected="selectedIds.includes(item.id)"
          @open="openDetail"
          @toggle-select="toggleSelect"
          @act="act"
          @delete-orphan="deleteOrphan"
          @error="error = $event"
        />
      </MediaPosterCollection>
    </template>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
      </div><!-- .psh-main -->
    </div><!-- .psh-layout -->
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CheckCheck, Film, Layers, Music2, RefreshCw, RotateCcw, Trash2, Tv } from '@lucide/vue';
import { mediaDetailPath } from '@/mediaUrl';
import { REQUEST_STATUSES } from '@/utils/labels';
import { proxyUrl } from '@/utils/mediaImage';
import { api } from '@/api';
import { readCache, writeCache } from '@/cache';
import { useRealtime } from '@/events';
import { useConfirm } from '@/composables/useConfirm';
import { useAsyncAction } from '@/composables/useAsyncAction';
import { useDebounced } from '@/composables/useDebounced';
import { useLatestRequest } from '@/composables/useLatestRequest';
import { useLibraryHubs } from '@/composables/useLibraryHubs';
import { useFiltersDrawer } from '@/composables/useFiltersDrawer';
import { canModerateSession, isAdminSession, loadSession } from '@/composables/useSession';
import LibraryCard from '@/components/library/LibraryCard.vue';
import MusicHubRow from '@/components/library/MusicHubRow.vue';
import MediaHeroBanner from '@/components/media/MediaHeroBanner.vue';
import MediaPosterCollection from '@/components/media/MediaPosterCollection.vue';
import UiButton from '@/components/ui/UiButton.vue';
import BulkActionBar from '@/components/ui/BulkActionBar.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';

const route = useRoute();
const router = useRouter();
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const request = useLatestRequest();

// La modale Filtres modifie aussi le sous-type musical (Artistes/Albums/Pistes) -- on passe
// par l'URL plutot que d'assigner typeFilters.value directement, pour rester coherent avec
// la sidebar Bibliotheque (spaces.js) qui pilote deja le type de media via route.query.type. Le
// watcher existant sur route.query se charge ensuite de mettre typeFilters a jour et de
// recharger.
function onTypeFiltersChange(types: string[]): void {
  const q: Record<string, any> = { ...route.query };
  if (types.length) q.type = types;
  else delete q.type;
  router.replace({ path: '/library', query: q });
}

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

async function openDetail(item: any): Promise<void> {
  sessionStorage.setItem('library.scroll_position', String(window.scrollY));
  if (item.media_type === 'track') {
    const album = await openTrackAlbum(item);
    if (album) {
      router.push(mediaDetailPath(album, 'library'));
      return;
    }
  }
  router.push(mediaDetailPath(item, item._kind));
}

// Une page de 200 cartes represente ~47 ecrans de defilement sur un telephone (mesure
// a 375x812) : le chargement incremental existe, mais son grain etait pense pour un
// grand ecran. Le lot est reduit sous 640px, la sentinelle de defilement se chargeant
// d'enchainer. Fige au montage : changer la taille de lot en cours de session
// desalignerait les offsets deja demandes.
const PAGE_SIZE = window.matchMedia('(max-width: 640px)').matches ? 60 : 200;

const libraryItemsRaw = ref<any[]>([]);
const pendingRequests = ref<any[]>([]);
const allRequestsRaw = ref<any[]>([]);
const requestSummary = ref<Record<string, any>>({ total: 0, facets: { by_type: {}, sources: [], requesters: [] } });
const orphans = ref<any[]>([]);
const rawMetrics = ref<Record<string, any>>({});
const users = ref<any[]>([]);
const libraryOffset = ref(0);
const hasMoreLibrary = ref(false);
const loadingMore = ref(false);
const selectedIds = ref<any[]>([]);
const isAdmin = ref(false);
const canModerate = ref(false);
const busy = ref(false);

// Une demande partiellement disponible garde son library_item_id une fois indexee cote
// Plex : on exclut le LibraryItem correspondant pour ne pas l'afficher deux fois (une
// carte "en cours" avec son statut de progression suffit tant que ce n'est pas complet).
const items = computed(() => {
  const partialLibraryIds = new Set(
    pendingRequests.value.filter((x: any) => x.status === 'partially_available' && x.library_item_id).map((x: any) => x.library_item_id)
  );
  const libraryItems = partialLibraryIds.size
    ? libraryItemsRaw.value.filter((x: any) => !partialLibraryIds.has(x.id))
    : libraryItemsRaw.value;
  return [...libraryItems, ...pendingRequests.value, ...orphans.value];
});

const IN_PROGRESS_STATUSES = ['pending_approval', 'pending', 'sent_to_arr', 'partially_available'];
const savedFilters = JSON.parse(sessionStorage.getItem('library.active_filters') || '{}');
const hubRequested = route.query.hub === '1';

const query = ref(String(route.query.query || (!hubRequested && savedFilters.query) || ''));
const statusFilters = ref<string[]>(
  route.query.status
    ? (Array.isArray(route.query.status) ? route.query.status as string[] : [String(route.query.status)])
    : (route.query.sort === 'requested_desc' ? ['pending_approval', 'pending', 'sent_to_arr', 'partially_available', 'failed'] : ((!hubRequested && savedFilters.statusFilters) || ['library']))
);
const typeFilters = ref<string[]>(
  route.query.type
    ? (Array.isArray(route.query.type) ? route.query.type as string[] : [String(route.query.type)])
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
// La sidebar Bibliotheque (spaces.js) derive son onglet actif uniquement de
// route.query.type -- si on arrive sur /library sans query et que typeFilters a ete
// restaure depuis sessionStorage, la query ne le reflete pas encore : l'onglet actif
// n'apparaitrait pas au premier rendu bien que le filtrage soit deja correct. On pousse
// une seule fois la valeur restauree dans l'URL pour que la sidebar la reflete direct.
if (!hubRequested && !route.query.type && typeFilters.value.length) {
  router.replace({ query: { ...route.query, type: typeFilters.value } });
}

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
    && !releaseType.value && !hiRes.value && !sort.value;
});
// Cible d'un clic sur l'en-tete d'une rangee du hub -- meme mecanisme que
// la sidebar Bibliotheque (spaces.js, libraryTarget) : clone la query active pour ne pas ecraser d'autres
// filtres, ne fixe que "type".
function musicFilterTarget(types: string[]) {
  return { path: '/library', query: { ...detailQuery(), type: types } };
}

function detailQuery(): Record<string, any> {
  const query: Record<string, any> = { ...route.query };
  delete query.hub;
  return query;
}

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
    && !sort.value && !decade.value && !genre.value;
});

// Hub "Tout" : meme principe pour la vue d'atterrissage sans type selectionne --
// hero + une rangee par bibliotheque + dernieres demandes, façon accueil Plex.
const isAllShape = computed(() => !typeFilters.value.length);
const isAllHub = computed(() => {
  if (!isAllShape.value) return false;
  return !query.value.trim()
    && statusFilters.value.length === 1 && statusFilters.value[0] === 'library'
    && !vf.value && !sourceFilters.value.length && !requesterFilters.value.length
    && !sort.value && !decade.value && !genre.value;
});

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

const loading = ref(false);
const error = ref('');

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

const { filtersOpen, activeCount: activeFilterCount, toggle: toggleFilters, close: closeFilters, reset: resetFilters } = useFiltersDrawer(
  {
    statusFilters,
    vf,
    subtitle,
    sourceFilters,
    requesterFilters,
    decade,
    sort,
    genre,
    audioFormat,
    releaseType,
    hiRes,
    query,
  },
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
    query: '',
  }
);

// Rangees des trois pages d'atterrissage. Les predicats isAllHub/isMusicHub/
// isMovieShowHub restent ici : ils dependent des filtres actifs, pas du chargement.
const { music: musicHub, all: allHub, type: typeHub, loadMusicHub, loadAllHub, loadTypeHub } =
  useLibraryHubs({ isAbort: e => request.isAbort(e), onError: message => { error.value = message; } });
const { recent: musicHubRecent, artists: musicHubArtists, albums: musicHubAlbums, tracks: musicHubTracks, loading: musicHubLoading } = musicHub;
const { recent: allHubRecent, movies: allHubMovies, shows: allHubShows, music: allHubMusic, requests: allHubRequests, loading: allHubLoading } = allHub;
const { recent: typeHubRecent, requests: typeHubRequests, genreRows: typeHubGenreRows, loading: typeHubLoading } = typeHub;

const sources = computed(() => requestSummary.value.facets?.sources || []);
const requesters = computed(() => {
  if (requestSummary.value.facets?.requesters?.length) return requestSummary.value.facets.requesters;
  const seen = new Map<string, string>();
  for (const row of allRequestsRaw.value) {
    const id = row.plex_user_id;
    if (!id || seen.has(id)) continue;
    seen.set(id, row.requested_by || row.plex_user || id);
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
});

// La bibliotheque n'est concernee que si le filtre de statut inclut « Dans Plex » (ou
// n'en selectionne aucun). Un LibraryItem n'a par ailleurs pas de `source` -- c'est un
// media Plex, pas une demande : des qu'un filtre par source est actif, aucun ne peut
// correspondre, autant ne pas demander la page du tout.
const wantsLibraryItems = computed(() =>
  (!statusFilters.value.length || statusFilters.value.includes('library'))
  && !sourceFilters.value.length
);

// Les medias Plex et les demandes sont desormais filtres en SQL (voir _libraryParams et
// _requestListParams) : les refiltrer ici ne changerait rien au mieux, et donnait un
// resultat faux des que la liste depassait une page -- « VF uniquement » ne filtrait que
// les 200 premiers medias charges et masquait tout le reste de la bibliotheque.
//
// Les orphelins restent filtres localement : ils viennent de Sonarr/Radarr en un seul
// bloc, sans pagination, donc le filtrage client y est exact.
function matchesOrphanFilters(item: any): boolean {
  if (statusFilters.value.length && !statusFilters.value.includes('orphan')) return false;
  if (typeFilters.value.length && !typeFilters.value.includes(item.media_type)) return false;
  if (vf.value === 'vf' && item.has_vf !== true) return false;
  if (vf.value === 'vo' && item.has_vf !== false) return false;
  if (vf.value === 'unchecked' && item.has_vf != null) return false;
  if (sourceFilters.value.length && !sourceFilters.value.includes(item.source)) return false;
  if (requesterFilters.value.length && !requesterFilters.value.includes(item.plex_user_id)) return false;
  return true;
}

const filtered = computed(() => items.value.filter((item: any) => {
  if (typeFilters.value.length && !typeFilters.value.includes(item.media_type)) return false;
  if (item.orphan) return matchesOrphanFilters(item);
  return true;
}));

function toggleSelect(id: any): void {
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter(x => x !== id) : [...selectedIds.value, id];
}

watch(
  () => route.query,
  (value: any) => {
    const returningToHub = value.hub === '1';
    query.value = value.query || '';
    statusFilters.value = value.status
      ? (Array.isArray(value.status) ? value.status : [value.status])
      : (value.sort === 'requested_desc' ? ['pending_approval', 'pending', 'sent_to_arr', 'partially_available', 'failed'] : ['library']);
    typeFilters.value = value.type ? (Array.isArray(value.type) ? value.type : [value.type]) : [];
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
    if (returningToHub) {
      sourceFilters.value = [];
      requesterFilters.value = [];
    }
    load();
  },
  { deep: true },
);
// `vf` fait partie de la liste depuis que le filtre est applique en SQL : tant qu'il ne
// servait qu'au filtrage client, le changer suffisait a recalculer `filtered` sans
// rechargement -- ce n'est plus le cas.
watch(
  [statusFilters, typeFilters, sourceFilters, requesterFilters, vf, subtitle, decade, sort, genre, audioFormat, releaseType, hiRes],
  () => {
    sessionStorage.setItem('library.active_filters', JSON.stringify({
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
    }));
    load();
  },
  { deep: true },
);

// La frappe au clavier abandonne la requete en cours avant d'armer le delai : inutile de
// laisser courir une recherche que l'utilisateur est deja en train de reformuler.
const scheduleLoad = useDebounced(load, 250);
function onSearch(): void {
  request.abort();
  scheduleLoad();
}

function _libraryParams(offset: number): URLSearchParams {
  const p = new URLSearchParams();
  if (query.value.trim()) p.set('query', query.value.trim());
  if (typeFilters.value.length) p.set('media_types', typeFilters.value.join(','));
  if (vf.value) p.set('vf', vf.value);
  if (subtitle.value) p.set('subtitle', subtitle.value);
  if (requesterFilters.value.length) p.set('requesters', requesterFilters.value.join(','));
  if (decade.value) p.set('decade', decade.value);
  if (sort.value) p.set('sort', sort.value);
  if (genre.value) p.set('genre', genre.value);
  if (audioFormat.value) p.set('audio_format', audioFormat.value);
  if (releaseType.value) p.set('release_type', releaseType.value);
  if (hiRes.value) p.set('hi_res', hiRes.value);
  p.set('limit', String(PAGE_SIZE));
  p.set('offset', String(offset));
  return p;
}

function _requestListParams(): URLSearchParams {
  const p = new URLSearchParams({ limit: '500' });
  const q = query.value.trim();
  if (q) p.set('query', q);
  // « Dans Plex » couvre les LibraryItem synces, les demandes « disponible » (Radarr/Sonarr
  // a confirme avant le prochain sync Plex quotidien) et les series « partiellement
  // disponible » : au moins un episode est deja regardable.
  const selectedStatuses = statusFilters.value.includes('library')
    ? [...new Set([...statusFilters.value.filter(value => value !== 'library'), 'available', 'partially_available'])]
    : statusFilters.value;
  if (selectedStatuses.length) p.set('statuses', selectedStatuses.join(','));
  // Une serie garde le statut « partiellement disponible » tant qu'elle n'a pas fini de
  // diffuser, meme a jour sur tout ce qui est sorti. Ce raffinement ne s'applique que si
  // l'utilisateur a explicitement choisi ce statut : sous « Dans Plex », une serie a jour
  // doit rester visible.
  if (statusFilters.value.includes('partially_available') && !statusFilters.value.includes('library')) {
    p.set('strict_partial', 'true');
  }
  if (typeFilters.value.length) p.set('media_types', typeFilters.value.join(','));
  if (sourceFilters.value.length) p.set('sources', sourceFilters.value.join(','));
  if (requesterFilters.value.length) p.set('requesters', requesterFilters.value.join(','));
  if (vf.value) p.set('vf', vf.value);
  return p;
}

// Le cache SWR est indexe sur les parametres reellement envoyes : les charges utiles
// dependent des filtres, repeindre celles d'un autre filtre serait faux.
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
function _cacheKey(): string {
  return `library:${_libraryParams(0)}|${_requestListParams()}`;
}

function applyRequestData(requests: any, stats: any): void {
  if (!requests) return;
  requestSummary.value = requests;
  allRequestsRaw.value = requests.items || [];
  pendingRequests.value = allRequestsRaw.value
    .filter((x: any) => !wantsLibraryItems.value || !x.library_item_id || x.status === 'partially_available')
    .map((x: any) => ({ ...x, _kind: 'request', poster_url: proxyUrl(x.poster_url) }));
  rawMetrics.value = stats || {};
  selectedIds.value = selectedIds.value.filter(id => items.value.some((x: any) => x.id === id));
}

function applyOrphans(orphanRows: any[]): void {
  const searchQuery = query.value.trim().toLowerCase();
  const matching = searchQuery
    ? orphanRows.filter(row => row.title?.toLowerCase().includes(searchQuery))
    : orphanRows;
  orphans.value = matching.map(x => ({ ...x, _kind: 'request' }));
}

function applyLibraryPage(library: any[]): void {
  libraryItemsRaw.value = library.map(x => ({ ...x, _kind: 'library' }));
  libraryOffset.value = library.length;
  hasMoreLibrary.value = wantsLibraryItems.value && library.length === PAGE_SIZE;
}

/** Repeint la derniere vue connue pour ces filtres, avant le premier aller-retour reseau. */
function primeFromCache(): void {
  const cached = readCache(_cacheKey(), { maxAgeMs: CACHE_MAX_AGE_MS });
  if (!cached?.requests) return;
  applyLibraryPage(cached.library || []);
  applyRequestData(cached.requests, cached.stats);
  applyOrphans(cached.orphans || []);
}

async function refreshRequestData(): Promise<void> {
  const [requests, stats] = await Promise.all([
    api(`/api/requests-list?${_requestListParams()}`),
    api(`/api/library-metrics${typeFilters.value.length === 1 ? `?media_type=${typeFilters.value[0]}` : ''}`).catch(() => ({})),
  ]);
  applyRequestData(requests, stats);
}

async function load(): Promise<void> {
  const { signal, isCurrent } = request.begin();
  const options = { signal };
  error.value = '';
  libraryOffset.value = 0;
  loading.value = true;

  // Hub "Tout" : 5 requetes dediees (une par bibliotheque + demandes), meme principe
  // que les hubs Musique/Films/Series ci-dessous.
  if (isAllHub.value) {
    await loadAllHub(options);
    if (isCurrent()) loading.value = false;
    return;
  }
  // Hub Musique : 4 requetes dediees (10 items chacune) remplacent la grosse page
  // paginee, inutile tant que le hub est affiche a la place de la grille.
  if (isMusicHub.value) {
    await loadMusicHub(options);
    if (isCurrent()) loading.value = false;
    return;
  }
  // Hub Films/Series : idem, 2 requetes dediees (derniers ajouts + dernieres demandes).
  if (isMovieShowHub.value) {
    await loadTypeHub(singleType.value, options);
    if (isCurrent()) loading.value = false;
    return;
  }

  // Chargement priorise (facon Seerr) : la bibliotheque (lecture DB pure, rapide)
  // s'affiche des qu'elle arrive, sans attendre demandes/orphelins/metriques -- ces
  // derniers completent la vue ensuite au fil de l'eau. Les orphelins en particulier
  // interrogent Sonarr/Radarr en direct (cache court cote backend, voir
  // arr_orphans.py) : avant, tout restait bloque derriere ce seul appel via
  // Promise.all, donnant l'impression d'un rechargement complet a chaque visite.
  let libraryPage: any[] | null = null;
  try {
    // Aucun media Plex ne peut correspondre aux filtres courants : on economise l'appel
    // plutot que de charger une page qui serait entierement ecartee.
    const library = wantsLibraryItems.value
      ? await api(`/api/library?${_libraryParams(0)}`, options)
      : [];
    if (!isCurrent()) return;
    libraryPage = library;
    applyLibraryPage(library);
  } catch (e: any) {
    if (!request.isAbort(e) && isCurrent()) error.value = e.message;
  } finally {
    if (isCurrent()) loading.value = false;
  }

  if (!isCurrent()) return;
  try {
    const [requests, orphanRows, stats] = await Promise.all([
      api(`/api/requests-list?${_requestListParams()}`, options),
      api('/api/requests/orphans', options).catch(e => request.isAbort(e) ? Promise.reject(e) : []),
      api(`/api/library-metrics${typeFilters.value.length === 1 ? `?media_type=${typeFilters.value[0]}` : ''}`, options).catch(e => request.isAbort(e) ? Promise.reject(e) : {}),
    ]);
    if (!isCurrent()) return;

    applyRequestData(requests, stats);
    applyOrphans(orphanRows);
    // Ecrit une fois les deux vagues arrivees : le cache represente ainsi une page
    // complete, jamais un etat intermediaire sans demandes ni orphelins.
    if (libraryPage) writeCache(_cacheKey(), { library: libraryPage, requests, stats, orphans: orphanRows });
    const savedScroll = sessionStorage.getItem('library.scroll_position');
    if (savedScroll) {
      setTimeout(() => {
        window.scrollTo(0, Number(savedScroll));
        sessionStorage.removeItem('library.scroll_position');
      }, 100);
    }
  } catch (e: any) {
    if (!request.isAbort(e) && isCurrent()) error.value = e.message;
  }
}

async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || !hasMoreLibrary.value) return;
  loadingMore.value = true;
  try {
    const library = await api(`/api/library?${_libraryParams(libraryOffset.value)}`);
    const known = new Set(libraryItemsRaw.value.map((x: any) => x.id));
    libraryItemsRaw.value = [...libraryItemsRaw.value, ...library.filter((x: any) => !known.has(x.id)).map((x: any) => ({ ...x, _kind: 'library' }))];
    libraryOffset.value += library.length;
    hasMoreLibrary.value = library.length === PAGE_SIZE;
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loadingMore.value = false;
  }
}

async function loadUsers(): Promise<void> {
  try {
    users.value = await api('/api/users');
  } catch (e) {
    console.warn("Failed to load users for filter", e);
  }
}

// Les quatre mutations ci-dessous partageaient le meme bloc busy/try/catch/finally,
// recopie a l'identique -- voir useAsyncAction pour le detail des oublis que ce genre de
// copie permettait. `run` restitue exactement le meme enchainement (confirmation eventuelle,
// occupation, appel, rechargement, erreur affichee) pour les quatre.
const { run } = useAsyncAction({ askConfirm, onDone: load, busy, error });

function deleteOrphan(row: any) {
  const source = row.orphan_source === 'sonarr' ? 'Sonarr' : 'Radarr';
  // Les fichiers deja telecharges (le cas echeant) restent sur le disque -- et donc
  // visibles dans Plex jusqu'a son prochain scan -- sauf choix explicite ici. Cette
  // question reste une confirmation navigateur classique, distincte de la modale
  // d'irreversibilite ci-dessous : deux choix independants, pas un enchainement a fusionner.
  return run(() => {
    const deleteFiles = confirm(
      `Supprimer aussi les fichiers deja telecharges pour "${row.title}" ?\n\n` +
      `Sans cela, ${source} arrete le suivi mais laisse les fichiers en place (toujours visibles dans Plex).`
    );
    return api(`/api/requests/orphans/${row.orphan_source}/${row.arr_instance_id}/${row.arr_id}?delete_files=${deleteFiles}`, { method: 'DELETE' });
  }, {
    confirm: {
      title: `Supprimer directement de ${source} ?`,
      message: `"${row.title}" ne sera plus suivi(e) par ${source}. Cette action est irreversible.`,
      confirmLabel: 'Supprimer',
      danger: true,
    },
  });
}

function act(row: any, action: string) {
  return run(() => (action === 'cancel' && canModerate.value)
    ? api(`/api/requests/${row.id}`, { method: 'DELETE' })
    : api(`/api/requests/${row.id}/${action}`, { method: 'POST' }));
}

function bulk(action: string) {
  return run(async () => {
    await api(`/api/requests/bulk/${action}`, { method: 'POST', body: JSON.stringify({ ids: selectedIds.value, delete_from_arr: false, delete_files: false }) });
    selectedIds.value = [];
  }, action === 'delete' ? {
    confirm: { title: 'Supprimer les demandes sélectionnées ?', message: `${selectedIds.value.length} demande(s) seront supprimée(s) définitivement.`, confirmLabel: 'Supprimer', danger: true },
  } : {});
}

function runUtility(path: string) {
  return run(() => api(path, { method: 'POST' }));
}

useRealtime(['request.updated'], (type?: string, event?: any) => {
  if (!type || ['plex-sync', 'plex-sync-recent'].includes(event?.job) || event?.library_changed) {
    return load();
  }
  return refreshRequestData().catch(() => {});
});
onMounted(async () => {
  primeFromCache();
  const session = await loadSession();
  isAdmin.value = isAdminSession(session);
  canModerate.value = canModerateSession(session);
  await load();
  loadUsers();
});
</script>

<style scoped lang="scss">
/* Les styles filter-group / group-label / filter-badge viennent de FilterSidebar.vue */

.music-hub {
  display: flex;
  flex-direction: column;
  gap: var(--space-6, 32px);
}

.metric-card small {
  display: block;
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.load-more-row {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 40px;
  margin-top: 1rem;
}

.library-result-count {
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-sm);
  text-align: right;
}

@media (max-width: 767.98px) {
  .music-hub { gap: var(--space-5); }
  .library-result-count { text-align: left; }
}

</style>
