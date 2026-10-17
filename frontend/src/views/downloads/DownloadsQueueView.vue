<template>
  <!-- File d'attente (gabarit Suivre) : où en est ce qui télécharge ? Ce qui demande une
       intervention d'abord (cause, et l'action qui débloque), puis ce qui télécharge, ce
       qui est en pause et ce qui attend. Pas de filtre : chaque groupe porte son titre et son
       nombre ; la recherche est celle de la barre du haut. Les derniers terminés renvoient
       à l'historique (gabarit Comprendre). -->
  <PageTemplate
    title="File d’attente"
    v-model:query="query"
    :search="{ placeholder: 'Filtrer les téléchargements…', scope: 'Acquisition', kind: 'filter' }"
    :match-count="items.length"
    :total-count="rows.length"
    :state="error && !rows.length ? 'error' : 'ready'"
    :error="error"
    @retry="reload"
  >
    <TrackTemplate
      :items="items"
      :recent="recent"
      :history-to="{ path: '/downloads', query: { view: 'history' } }"
      :updated="updated"
      :loading="pending"
      :labels="{ items: 'téléchargements', empty: 'Rien ne télécharge', emptyDetail: 'Aucun téléchargement en cours, en attente ni à traiter.', history: 'Voir l’historique' }"
      @action="onAction"
    />
    <CreateTemplate :open="Boolean(manualRow)" :definition="manualDefinition" mode="edit" @close="manualRow = null" @created="onImported" />
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </PageTemplate>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDownloadHistory } from '@/composables/useDownloadHistory';
import { useDownloadQueue } from '@/composables/useDownloadQueue';
import { onMounted } from 'vue';
import { queueRowToTrack } from '@/downloads/queueTrack';
import { queueDetailPath, rowKey } from '@/downloads/queueRules';
import { formatDateShort, formatRelativeDate } from '@/utils/format';
import ConfirmModal from '@/components/ConfirmModal.vue';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import TrackTemplate, { type TrackItem, type TrackRecent } from '@/components/templates/TrackTemplate.vue';
import { useErrorToast } from '@/composables/useErrorToast';
import CreateTemplate, { type CreateResult } from '@/components/templates/CreateTemplate.vue';
import { idleCreation } from '@/creations/idle';
import { manualImportCreation } from '@/creations/manualImport';
import { useToast } from '@/composables/useToast';

const query = ref('');
const { rows, pending, error, updatedAt, reload, acting, run, hide, confirmDialog, resolveConfirm } = useDownloadQueue();

/* Une ligne, un élément suivi ; la recherche porte sur le titre, la provenance et le demandeur. */
const items = computed<TrackItem[]>(() => {
  const needle = query.value.trim().toLocaleLowerCase('fr');
  return rows.value
    .map((row) => ({ row, item: queueRowToTrack(row, acting.value.has(rowKey(row))) }))
    .filter(({ item }) => !needle || `${item.title} ${item.subtitle || ''}`.toLocaleLowerCase('fr').includes(needle))
    .map(({ item }) => item);
});
const byKey = computed(() => new Map(rows.value.map((row) => [rowKey(row), row])));

/* Les cinq derniers terminés : l'historique complet a sa propre page. */
const { history, load: loadHistory } = useDownloadHistory(() => ({ source: '', instanceId: '' }), () => {});
onMounted(() => { void loadHistory(); });
const recent = computed<TrackRecent[]>(() => history.value.slice(0, 5).map((row) => ({
  key: String(row.id),
  title: row.year ? `${row.title} (${row.year})` : row.title,
  detail: row.completed_at ? formatDateShort(row.completed_at) : '',
  to: queueDetailPath(row),
})));
const updated = computed(() => (updatedAt.value ? `Mis à jour ${formatRelativeDate(new Date(updatedAt.value)).replace(/^\p{Lu}/u, (c) => c.toLowerCase())}` : ''));

const manualRow = ref<any>(null);
const manualDefinition = computed(() => (manualRow.value ? manualImportCreation(manualRow.value) : idleCreation));
const { addToast } = useToast();
useErrorToast(() => (rows.value.length ? error.value : ''), { title: 'Chargement partiel', type: 'warning', retry: () => reload() });
function onAction(item: TrackItem, key: string): void {
  const row = byKey.value.get(item.key);
  if (!row) return;
  if (key === 'manual') manualRow.value = row;
  else void run(key, row);
}
/* L'association faite, la ligne quitte la file sans attendre la relecture. */
async function onImported(result: CreateResult): Promise<void> {
  if (manualRow.value) hide(manualRow.value);
  manualRow.value = null;
  addToast({ type: 'success', message: result.message });
  await reload();
}
</script>
