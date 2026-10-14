<template>
  <!-- Stockage et transferts : Transferts (Suivre), Historique (Comprendre), Stockages (Gérer,
       avec les connexions, les correspondances Arr ↔ Plex en Configurer et l'inventaire en
       Explorer). Tout ce qu'on saisit est une définition du gabarit Créer (src/creations/). -->
  <PageTemplate
    class="storage-page"
    title="Stockage et transferts"
    :tabs="tabs"
    :active-tab="tab"
    tabs-label="Sections du stockage"
    v-model:query="query"
    :search="{ placeholder: searchPlaceholder, scope: 'Stockage', kind: 'filter' }"
    :filter-count="inventoryActive ? inventory.filterCount.value : 0"
    :filter-chips="inventoryActive ? inventory.chips.value : undefined"
    @reset-filters="inventory.reset"
  >
    <template v-if="quickAction" #quick-action>
      <UiButton variant="primary" @click="quickAction.run">{{ quickAction.label }}</UiButton>
    </template>
    <template v-if="inventoryActive" #filters>
      <FilterGroupList :groups="inventory.groups.value" />
    </template>

    <template v-if="tab === 'transfers' || tab === 'history'">
      <!-- Une tâche : sa fiche, depuis Transferts comme depuis l'Historique. -->
      <StorageTaskSheet v-if="selectedJob" :job="selectedJob" :ctx="taskCtx" @back="closeTask" @action="(key) => runTaskAction(selectedJob, key)" />
      <TrackTemplate
        v-else-if="tab === 'transfers'"
        :items="trackItems"
        :recent="recentTasks"
        :history-to="{ query: { vue: 'history' } }"
        :loading="loading && !jobs.length"
        :labels="{ items: 'transferts', empty: 'Aucun transfert en cours', emptyDetail: 'Créez un transfert pour libérer de l’espace sur un stockage.', recent: 'Derniers transferts terminés', history: 'Historique des transferts' }"
        @action="onTrackAction"
      />
      <UnderstandTemplate
        v-else
        :events="historyEvents"
        :detail="historyDetail"
        :open-key="historyOpen"
        :outcomes="OUTCOMES"
        :outcome="historyOutcome"
        :exportable="false"
        :loading="loading && !jobs.length"
        empty-title="Aucun transfert terminé"
        empty-message="Les transferts terminés ou annulés apparaîtront ici."
        @update:outcome="historyOutcome = $event"
        @open="(event) => (historyOpen = event.key)"
        @close="historyOpen = ''"
        @action="onHistoryAction"
      />
    </template>

    <template v-if="tab === 'settings'">
      <ManageTemplate
        v-if="settingsTab === 'roots'"
        label="Stockages"
        :rows="filteredLocations"
        :columns="LOCATION_COLUMNS"
        :row-key="(row: any) => row.id"
        :row-label="(row: any) => row.name"
        :loading="loading && !locations.length"
        :labels="{ singular: 'stockage sélectionné', plural: 'stockages sélectionnés', empty: 'Aucun stockage', global: 'Actions sur les stockages' }"
        :row-actions="LOCATION_ROW_ACTIONS"
        :global-actions="LOCATION_GLOBAL_ACTIONS"
        openable
        @open="openLocation"
        @action="onLocationAction"
      >
        <template #cell-name="{ row }"><strong>{{ row.name }}</strong><small>{{ row.mappings?.length || 0 }} dossier(s) associé(s)</small></template>
        <template #cell-capacity="{ row }">
          <strong>{{ bytesLabel(row.free_bytes) }} libres</strong><small>sur {{ bytesLabel(row.total_bytes) }} · {{ row.checked_at ? 'dernier contrôle' : 'capacité à confirmer' }}</small>
          <UiProgress v-if="row.total_bytes && row.free_bytes != null" :value="(row.total_bytes - row.free_bytes) / row.total_bytes * 100" :label="`Espace utilisé de ${row.name}`" />
        </template>
        <template #cell-access="{ row }"><span>{{ connectionNames(row, accesses, connections) }}</span><small>{{ row.virtual ? 'À configurer' : 'Contrôle des accès à l’aperçu' }}</small></template>
      </ManageTemplate>

      <template v-else>
        <UiButton class="storage-back" variant="ghost" @click="settingsTab = 'roots'">← Stockages</UiButton>

        <ManageTemplate
          v-if="settingsTab === 'connections'"
          label="Connexions"
          :rows="filteredConnections"
          :columns="CONNECTION_COLUMNS"
          :row-key="(row: any) => row.id"
          :row-label="(row: any) => row.name"
          :labels="{ singular: 'connexion sélectionnée', plural: 'connexions sélectionnées', empty: 'Aucune connexion', global: 'Actions sur les connexions' }"
          :row-actions="CONNECTION_ROW_ACTIONS"
          :global-actions="CONNECTION_GLOBAL_ACTIONS"
          openable
          @open="openConnection"
          @action="onConnectionAction"
        >
          <template #cell-name="{ row }"><strong>{{ row.name }}</strong><small>{{ row.method === 'ssh' ? row.connection?.host : row.connection?.browse_root }}</small></template>
          <template #cell-method="{ row }">{{ row.method === 'ssh' ? 'SSH' : 'Fichiers montés' }}</template>
          <template #cell-state="{ row }">{{ row.method === 'ssh' && !row.trusted ? 'Identité à confirmer' : 'Configurée · contrôle à l’aperçu' }}</template>
        </ManageTemplate>

        <ConfigureTemplate
          v-else-if="settingsTab === 'mappings'"
          :sections="mappingSections"
          :dirty="mappings.dirty.value"
          :saving="mappings.saving.value"
          :query="query"
          @save="saveMappings"
          @cancel="mappings.cancel"
        >
          <template v-for="group in mappings.groups.value" :key="group.id" #[`section-g${group.id}`]>
            <ConfigureField v-for="row in group.rows" :key="row.key" :label="row.arr_root || 'Aucune racine détectée'" :help="mappingHelp(row)" :for-id="`map-${row.key}`" stacked>
              <div class="storage-mapping">
                <UiSelect
                  :id="`map-${row.key}`"
                  v-model="mappings.pairs.value[row.key]"
                  :options="plexOptions(row)"
                  :disabled="mappings.saving.value || Boolean(row.error)"
                  :aria-label="`Dossier Plex correspondant à ${row.instance} ${row.arr_root}`"
                />
                <UiBadge :tone="STATUS_TONE[mappings.statusOf(row)]">{{ STATUS_LABEL[mappings.statusOf(row)] }}</UiBadge>
                <UiButton v-if="row.arr_root" variant="ghost" :aria-label="`Configurer l’accès de ${row.arr_root}`" @click="openRootAccess(row)">Configurer l’accès</UiButton>
              </div>
            </ConfigureField>
          </template>
        </ConfigureTemplate>

        <template v-else-if="settingsTab === 'inventory'">
          <DetailTemplate
            v-if="inventory.selected.value"
            variant="card"
            back
            eyebrow="Inventaire"
            :title="inventory.selected.value.data.title || 'Sans titre'"
            :badges="inventoryBadges(inventory.selected.value)"
            :actions="inventoryActions(inventory.selected.value)"
            :facts="inventoryFacts(inventory.selected.value)"
            @back="inventory.selectedId.value = null"
            @action="(key) => key === 'refresh' && refreshInventory(inventory.selected.value!.id)"
          >
            <template #tab-files>
              <UiDataTable v-if="inventory.selected.value.data.files?.length" density="compact" label="Fichiers observés" :rows="inventory.selected.value.data.files" :columns="FILE_COLUMNS" :row-key="(row: any) => row.path + (row.rating_key || '')">
                <template #cell-path="{ row }"><code>{{ row.path }}</code></template>
                <template #cell-size="{ row }">{{ row.size_bytes == null ? 'Taille inconnue' : gb(row.size_bytes) }}</template>
                <template #cell-state="{ row }">{{ row.present ? `Observé par ${inventory.selected.value.source === 'plex' ? 'Plex' : 'Arr'}` : 'Ancien emplacement' }}</template>
              </UiDataTable>
              <UiEmptyState v-else title="Aucun fichier" message="Aucun fichier n’a été observé pour cet élément." compact />
            </template>
          </DetailTemplate>
          <ExploreTemplate
            v-else
            view="table"
            :items="inventory.visible.value"
            :unit="['observation', 'observations']"
            :chips="inventory.chips.value"
            :has-more="inventory.hasMore.value"
            :loading="inventory.loading.value"
            :loading-more="inventory.loadingMore.value"
            :error="inventory.error.value"
            empty-title="Aucune observation"
            empty-message="L’inventaire se remplit pendant les synchronisations et les actualisations en arrière-plan."
            @reset="inventory.reset"
            @load-more="inventory.load(true)"
            @retry="inventory.load()"
          >
            <template #table>
              <UiDataTable label="Inventaire des médias" :rows="inventory.visible.value" :columns="INVENTORY_COLUMNS" :row-key="(row: any) => row.id" @row-click="(row: any) => (inventory.selectedId.value = row.id)">
                <template #cell-title="{ row }"><strong>{{ row.data.title }}</strong><small>{{ row.data.path || '' }}</small></template>
                <template #cell-source="{ row }">{{ row.source === 'plex' ? 'Plex' : 'Arr' }}</template>
                <template #cell-present="{ row }">{{ row.present ? 'Observé' : 'Absent du dernier catalogue' }}</template>
                <template #cell-observed="{ row }">{{ inventory.toDate(row.observed_at).toLocaleString('fr-FR') }}</template>
                <template #cell-open="{ row }"><UiButton variant="ghost" :aria-label="`Ouvrir ${row.data.title}`" @click="inventory.selectedId.value = row.id">Détails</UiButton></template>
              </UiDataTable>
            </template>
          </ExploreTemplate>
        </template>
      </template>
    </template>
  </PageTemplate>

  <CreateTemplate
    v-if="dialog"
    :open="true"
    :definition="dialog.definition"
    :mode="dialog.mode"
    :values="dialog.values"
    :start="dialog.start"
    @close="dialog = null"
    @created="onCreated"
  />
  <StorageDirectoryBrowser v-if="browser" :open="true" :connection="browser.connection" :initial-path="browser.path" @close="finishBrowse(null)" @choose="finishBrowse" />
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import ConfirmModal from '@/components/ConfirmModal.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import CreateTemplate from '@/components/templates/CreateTemplate.vue';
import DetailTemplate from '@/components/templates/DetailTemplate.vue';
import ExploreTemplate from '@/components/templates/ExploreTemplate.vue';
import ManageTemplate from '@/components/templates/ManageTemplate.vue';
import PageTemplate from '@/components/templates/PageTemplate.vue';
import TrackTemplate from '@/components/templates/TrackTemplate.vue';
import UnderstandTemplate from '@/components/templates/UnderstandTemplate.vue';
import type { CreateDefinition, CreateResult, CreateValues } from '@/components/templates/create/types';
import type { TrackItem } from '@/components/templates/track/types';
import StorageDirectoryBrowser from '@/components/storage/StorageDirectoryBrowser.vue';
import StorageTaskSheet from '@/components/storage/StorageTaskSheet.vue';
import { CONNECTION_COLUMNS, CONNECTION_GLOBAL_ACTIONS, CONNECTION_ROW_ACTIONS, LOCATION_COLUMNS, LOCATION_GLOBAL_ACTIONS, LOCATION_ROW_ACTIONS, bytesLabel, connectionNames } from '@/components/storage/storageDefinitions';
import { calculatePreview } from '@/components/storage/previewJob';
import { selectedRootAccess } from '@/components/storage/transferAccess';
import { useStorageLiveTelemetry } from '@/components/storage/useStorageLiveTelemetry';
import { useStorageTelemetry } from '@/components/storage/useStorageTelemetry';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import FilterGroupList from '@/components/ui/FilterGroupList.vue';
import { connectionCreation, connectionValuesFromRow, freshConnectionValues } from '@/creations/storageConnection';
import { locationCreation, locationValuesFromRow, freshLocationValues, rootAccessCreation, rootAccessValues } from '@/creations/storageLocation';
import { freshTransferValues, transferCreation, transferForm, transferValuesFromJob } from '@/creations/storageTransfer';
import { useConfirm } from '@/composables/useConfirm';
import { useStorageInventory, type InventoryRow } from '@/composables/useStorageInventory';
import { useStorageMappings, type MappingRow } from '@/composables/useStorageMappings';
import { useStorageOverview } from '@/composables/useStorageOverview';
import { useToast } from '@/composables/useToast';
import { isTerminal, taskDetail, taskEvent, taskName, taskRecent, taskTrackItem, type TaskContext } from '@/storage/storageTasks';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const query = ref('');

/* La vue est dans l'adresse (?vue=) : partageable, retrouvée au retour. */
const VIEWS = ['transfers', 'settings', 'history'];
const withoutTask = () => { const { tache: _task, ...rest } = route.query; return rest; };
const tabs = computed(() => [{ key: 'transfers', label: 'Transferts' }, { key: 'settings', label: 'Stockages' }, { key: 'history', label: 'Historique' }]
  .map((item) => ({ ...item, to: { path: route.path, query: { ...withoutTask(), vue: item.key } } })));
const tab = computed<string>(() => (VIEWS.includes(String(route.query.vue)) ? String(route.query.vue) : 'transfers'));
const settingsTab = ref<'roots' | 'connections' | 'mappings' | 'inventory'>('roots');

const { locations, jobs, accesses, connections, instances, loading, error, load } = useStorageOverview(() => tick());
const { gb, date, locationName, status } = useStorageTelemetry(locations);
useStorageLiveTelemetry(jobs, loading);
watch(error, (value) => { if (value) toast.error('Stockage', value); });

const mappings = useStorageMappings(locations, () => load(true));
const inventory = useStorageInventory(query);
const inventoryActive = computed(() => tab.value === 'settings' && settingsTab.value === 'inventory');

const searchPlaceholder = computed(() => (tab.value !== 'settings' ? 'Rechercher une tâche…' : settingsTab.value === 'inventory' ? 'Rechercher dans l’inventaire…' : settingsTab.value === 'connections' ? 'Rechercher une connexion…' : settingsTab.value === 'mappings' ? 'Rechercher une instance…' : 'Rechercher un stockage…'));

const needle = computed(() => query.value.trim().toLowerCase());
const named = (job: any) => taskName(job).toLowerCase().includes(needle.value);
const filteredLocations = computed(() => locations.value.filter((l) => (l.name || `Stockage ${l.id}`).toLowerCase().includes(needle.value)));
const filteredConnections = computed(() => connections.value.filter((c) => String(c.name || '').toLowerCase().includes(needle.value)));

/* --- Tâches de transfert --------------------------------------------------------------- */
const busy = ref(false);
const taskCtx: TaskContext = {
  locationName, status, gb, date,
  instanceName: (job: any) => instances.value.find((i: any) => i.id === job.params?.arr_instance_id)?.name || `Instance ${job.params?.arr_instance_id || 'non précisée'}`,
  taskTo: (id: number) => ({ query: { ...route.query, vue: tab.value === 'history' ? 'history' : 'transfers', tache: String(id) } }),
};
const OUTCOMES = [{ value: 'all', label: 'Toutes' }, { value: 'completed', label: 'Terminées' }, { value: 'cancelled', label: 'Annulées' }];
const historyOpen = ref('');
const historyOutcome = ref('all');
const trackItems = computed(() => jobs.value.filter((job) => !isTerminal(job) && named(job)).map((job) => taskTrackItem(job, taskCtx, busy.value)));
const finishedJobs = computed(() => jobs.value.filter((job) => isTerminal(job) && named(job)));
const recentTasks = computed(() => finishedJobs.value.slice().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 5).map((job) => taskRecent(job, taskCtx)));
const historyEvents = computed(() => finishedJobs.value.filter((job) => historyOutcome.value === 'all' || job.status === historyOutcome.value).map((job) => taskEvent(job, taskCtx)));
const historyJob = computed(() => jobs.value.find((job) => String(job.id) === historyOpen.value));
const historyDetail = computed(() => (historyJob.value ? taskDetail(historyJob.value, taskCtx) : null));
const selectedJob = computed(() => jobs.value.find((job) => String(job.id) === String(route.query.tache)));
const closeTask = () => { void router.replace({ query: withoutTask() }); };

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

async function guarded(fn: () => Promise<void>): Promise<void> {
  busy.value = true;
  try { await fn(); } catch (cause: any) { toast.error('Stockage', cause.message); } finally { busy.value = false; }
}
const command = (id: number, action: string) => guarded(async () => { await api(`/api/storage/transfers/${id}/command`, { method: 'POST', body: JSON.stringify({ action }) }); await load(); });

async function confirmRemove(job: any): Promise<void> {
  const draft = job.status === 'draft';
  const live = !isTerminal(job) && !draft;
  const ok = await askConfirm({
    title: draft ? 'Supprimer le brouillon ?' : 'Supprimer la tâche ?',
    message: `Cette tâche et son historique seront supprimés. Les originaux et les copies complètes seront conservés.${draft ? ' Aucun fichier média ne sera déplacé ou supprimé.' : ''}${live ? ' La tâche sera d’abord annulée et ses fichiers temporaires nettoyés ; sa suppression attendra la fin de cette opération, y compris d’une commande Arr déjà lancée.' : ''}`,
    confirmLabel: draft ? 'Supprimer le brouillon' : live ? 'Annuler et supprimer' : 'Supprimer la tâche', danger: true,
  });
  if (!ok) return;
  await guarded(async () => {
    const result: any = await api(`/api/storage/transfers/${job.id}`, { method: 'DELETE' });
    toast.success(result.deletion_pending ? 'Suppression demandée : annulation et nettoyage en cours.' : 'Tâche supprimée.');
    await load();
  });
  if (String(route.query.tache) === String(job.id)) closeTask();
  if (historyOpen.value === String(job.id)) historyOpen.value = '';
}
async function confirmCancel(job: any): Promise<void> {
  const arr = job.params?.transfer_mode === 'arr';
  const ok = await askConfirm({
    title: 'Annuler cette tâche ?',
    message: `Les prochains titres ne seront pas transférés. Les fichiers partiels seront nettoyés après l’arrêt de la copie. Les copies complètes, les originaux non transférés et les deux emplacements Plex restent conservés. Avec rsync, une série incomplète garde sa racine Arr d’origine.${arr ? ' Une commande Sonarr / Radarr déjà lancée peut continuer : l’annulation attend sa fin et ne revient pas sur son déplacement.' : ''}`,
    confirmLabel: 'Annuler et nettoyer', danger: true,
  });
  if (ok) await command(job.id, 'cancel');
}
function runTaskAction(job: any, key: string): void | Promise<void> {
  if (!job) return;
  if (['pause', 'resume', 'retry'].includes(key)) return command(job.id, key);
  if (key === 'retry-items') return command(job.id, 'retry');
  if (key === 'verify' || key === 'relaunch') return openTransfer(job, { editing: true, start: 'preview' });
  if (key === 'cancel') return confirmCancel(job);
  if (key === 'remove') return confirmRemove(job);
  if (key === 'edit') return openTransfer(job, { editing: true });
  if (key === 'duplicate') return openTransfer(job, { editing: false });
}
const onTrackAction = (item: TrackItem, key: string) => runTaskAction(jobs.value.find((job) => String(job.id) === item.key), key);
const onHistoryAction = (key: string) => runTaskAction(historyJob.value, key);

/* --- Fenêtre de création (gabarit Créer) ------------------------------------------------ */
interface Dialog { definition: CreateDefinition; mode: 'create' | 'edit'; values: CreateValues | null; start: string }
const dialog = shallowRef<Dialog | null>(null);
const onCreated = (_result: CreateResult, _values: CreateValues) => { void load(true); };
const done = (message: string) => { toast.success(message); void load(true); };

const protectedTitles = ref<any[]>([]);
const loadProtections = async () => { protectedTitles.value = await api<any[]>('/api/storage/protected-titles'); };

/* Instances Arr et leurs dossiers connus (pour le trajet d'un transfert). */
const transferRoots = computed(() => {
  const byInstance = new Map<number, any>();
  const ensure = (id: number) => {
    if (!byInstance.has(id)) {
      const instance = instances.value.find((entry: any) => entry.id === id);
      byInstance.set(id, { arr_instance_id: id, name: instance?.name || `Instance ${id}`, arr_type: instance?.arr_type || 'sonarr', arr_roots: [], capacities: {}, plex_roots: [] });
    }
    return byInstance.get(id);
  };
  for (const location of locations.value) {
    for (const mapping of location.mappings || []) {
      const item = ensure(mapping.arr_instance_id);
      if (!item.arr_roots.includes(mapping.arr_root)) item.arr_roots.push(mapping.arr_root);
      item.plex_roots.push({ path: mapping.plex_root, section_id: String(mapping.plex_section_id) });
    }
  }
  for (const access of accesses.value) {
    for (const root of access.roots || []) {
      const item = ensure(root.arr_instance_id);
      if (!item.arr_roots.includes(root.arr_root)) item.arr_roots.push(root.arr_root);
    }
  }
  for (const instance of instances.value) if (instance.enabled !== false) ensure(instance.id);
  for (const location of locations.value) {
    const mapping = location.mappings?.[0];
    if (!mapping) continue;
    if (location.free_bytes != null) ensure(mapping.arr_instance_id).capacities[mapping.arr_root] = { free_bytes: location.free_bytes };
  }
  return [...byInstance.values()].filter((item: any) => instances.value.find((entry: any) => entry.id === item.arr_instance_id)?.enabled !== false);
});

function openTransfer(job: any | null, options: { editing?: boolean; start?: string } = {}): void {
  void loadProtections().catch((cause: any) => toast.error('Stockage', cause.message));
  const taskId = options.editing && job ? job.id : 0;
  const definition = transferCreation({
    roots: () => transferRoots.value,
    accesses: () => accesses.value,
    locations: () => locations.value,
    protectedTitles: () => protectedTitles.value,
    taskId,
    calculate: async (values, progress) => {
      await loadProtections();
      const { routes, ...settings } = transferForm(values) as any;
      const prepared = routes.map((entry: any) => {
        const rootAccessIds = { ...settings.root_access_ids };
        for (const root of [...entry.source_roots, entry.destination_root]) {
          const endpoint = selectedRootAccess(settings, accesses.value, entry.arr_instance_id, root);
          if (endpoint) rootAccessIds[`${entry.arr_instance_id}:${root}`] = endpoint.id;
        }
        return { ...entry, root_access_ids: rootAccessIds, name: settings.name || instances.value.find((i: any) => i.id === entry.arr_instance_id)?.name || String(entry.arr_instance_id) };
      });
      return calculatePreview({ ...settings, routes: prepared, task_id: taskId }, (seconds, phase) => progress(`Calcul de l’aperçu · ${seconds} s · ${phase}`));
    },
    launch: async (plan, selection, start) => {
      for (const group of plan.groups) {
        if (group.submitted) continue;
        const keys = group.items.filter((item: any) => selection.includes(item.key)).map((item: any) => item.key);
        if (!keys.length) continue;
        await api(`/api/storage/transfers${taskId ? `/${taskId}` : ''}`, { method: taskId ? 'PUT' : 'POST', body: JSON.stringify({ ...group.body, selection: keys, start_immediately: start }) });
        group.submitted = true;
      }
      await load(true);
    },
    saveSettings: async (values) => {
      const { routes, ...settings } = transferForm(values) as any;
      if (routes.length !== 1) throw new Error('Une tâche correspond à une instance. Créez une copie pour une autre tâche.');
      await api(`/api/storage/transfers/${taskId}`, { method: 'PUT', body: JSON.stringify({ ...settings, ...routes[0], source_root: routes[0].source_roots[0], routes: [], selection: [], start_immediately: false }) });
      await load(true);
    },
    protect: async (item) => {
      await api(`/api/storage/protected-titles/${item.arr_instance_id}/${item.arr_id}`, { method: 'PUT', body: JSON.stringify({ title: item.title }) });
      item.protected = true;
      await loadProtections();
    },
    unprotect: async (key) => {
      await api(`/api/storage/protected-titles/${key.replace(':', '/')}`, { method: 'DELETE' });
      await loadProtections();
    },
  });
  dialog.value = { definition, mode: taskId ? 'edit' : 'create', values: job ? transferValuesFromJob(job) : freshTransferValues(), start: options.start || '' };
}

/* Choisir un dossier sur une connexion : la fenêtre de l'explorateur répond par une promesse. */
const browser = ref<{ connection: any; path: string; resolve: (path: string | null) => void } | null>(null);
const browse = (connection: any, current: string) => new Promise<string | null>((resolve) => { browser.value = { connection, path: current, resolve }; });
function finishBrowse(path: string | null): void {
  browser.value?.resolve(path);
  browser.value = null;
}

function openLocation(location: any | null): void {
  const definition = locationCreation({
    location, roots: () => mappings.roots.value, loadRoots: () => mappings.refresh(), connections: () => connections.value, accesses: () => accesses.value, browse, done,
  });
  dialog.value = { definition, mode: location ? 'edit' : 'create', values: location ? locationValuesFromRow(location, accesses.value, connections.value) : freshLocationValues(), start: '' };
}
function openConnection(connection: any | null): void {
  const definition = connectionCreation({ locations: () => locations.value, accesses: () => accesses.value, connection, done });
  dialog.value = { definition, mode: connection ? 'edit' : 'create', values: connection ? connectionValuesFromRow(connection, accesses.value, locations.value) : freshConnectionValues(), start: '' };
}
function openRootAccess(row: MappingRow): void {
  const definition = rootAccessCreation({ connections: () => connections.value, accesses: () => accesses.value, browse, done }, row);
  dialog.value = { definition, mode: 'edit', values: rootAccessValues(accesses.value, connections.value, row), start: '' };
}

function onLocationAction(key: string, rows: any[]): void {
  if (key === 'configure' && rows[0]) openLocation(rows[0]);
  else if (key === 'mappings') { settingsTab.value = 'mappings'; void mappings.refresh().catch((cause: any) => toast.error('Stockage', cause.message)); }
  else if (key === 'connections') settingsTab.value = 'connections';
  else if (key === 'inventory') { settingsTab.value = 'inventory'; void inventory.load(); }
}
function onConnectionAction(key: string, rows: any[]): void {
  if (key === 'add') openConnection(null);
  else if (key === 'configure' && rows[0]) openConnection(rows[0]);
  else if (key === 'trust' && rows[0]) openConnection(rows[0]);
}

/* --- Correspondances Arr ↔ Plex (Configurer) ----------------------------------------------- */
const STATUS_LABEL = { todo: 'À associer', dirty: 'À enregistrer', done: 'Configuré' } as const;
const STATUS_TONE = { todo: 'warning', dirty: 'info', done: 'success' } as const;
const mappingSections = computed(() => mappings.groups.value.map((group) => ({
  key: `g${group.id}`, title: `${group.name} · ${group.kind === 'radarr' ? 'Films' : 'Séries'}`,
  description: `${group.rows.length} dossier(s) à associer à un dossier Plex.`, keywords: [group.name], dirty: mappings.dirtyGroups.value.has(group.id),
})));
const plexOptions = (row: MappingRow) => [{ value: '', label: 'Choisir le dossier Plex' }, ...row.plex_roots.map((plex: any) => ({ value: JSON.stringify([plex.section_id, plex.path]), label: `${plex.path} · ${plex.library}` }))];
const mappingHelp = (row: MappingRow) => row.error || 'Les dossiers utilisés seront contrôlés lors de l’aperçu du déplacement.';
async function saveMappings(): Promise<void> {
  const { saved, failures } = await mappings.save();
  if (saved) toast.success(`${saved} correspondance(s) enregistrée(s). Aucun transfert lancé.`);
  if (failures.length) toast.error('Stockage', failures.join(' · '));
}

/* --- Inventaire (Explorer, fiche) -------------------------------------------------------- */
const INVENTORY_COLUMNS: UiColumn[] = [
  { key: 'title', label: 'Titre', card: 'title' }, { key: 'source', label: 'Source' }, { key: 'present', label: 'Présence' },
  { key: 'observed', label: 'Dernière observation' }, { key: 'open', label: '' },
];
const FILE_COLUMNS: UiColumn[] = [{ key: 'path', label: 'Chemin', card: 'title' }, { key: 'size', label: 'Taille' }, { key: 'state', label: 'État' }];
const inventoryBadges = (row: InventoryRow) => [
  { key: 'source', label: row.source === 'plex' ? 'Plex' : 'Sonarr / Radarr', tone: 'info' as const },
  { key: 'present', label: row.present ? 'Observé' : 'Absent du dernier catalogue', tone: row.present ? 'success' as const : 'warning' as const },
];
const inventoryActions = (row: InventoryRow) => (row.source === 'plex' ? [{ key: 'refresh', label: inventory.refreshing.value === row.id ? 'Actualisation…' : 'Actualiser la fiche Plex', disabled: inventory.refreshing.value !== 0 }] : []);
const inventoryFacts = (row: InventoryRow) => [
  { label: 'Dernière observation', value: inventory.toDate(row.observed_at).toLocaleString('fr-FR') },
  ...(row.data.files_observed_at ? [{ label: 'Fichiers actualisés', value: inventory.toDate(row.data.files_observed_at).toLocaleString('fr-FR') }] : []),
  ...(row.source === 'arr' && row.data.path ? [{ label: 'Dossier Arr', value: row.data.path }] : []),
];
const refreshInventory = (id: number) => inventory.refreshRow(id).catch((cause: any) => toast.error('Stockage', cause.message));

/* --- Action du contexte (segment de droite de la capsule) ------------------------------- */
const quickAction = computed(() => {
  if (tab.value === 'settings') {
    if (settingsTab.value === 'roots') return { label: 'Ajouter un stockage', run: () => openLocation(null) };
    if (settingsTab.value === 'connections') return { label: 'Ajouter une connexion', run: () => openConnection(null) };
    return null;
  }
  return { label: 'Nouveau transfert', run: () => openTransfer(null) };
});

function tick(): void {
  if (tab.value === 'settings' && settingsTab.value === 'mappings') void mappings.refreshIfStale();
}
onMounted(() => { void load(); });
</script>

<style lang="scss">
@use '@/components/storage/storage' as storage;
.storage-page { @include storage.styles; }
</style>

<style scoped>
.storage-mapping { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2, 8px); }
.storage-mapping > :first-child { flex: 1 1 260px; min-width: 0; }
.storage-back { align-self: flex-start; margin-bottom: var(--space-2, 8px); }
</style>
