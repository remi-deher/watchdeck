<template>
  <div class="my-requests-panel psh-layout">
    <!-- Les filtres passent par la sidebar commune, comme Explorer, Bibliotheque ou
         Activite : la modale maison des demandes etait la seule surface de
         filtrage a diverger du reste de l'application. -->
    <FilterSidebar :open="filtersOpen" :active-count="activeFilterCount" @close="closeFilters" @reset="resetFilters">
      <FilterGroup label="Statut">
        <button
          v-for="entry in statusOptions"
          :key="entry.value || 'all'"
          class="filter-badge"
          type="button"
          :class="{ active: statusKey === entry.value }"
          @click="setStatus(entry.value)"
        ><span>{{ entry.label }}</span></button>
      </FilterGroup>

      <FilterGroup label="Type de média">
        <button
          v-for="entry in typeOptions"
          :key="entry.value || 'all'"
          class="filter-badge"
          type="button"
          :class="{ active: typeKey === entry.value }"
          @click="setType(entry.value)"
        ><span>{{ entry.label }}</span></button>
      </FilterGroup>

      <FilterGroup v-if="requesterOptions.length > 1" label="Demandeur">
        <button
          v-for="entry in requesterOptions"
          :key="entry.value || 'me'"
          class="filter-badge"
          type="button"
          :class="{ active: requesterKey === entry.value }"
          @click="requesterKey = entry.value"
        ><span>{{ entry.label }}</span></button>
      </FilterGroup>

      <FilterGroup label="Version française">
        <button
          v-for="entry in vfOptions"
          :key="entry.value || 'all'"
          class="filter-badge"
          type="button"
          :class="{ active: vf === entry.value }"
          @click="vf = entry.value"
        ><span>{{ entry.label }}</span></button>
      </FilterGroup>

      <FilterGroup label="Tri">
        <button
          v-for="entry in sortOptions"
          :key="entry.value || 'recent'"
          class="filter-badge"
          type="button"
          :class="{ active: sort === entry.value }"
          @click="sort = entry.value"
        ><span>{{ entry.label }}</span></button>
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
      <UiFeedback v-if="error" type="error" title="Impossible de charger vos demandes" :message="error" retry @retry="load" />
      <UiFeedback v-else-if="loading && !items.length" type="loading" message="Chargement de vos demandes…" />
      <p v-else class="my-requests-count" aria-live="polite">{{ sorted.length }} demande{{ sorted.length > 1 ? 's' : '' }} affichée{{ sorted.length > 1 ? 's' : '' }}</p>

      <section v-if="sorted.length" :class="view === 'grid' ? 'media-grid library-grid' : 'panel media-list'" :aria-busy="loading">
        <LibraryCard
          v-for="item in sorted"
          :key="item.id"
          :item="{ ...item, _kind: 'request' }"
          :view="view"
          :can-moderate="canModerate"
          :busy="busy"
          @open="openDetail"
          @act="act"
        />
      </section>

      <UiEmptyState v-else-if="!loading" title="Aucune demande" :message="emptyMessage">
        <template #action>
          <UiButton v-if="activeFilterCount || query.trim()" @click="resetFilters">Réinitialiser les filtres</UiButton>
          <UiButton v-else variant="primary" @click="$emit('explore')">Explorer le catalogue</UiButton>
        </template>
      </UiEmptyState>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import { mediaDetailPath } from '@/mediaUrl';
import { useDebounced } from '@/composables/useDebounced';
import { useLatestRequest } from '@/composables/useLatestRequest';
import { useRealtimeList } from '@/composables/useRealtimeList';
import { providePageSearch, type PageSearch } from '@/composables/usePageSearch';
import { canModerateSession, loadSession } from '@/composables/useSession';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';
import LibraryCard from '@/components/library/LibraryCard.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';

defineEmits<{
  (e: 'explore'): void;
}>();

const router = useRouter();
const request = useLatestRequest();

const items = ref<any[]>([]);
const canModerate = ref(false);
const plexUserId = ref('');
/* La session porte l'identite du demandeur : tant qu'elle n'est pas resolue, charger
   reviendrait a demander « les demandes de personne ». Un compte sans `plex_user_id`
   (owner local, compte admin non lie a Plex) reste servi : il voit alors tout ce que
   l'API lui autorise, au lieu d'une page vide et sans explication. */
const sessionReady = ref(false);
const loading = ref(false);
const busy = ref(false);
const error = ref('');

const query = ref('');
const statusKey = ref('');
const typeKey = ref('');
const vf = ref('');
const requesterKey = ref('');
const sort = ref('');
/* Facette renvoyee par `/api/requests-list`. Elle est globale pour un administrateur et
   reduite au seul appelant sinon : le groupe « Demandeur » se montre donc tout seul,
   uniquement la ou il y a vraiment le choix. */
const requesters = ref<Array<{ id: string; label: string }>>([]);
const view = ref(localStorage.getItem('library.view') || 'grid');
const filtersOpen = ref(false);

/* Un seul statut a la fois, mais certains libelles couvrent plusieurs valeurs du
   backend : « En cours » est le seul regroupement qui ait un sens pour un demandeur,
   qui ne fait pas la difference entre `pending` et `sent_to_arr`.
   Les pseudo-statuts `library` / `orphan` de la Bibliotheque ont disparu de la liste :
   ce ne sont pas des `MediaRequest.status`, les selectionner ne renvoyait jamais rien. */
const STATUS_BUCKETS: Record<string, string[]> = {
  in_progress: ['pending_approval', 'pending', 'sent_to_arr'],
  pending_approval: ['pending_approval'],
  partially_available: ['partially_available'],
  available: ['available'],
  failed: ['failed'],
  rejected: ['rejected'],
};
const statusOptions = [
  { value: '', label: 'Tous les statuts' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'pending_approval', label: 'À approuver' },
  { value: 'partially_available', label: 'Partiellement disponible' },
  { value: 'available', label: 'Disponible' },
  { value: 'failed', label: 'Échec' },
  { value: 'rejected', label: 'Refusée' },
];
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

const activeFilterCount = computed(
  () => (statusKey.value ? 1 : 0) + (typeKey.value ? 1 : 0) + (vf.value ? 1 : 0)
    + (requesterKey.value ? 1 : 0) + (sort.value ? 1 : 0)
);
const emptyMessage = computed(() =>
  activeFilterCount.value || query.value.trim()
    ? 'Aucune demande ne correspond à ces filtres.'
    : "Vous n'avez pas encore fait de demande."
);

providePageSearch(computed<PageSearch>(() => ({
  showSearch: true,
  query: query.value,
  placeholder: 'Rechercher une demande…',
  scopeLabel: 'Demandes',
  hasFilters: true,
  filtersOpen: filtersOpen.value,
  activeCount: activeFilterCount.value,
  onQuery: (value: string) => { query.value = value; },
  onSearch: () => onSearch(),
  onToggleFilters: () => { filtersOpen.value = !filtersOpen.value; },
})));

function setStatus(value: string): void { statusKey.value = statusKey.value === value ? '' : value; }
function setType(value: string): void { typeKey.value = typeKey.value === value ? '' : value; }
function closeFilters(): void { filtersOpen.value = false; }
function resetFilters(): void {
  statusKey.value = '';
  typeKey.value = '';
  vf.value = '';
  requesterKey.value = '';
  sort.value = '';
  if (query.value) { query.value = ''; onSearch(); }
}

function _params(): URLSearchParams {
  const p = new URLSearchParams({ limit: '500' });
  if (!requesterKey.value) { if (plexUserId.value) p.set('requesters', plexUserId.value); }
  else if (requesterKey.value !== 'all') p.set('requesters', requesterKey.value);
  const q = query.value.trim();
  if (q) p.set('query', q);
  const statuses = STATUS_BUCKETS[statusKey.value];
  if (statuses) p.set('statuses', statuses.join(','));
  if (typeKey.value) p.set('media_types', typeKey.value);
  if (vf.value) p.set('vf', vf.value);
  return p;
}

async function load(): Promise<void> {
  if (!sessionReady.value) return;
  const { signal, isCurrent } = request.begin();
  loading.value = true;
  error.value = '';
  try {
    const payload = await api<{ items?: any[]; facets?: { requesters?: Array<{ id: string; label: string }> } }>(
      `/api/requests-list?${_params()}`,
      { signal }
    );
    if (!isCurrent()) return;
    items.value = payload.items || [];
    requesters.value = payload.facets?.requesters || [];
  } catch (e: any) {
    if (!request.isAbort(e) && isCurrent()) error.value = e?.message || String(e);
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

const sorted = computed(() => {
  const list = [...items.value];
  if (sort.value === 'oldest') list.sort((a, b) => (a.requested_at || '').localeCompare(b.requested_at || ''));
  else if (sort.value === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  else list.sort((a, b) => (b.requested_at || '').localeCompare(a.requested_at || ''));
  return list;
});

function openDetail(item: any): void {
  router.push(mediaDetailPath(item, 'request', { discover: true }));
}

async function act(row: any, action: string): Promise<void> {
  /* L'annulation demande une explication : elle bloque le retour automatique du media
     et previent le demandeur par mail. Sans un mot, il redemande la semaine suivante. */
  let body: string | undefined;
  if (action === 'withdraw') {
    const reason = window.prompt(
      `Annuler « ${row.title} » et empêcher son retour automatique ?

Message envoyé au demandeur (facultatif) :`,
      row.fulfillment_error || ''
    );
    if (reason === null) return;
    body = JSON.stringify({ reason });
  }
  busy.value = true;
  try {
    await api(`/api/requests/${row.id}/${action}`, { method: 'POST', body });
    await load();
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    busy.value = false;
  }
}

const scheduleLoad = useDebounced(load, 250);
function onSearch(): void {
  request.abort();
  scheduleLoad();
}

watch(view, (value) => localStorage.setItem('library.view', value));
watch([statusKey, typeKey, vf, requesterKey], () => load());

useRealtimeList(items, ['request.updated', 'download.updated'], {
  keyFields: ['request_id', 'id'],
  onFallbackReload: () => load(),
});

onMounted(async () => {
  const session = await loadSession();
  canModerate.value = canModerateSession(session);
  plexUserId.value = session?.plex_user_id || '';
  sessionReady.value = true;
  await load();
});
</script>

<style scoped lang="scss">
.my-requests-panel .psh-main {
  display: grid;
  gap: var(--space-4);
  align-content: start;
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
