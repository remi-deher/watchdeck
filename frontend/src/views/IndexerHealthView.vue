<template>
  <PageTemplate :title="title" :state="error ? 'error' : pending ? 'loading' : 'ready'" skeleton="cards" :error="error" @retry="reload">
    <PageTools><UiSegmentedControl v-model="days" :options="PERIODS" ariaLabel="Période" /></PageTools>
    <MonitorTemplate
      :items="items"
      :kpis="kpis"
      :icons="{ indexer: Search }"
      :labels="{ okTitle: 'Les indexeurs répondent bien', okDetail: 'Aucun indexeur en panne ni dégradé sur la période.', kpisLabel: 'Santé des indexeurs', checkingTitle: 'Vérification des indexeurs…' }"
    >
      <template #details>
        <PanelCard title="Tous les indexeurs" description="Une alerte part vers l’email administrateur, et sur Discord s’il est actif, quand un indexeur tombe en panne ou revient (Paramètres → Notifications → Règles).">
          <UiDataTable label="Indexeurs" :rows="rows" :columns="COLUMNS" :row-key="(row: IndexerRow) => row.id">
            <template #cell-name="{ row }"><strong>{{ row.name }}</strong><small class="indexer-kind">{{ [row.protocol, row.privacy].filter(Boolean).join(' · ') }}</small></template>
            <template #cell-state="{ row }"><UiBadge :tone="indexerStateTone(row.state)" dot>{{ indexerStateLabel(row) }}</UiBadge></template>
            <template #cell-failure_rate="{ row }">{{ row.failure_rate == null ? '—' : `${row.failure_rate} %` }}</template>
            <template #cell-average_response_ms="{ row }">{{ row.average_response_ms == null ? '—' : `${Math.round(row.average_response_ms)} ms` }}</template>
            <template #cell-grabs="{ row }">{{ row.grabs }}<template v-if="row.failed_grabs"> ({{ row.failed_grabs }} en échec)</template></template>
          </UiDataTable>
        </PanelCard>
      </template>
    </MonitorTemplate>
  </PageTemplate>
</template>

<script setup lang="ts">
/* Sante des indexeurs d'une instance Prowlarr (gabarit Surveiller) : qui est en pause apres
   des echecs, qui repond mal. Les points d'attention sont les seuls indexeurs en difficulte ;
   la liste complete, avec leurs mesures, accompagne en lecture. */
import { Search } from '@lucide/vue';
import { useIndexerHealth } from '@/composables/useIndexerHealth';
import { indexerStateLabel, indexerStateTone, type IndexerRow } from '@/downloads/indexerHealth';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import MonitorTemplate from '@/components/templates/MonitorTemplate.vue';
import PageTools from '@/components/ui/PageTools.vue';
import PanelCard from '@/components/ui/PanelCard.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';

const PERIODS = [
  { value: 1, label: '24 h' },
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
];
const COLUMNS: UiColumn<IndexerRow>[] = [
  { key: 'name', label: 'Indexeur', card: 'title', sortable: true },
  { key: 'state', label: 'État' },
  { key: 'queries', label: 'Requêtes', sortable: true },
  { key: 'failure_rate', label: 'Échecs', sortable: true },
  { key: 'average_response_ms', label: 'Réponse', sortable: true },
  { key: 'grabs', label: 'Grabs', sortable: true },
];

const { days, rows, kpis, items, title, error, pending, reload } = useIndexerHealth();
</script>

<style scoped lang="scss">
.indexer-kind { display: block; color: var(--muted); font-size: var(--fs-xs); text-transform: capitalize; }
</style>
