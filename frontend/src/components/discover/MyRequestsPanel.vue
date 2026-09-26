<template>
  <div class="my-requests-panel psh-layout">
    <!-- Les filtres passent par la sidebar commune, comme Explorer, Bibliotheque ou
         Activite : la modale maison des demandes etait la seule surface de
         filtrage a diverger du reste de l'application. -->
    <FilterSidebar :open="filtersOpen" :active-count="activeFilterCount" @close="closeFilters" @reset="resetFilters">
      <FilterGroup label="Type de média">
        <UiChipGroup label="Type de média" :options="typeOptions" :model-value="typeKey" @update:model-value="setType" />
      </FilterGroup>

      <FilterGroup v-if="isAdmin && requesterOptions.length > 1" label="Demandeur">
        <UiChipGroup label="Demandeur" :options="requesterOptions" v-model="requesterKey" />
      </FilterGroup>

      <FilterGroup label="Version française">
        <UiChipGroup label="Version française" :options="vfOptions" v-model="vf" />
      </FilterGroup>

      <FilterGroup label="Tri">
        <UiChipGroup label="Tri" :options="sortOptions" v-model="sort" />
      </FilterGroup>

      <FilterGroup label="Affichage" :default-open="false">
        <UiSegmentedControl
          :model-value="view"
          :options="viewOptions"
          :ariaLabel="'Mode d’affichage'"
          @update:model-value="view = String($event)"
        />
      </FilterGroup>
    </FilterSidebar>

    <div class="psh-main">
      <!-- Les etats d'une demande en onglets, avec leur nombre : « En cours » d'abord, la
           ou il y a quelque chose a suivre. Ils remplacent le filtre de statut, qui
           cachait les demandes a surveiller dans le panneau de filtres. -->
      <AppSubnav :items="tabItems" :active="activeTab" aria-label="États des demandes" />

      <UiFeedback v-if="error" type="error" title="Impossible de charger vos demandes" :message="error" retry @retry="load" />
      <UiFeedback v-else-if="loading && !items.length" type="loading" message="Chargement de vos demandes…" />
      <p v-else class="my-requests-count" aria-live="polite">
        <template v-if="hasMore">{{ visible.length }} sur {{ sorted.length }} demandes affichées</template>
        <template v-else>{{ sorted.length }} demande{{ sorted.length > 1 ? 's' : '' }} affichée{{ sorted.length > 1 ? 's' : '' }}</template>
      </p>

      <!-- Suivi (en cours, a approuver, VF manquante, echecs) : des cartes qui disent
           pourquoi une demande attend. Les disponibles gardent la grille d'affiches. -->
      <section v-if="sorted.length && activeTab !== 'disponibles'" v-list-motion class="rt-list" :aria-busy="loading">
        <RequestTrackingCard
          v-for="item in visible"
          :key="item.id"
          :item="item"
          :can-moderate="canModerate"
          :busy="busy"
          @open="openDetail"
          @act="act"
        />
      </section>
      <section v-else-if="sorted.length" v-list-motion :class="view === 'grid' ? 'media-grid library-grid' : 'panel media-list'" :aria-busy="loading">
        <LibraryCard
          v-for="item in visible"
          :key="item.id"
          :item="{ ...item, _kind: 'request' }"
          :view="view"
          :can-moderate="canModerate"
          :busy="busy"
          @open="openDetail"
          @act="act"
        />
      </section>

      <UiEmptyState v-else-if="!loading" :title="emptyTitle" :message="emptyMessage">
        <template #action>
          <UiButton v-if="activeFilterCount || query.trim()" @click="resetFilters">Réinitialiser les filtres</UiButton>
          <UiButton v-else-if="!items.length" variant="primary" @click="$emit('explore')">Explorer le catalogue</UiButton>
        </template>
      </UiEmptyState>

      <!-- Les 236 demandes d'une mediatheque bien remplie tenaient toutes dans le DOM
           d'un coup : 25 000px de page et 4 500 noeuds, pour un ecran qui en montre
           huit. La liste complete reste chargee (le filtrage et le tri sont locaux),
           seule la fenetre rendue grandit au defilement.
           Place apres l'etat vide : intercale entre le `v-if` et le `v-else-if`, il
           casserait la chaine conditionnelle. -->
      <InfiniteScrollTrigger :has-more="hasMore" @load="showMore" />
    </div>

    <ReasonPickerModal
      :open="!!pendingWithdraw"
      event="cancelled"
      :subtitle="pendingWithdraw ? `« ${pendingWithdraw.title} » sera retiré de Sonarr/Radarr et empêché de revenir automatiquement.` : ''"
      :initial="pendingWithdraw?.fulfillment_error || ''"
      :busy="busy"
      @cancel="pendingWithdraw = null"
      @confirm="confirmWithdraw"
    />
    <ReasonPickerModal
      :open="!!pendingReject"
      event="rejected"
      title="Refuser cette demande ?"
      :subtitle="pendingReject ? `« ${pendingReject.title} » ne sera pas ajouté ; le demandeur sera prévenu.` : ''"
      :busy="busy"
      @cancel="pendingReject = null"
      @confirm="confirmReject"
    />
  </div>
</template>

<script setup lang="ts">
import { humanizeError } from '@/utils/apiError';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { mediaDetailPath } from '@/mediaUrl';
import { useDebounceFn } from '@vueuse/core';
import { useRealtimeQuery } from '@/composables/useRealtimeQuery';
import { providePageSearch, type PageSearch } from '@/composables/usePageSearch';
import { canModerateSession, isAdminSession, loadSession } from '@/composables/useSession';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import LibraryCard from '@/components/library/LibraryCard.vue';
import RequestTrackingCard from '@/components/requests/RequestTrackingCard.vue';
import AppSubnav, { type SubnavItem } from '@/components/ui/AppSubnav.vue';
import ReasonPickerModal from '@/components/requests/ReasonPickerModal.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import InfiniteScrollTrigger from '@/components/ui/InfiniteScrollTrigger.vue';
import { usePreference } from '@/composables/usePreference';

defineEmits<{
  (e: 'explore'): void;
}>();

const router = useRouter();
const route = useRoute();

const canModerate = ref(false);
const isAdmin = ref(false);
const plexUserId = ref('');
/* La session porte l'identite du demandeur : tant qu'elle n'est pas resolue, charger
   reviendrait a demander « les demandes de personne ». Un compte sans `plex_user_id`
   (owner local, compte admin non lie a Plex) reste servi : il voit alors tout ce que
   l'API lui autorise, au lieu d'une page vide et sans explication. */
const sessionReady = ref(false);
const busy = ref(false);
// Erreur d'une action (annuler, relancer...), distincte de celle de la lecture.
const actionError = ref('');

const query = ref('');
const typeKey = ref('');
const vf = ref('');
const requesterKey = ref('');
const sort = ref('');
/* Facette renvoyee par `/api/requests-list`. Elle est globale pour un administrateur et
   reduite au seul appelant sinon : le groupe « Demandeur » se montre donc tout seul,
   uniquement la ou il y a vraiment le choix. */
const view = usePreference('library.view', 'grid');
const filtersOpen = ref(false);

/* Onglets : chaque demande tombe dans un etat, calcule par le serveur (`tracking`). Une
   demande disponible sans VF apparait aussi dans « VF manquante ». */
const TABS = [
  { key: 'en-cours', label: 'En cours' },
  { key: 'a-approuver', label: 'À approuver' },
  { key: 'disponibles', label: 'Disponibles' },
  { key: 'vf-manquante', label: 'VF manquante' },
  { key: 'echecs', label: 'Échecs et refus' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
function tabOf(item: any): TabKey[] {
  const kind = item.tracking?.kind;
  const tabs: TabKey[] = [];
  if (kind === 'approval') tabs.push('a-approuver');
  else if (kind === 'failed' || kind === 'rejected') tabs.push('echecs');
  else if (kind) tabs.push('en-cours');
  else tabs.push('disponibles');
  if (item.vf_missing) tabs.push('vf-manquante');
  return tabs;
}
const typeOptions = [
  { value: '', label: 'Tous les médias' },
  { value: 'movie', label: 'Films' },
  { value: 'show', label: 'Séries' },
];
const vfOptions = [
  { value: '', label: 'Toutes les pistes' },
  { value: 'vf', label: 'VF disponible' },
  { value: 'vf_secondary', label: 'VF non prioritaire' },
  { value: 'mixed', label: 'VF partielle' },
  { value: 'vo', label: 'VO uniquement' },
  { value: 'unchecked', label: 'Non analysée' },
];
const sortOptions = [
  { value: '', label: 'Plus récentes' },
  { value: 'oldest', label: 'Plus anciennes' },
  { value: 'title', label: 'Titre A→Z' },
];
/* « Mes demandes » reste le defaut : le filtre sert a l'elargir, pas a le remplacer. */
const requesterOptions = computed(() => [
  plexUserId.value
    ? { value: '', label: 'Mes demandes' }
    : { value: '', label: 'Tous les demandeurs' },
  ...(plexUserId.value ? [{ value: 'all', label: 'Tous les demandeurs' }] : []),
  ...requesters.value
    .filter((entry) => entry.id && entry.id !== plexUserId.value)
    .map((entry) => ({ value: entry.id, label: entry.label })),
]);
const viewOptions = [
  { value: 'grid', label: 'Grille' },
  { value: 'list', label: 'Liste' },
];

/* Demandeur par defaut : tout le monde pour un administrateur, soi-meme sinon. */
const defaultRequester = computed(() => (isAdmin.value ? 'all' : ''));
const activeFilterCount = computed(
  () => (typeKey.value ? 1 : 0) + (vf.value ? 1 : 0)
    + (requesterKey.value !== defaultRequester.value ? 1 : 0) + (sort.value ? 1 : 0)
);
const emptyTitle = computed(() => (items.value.length ? 'Rien dans cet onglet' : 'Aucune demande'));
const emptyMessage = computed(() => {
  if (activeFilterCount.value || query.value.trim()) return 'Aucune demande ne correspond à ces filtres.';
  if (!items.value.length) return "Vous n'avez pas encore fait de demande.";
  return activeTab.value === 'en-cours' ? 'Tout est arrivé : aucune demande en attente.' : 'Aucune demande dans cet état.';
});
function setType(value: string): void { typeKey.value = typeKey.value === value ? '' : value; }
function closeFilters(): void { filtersOpen.value = false; }
function resetFilters(): void {
  typeKey.value = '';
  vf.value = '';
  requesterKey.value = defaultRequester.value;
  sort.value = '';
  if (query.value) { query.value = ''; onSearch(); }
}

function _params(): URLSearchParams {
  const p = new URLSearchParams({ limit: '500' });
  if (!requesterKey.value) { if (plexUserId.value) p.set('requesters', plexUserId.value); }
  else if (requesterKey.value !== 'all') p.set('requesters', requesterKey.value);
  const q = submittedQuery.value;
  if (q) p.set('query', q);
  if (typeKey.value) p.set('media_types', typeKey.value);
  if (vf.value) p.set('vf', vf.value);
  return p;
}

/* La recherche ne part au serveur qu'a sa validation (ou avec un filtre) : la liste
   chargee est ensuite filtree sur place a chaque frappe. `submittedQuery` fige donc la
   saisie a ces moments-la, comme le faisait le chargement manuel. */
const submittedQuery = ref('');
interface RequestsPayload { items?: any[]; facets?: { requesters?: Array<{ id: string; label: string }> } }
const requestsKey = computed(() => ['requests', 'mine', _params().toString()]);
const requestsQuery = useQuery({
  queryKey: requestsKey,
  queryFn: ({ signal }) => api<RequestsPayload>(`/api/requests-list?${_params()}`, { signal }),
  enabled: sessionReady,
  // Garder la liste precedente pendant qu'un filtre recharge, plutot que de la vider.
  placeholderData: keepPreviousData,
  staleTime: 15_000,
});
const items = computed<any[]>(() => requestsQuery.data.value?.items || []);
const requesters = computed(() => requestsQuery.data.value?.facets?.requesters || []);
const loading = computed(() => requestsQuery.isFetching.value);
const error = computed(() => actionError.value || (requestsQuery.error.value ? humanizeError(requestsQuery.error.value) : ''));

/** Recharge : capture la recherche en cours ; si la cle n'a pas change, relit quand meme. */
async function load(): Promise<void> {
  if (!sessionReady.value) return;
  actionError.value = '';
  const before = requestsKey.value.join('|');
  submittedQuery.value = query.value.trim();
  await nextTick();
  if (requestsKey.value.join('|') === before) await requestsQuery.refetch();
}

const tabCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const item of items.value) for (const tab of tabOf(item)) counts[tab] = (counts[tab] || 0) + 1;
  return counts;
});
/* Onglet dans l'adresse (?onglet=) : partageable, retrouve au retour. Sans choix, « En
   cours » s'il y a quelque chose a suivre, sinon « Disponibles ». */
const activeTab = computed<TabKey>(() => {
  const asked = String(route.query.onglet || '');
  if (TABS.some((tab) => tab.key === asked)) return asked as TabKey;
  return tabCounts.value['en-cours'] || !items.value.length ? 'en-cours' : 'disponibles';
});
/* « A approuver » et « Echecs » ne s'affichent que s'ils ont un contenu, ou s'ils sont
   l'onglet courant (lien partage). */
const tabItems = computed<SubnavItem[]>(() => TABS
  .filter((tab) => !['a-approuver', 'echecs'].includes(tab.key) || tabCounts.value[tab.key] || activeTab.value === tab.key)
  .map((tab) => ({
    key: tab.key,
    label: tab.label,
    count: tabCounts.value[tab.key] || 0,
    to: { path: route.path, query: { ...route.query, onglet: tab.key } },
  })));
const sorted = computed(() => {
  const list = items.value.filter((item) => tabOf(item).includes(activeTab.value));
  if (sort.value === 'oldest') list.sort((a, b) => (a.requested_at || '').localeCompare(b.requested_at || ''));
  else if (sort.value === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  else list.sort((a, b) => (b.requested_at || '').localeCompare(a.requested_at || ''));
  return list;
});

/* Fenetre de rendu : une rangee de grille fait quatre cartes en grand, deux en
   compact. 48 couvre donc plusieurs ecrans dans tous les cas, sans jamais laisser la
   page se terminer sur une rangee incomplete au premier affichage. */
const PAGE_SIZE = 48;
const visibleCount = ref(PAGE_SIZE);
const visible = computed(() => sorted.value.slice(0, visibleCount.value));
const hasMore = computed(() => visibleCount.value < sorted.value.length);

function showMore(): void {
  visibleCount.value = Math.min(visibleCount.value + PAGE_SIZE, sorted.value.length);
}

/* Changer de filtre, de tri ou de recherche ramene la fenetre au debut. On surveille
   les criteres et non `sorted` : ce calcul se refait aussi a chaque evenement temps
   reel, et remonter l'utilisateur en haut de la liste parce qu'une demande a change de
   statut ailleurs serait une regression. */
watch([activeTab, typeKey, vf, requesterKey, sort, query], () => { visibleCount.value = PAGE_SIZE; });

/* Declare apres `sorted` : le calcul le lit, et une constante lue avant sa
   declaration leve — l'effet echouait alors en silence, et la barre du haut retombait
   sur le declencheur de la palette. */
providePageSearch(computed<PageSearch>(() => ({
  showSearch: true,
  // La liste est deja chargee : taper ici retranche, cela ne fait rien apparaitre.
  kind: 'filter',
  matchCount: sorted.value.length,
  totalCount: items.value.length,
  query: query.value,
  placeholder: 'Filtrer les demandes…',
  scopeLabel: 'Demandes',
  hasFilters: true,
  filtersOpen: filtersOpen.value,
  activeCount: activeFilterCount.value,
  onQuery: (value: string) => { query.value = value; },
  onSearch: () => onSearch(),
  onToggleFilters: () => { filtersOpen.value = !filtersOpen.value; },
})));

function openDetail(item: any): void {
  ouvrirFiche(router, mediaDetailPath(item, 'request', { discover: true }), route.fullPath);
}

/* L'annulation demande une explication : elle bloque le retour automatique du media et
   previent le demandeur par mail. Le motif se choisit dans une liste partagee plutot que
   de se ressaisir a chaque fois. */
const pendingWithdraw = ref<any | null>(null);

const pendingReject = ref<any | null>(null);
function act(row: any, action: string): void {
  if (action === 'withdraw') {
    pendingWithdraw.value = row;
    return;
  }
  if (action === 'reject') {
    pendingReject.value = row;
    return;
  }
  // Recherche interactive des releases (la VF y est mise en avant).
  if (action === 'interactive') {
    void router.push(`/releases/${row.id}`);
    return;
  }
  void runAction(row, action);
}
async function confirmReject(reason: string): Promise<void> {
  const row = pendingReject.value;
  pendingReject.value = null;
  if (row) await runAction(row, 'reject', JSON.stringify({ reason }));
}

async function confirmWithdraw(reason: string): Promise<void> {
  const row = pendingWithdraw.value;
  pendingWithdraw.value = null;
  if (row) await runAction(row, 'withdraw', JSON.stringify({ reason }));
}

async function runAction(row: any, action: string, body?: string): Promise<void> {
  busy.value = true;
  try {
    await api(`/api/requests/${row.id}/${action}`, { method: 'POST', body });
    await load();
  } catch (e: any) {
    actionError.value = humanizeError(e);
  } finally {
    busy.value = false;
  }
}

const scheduleLoad = useDebounceFn(load, 250);
function onSearch(): void {
  // Une lecture devenue obsolete est annulee par TanStack Query au changement de cle.
  scheduleLoad();
}

// Un filtre fait partie de la cle, qui relance seule : il suffit d'y joindre la
// recherche en cours, comme le faisait le rechargement d'avant.
watch([typeKey, vf, requesterKey], () => { submittedQuery.value = query.value.trim(); });

// Un evenement met a jour la demande dans le cache ; faute de correspondance, relecture.
useRealtimeQuery<RequestsPayload>(requestsKey, ['request.updated', 'download.updated'], {
  keyFields: ['request_id', 'id'],
  getList: (data) => data.items || [],
  setList: (data, list) => ({ ...data, items: list }),
});

onMounted(async () => {
  const session = await loadSession();
  canModerate.value = canModerateSession(session);
  isAdmin.value = isAdminSession(session);
  // Un administrateur suit toutes les demandes ; un utilisateur, les siennes.
  if (isAdmin.value && !requesterKey.value) requesterKey.value = 'all';
  plexUserId.value = session?.plex_user_id || '';
  // Session resolue : la query part d'elle-meme (`enabled`).
  sessionReady.value = true;
});
</script>

<style scoped lang="scss">
.my-requests-panel .psh-main {
  display: grid;
  gap: var(--space-4);
  align-content: start;
}
.rt-list {
  display: grid;
  gap: var(--space-2);
}
.my-requests-count {
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-sm);
  text-align: right;
}
:deep(.select-tag) {
  display: none;
}
@media (min-width: 1201px) {
  .library-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
