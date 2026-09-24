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

    <!-- Barre de débits globaux et contrôle du mode alternatif -->
    <div class="global-speed-bar">
      <div class="speed-counters">
        <span class="speed-item"><Download /><span><small>Réception</small><strong>{{ formatSpeed(globalDownloadSpeed) }}</strong></span></span>
        <span class="speed-item"><Upload /><span><small>Envoi</small><strong>{{ formatSpeed(globalUploadSpeed) }}</strong></span></span>
        <span class="connection-status" :class="connectionClass"><i />{{ connectionLabel }}</span>
      </div>
      <div class="speed-bar-actions">
        <UiButton class="text-xs tool-toggle-btn" :class="{ active: isCompact }" title="Basculer entre affichage compact et confortable" @click="toggleCompact">
          <Minimize2 v-if="isCompact" /><Maximize2 v-else /> {{ isCompact ? 'Compact' : 'Normal' }}
        </UiButton>
        <UiButton class="text-xs tool-toggle-btn" :class="{ active: isIncognito }" title="Mode Incognito (masquer / anonymiser les noms de torrents)" @click="toggleIncognito">
          <EyeOff v-if="isIncognito" /><Eye v-else /> {{ isIncognito ? 'Incognito' : 'Discret' }}
        </UiButton>
        <UiButton class="text-xs alt-speed-btn" :class="{ active: globalAltSpeed }" title="Activer / désactiver les limites de vitesse alternatives (Turtle mode)" @click="toggleAltSpeed">
          <Gauge /> Mode alternatif : <strong>{{ globalAltSpeed ? 'ON' : 'OFF' }}</strong>
        </UiButton>
      </div>
    </div>

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
      :sort="{ key: sortKey, direction: sortDirection as 'asc' | 'desc' }"
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
        <button class="torrent-title" @click.stop="details=row">
          {{ isIncognito ? maskTitle(row.title, Number(index)) : row.title }}
        </button>
        <small>{{ row.client_name }}<template v-if="row.tags"> · {{ row.tags }}</template></small>
      </template>
      <template #cell-status="{ row }"><span class="state-badge" :class="statusClass(row)">{{ statusLabel(row) }}</span></template>
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


    <!-- Modal Personnalisation des colonnes -->
    <ModalShell :open="showColumnPicker" title="Personnaliser les colonnes" subtitle="Sélectionnez les colonnes à afficher dans le tableau des torrents." @close="showColumnPicker = false">
      <div class="column-picker-grid">
        <div v-for="(col, index) in orderedColumns" :key="col.key" class="column-picker-item" :class="{ dragging: draggedColumnKey===col.key }" draggable="true" @dragstart="startColumnDrag(col.key, $event)" @dragover.prevent @drop="dropColumn(col.key)">
          <input
            type="checkbox"
            :checked="col.required || visibleColumnKeys.has(col.key)"
            :disabled="col.required"
            @change="toggleColumnKey(col.key)"
          />
          <span>{{ col.label }}</span>
          <span class="column-reorder-buttons">
            <button type="button" class="column-reorder-btn" :disabled="index === 0" :aria-label="`Déplacer ${col.label} vers le haut`" @click="moveColumnKey(col.key, -1)"><ChevronUp /></button>
            <button type="button" class="column-reorder-btn" :disabled="index === orderedColumns.length - 1" :aria-label="`Déplacer ${col.label} vers le bas`" @click="moveColumnKey(col.key, 1)"><ChevronDown /></button>
          </span>
          <span class="column-drag-handle" aria-hidden="true">⠿</span>
        </div>
      </div>
      <template #actions>
        <UiButton variant="primary" @click="showColumnPicker = false">Valider</UiButton>
      </template>
    </ModalShell>

    <!-- Modal Actions individuelles -->
    <ModalShell :open="!!actionTarget" title="Actions sur le torrent" :subtitle="actionTarget?.title" @close="actionTarget=null">
      <div v-if="actionTarget" class="torrent-actions-menu">
        <UiButton class="action-menu-btn" :disabled="isBusy(actionTarget)" @click="runAction(isPaused(actionTarget)?'resume':'pause',[actionTarget]);actionTarget=null;">
          <Play v-if="isPaused(actionTarget)" /><Pause v-else />
          {{ isPaused(actionTarget) ? 'Reprendre le téléchargement' : 'Mettre en pause' }}
        </UiButton>

        <UiButton class="action-menu-btn" :disabled="isBusy(actionTarget)" @click="runAction('recheck',[actionTarget]);actionTarget=null;">
          <RotateCcw /> Revérifier les fichiers
        </UiButton>

        <UiButton class="action-menu-btn" :disabled="isBusy(actionTarget)" @click="runAction('reannounce',[actionTarget]);actionTarget=null;">
          <Radio /> Réannoncer aux trackers
        </UiButton>

        <UiButton class="action-menu-btn" :disabled="isBusy(actionTarget)" @click="openMetaModal([actionTarget]);actionTarget=null;">
          <Tag /> Modifier Catégorie & Tags
        </UiButton>

        <UiButton variant="danger" class="action-menu-btn" :disabled="isBusy(actionTarget)" @click="removalTarget=actionTarget;actionTarget=null;">
          <Trash2 /> Supprimer ou retirer...
        </UiButton>
      </div>
    </ModalShell>

    <!-- Tiroir d'Inspection Détails (Général, Fichiers, Trackers, Peers) -->
    <DrawerShell v-if="details" eyebrow="Client torrent" :title="details.title" @close="details=null">
      <div class="drawer-nav-tabs">
        <button class="drawer-tab" :class="{ active: detailTab==='general' }" @click="detailTab='general'"><Info /> Général</button>
        <button class="drawer-tab" :class="{ active: detailTab==='files' }" @click="selectDetailTab('files')"><FileText /> Fichiers ({{ inspectorFiles.length }})</button>
        <button class="drawer-tab" :class="{ active: detailTab==='trackers' }" @click="selectDetailTab('trackers')"><Radio /> Trackers ({{ inspectorTrackers.length }})</button>
        <button class="drawer-tab" :class="{ active: detailTab==='peers' }" @click="selectDetailTab('peers')"><Users /> Peers ({{ inspectorPeers.length }})</button>
      </div>

      <!-- Onglet Général -->
      <template v-if="detailTab==='general'">
        <section class="torrent-detail-summary">
          <span class="state-badge" :class="statusClass(details)">{{ statusLabel(details) }}</span>
        </section>
        <section class="drawer-section">
          <h3>Transfert</h3>
          <dl class="detail-grid">
            <div><dt>Progression</dt><dd>{{ Number(details.progress||0).toFixed(1) }} %</dd></div>
            <div><dt>Taille</dt><dd>{{ formatBytes(details.size) }}</dd></div>
            <div><dt>Réception</dt><dd>{{ formatSpeed(details.download_speed) }}</dd></div>
            <div><dt>Envoi</dt><dd>{{ formatSpeed(details.upload_speed) }}</dd></div>
            <div><dt>Ratio</dt><dd>{{ Number(details.ratio||0).toFixed(2) }}</dd></div>
            <div><dt>Temps restant</dt><dd>{{ formatEta(details.eta) }}</dd></div>
          </dl>
        </section>
        <section class="drawer-section">
          <h3>Classement et Horodatage</h3>
          <dl class="detail-list">
            <div><dt>Client</dt><dd>{{ details.client_name }}</dd></div>
            <div><dt>Catégorie</dt><dd>{{ details.category||'Aucune' }}</dd></div>
            <div><dt>Tags</dt><dd>{{ details.tags||'Aucun' }}</dd></div>
            <div v-if="details.added_on"><dt>Ajouté le</dt><dd>{{ formatTimestamp(details.added_on) }}</dd></div>
            <div v-if="details.completed_on"><dt>Fin de téléchargement</dt><dd>{{ formatTimestamp(details.completed_on) }}</dd></div>
            <div v-if="details.comment"><dt>Commentaire</dt><dd>{{ details.comment }}</dd></div>
            <div v-if="details.trackers||details.tracker"><dt>Trackers</dt><dd class="hash-value">{{ details.trackers||details.tracker }}</dd></div>
            <div><dt>Hash</dt><dd class="hash-value">{{ details.hash }}</dd></div>
          </dl>
        </section>
      </template>

      <!-- Onglet Fichiers -->
      <template v-else-if="detailTab==='files'">
        <section class="drawer-section">
          <h3>Contenu du torrent</h3>
          <div v-if="loadingInspector" class="inspector-loading">Chargement des fichiers...</div>
          <UiDataTable v-else-if="inspectorFiles.length" class="inspector-table-wrap" label="Contenu du torrent" :rows="inspectorFiles" :columns="FILE_COLUMNS" :row-key="(f: any) => f.id">
            <template #cell-name="{ row: f }"><span class="file-name-cell" :title="f.name">{{ f.name }}</span></template>
            <template #cell-size="{ row: f }">{{ formatBytes(f.size) }}</template>
            <template #cell-progress="{ row: f }">{{ f.progress }}%</template>
            <template #cell-priority="{ row: f }">
              <select :value="f.priority" class="prio-select" :aria-label="`Priorité de ${f.name}`" @change="changeFilePriority(f.id, ($event.target as HTMLSelectElement).value)">
                <option :value="1">Normale</option>
                <option :value="6">Haute</option>
                <option :value="0">Ne pas télécharger</option>
              </select>
            </template>
          </UiDataTable>
          <p v-else class="empty">Aucun fichier à afficher.</p>
        </section>
      </template>

      <!-- Onglet Trackers -->
      <template v-else-if="detailTab==='trackers'">
        <section class="drawer-section">
          <h3>Annonces Trackers</h3>
          <div v-if="loadingInspector" class="inspector-loading">Chargement des trackers...</div>
          <UiDataTable v-else-if="inspectorTrackers.length" class="inspector-table-wrap" label="Annonces trackers" :rows="inspectorTrackers" :columns="TRACKER_INSPECT_COLUMNS" :row-key="(tr: any) => tr.url">
            <template #cell-url="{ row: tr }"><span class="file-name-cell" :title="tr.url">{{ tr.url }}</span></template>
            <template #cell-msg="{ row: tr }"><small>{{ tr.msg || 'Actif' }}</small></template>
          </UiDataTable>
          <p v-else class="empty">Aucun tracker à afficher.</p>
        </section>
      </template>

      <!-- Onglet Peers -->
      <template v-else-if="detailTab==='peers'">
        <section class="drawer-section">
          <h3>Paires connectées</h3>
          <div v-if="loadingInspector" class="inspector-loading">Chargement des paires...</div>
          <UiDataTable v-else-if="inspectorPeers.length" class="inspector-table-wrap" label="Paires connectées" :rows="inspectorPeers" :columns="PEER_COLUMNS" :row-key="(peer: any) => `${peer.ip}:${peer.port ?? ''}`">
            <template #cell-speed="{ row: peer }">{{ formatSpeed(peer.download_speed) }} / {{ formatSpeed(peer.upload_speed) }}</template>
            <template #cell-progress="{ row: peer }">{{ peer.progress }}%</template>
          </UiDataTable>
          <p v-else class="empty">Aucune paire connectée actuellement.</p>
        </section>
      </template>

      <div class="drawer-actions">
        <UiButton :disabled="isBusy(details)" @click="runAction(isPaused(details)?'resume':'pause',[details])"><Play v-if="isPaused(details)"/><Pause v-else/>{{ isPaused(details)?'Reprendre':'Mettre en pause' }}</UiButton>
        <UiButton :disabled="isBusy(details)" @click="runAction('recheck',[details])"><RotateCcw />Revérifier</UiButton>
        <UiButton :disabled="isBusy(details)" @click="runAction('reannounce',[details])"><Radio />Réannoncer</UiButton>
        <UiButton :disabled="isBusy(details)" @click="openMetaModal([details])"><Tag />Catégorie & Tags</UiButton>
        <UiButton variant="danger" :disabled="isBusy(details)" @click="removalTarget=details"><Trash2 />Supprimer</UiButton>
      </div>
    </DrawerShell>

    <!-- Modal Modification Catégorie & Tags -->
    <ModalShell :open="!!metaTarget" title="Modifier Catégorie & Tags" subtitle="Mettre à jour le classement des torrents sélectionnés." @close="metaTarget=null">
      <form class="meta-form" @submit.prevent="saveMetadata">
        <div class="form-group">
          <label for="meta-category">Catégorie</label>
          <input id="meta-category" v-model="metaCategory" type="text" placeholder="Ex: radarr, sonarr, films" />
        </div>
        <div class="form-group">
          <label for="meta-tags">Tags (séparés par des virgules)</label>
          <input id="meta-tags" v-model="metaTags" type="text" placeholder="Ex: watchdeck, vff, 1080p" />
        </div>
        <div class="form-actions">
          <UiButton :disabled="busy" @click="metaTarget=null">Annuler</UiButton>
          <UiButton variant="primary" type="submit" :disabled="busy">Enregistrer</UiButton>
        </div>
      </form>
    </ModalShell>

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
import UiButton from '@/components/ui/UiButton.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useEventListener, useIntersectionObserver } from '@vueuse/core';
import { AlertTriangle, ChevronDown, ChevronUp, Download, Eye, EyeOff, FileText, FileX2, Gauge, Info, Maximize2, Minimize2, Pause, Play, Radio, RotateCcw, SlidersHorizontal, Tag, Trash2, Upload, Users } from '@lucide/vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import { api } from '@/api';
import { useConfirm } from '@/composables/useConfirm';
import { useTableColumns } from '@/composables/useTableColumns';
import { usePreference } from '@/composables/usePreference';
import ConfirmModal from '@/components/ConfirmModal.vue';
import DrawerShell from '@/components/DrawerShell.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import LoadMore from '@/components/ui/LoadMore.vue';
import TorrentContextMenu from './TorrentContextMenu.vue';
import { useTableSelection } from '@/composables/useTableSelection';

import { formatDateTime as formatDate } from '@/utils/format';

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

function toggleCompact(): void {
  isCompact.value = !isCompact.value;
}

function toggleIncognito(): void {
  isIncognito.value = !isIncognito.value;
}

function maskTitle(title: string, index: number): string {
  if (!title) return `Linux ISO #${index + 1}`;
  const suffix = title.length > 8 ? title.slice(-6) : title;
  return `Linux ISO #${index + 1} (${suffix})`;
}

function handleGlobalDrop(e: DragEvent): void {
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
    const file = e.dataTransfer.files[0];
    if (file.name.endsWith('.torrent')) {
      emit('add-file', file);
    }
  }
}

function formatTimestamp(val: number | string): string {
  if (!val) return '—';
  let date: number | string = val;
  if (typeof val === 'number') {
    date = val > 1e11 ? val : val * 1000;
  }
  return formatDate(date);
}

function trackerValue(row: any): string { return row.trackers || row.tracker || ''; }
function trackerKey(row: any): string { return formatTracker(trackerValue(row)).toLocaleLowerCase('fr'); }
function trackerFaviconUrl(row: any): string { return `/api/downloads/tracker-favicon?tracker=${encodeURIComponent(String(trackerValue(row)).split(',')[0].trim())}`; }
function hideTrackerFavicon(row: any): void { failedFavicons.value = new Set([...failedFavicons.value, trackerKey(row)]); }

function formatTracker(val: string): string {
  if (!val) return '—';
  const first = String(val).split(',')[0].trim();
  try {
    const raw = first.startsWith('http') || first.startsWith('udp') ? first : `http://${first}`;
    const host = new URL(raw).hostname;
    return host || first;
  } catch {
    return first.length > 25 ? first.slice(0, 22) + '...' : first;
  }
}

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

const showColumnPicker = ref(false);

/* Ordre, visibilite, largeurs et glisser-deposer des colonnes viennent du composable
   partage avec `DataTable` : c'etait deux fois le meme code. Les cles de rangement
   restent distinctes, chaque tableau gardant ses preferences. */
const DEFAULT_VISIBLE_COLUMNS = ['title', 'status', 'progress', 'size', 'download_speed', 'upload_speed', 'eta', 'category'];
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  title: 300,
  status: 110,
  progress: 140,
  size: 90,
  download_speed: 100,
  upload_speed: 90,
  ratio: 75,
  eta: 100,
  category: 110,
  trackers: 130,
  added_on: 130,
  completed_on: 130,
};

const columnPrefs = useTableColumns(() => ALL_COLUMNS, {
  storageKey: `watchdeck:torrent-table-columns:${props.preferenceScope || 'all'}`,
  defaultVisible: DEFAULT_VISIBLE_COLUMNS,
  defaultWidths: DEFAULT_COLUMN_WIDTHS,
  // Deux colonnes au minimum : un tableau reduit a une colonne ne dit plus rien.
  minimumVisible: 2,
});
const {
  orderedColumns,
  visibleKeys: visibleColumnKeys,
  toggleColumn: toggleColumnKey,
  moveColumn: moveColumnKey,
  draggedKey: draggedColumnKey,
  startDrag: startColumnDrag,
  drop: dropColumn,
} = columnPrefs;

/* Toutes les colonnes triables, avec leur role dans la carte de telephone : le titre en
   tete, l'etat et la progression lisibles, le reste reserve au tableau. */
const FILE_COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Nom du fichier', card: 'title', sortable: true },
  { key: 'size', label: 'Taille', sortable: true },
  { key: 'progress', label: 'Progrès', sortable: true },
  { key: 'priority', label: 'Priorité' },
];
const TRACKER_INSPECT_COLUMNS: UiColumn[] = [
  { key: 'url', label: 'URL Tracker', card: 'title' },
  { key: 'num_seeds', label: 'Seeds', sortable: true },
  { key: 'num_peers', label: 'Peers', sortable: true },
  { key: 'msg', label: 'Message' },
];
const PEER_COLUMNS: UiColumn[] = [
  { key: 'ip', label: 'Adresse IP', card: 'title' },
  { key: 'client', label: 'Client', sortable: true },
  { key: 'speed', label: 'DL / UP', sortable: true, sortValue: (peer: any) => (peer.download_speed || 0) + (peer.upload_speed || 0) },
  { key: 'progress', label: 'Progrès', sortable: true },
];
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

const staleInfo = computed(() => props.rows.find((row: any) => row.is_stale));

const busyKeys = ref<Set<string>>(new Set());
const sortKey = ref('title');
const sortDirection = ref('asc');
const details = ref<any>(null);
const failedFavicons = ref<Set<string>>(new Set());
const actionTarget = ref<any>(null);
const removalTarget = ref<any>(null);
const metaTarget = ref<{ rows: any[] } | null>(null);
const metaCategory = ref('');
const metaTags = ref('');

const BATCH_SIZE = 100;
const displayLimit = ref(BATCH_SIZE);
const sentinelRef = ref<HTMLElement | null>(null);

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const rowKey = (row: any): string => `${row.client_id}:${row.hash}`;

const busy = computed(() => busyKeys.value.size > 0);

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
// cles obsoletes porte sur les memes lignes que celles rendues.
const {
  selectedKeys: selected, selectedRows,
  toggle: toggleRow, toggleAll, clear: clearSelection, setKeys: setSelection, lastIndex: lastSelectedIndex,
} = useTableSelection(() => sortedRows.value, rowKey);

/* UiDataTable recoit et renvoie des cles stables : les rafraichissements remplacent les
   objets torrent, mais ne doivent pas vider la barre d'actions en lot. */

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

/* Un clic ouvre le detail ; avec Maj ou Ctrl, il etend ou bascule la selection, comme
   dans un gestionnaire de fichiers. */
function onRowClick(row: any, index: number, event: MouseEvent): void {
  if ((event.target as HTMLElement | null)?.closest('button, input, a, [role="checkbox"]')) return;
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    toggleRow(row, index, event);
    return;
  }
  details.value = row;
  lastSelectedIndex.value = index;
}

function rowClass(row: any): string {
  return selected.value.has(rowKey(row)) ? 'selected' : '';
}

function isPaused(row: any): boolean {
  const state = String(row.status || '').toLowerCase();
  return state.includes('paused') || state.includes('stopped');
}

function isBusy(row: any): boolean {
  return busyKeys.value.has(rowKey(row));
}

function statusClass(row: any): string {
  const state = String(row.status || '').toLowerCase();
  if (state.includes('error') || state.includes('missing')) return 'error';
  if (isPaused(row)) return 'paused';
  if (Number(row.progress) >= 100 || state.includes('upload') || state.includes('stalledup')) return 'complete';
  return 'active';
}

function statusLabel(row: any): string {
  const state = String(row.status || '').toLowerCase();
  if (state.includes('error')) return 'Erreur';
  if (state.includes('missing')) return 'Fichiers manquants';
  if (state.includes('check')) return 'Vérification';
  if (isPaused(row)) return 'En pause';
  if (Number(row.progress) >= 100 || state.includes('upload') || state.includes('stalledup')) return 'En partage';
  if (state.includes('queue')) return 'En attente';
  return 'Téléchargement';
}

function formatBytes(value: number): string {
  const bytes = Number(value || 0);
  if (!bytes) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const rank = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** rank).toFixed(rank > 2 ? 1 : 0)} ${units[rank]}`;
}

function formatSpeed(value: number): string {
  return `${formatBytes(value)}/s`;
}

function formatEta(value: number): string {
  const seconds = Number(value || 0);
  if (!seconds || seconds >= 8640000) return '—';
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function openMetaModal(rows: any[]): void {
  const targets = rows.filter(Boolean);
  if (!targets.length) return;
  const first = targets[0];
  metaCategory.value = first.category || '';
  metaTags.value = first.tags || '';
  metaTarget.value = { rows: targets };
}

async function saveMetadata(): Promise<void> {
  if (!metaTarget.value || !metaTarget.value.rows.length) return;
  const targets = metaTarget.value.rows;
  const cat = metaCategory.value.trim();
  const tags = metaTags.value.trim();

  await runAction('set_category', targets, false, cat);
  await runAction('set_tags', targets, false, tags);
  metaTarget.value = null;
}

async function runAction(action: string, rows: any[], deleteFiles = false, extraParam = ''): Promise<void> {
  const targets = rows.filter(Boolean);
  if (!targets.length) return;
  busyKeys.value = new Set([...busyKeys.value, ...targets.map(rowKey)]);

  const results = await Promise.allSettled(
    targets.map(row => {
      const payload: Record<string, any> = { action, delete_files: deleteFiles };
      if (action === 'set_category') payload.category = extraParam;
      if (action === 'set_tags') payload.tags = extraParam;
      return api(`/api/downloads/clients/${row.client_id}/${row.hash}/control`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    })
  );

  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) emit('error', `${failures.length} action(s) sur ${targets.length} ont échoué.`);
  if (action === 'delete') {
    const removed = new Set(targets.filter((_, index) => results[index].status === 'fulfilled').map(rowKey));
    if (details.value && removed.has(rowKey(details.value))) details.value = null;
  }
  busyKeys.value = new Set();
  removalTarget.value = null;
  emit('refresh');
}

async function confirmRemoval(rows: any[], deleteFiles: boolean): Promise<void> {
  const targets = rows.filter(Boolean);
  if (!targets.length) return;
  removalTarget.value = null;
  if (deleteFiles) {
    const confirmed = await askConfirm({
      title: `Supprimer ${targets.length} torrent(s) et leurs fichiers ?`,
      message: 'Les fichiers téléchargés seront supprimés définitivement. Cette action ne peut pas être annulée.',
      confirmLabel: 'Supprimer définitivement',
      danger: true,
    });
    if (!confirmed) return;
  } else {
    const confirmed = await askConfirm({
      title: `Retirer ${targets.length} torrent(s) ?`,
      message: 'Les torrents seront retirés du client, mais leurs fichiers seront conservés.',
      confirmLabel: 'Retirer',
      danger: true,
    });
    if (!confirmed) return;
  }
  await runAction('delete', targets, deleteFiles);
}

function handleKeyDown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
    event.preventDefault();
    toggleAll();
  }
}

onMounted(() => {
  loadGlobalStats();
});
useEventListener(window, 'keydown', handleKeyDown);
useIntersectionObserver(sentinelRef, (entries) => {
  if (entries[0]?.isIntersecting && hasMore.value) loadMore();
}, { rootMargin: '200px' });

onUnmounted(() => {
  clearTimeout(statsLoadTimer);
});

watch(
  () => props.rows,
  (rows: any[]) => {
    // L'elagage de la selection est pris en charge par useTableSelection ; ne reste ici
    // que la fermeture du tiroir d'une ligne disparue et le rafraichissement des debits.
    const valid = new Set(rows.map(rowKey));
    if (details.value && !valid.has(rowKey(details.value))) details.value = null;
    scheduleGlobalStats();
  }
);

watch(() => props.clientId, loadGlobalStats);

watch(details, val => {
  if (val) {
    detailTab.value = 'general';
    inspectorFiles.value = [];
    inspectorTrackers.value = [];
    inspectorPeers.value = [];
  }
});

const globalDownloadSpeed = ref(0);
const globalUploadSpeed = ref(0);
const globalAltSpeed = ref(false);
const connectedClients = ref(0);
const totalClients = ref(0);
const connectionClass = computed(() => totalClients.value === 0 ? 'unknown' : connectedClients.value === totalClients.value ? 'connected' : connectedClients.value > 0 ? 'partial' : 'offline');
const connectionLabel = computed(() => totalClients.value === 0 ? 'Aucun client' : totalClients.value === 1 ? connectedClients.value ? 'Connecté' : 'Hors ligne' : `${connectedClients.value}/${totalClients.value} connectés`);
let statsLoadTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleGlobalStats(): void {
  clearTimeout(statsLoadTimer);
  statsLoadTimer = setTimeout(loadGlobalStats, 250);
}

async function loadGlobalStats(): Promise<void> {
  try {
    const suffix = props.clientId ? `?client_id=${encodeURIComponent(props.clientId)}` : '';
    const data = await api(`/api/downloads/global-stats${suffix}`);
    globalDownloadSpeed.value = Number(data.download_speed || 0);
    globalUploadSpeed.value = Number(data.upload_speed || 0);
    globalAltSpeed.value = !!data.alt_speed_enabled;
    connectedClients.value = Number(data.connected || 0);
    totalClients.value = Number(data.total || 0);
  } catch {
    connectedClients.value = 0;
    totalClients.value = props.clientId ? 1 : totalClients.value;
  }
}

async function toggleAltSpeed(): Promise<void> {
  try {
    const res = await api('/api/downloads/global-alt-speed', { method: 'POST' });
    if (res.ok) {
      globalAltSpeed.value = !globalAltSpeed.value;
      emit('refresh');
    }
  } catch (e: any) {
    emit('error', `Impossible de modifier le mode vitesse alternative : ${e.message}`);
  }
}

const contextTarget = ref<any>(null);

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

  if (actionType === 'details') {
    details.value = targets[0];
  } else if (actionType === 'meta') {
    openMetaModal(targets);
  } else if (actionType === 'remove-torrent') {
    confirmRemoval(targets, false);
  } else if (actionType === 'remove-files') {
    confirmRemoval(targets, true);
  } else if (['pause', 'resume', 'recheck', 'reannounce'].includes(actionType)) {
    runAction(actionType, targets);
  }
}

const detailTab = ref('general');
const inspectorFiles = ref<any[]>([]);
const inspectorTrackers = ref<any[]>([]);
const inspectorPeers = ref<any[]>([]);
const loadingInspector = ref(false);

async function selectDetailTab(tabName: string): Promise<void> {
  detailTab.value = tabName;
  if (!details.value) return;
  loadingInspector.value = true;
  try {
    const { client_id, hash } = details.value;
    if (tabName === 'files') {
      inspectorFiles.value = await api(`/api/downloads/clients/${client_id}/${hash}/files`);
    } else if (tabName === 'trackers') {
      inspectorTrackers.value = await api(`/api/downloads/clients/${client_id}/${hash}/trackers`);
    } else if (tabName === 'peers') {
      inspectorPeers.value = await api(`/api/downloads/clients/${client_id}/${hash}/peers`);
    }
  } catch (e: any) {
    emit('error', e.message);
  } finally {
    loadingInspector.value = false;
  }
}

async function changeFilePriority(fileId: number, newPrio: string): Promise<void> {
  if (!details.value) return;
  try {
    const { client_id, hash } = details.value;
    await api(`/api/downloads/clients/${client_id}/${hash}/files/priority`, {
      method: 'POST',
      body: JSON.stringify({ file_ids: [fileId], priority: Number(newPrio) }),
    });
    selectDetailTab('files');
  } catch (e: any) {
    emit('error', `Erreur de modification de la priorité : ${e.message}`);
  }
}
</script>

<style scoped lang="scss">
/* Densite et mode incognito : le tableau vient de UiDataTable, dont les cellules ne portent
   pas l'attribut de portee de ce composant -- d'ou :deep() pour les cellules elles-memes. */
.torrent-table.compact-table :deep(th),.torrent-table.compact-table :deep(td){padding:4px 7px;font-size:var(--fs-xs)}
.torrent-table.compact-table .progress-cell :deep(.ui-progress){height:4px}
.torrent-table.incognito-mode .torrent-title{font-family:monospace;letter-spacing:0.5px}
@media (min-width: 641px){.torrent-table :deep(td){white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
/* Dans la carte, le titre passe a la ligne et la progression prend toute la largeur. */
@media (max-width: 640px){.torrent-table .torrent-title{white-space:normal;overflow-wrap:anywhere}.progress-cell{flex:1;min-width:0}}

.global-speed-bar{position:fixed;left:0;right:0;bottom:0;z-index:35;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:4px max(10px,var(--safe-right)) 4px max(10px,var(--safe-left));border:0;border-top:1px solid var(--border);border-radius:0;background:color-mix(in srgb,var(--surface) 94%,transparent);box-shadow:0 -6px 22px rgb(0 0 0 / 18%);backdrop-filter:blur(12px);flex-wrap:nowrap;overflow-x:auto;overscroll-behavior-x:contain}
:global(.shell.sidebar-collapsed) .global-speed-bar{left:72px}
.speed-counters{display:flex;align-items:center;gap:18px;min-width:max-content}
.speed-item{display:inline-flex;align-items:center;gap:8px;color:var(--text)}
.speed-item>span{display:grid;gap:1px}
.speed-item small{color:var(--accent);font-size: var(--fs-xs);font-weight:700}
.speed-item strong{font-size:13px}
.speed-item svg{width:15px;height:15px;color:var(--muted)}
.connection-status{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;font-weight:700;white-space:nowrap}.connection-status i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 14%,transparent)}.connection-status.connected{color:var(--success)}.connection-status.partial{color:var(--warning)}.connection-status.offline{color:var(--danger)}
.speed-bar-actions{display:flex;align-items:center;gap:6px;min-width:max-content}
.speed-bar-actions button{min-height:32px;padding:4px 9px;white-space:nowrap}
.tool-toggle-btn.active{background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);border-color:var(--accent)}
.alt-speed-btn.active{background:color-mix(in srgb,var(--warning) 16%,transparent);color:var(--warning);border-color:var(--warning)}
.torrent-status-bar{display:flex;align-items:center;justify-content:flex-end;gap:14px;min-height:34px;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--accent);font-size:12px;font-weight:600}.torrent-status-bar span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.torrent-status-bar svg{width:13px}.torrent-status-bar .stale-state{color:var(--warning)}

.drawer-nav-tabs{display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:12px;overflow-x:auto}
.drawer-tab{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--muted);font:inherit;font-size:var(--fs-xs);cursor:pointer;white-space:nowrap}
.drawer-tab:hover{color:var(--text);background:var(--surface-2)}
.drawer-tab.active{background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent);font-weight:700}
.drawer-tab svg{width:13px;height:13px}

.inspector-loading{padding:16px 0;font-size:var(--fs-xs);color:var(--muted)}
.inspector-table-wrap{overflow-x:auto;margin-top:8px;border:1px solid var(--border);border-radius:var(--radius-sm)}
.inspector-table{width:100%;border-collapse:collapse;font-size:var(--fs-xs)}
.inspector-table th,.inspector-table td{padding:7px 9px;border-bottom:1px solid var(--border);text-align:left}
.inspector-table th{background:var(--surface-2);color:var(--muted);font-weight:700}
.file-name-cell{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prio-select{padding:2px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);font-size: var(--fs-xs)}

.torrent-manager{display:grid;gap:var(--space-3);padding-bottom:52px}.bulk-toolbar{position:sticky;top:8px;z-index:4;display:flex;align-items:center;gap:var(--space-2);padding:10px 12px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--border));border-radius:var(--radius-md);background:color-mix(in srgb,var(--surface) 94%,transparent);box-shadow:var(--shadow-md);backdrop-filter:blur(12px)}.bulk-toolbar strong{margin-right:auto}.bulk-toolbar button,.drawer-actions button{display:inline-flex;align-items:center;gap:6px}.bulk-toolbar svg,.row-actions svg,.drawer-actions svg{width:14px;height:14px}.torrent-name{min-width:0}.torrent-title{display:block;max-width:100%;overflow:hidden;padding:0;border:0;background:transparent;color:var(--text);font:inherit;font-weight:700;text-align:left;text-overflow:ellipsis;white-space:nowrap}.torrent-title:hover{color:var(--accent);text-decoration:underline}.torrent-name small{display:block;overflow:hidden;margin-top:3px;color:var(--muted);text-overflow:ellipsis;white-space:nowrap}.progress-cell{min-width:0}.progress-cell>div{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px}.progress-cell progress{width:100%;height:6px}.state-badge{display:inline-flex;padding:4px 7px;border-radius:var(--radius-pill);background:var(--surface-2);color:var(--muted);font-weight:700;white-space:nowrap}.state-badge.active{background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}.state-badge.complete{background:color-mix(in srgb,var(--success) 14%,transparent);color:var(--success)}.state-badge.paused{background:color-mix(in srgb,var(--warning) 14%,transparent);color:var(--warning)}.state-badge.error{background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger)}.row-actions{display:flex;justify-content:flex-end;gap:3px}.row-actions :deep(.ui-button){width:30px;height:30px}.torrent-detail-summary{display:flex;flex-wrap:wrap;gap:var(--space-2);padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)}.drawer-section h3{margin:0 0 12px}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2);margin:0}.detail-grid div,.detail-list div{padding:10px;border-radius:var(--radius-sm);background:var(--surface-2)}.detail-grid dt,.detail-list dt{color:var(--muted);font-size:var(--fs-xs)}.detail-grid dd,.detail-list dd{margin:4px 0 0;font-weight:700}.detail-list{display:grid;gap:var(--space-2);margin:0}.hash-value{overflow-wrap:anywhere;font-family:monospace;font-size:var(--fs-xs)}.drawer-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--space-2);margin-top:auto;padding-top:var(--space-3);border-top:1px solid var(--border)}.removal-warning{color:var(--danger)}
.meta-form{display:grid;gap:var(--space-3)}.form-group{display:grid;gap:6px}.form-group label{font-size:var(--fs-xs);font-weight:600}.form-group input{width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text)}.form-actions{display:flex;justify-content:flex-end;gap:var(--space-2);margin-top:var(--space-2)}
.action-trigger-btn{display:inline-flex;align-items:center;gap:6px;min-width:100px;padding:5px 9px;font-size:var(--fs-xs);white-space:nowrap}
.action-trigger-btn svg{width:14px;height:14px}
.tracker-display{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%}.tracker-display img{width:14px;height:14px;flex:0 0 14px;border-radius:3px;object-fit:contain}.tracker-display span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.torrent-actions-menu{display:flex;flex-direction:column;gap:var(--space-2)}
.action-menu-btn{display:inline-flex;align-items:center;gap:10px;width:100%;justify-content:flex-start;padding:10px 14px;font-size:var(--fs-sm)}
.action-menu-btn svg{width:16px;height:16px}

.stale-cache-banner{display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid color-mix(in srgb,var(--warning) 40%,var(--border));border-radius:var(--radius-md);background:color-mix(in srgb,var(--warning) 12%,transparent);color:var(--text)}
.stale-cache-banner svg{width:20px;height:20px;color:var(--warning);flex-shrink:0}
.stale-cache-banner strong{font-size:var(--fs-xs);color:var(--warning)}
.stale-cache-banner p{margin:2px 0 0;font-size: var(--fs-xs);color:var(--muted)}

.column-picker-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:10px 0}
.column-picker-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--radius-sm);background:var(--surface-2);font-size:var(--fs-xs);user-select:none;cursor:grab}.column-picker-item.dragging{opacity:.45}.column-picker-item>span:not(.column-drag-handle):not(.column-reorder-buttons){flex:1}.column-picker-item input{cursor:pointer}.column-reorder-buttons{display:inline-flex;gap:2px}.column-reorder-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:var(--radius-xs);background:transparent;color:var(--muted);cursor:pointer}.column-reorder-btn:hover:not(:disabled){color:var(--text);background:var(--surface-3)}.column-reorder-btn:disabled{opacity:.35;cursor:not-allowed}.column-reorder-btn svg{width:14px;height:14px}.column-drag-handle{color:var(--muted);font-size:18px;line-height:1}
.column-picker-item.disabled{opacity:0.6;cursor:not-allowed}

@media(min-width:761px){
  .torrent-title{font-size:14px}
  .torrent-name small{color:var(--accent);font-size:12px;font-weight:600}
  .sort-button,.state-badge,.action-trigger-btn{font-size:13px}
  .global-speed-bar button,.bulk-toolbar button{font-size:13px}
  .detail-grid dt,.detail-list dt{color:var(--accent);font-size:12px}
}

@media(max-width:760px){
  .torrent-manager{min-width:0}
  .global-speed-bar{left:0;bottom:var(--app-shell-offset-bottom);min-width:0;min-height:42px;padding:3px 8px}
  .speed-counters{gap:12px}
  .speed-item{gap:5px}.speed-item small{display:none}.speed-item strong{font-size:12px}
  .speed-bar-actions{gap:4px}
  .speed-bar-actions button{justify-content:center;min-width:0;padding:3px 7px;font-size: var(--fs-xs)}
  .bulk-toolbar{top:4px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:hidden}
  .bulk-toolbar strong{grid-column:1/-1;margin:0}
  .bulk-toolbar button{justify-content:center;min-width:0;white-space:normal;text-align:center}
  .bulk-toolbar .text-button{grid-column:1/-1}
  .action-trigger-btn{width:100%;justify-content:center}
  .torrent-name{min-width:0;max-width:none}
  .state-badge{max-width:100%;overflow:hidden;text-overflow:ellipsis}
  .detail-grid{grid-template-columns:1fr 1fr}
  .torrent-status-bar{justify-content:flex-start;max-width:100%;overflow-x:auto}
  :deep(.detail-drawer),:deep(.detail-drawer.wide){inset:0;width:100vw;height:100dvh;max-height:100dvh;padding:18px max(16px,var(--safe-right)) max(18px,var(--safe-bottom)) max(16px,var(--safe-left));transform:none;border:0;border-radius:0}
}
@media(max-width:380px){
  .connection-status{font-size:0}.connection-status i{width:8px;height:8px}
  .bulk-toolbar{grid-template-columns:1fr}
  .bulk-toolbar strong,.bulk-toolbar .text-button{grid-column:auto}
  .detail-grid,.column-picker-grid{grid-template-columns:1fr}
}
</style>
