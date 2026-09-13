<template>
  <!-- La page reprend la coquille commune : recherche de page, tiroir de filtres et
       disposition `psh-layout`. Elle etait la seule liste sans recherche, et la seule a
       porter `FilterBar` -- un composant qui n'existait que pour elle et qui posait sa
       propre rangee de filtres au-dessus du tableau, sans lien avec le bouton Filtres
       de la barre du haut. -->
  <AppPage
    title="Problèmes"
    v-model:query="query"
    search-scope="Problèmes"
    placeholder="Filtrer par média, message ou personne…"
    search-kind="filter"
    :match-count="visibleIssues.length"
    :total-count="issues.length"
    has-filters
    :active-count="activeFilterCount"
    :filters-open="filtersOpen"
    :error="error"
    retry
    @retry="load"
    @toggle-filters="filtersOpen = !filtersOpen"
  >
    <div class="psh-layout">
      <FilterSidebar :open="filtersOpen" :active-count="activeFilterCount" @close="filtersOpen = false" @reset="resetFilters">
        <FilterGroup label="Statut">
          <button
            v-for="entry in STATUS_OPTIONS"
            :key="entry.value || 'all'"
            class="filter-badge"
            type="button"
            :class="{ active: statusFilter === entry.value }"
            @click="setStatus(entry.value)"
          ><span>{{ entry.label }}</span></button>
        </FilterGroup>

        <FilterGroup v-if="types.length > 1" label="Type de problème">
          <button
            class="filter-badge"
            type="button"
            :class="{ active: !typeFilter }"
            @click="setType('')"
          ><span>Tous les types</span></button>
          <button
            v-for="value in types"
            :key="value"
            class="filter-badge"
            type="button"
            :class="{ active: typeFilter === value }"
            @click="setType(value)"
          ><span>{{ typeLabel(value) }}</span></button>
        </FilterGroup>
      </FilterSidebar>

      <div class="psh-main">
        <UiFeedback v-if="loading && !issues.length" type="loading" message="Chargement des signalements…" />
        <p v-else class="issues-count" aria-live="polite">
          {{ visibleIssues.length }} signalement{{ visibleIssues.length > 1 ? 's' : '' }}
        </p>

        <div v-if="visibleIssues.length" class="issues-list">
          <IssueCard
            v-for="issue in visibleIssues"
            :key="issue.id"
            :issue="issue"
            :busy="busy"
            @update="updateIssue(issue, $event)"
            @retry="retryIssue(issue)"
            @note="saveNote(issue, $event)"
          />
        </div>

        <UiEmptyState
          v-else-if="!loading"
          title="Aucun signalement"
          :message="activeFilterCount || query.trim() ? 'Aucun signalement ne correspond à ces filtres.' : 'Personne n’a signalé de problème.'"
        >
          <template v-if="activeFilterCount || query.trim()" #action>
            <UiButton @click="resetFilters">Réinitialiser les filtres</UiButton>
          </template>
        </UiEmptyState>
      </div>
    </div>
  </AppPage>
</template>

<script setup lang="ts">
import { humanizeError } from '@/utils/apiError';
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api';
import AppPage from '@/components/ui/AppPage.vue';
import FilterGroup from '@/components/ui/FilterGroup.vue';
import FilterSidebar from '@/components/ui/FilterSidebar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import IssueCard, { type Issue } from '@/components/issues/IssueCard.vue';

/* Trois statuts, plus quatre : « resolved » faisait doublon avec « closed », l'interface
   ne l'ecrivait jamais et ne le proposait pas (migration 0017). */
const STATUS_OPTIONS = [
  { value: 'open', label: 'Ouverts' },
  { value: 'investigating', label: 'En cours' },
  { value: 'closed', label: 'Clos' },
  // `all` explicite : omettre le parametre renverrait le defaut de l'API, qui est
  // « ouverts » -- « Tous » n'aurait alors montre que les ouverts.
  { value: 'all', label: 'Tous' },
];

const ISSUE_TYPES: Record<string, string> = {
  other: 'Autre',
  audio: 'Problème audio',
  video: 'Problème vidéo',
  subtitle: 'Sous-titres',
  missing: 'Média absent',
  wrong: 'Mauvais média',
};
const typeLabel = (value: string) => ISSUE_TYPES[value] || value;

const issues = ref<Issue[]>([]);
const types = ref<string[]>([]);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const query = ref('');
const statusFilter = ref('open');
const typeFilter = ref('');
const filtersOpen = ref(false);

const activeFilterCount = computed(() => (statusFilter.value === 'open' ? 0 : 1) + (typeFilter.value ? 1 : 0));

/* La recherche filtre localement : la liste est bornee a deux cents lignes cote serveur,
   et parcourir un texte deja charge evite un aller-retour a chaque frappe. */
const visibleIssues = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) return issues.value;
  return issues.value.filter((issue) =>
    [issue.title, issue.message, issue.reporter_name, issue.issue_type, issue.admin_note]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle)
  );
});

function setStatus(value: string): void {
  statusFilter.value = value;
  load();
}
function setType(value: string): void {
  typeFilter.value = typeFilter.value === value ? '' : value;
  load();
}
function resetFilters(): void {
  statusFilter.value = 'open';
  typeFilter.value = '';
  query.value = '';
  load();
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams();
    if (statusFilter.value) params.set('status', statusFilter.value);
    if (typeFilter.value) params.set('issue_type', typeFilter.value);
    const payload = await api<{ items?: Issue[]; types?: string[] }>(`/api/media/issues?${params}`);
    issues.value = payload.items || [];
    types.value = payload.types || [];
  } catch (e: any) {
    error.value = humanizeError(e);
  } finally {
    loading.value = false;
  }
}

async function patchIssue(issue: Issue, body: Record<string, unknown>): Promise<void> {
  busy.value = true;
  try {
    const updated = await api<Issue>(`/api/media/issues/${issue.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    const index = issues.value.findIndex((row) => row.id === issue.id);
    // La ligne mise a jour est remplacee sur place plutot que de recharger la liste :
    // un rechargement la ferait disparaitre sous le curseur des que son nouveau statut
    // sort du filtre courant.
    if (index >= 0) issues.value[index] = { ...issues.value[index], ...updated };
  } catch (e: any) {
    error.value = humanizeError(e);
  } finally {
    busy.value = false;
  }
}

const updateIssue = (issue: Issue, status: string) => patchIssue(issue, { status });
const saveNote = (issue: Issue, admin_note: string) => patchIssue(issue, { admin_note });

async function retryIssue(issue: Issue): Promise<void> {
  busy.value = true;
  try {
    await api(`/api/media/issues/${issue.id}/retry`, { method: 'POST' });
  } catch (e: any) {
    error.value = humanizeError(e);
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.psh-main { display: grid; gap: var(--space-3); align-content: start; }
.issues-count { margin: 0; color: var(--muted); font-size: var(--fs-sm); text-align: right; }
.issues-list { display: grid; gap: var(--space-3); }
</style>
