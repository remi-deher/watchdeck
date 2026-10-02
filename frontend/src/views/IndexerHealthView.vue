<template>
  <!-- Sante des indexeurs d'une instance Prowlarr, a la maniere de son onglet
       Statistiques : qui est en pause apres des echecs, qui repond mal, qui va bien. -->
  <AppPage :title="title" hide-search>
    <div class="indexer-health">
      <div class="indexer-toolbar">
        <UiChipGroup label="Période" :options="periodOptions" :model-value="days" @update:model-value="(value) => (days = Number(value))" />
        <UiButton :loading="healthQuery.isFetching.value" @click="healthQuery.refetch()"><RefreshCw />Actualiser</UiButton>
      </div>

      <UiFeedback v-if="healthQuery.isError.value" type="error" :message="errorMessage" />
      <UiFeedback v-else-if="data && !data.connected" type="error" message="Prowlarr ne répond pas : vérifiez l'instance dans Connexions." />

      <MetricGrid v-if="data?.connected">
        <MetricCard label="Indexeurs actifs" :value="activeCount" />
        <MetricCard label="En panne" :value="counts.failing" :detail="counts.failing ? 'Mis en pause par Prowlarr' : 'Aucun'" />
        <MetricCard label="Dégradés" :value="counts.degraded" detail="20 % d'échecs ou plus" />
        <MetricCard label="Requêtes" :value="totalQueries" :detail="`Sur ${days} jour(s)`" />
      </MetricGrid>

      <section v-if="data?.connected" class="indexer-list" aria-label="Indexeurs">
        <article v-for="row in data.indexers" :key="row.id" class="indexer-row" :class="`is-${row.state}`">
          <div class="indexer-name">
            <strong>{{ row.name }}</strong>
            <small>{{ [row.protocol, row.privacy].filter(Boolean).join(' · ') }}</small>
          </div>
          <UiBadge :tone="stateTone(row.state)" dot>{{ stateLabel(row) }}</UiBadge>
          <dl class="indexer-stats">
            <div><dt>Requêtes</dt><dd>{{ row.queries }}</dd></div>
            <div><dt>Échecs</dt><dd>{{ row.failure_rate == null ? '—' : `${row.failure_rate} %` }}</dd></div>
            <div><dt>Réponse</dt><dd>{{ row.average_response_ms == null ? '—' : `${Math.round(row.average_response_ms)} ms` }}</dd></div>
            <div><dt>Grabs</dt><dd>{{ row.grabs }}<template v-if="row.failed_grabs"> ({{ row.failed_grabs }} en échec)</template></dd></div>
          </dl>
        </article>
        <UiEmptyState v-if="!data.indexers.length" title="Aucun indexeur configuré dans Prowlarr" compact />
      </section>
      <p class="indexer-hint">Une alerte part vers l'email administrateur, et sur Discord s'il est actif, quand un indexeur tombe en panne ou revient (Paramètres → Notifications → Règles).</p>
    </div>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { RefreshCw } from '@lucide/vue';
import { api } from '@/api';
import { humanizeError } from '@/utils/apiError';
import { formatDateTime } from '@/utils/format';
import AppPage from '@/components/ui/AppPage.vue';
import MetricCard from '@/components/ui/MetricCard.vue';
import MetricGrid from '@/components/ui/MetricGrid.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';

interface IndexerRow {
  id: number;
  name: string;
  protocol?: string;
  privacy?: string;
  state: 'ok' | 'degraded' | 'failing' | 'disabled';
  disabled_till?: string | null;
  queries: number;
  failure_rate: number | null;
  grabs: number;
  failed_grabs: number;
  average_response_ms: number | null;
}

const route = useRoute();
const instanceId = computed(() => String(route.params.instanceId || ''));
const days = ref(7);
const periodOptions = [
  { value: 1, label: '24 h' },
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
];

const healthQuery = useQuery({
  queryKey: computed(() => ['downloads', 'indexer-health', instanceId.value, days.value]),
  queryFn: ({ signal }) => api<any>(`/api/prowlarr/${instanceId.value}/indexer-health?days=${days.value}`, { signal }),
  enabled: computed(() => Boolean(instanceId.value)),
  staleTime: 60_000,
});
const data = computed(() => healthQuery.data.value || null);
const errorMessage = computed(() => humanizeError(healthQuery.error.value));
const title = computed(() => (data.value?.instance?.name ? `Indexeurs · ${data.value.instance.name}` : 'Santé des indexeurs'));

const rows = computed<IndexerRow[]>(() => data.value?.indexers || []);
const counts = computed(() => ({
  failing: rows.value.filter((row) => row.state === 'failing').length,
  degraded: rows.value.filter((row) => row.state === 'degraded').length,
}));
const activeCount = computed(() => rows.value.filter((row) => row.state !== 'disabled').length);
const totalQueries = computed(() => rows.value.reduce((sum, row) => sum + (row.queries || 0), 0));

function stateTone(state: IndexerRow['state']): string {
  return { failing: 'danger', degraded: 'warning', ok: 'success', disabled: 'neutral' }[state];
}
function stateLabel(row: IndexerRow): string {
  if (row.state === 'failing') return row.disabled_till ? `En pause jusqu'au ${formatDateTime(row.disabled_till)}` : 'En panne';
  return { degraded: 'Dégradé', ok: 'Opérationnel', disabled: 'Désactivé' }[row.state];
}
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.indexer-health { display: grid; gap: var(--space-4); }
.indexer-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.indexer-list { display: grid; gap: var(--space-2); }
.indexer-row {
  display: grid;
  grid-template-columns: minmax(160px, 1.2fr) auto minmax(0, 2fr);
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.indexer-row.is-failing { border-color: color-mix(in srgb, var(--red) 45%, var(--border)); }
.indexer-row.is-disabled { opacity: 0.6; }
.indexer-name { display: grid; gap: 2px; min-width: 0; }
.indexer-name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.indexer-name small { color: var(--muted); font-size: var(--fs-xs); text-transform: capitalize; }
.indexer-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
.indexer-stats dt { color: var(--muted); font-size: var(--fs-xs); }
.indexer-stats dd { margin: 0; font-weight: 650; font-variant-numeric: tabular-nums; }
.indexer-hint { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
@include bp.until(phablet) {
  .indexer-row { grid-template-columns: 1fr auto; }
  .indexer-stats { grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
