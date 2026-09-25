<template>
  <section class="torrent-manager" aria-label="Gestion des torrents">
    <!-- Bannière de données en cache (en cas de panne client) -->
    <div v-if="staleInfo" class="stale-cache-banner" role="alert">
      <AlertTriangle />
      <div>
        <strong>Mode données en cache local</strong>
        <p>Le client torrent <strong>{{ staleInfo.client_name }}</strong> est momentanément injoignable. (Dernière synchro : il y a {{ staleInfo.stale_since_seconds }} sec)</p>
      </div>
    </div>

    <TorrentSpeedBar v-model:compact="isCompact" v-model:incognito="isIncognito" :rows="rows" :client-id="clientId" @refresh="emit('refresh')" @error="emit('error', $event)" />

    <div v-if="selectedRows.length" class="bulk-toolbar" role="toolbar" aria-label="Actions sur la sélection">
      <strong>{{ selectedRows.length }} sélectionné(s)</strong>
      <UiButton :disabled="busy" @click="runAction('pause', selectedRows)"><Pause />Mettre en pause</UiButton>
      <UiButton :disabled="busy" @click="runAction('resume', selectedRows)"><Play />Reprendre</UiButton>
      <UiButton :disabled="busy" @click="runAction('recheck', selectedRows)"><RotateCcw />Revérifier</UiButton>
      <UiButton :disabled="busy" @click="runAction('reannounce', selectedRows)"><Radio />Réannoncer</UiButton>
      <UiButton :disabled="busy" @click="openMetaModal(selectedRows)"><Tag />Catégorie & Tags</UiButton>
      <UiButton variant="danger" :disabled="busy" @click="confirmRemoval(selectedRows, false)"><Trash2 />Retirer</UiButton>
      <UiButton variant="danger" :disabled="busy" @click="confirmRemoval(selectedRows, true)"><FileX2 />Supprimer avec les fichiers</UiButton>
      <button class="text-button" :disabled="busy" @click="clearSelection">Annuler la sélection</button>
    </div>

    <!-- Clic droit (ou appui long) sur le tableau : le menu contextuel s'ouvre au pointeur,
         sur la ligne visee, que la ligne selectionne d'abord (son evenement remonte avant). -->
    <TorrentContextMenu :selection="selectedRows.length ? selectedRows : (contextTarget ? [contextTarget] : [])" @action="handleContextMenuAction">
    <UiDataTable
      :class="['torrent-table', { 'compact-table': isCompact, 'incognito-mode': isIncognito }]"
      label="Tableau des torrents"
      :rows="displayedRows"
      :columns="tableColumns"
      :column-prefs="columnPrefs"
      :row-key="rowKey"
      :row-label="(row: any) => row.title"
      :row-class="rowClass"
      :sort="{ key: sortKey, direction: sortDirection }"
      manual-sort
      selectable
      :selection="[...selected]"
      resizable
      reorderable
      clickable
      :density="isCompact ? 'compact' : 'comfortable'"
      @update:sort="onSort"
      @update:selection="(keys: Array<string | number>) => setSelection(keys.map(String))"
      @row-click="onRowClick"
      @row-contextmenu="(row: any, index: number) => openContextMenu(row, index)"
      @dragover.prevent
      @drop.prevent="handleGlobalDrop"
    >
      <template #empty>Aucun torrent ne correspond aux filtres.</template>
      <template #cell-title="{ row, index }">
        <button class="torrent-title" @click.stop="openDetails(row)">
          {{ isIncognito ? maskTitle(row.title, Number(index)) : row.title }}
        </button>
        <small>{{ row.client_name }}<template v-if="row.tags"> · {{ row.tags }}</template></small>
      </template>
      <template #cell-status="{ row }"><TorrentStateBadge :torrent="row" /></template>
      <template #cell-progress="{ row }">
        <div class="progress-cell"><div><UiProgress :value="row.progress||0" :label="`Progression de ${row.title}`" /><span>{{ Math.round(row.progress||0) }} %</span></div></div>
      </template>
      <template #cell-size="{ row }">{{ formatBytes(row.size) }}</template>
      <template #cell-download_speed="{ row }">{{ formatSpeed(row.download_speed) }}</template>
      <template #cell-upload_speed="{ row }">{{ formatSpeed(row.upload_speed) }}</template>
      <template #cell-ratio="{ row }">{{ Number(row.ratio||0).toFixed(2) }}</template>
      <template #cell-eta="{ row }">{{ formatEta(row.eta) }}</template>
      <template #cell-category="{ row }">{{ row.category||'—' }}</template>
      <template #cell-trackers="{ row }">
        <span class="tracker-display">
          <img v-if="trackerValue(row) && !failedFavicons.has(trackerKey(row))" :src="trackerFaviconUrl(row)" alt="" loading="lazy" @error="hideTrackerFavicon(row)" />
          <span>{{ formatTracker(trackerValue(row)) }}</span>
        </span>
      </template>
      <template #cell-added_on="{ row }">{{ formatTimestamp(row.added_on) }}</template>
      <template #cell-completed_on="{ row }">{{ formatTimestamp(row.completed_on) }}</template>
      <template #cell-actions="{ row }">
        <UiButton class="action-trigger-btn" :disabled="isBusy(row)" title="Actions sur ce torrent" @click.stop="actionTarget=row">
          Actions
        </UiButton>
      </template>
      <template #after>
        <div ref="sentinelRef" class="load-more-sentinel">
          <LoadMore v-if="hasMore" :has-more="hasMore" :loading="false" @load="loadMore" />
        </div>
      </template>
    </UiDataTable>
    </TorrentContextMenu>
    <footer class="torrent-status-bar"><span>{{ displayedRows.length }} / {{ sortedRows.length }} affichés</span><span v-if="selectedRows.length">{{ selectedRows.length }} sélectionné(s)</span><span v-if="staleInfo" class="stale-state">Données en cache</span></footer>

    <TorrentColumnPicker :open="showColumnPicker" :prefs="columnPrefs" @close="showColumnPicker = false" />

    <!-- Actions d'un seul torrent, depuis le bouton de sa ligne -->
    <ModalShell :open="!!actionTarget" title="Actions sur le torrent" :subtitle="actionTarget?.title" @close="actionTarget=null">
      <div v-if="actionTarget" class="torrent-actions-menu">
        <UiButton class="action-menu-btn" :disabled="isBusy(actionTarget)" @click="actOnTarget(isPaused(actionTarget) ? 'resume' : 'pause')">
          <Play v-if="isPaused(actionTarget)" /><Pause v-else />
          {{ isPaused(actionTarget) ? 'Reprendre le téléchargement' : 'Mettre en pause' }}
        </UiButton>
        <UiButton class="action-menu-btn" :disabled="isBusy(actionTarget)" @click="actOnTarget('recheck')">
          <RotateCcw /> Revérifier les fichiers
        </UiButton>
        <UiButton class="action-menu-btn" :disabled="isBusy(actionTarget)" @click="actOnTarget('reannounce')">
          <Radio /> Réannoncer aux trackers
        </UiButton>
        <UiButton class="action-menu-btn" :disabled="isBusy(actionTarget)" @click="openMetaModal([actionTarget]); actionTarget=null">
          <Tag /> Modifier Catégorie & Tags
        </UiButton>
        <UiButton variant="danger" class="action-menu-btn" :disabled="isBusy(actionTarget)" @click="removalTarget=actionTarget; actionTarget=null">
          <Trash2 /> Supprimer ou retirer...
        </UiButton>
      </div>
    </ModalShell>

    <TorrentMetaModal :targets="metaTargets" :busy="busy" @close="metaTargets=null" @save="saveMetadata" />

    <ModalShell :open="!!removalTarget" title="Supprimer ce torrent" subtitle="Choisis si les données téléchargées doivent être conservées." @close="removalTarget=null">
      <p><strong>{{ removalTarget?.title }}</strong></p>
      <p class="removal-warning">La suppression des fichiers est définitive et peut retirer des médias encore utilisés ailleurs.</p>
      <template #actions>
        <UiButton :disabled="busy" @click="removalTarget=null">Annuler</UiButton>
        <UiButton variant="danger" :disabled="busy" @click="confirmRemoval([removalTarget],false)"><Trash2 />Retirer seulement</UiButton>
        <UiButton variant="danger" :disabled="busy" @click="confirmRemoval([removalTarget],true)"><FileX2 />Supprimer avec les fichiers</UiButton>
      </template>
    </ModalShell>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useEventListener, useIntersectionObserver } from '@vueuse/core';
import { AlertTriangle, FileX2, Pause, Play, Radio, RotateCcw, Tag, Trash2 } from '@lucide/vue';
import { useConfirm } from '@/composables/useConfirm';
import { useTableColumns } from '@/composables/useTableColumns';
import { usePreference } from '@/composables/usePreference';
import { useTableSelection } from '@/composables/useTableSelection';
import { torrentKey, useTorrentActions } from '@/composables/useTorrentActions';
import { ouvrirFiche } from '@/composables/useMediaOverlay';
import { useRoute, useRouter } from 'vue-router';
import { formatBytes, formatEta, formatSpeed, formatTimestamp, formatTracker, isPaused, maskTitle } from '@/downloads/torrentFormat';
import ConfirmModal from '@/components/ConfirmModal.vue';
import LoadMore from '@/components/ui/LoadMore.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import TorrentColumnPicker from './TorrentColumnPicker.vue';
import TorrentContextMenu from './TorrentContextMenu.vue';
import TorrentMetaModal from './TorrentMetaModal.vue';
import TorrentSpeedBar from './TorrentSpeedBar.vue';
import TorrentStateBadge from './TorrentStateBadge.vue';

const props = withDefaults(
  defineProps<{
    rows?: any[];
    clientId?: string | number;
    preferenceScope?: string | number;
  }>(),
  {
    rows: () => [],
    clientId: '',
    preferenceScope: 'all',
  }
);
const emit = defineEmits<{
  (e: 'refresh'): void;
  (e: 'error', message: string): void;
  (e: 'add-file', file: File): void;
}>();

const isCompact = usePreference('torrent-table-compact', false, { legacyKeys: ['watchdeck:torrent-table-compact'] });
const isIncognito = usePreference('torrent-table-incognito', false, { legacyKeys: ['watchdeck:torrent-table-incognito'] });

function handleGlobalDrop(e: DragEvent): void {
  const file = e.dataTransfer?.files?.[0];
  if (file?.name.endsWith('.torrent')) emit('add-file', file);
}

/* ---- Colonnes ---- */

interface TorrentColumn { key: string; label: string; className?: string; required?: boolean }

const ALL_COLUMNS: TorrentColumn[] = [
  { key: 'title', label: 'Torrent', className: 'torrent-name', required: true },
  { key: 'status', label: 'État', required: true },
  { key: 'progress', label: 'Progression' },
  { key: 'size', label: 'Taille' },
  { key: 'download_speed', label: 'Réception' },
  { key: 'upload_speed', label: 'Envoi' },
  { key: 'ratio', label: 'Ratio' },
  { key: 'eta', label: 'Temps restant' },
  { key: 'category', label: 'Catégorie' },
  { key: 'trackers', label: 'Tracker' },
  { key: 'added_on', label: 'Ajouté le' },
  { key: 'completed_on', label: 'Terminé le' },
];
const DEFAULT_VISIBLE_COLUMNS = ['title', 'status', 'progress', 'size', 'download_speed', 'upload_speed', 'eta', 'category'];
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  title: 300, status: 110, progress: 140, size: 90, download_speed: 100, upload_speed: 90,
  ratio: 75, eta: 100, category: 110, trackers: 130, added_on: 130, completed_on: 130,
};

const showColumnPicker = ref(false);
/* Ordre, visibilite et largeurs des colonnes, gardes par client (`preferenceScope`). */
const columnPrefs = useTableColumns(() => ALL_COLUMNS, {
  storageKey: `watchdeck:torrent-table-columns:${props.preferenceScope || 'all'}`,
  defaultVisible: DEFAULT_VISIBLE_COLUMNS,
  defaultWidths: DEFAULT_COLUMN_WIDTHS,
  // Deux colonnes au minimum : un tableau reduit a une colonne ne dit plus rien.
  minimumVisible: 2,
});

/* Dans la carte de telephone : le titre en tete, l'etat et la progression lisibles, le
   reste reserve au tableau. */
const CARTE_VISIBLE = new Set(['status', 'progress']);
const tableColumns = computed<UiColumn[]>(() => [
  ...ALL_COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    sortable: true,
    required: column.required,
    width: DEFAULT_COLUMN_WIDTHS[column.key],
    className: column.className,
    card: column.key === 'title' ? 'title' as const : CARTE_VISIBLE.has(column.key) ? 'field' as const : 'hidden' as const,
  })),
  { key: 'actions', label: 'Actions', required: true, width: 118, card: 'actions' as const, className: 'actions-cell' },
]);

defineExpose({
  openColumnPicker: () => { showColumnPicker.value = true; },
});

/* ---- Trackers ---- */

const failedFavicons = ref<Set<string>>(new Set());
function trackerValue(row: any): string { return row.trackers || row.tracker || ''; }
function trackerKey(row: any): string { return formatTracker(trackerValue(row)).toLocaleLowerCase('fr'); }
function trackerFaviconUrl(row: any): string { return `/api/downloads/tracker-favicon?tracker=${encodeURIComponent(String(trackerValue(row)).split(',')[0].trim())}`; }
function hideTrackerFavicon(row: any): void { failedFavicons.value = new Set([...failedFavicons.value, trackerKey(row)]); }

/* ---- Tri, pagination, selection ---- */

const staleInfo = computed(() => props.rows.find((row: any) => row.is_stale));
const rowKey = torrentKey;
const sortKey = ref('title');
const sortDirection = ref<'asc' | 'desc'>('asc');

const sortedRows = computed(() =>
  [...props.rows].sort((left, right) => {
    const a = left[sortKey.value] ?? '',
      b = right[sortKey.value] ?? '';
    const result =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
    return sortDirection.value === 'asc' ? result : -result;
  })
);

// Sur la liste triee : une selection par plage suit l'ordre affiche, et l'elagage des
// cles obsoletes porte sur les memes lignes que celles rendues. UiDataTable recoit et
// renvoie des cles stables : les rafraichissements remplacent les objets torrent, mais
// ne doivent pas vider la barre d'actions en lot.
const {
  selectedKeys: selected, selectedRows,
  toggle: toggleRow, toggleAll, clear: clearSelection, setKeys: setSelection, lastIndex: lastSelectedIndex,
} = useTableSelection(() => sortedRows.value, rowKey);

const BATCH_SIZE = 100;
const displayLimit = ref(BATCH_SIZE);
const sentinelRef = ref<HTMLElement | null>(null);
const displayedRows = computed(() => sortedRows.value.slice(0, displayLimit.value));
const hasMore = computed(() => displayLimit.value < sortedRows.value.length);

function loadMore(): void {
  displayLimit.value += BATCH_SIZE;
}

function onSort(value: { key: string; direction: 'asc' | 'desc' } | null): void {
  if (!value) return;
  displayLimit.value = BATCH_SIZE;
  sortKey.value = value.key;
  sortDirection.value = value.direction;
}

/* Le detail d'un torrent s'ouvre dans la feuille, avec sa propre adresse (voir
   TorrentDetailView) : retour le referme, le lien se partage. */
const route = useRoute();
const router = useRouter();
function openDetails(row: any): void {
  ouvrirFiche(router, `/downloads/torrent/${encodeURIComponent(row.client_id)}/${encodeURIComponent(row.hash)}`, route.fullPath);
}

/* Un clic ouvre le detail ; avec Maj ou Ctrl, il etend ou bascule la selection, comme
   dans un gestionnaire de fichiers. */
function onRowClick(row: any, index: number, event: MouseEvent): void {
  if ((event.target as HTMLElement | null)?.closest('button, input, a, [role="checkbox"]')) return;
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    toggleRow(row, index, event);
    return;
  }
  openDetails(row);
  lastSelectedIndex.value = index;
}

function rowClass(row: any): string {
  return selected.value.has(rowKey(row)) ? 'selected' : '';
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  const target = event.target as HTMLElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
    event.preventDefault();
    toggleAll();
  }
});
useIntersectionObserver(sentinelRef, (entries) => {
  if (entries[0]?.isIntersecting && hasMore.value) loadMore();
}, { rootMargin: '200px' });


/* ---- Actions ---- */

const actionTarget = ref<any>(null);
const removalTarget = ref<any>(null);
const metaTargets = ref<any[] | null>(null);
const contextTarget = ref<any>(null);
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const { busy, isBusy, runAction, saveMetadata: saveTorrentMetadata, confirmRemoval: confirmTorrentRemoval } = useTorrentActions({
  onDone: () => emit('refresh'),
  onError: (message) => emit('error', message),
  askConfirm,
});

function actOnTarget(action: string): void {
  void runAction(action, [actionTarget.value]);
  actionTarget.value = null;
}

function openMetaModal(rows: any[]): void {
  const targets = rows.filter(Boolean);
  if (targets.length) metaTargets.value = targets;
}

async function saveMetadata(category: string, tags: string): Promise<void> {
  await saveTorrentMetadata(metaTargets.value || [], category, tags);
  metaTargets.value = null;
}

async function confirmRemoval(rows: any[], deleteFiles: boolean): Promise<void> {
  removalTarget.value = null;
  await confirmTorrentRemoval(rows, deleteFiles);
}

function openContextMenu(row: any, index: number): void {
  const key = rowKey(row);
  if (!selected.value.has(key)) {
    setSelection([key]);
    lastSelectedIndex.value = index;
  }
  contextTarget.value = row;
}

function handleContextMenuAction(actionType: string): void {
  const targets = selectedRows.value.length ? selectedRows.value : (contextTarget.value ? [contextTarget.value] : []);
  if (!targets.length) return;

  if (actionType === 'details') openDetails(targets[0]);
  else if (actionType === 'meta') openMetaModal(targets);
  else if (actionType === 'remove-torrent') confirmRemoval(targets, false);
  else if (actionType === 'remove-files') confirmRemoval(targets, true);
  else if (['pause', 'resume', 'recheck', 'reannounce'].includes(actionType)) runAction(actionType, targets);
}
</script>

<style scoped lang="scss">
/* Densite et mode incognito : le tableau vient de UiDataTable, dont les cellules ne portent
   pas l'attribut de portee de ce composant -- d'ou :deep() pour les cellules elles-memes. */
.torrent-table.compact-table :deep(th),.torrent-table.compact-table :deep(td){padding:4px 7px;font-size:var(--fs-xs)}
.torrent-table.compact-table .progress-cell :deep(.ui-progress){height:4px}
.torrent-table.incognito-mode .torrent-title{font-family: var(--font-mono);letter-spacing:0.5px}
@media (min-width: 641px){.torrent-table :deep(td){white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
/* Dans la carte, le titre passe a la ligne et la progression prend toute la largeur. */
@media (max-width: 640px){.torrent-table .torrent-title{white-space:normal;overflow-wrap:anywhere}.progress-cell{flex:1;min-width:0}}

.torrent-manager{display:grid;gap:var(--space-3);padding-bottom:52px}
.torrent-status-bar{display:flex;align-items:center;justify-content:flex-end;gap:14px;min-height:34px;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--accent);font-size:12px;font-weight:600}
.torrent-status-bar span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.torrent-status-bar .stale-state{color: var(--amber-text)}

.bulk-toolbar{position:sticky;top:8px;z-index:4;display:flex;align-items:center;gap:var(--space-2);padding:10px 12px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--border));border-radius:var(--radius-md);background:color-mix(in srgb,var(--surface) 94%,transparent);box-shadow:var(--shadow-md);backdrop-filter:blur(12px)}
.bulk-toolbar strong{margin-right:auto}
.bulk-toolbar button{display:inline-flex;align-items:center;gap:6px}
.bulk-toolbar svg{width:14px;height:14px}

.torrent-name{min-width:0}
.torrent-title{display:block;max-width:100%;overflow:hidden;padding:0;border:0;background:transparent;color:var(--text);font:inherit;font-weight:700;text-align:left;text-overflow:ellipsis;white-space:nowrap}
.torrent-title:hover{color:var(--accent);text-decoration:underline}
.torrent-name small{display:block;overflow:hidden;margin-top:3px;color:var(--muted);text-overflow:ellipsis;white-space:nowrap}
.progress-cell{min-width:0}
.progress-cell>div{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px}
.tracker-display{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%}
.tracker-display img{width:14px;height:14px;flex:0 0 14px;border-radius: var(--radius-xs);object-fit:contain}
.tracker-display span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.action-trigger-btn{display:inline-flex;align-items:center;gap:6px;min-width:100px;padding:5px 9px;font-size:var(--fs-xs);white-space:nowrap}

.torrent-actions-menu{display:flex;flex-direction:column;gap:var(--space-2)}
.action-menu-btn{display:inline-flex;align-items:center;gap:10px;width:100%;justify-content:flex-start;padding:10px 14px;font-size:var(--fs-sm)}
.action-menu-btn svg{width:16px;height:16px}
.removal-warning{color: var(--red-text)}

.stale-cache-banner{display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid color-mix(in srgb,var(--warning) 40%,var(--border));border-radius:var(--radius-md);background:color-mix(in srgb,var(--warning) 12%,transparent);color:var(--text)}
.stale-cache-banner svg{width:20px;height:20px;color: var(--amber-text);flex-shrink:0}
.stale-cache-banner strong{font-size:var(--fs-xs);color: var(--amber-text)}
.stale-cache-banner p{margin:2px 0 0;font-size:var(--fs-xs);color:var(--muted)}

@media(min-width:761px){
  .torrent-title{font-size:14px}
  .torrent-name small{color:var(--accent);font-size:12px;font-weight:600}
  .action-trigger-btn,.bulk-toolbar button{font-size:13px}
}
@media(max-width:760px){
  .torrent-manager{min-width:0}
  .bulk-toolbar{top:4px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:hidden}
  .bulk-toolbar strong{grid-column:1/-1;margin:0}
  .bulk-toolbar button{justify-content:center;min-width:0;white-space:normal;text-align:center}
  .bulk-toolbar .text-button{grid-column:1/-1}
  .action-trigger-btn{width:100%;justify-content:center}
  .torrent-name{min-width:0;max-width:none}
  .torrent-status-bar{justify-content:flex-start;max-width:100%;overflow-x:auto}
}
@media(max-width:380px){
  .bulk-toolbar{grid-template-columns:1fr}
  .bulk-toolbar strong,.bulk-toolbar .text-button{grid-column:auto}
}
</style>
