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
        <button
          class="secondary text-xs tool-toggle-btn"
          :class="{ active: isCompact }"
          title="Basculer entre affichage compact et confortable"
          @click="toggleCompact"
        >
          <Minimize2 v-if="isCompact" /><Maximize2 v-else /> {{ isCompact ? 'Compact' : 'Normal' }}
        </button>
        <button
          class="secondary text-xs tool-toggle-btn"
          :class="{ active: isIncognito }"
          title="Mode Incognito (masquer / anonymiser les noms de torrents)"
          @click="toggleIncognito"
        >
          <EyeOff v-if="isIncognito" /><Eye v-else /> {{ isIncognito ? 'Incognito' : 'Discret' }}
        </button>
        <button
          class="secondary text-xs alt-speed-btn"
          :class="{ active: globalAltSpeed }"
          title="Activer / désactiver les limites de vitesse alternatives (Turtle mode)"
          @click="toggleAltSpeed"
        >
          <Gauge /> Mode alternatif : <strong>{{ globalAltSpeed ? 'ON' : 'OFF' }}</strong>
        </button>
      </div>
    </div>

    <div v-if="selectedRows.length" class="bulk-toolbar" role="toolbar" aria-label="Actions sur la sélection">
      <strong>{{ selectedRows.length }} sélectionné(s)</strong>
      <button class="secondary" :disabled="busy" @click="runAction('pause', selectedRows)"><Pause />Mettre en pause</button>
      <button class="secondary" :disabled="busy" @click="runAction('resume', selectedRows)"><Play />Reprendre</button>
      <button class="secondary" :disabled="busy" @click="runAction('recheck', selectedRows)"><RotateCcw />Revérifier</button>
      <button class="secondary" :disabled="busy" @click="runAction('reannounce', selectedRows)"><Radio />Réannoncer</button>
      <button class="secondary" :disabled="busy" @click="openMetaModal(selectedRows)"><Tag />Catégorie & Tags</button>
      <button class="secondary danger" :disabled="busy" @click="confirmRemoval(selectedRows, false)"><Trash2 />Retirer</button>
      <button class="secondary danger" :disabled="busy" @click="confirmRemoval(selectedRows, true)"><FileX2 />Supprimer avec les fichiers</button>
      <button class="text-button" :disabled="busy" @click="clearSelection">Annuler la sélection</button>
    </div>

    <div class="torrent-table-wrap" tabindex="0" role="region" aria-label="Tableau des torrents, défilement horizontal" @dragover.prevent @drop.prevent="handleGlobalDrop">
      <table :class="['torrent-table', { 'compact-table': isCompact, 'incognito-mode': isIncognito }]">
        <thead>
          <tr>
            <th class="select-cell"><input type="checkbox" :checked="allSelected" :indeterminate="partiallySelected" aria-label="Sélectionner tous les torrents affichés" @change="toggleAll"></th>
            <th
              v-for="column in columns"
              :key="column.key"
              :class="[column.className, { 'drag-over': dragOverKey === column.key, 'is-dragging': draggedColumnKey === column.key }]"
              :style="{ width: columnWidths[column.key] ? columnWidths[column.key] + 'px' : undefined }"
              :aria-sort="sortKey===column.key?(sortDirection==='asc'?'ascending':'descending'):'none'"
              draggable="true"
              @dragstart="startColumnDrag(column.key, $event)"
              @dragover.prevent="dragOverColumn(column.key, $event)"
              @dragleave="dragLeaveColumn(column.key)"
              @drop.prevent="dropColumn(column.key)"
            >
              <div class="th-content">
                <button class="sort-button" @click="sortBy(column.key)">
                  <span>{{ column.label }}</span>
                  <ArrowUpDown />
                </button>
              </div>
              <div class="col-resize-handle" title="Redimensionner la colonne" @pointerdown.prevent.stop="startColumnResize(column.key, $event)"></div>
            </th>
            <th class="actions-cell"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in displayedRows"
            :key="rowKey(row)"
            :class="{ selected: selected.has(rowKey(row)) }"
            @click="handleRowClick(row, index, $event)"
            @contextmenu.prevent="openContextMenu(row, index, $event)"
          >
            <td class="select-cell" data-label="Sélection">
              <input
                type="checkbox"
                :checked="selected.has(rowKey(row))"
                :aria-label="`Sélectionner ${row.title}`"
                @click.stop="toggleRow(row, index, $event)"
              />
            </td>
            <td v-for="col in columns" :key="col.key" :class="col.className" :data-label="col.label">
              <template v-if="col.key === 'title'">
                <button class="torrent-title" @click.stop="details=row">
                  {{ isIncognito ? maskTitle(row.title, index) : row.title }}
                </button>
                <small>{{ row.client_name }}<template v-if="row.tags"> · {{ row.tags }}</template></small>
              </template>
              <template v-else-if="col.key === 'status'">
                <span class="state-badge" :class="statusClass(row)">{{ statusLabel(row) }}</span>
              </template>
              <template v-else-if="col.key === 'progress'">
                <div class="progress-cell"><div><progress :value="row.progress||0" max="100"></progress><span>{{ Math.round(row.progress||0) }} %</span></div></div>
              </template>
              <template v-else-if="col.key === 'size'">{{ formatBytes(row.size) }}</template>
              <template v-else-if="col.key === 'download_speed'">{{ formatSpeed(row.download_speed) }}</template>
              <template v-else-if="col.key === 'upload_speed'">{{ formatSpeed(row.upload_speed) }}</template>
              <template v-else-if="col.key === 'ratio'">{{ Number(row.ratio||0).toFixed(2) }}</template>
              <template v-else-if="col.key === 'eta'">{{ formatEta(row.eta) }}</template>
              <template v-else-if="col.key === 'category'">{{ row.category||'—' }}</template>
              <template v-else-if="col.key === 'trackers'">
                <span class="tracker-display">
                  <img v-if="trackerValue(row) && !failedFavicons.has(trackerKey(row))" :src="trackerFaviconUrl(row)" alt="" loading="lazy" @error="hideTrackerFavicon(row)" />
                  <span>{{ formatTracker(trackerValue(row)) }}</span>
                </span>
              </template>
              <template v-else-if="col.key === 'added_on'">{{ formatTimestamp(row.added_on) }}</template>
              <template v-else-if="col.key === 'completed_on'">{{ formatTimestamp(row.completed_on) }}</template>
            </td>
            <td class="actions-cell" data-label="Actions" @click.stop>
              <button class="secondary action-trigger-btn" :disabled="isBusy(row)" title="Actions sur ce torrent" @click="actionTarget=row">
                Actions
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" class="empty">Aucun torrent ne correspond aux filtres.</p>
      <div ref="sentinelRef" class="load-more-sentinel">
        <LoadMore v-if="hasMore" :has-more="hasMore" :loading="false" @load="loadMore" />
      </div>
    </div>
    <footer class="torrent-status-bar"><span>{{ displayedRows.length }} / {{ sortedRows.length }} affichés</span><span v-if="selectedRows.length">{{ selectedRows.length }} sélectionné(s)</span><span v-if="staleInfo" class="stale-state">Données en cache</span></footer>

    <!-- Menu Contextuel Clic Droit -->
    <TorrentContextMenu
      :open="contextMenuOpen"
      :position="contextMenuPos"
      :selection="selectedRows.length ? selectedRows : (contextTarget ? [contextTarget] : [])"
      @close="contextMenuOpen = false"
      @action="handleContextMenuAction"
    />

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
        <button class="primary" @click="showColumnPicker = false">Valider</button>
      </template>
    </ModalShell>

    <!-- Modal Actions individuelles -->
    <ModalShell :open="!!actionTarget" title="Actions sur le torrent" :subtitle="actionTarget?.title" @close="actionTarget=null">
      <div v-if="actionTarget" class="torrent-actions-menu">
        <button class="secondary action-menu-btn" :disabled="isBusy(actionTarget)" @click="runAction(isPaused(actionTarget)?'resume':'pause',[actionTarget]);actionTarget=null;">
          <Play v-if="isPaused(actionTarget)" /><Pause v-else />
          {{ isPaused(actionTarget) ? 'Reprendre le téléchargement' : 'Mettre en pause' }}
        </button>

        <button class="secondary action-menu-btn" :disabled="isBusy(actionTarget)" @click="runAction('recheck',[actionTarget]);actionTarget=null;">
          <RotateCcw /> Revérifier les fichiers
        </button>

        <button class="secondary action-menu-btn" :disabled="isBusy(actionTarget)" @click="runAction('reannounce',[actionTarget]);actionTarget=null;">
          <Radio /> Réannoncer aux trackers
        </button>

        <button class="secondary action-menu-btn" :disabled="isBusy(actionTarget)" @click="openMetaModal([actionTarget]);actionTarget=null;">
          <Tag /> Modifier Catégorie & Tags
        </button>

        <button class="secondary danger action-menu-btn" :disabled="isBusy(actionTarget)" @click="removalTarget=actionTarget;actionTarget=null;">
          <Trash2 /> Supprimer ou retirer...
        </button>
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
          <div v-else-if="inspectorFiles.length" class="inspector-table-wrap" tabindex="0" role="region" aria-label="Contenu du torrent, défilement horizontal">
            <table class="inspector-table">
              <thead>
                <tr>
                  <th>Nom du fichier</th>
                  <th>Taille</th>
                  <th>Progrès</th>
                  <th>Priorité</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in inspectorFiles" :key="f.id">
                  <td class="file-name-cell" :title="f.name">{{ f.name }}</td>
                  <td>{{ formatBytes(f.size) }}</td>
                  <td>{{ f.progress }}%</td>
                  <td>
                    <select :value="f.priority" class="prio-select" @change="changeFilePriority(f.id, ($event.target as HTMLSelectElement).value)">
                      <option :value="1">Normale</option>
                      <option :value="6">Haute</option>
                      <option :value="0">Ne pas télécharger</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty">Aucun fichier à afficher.</p>
        </section>
      </template>

      <!-- Onglet Trackers -->
      <template v-else-if="detailTab==='trackers'">
        <section class="drawer-section">
          <h3>Annonces Trackers</h3>
          <div v-if="loadingInspector" class="inspector-loading">Chargement des trackers...</div>
          <div v-else-if="inspectorTrackers.length" class="inspector-table-wrap" tabindex="0" role="region" aria-label="Annonces trackers, défilement horizontal">
            <table class="inspector-table">
              <thead>
                <tr>
                  <th>URL Tracker</th>
                  <th>Seeds</th>
                  <th>Peers</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(tr, i) in inspectorTrackers" :key="i">
                  <td class="file-name-cell" :title="tr.url">{{ tr.url }}</td>
                  <td>{{ tr.num_seeds }}</td>
                  <td>{{ tr.num_peers }}</td>
                  <td><small>{{ tr.msg || 'Actif' }}</small></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty">Aucun tracker à afficher.</p>
        </section>
      </template>

      <!-- Onglet Peers -->
      <template v-else-if="detailTab==='peers'">
        <section class="drawer-section">
          <h3>Paires connectées</h3>
          <div v-if="loadingInspector" class="inspector-loading">Chargement des paires...</div>
          <div v-else-if="inspectorPeers.length" class="inspector-table-wrap" tabindex="0" role="region" aria-label="Paires connectées, défilement horizontal">
            <table class="inspector-table">
              <thead>
                <tr>
                  <th>Adresse IP</th>
                  <th>Client</th>
                  <th>DL / UP</th>
                  <th>Progrès</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(peer, i) in inspectorPeers" :key="i">
                  <td>{{ peer.ip }}</td>
                  <td>{{ peer.client }}</td>
                  <td>{{ formatSpeed(peer.download_speed) }} / {{ formatSpeed(peer.upload_speed) }}</td>
                  <td>{{ peer.progress }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty">Aucune paire connectée actuellement.</p>
        </section>
      </template>

      <div class="drawer-actions">
        <button class="secondary" :disabled="isBusy(details)" @click="runAction(isPaused(details)?'resume':'pause',[details])"><Play v-if="isPaused(details)"/><Pause v-else/>{{ isPaused(details)?'Reprendre':'Mettre en pause' }}</button>
        <button class="secondary" :disabled="isBusy(details)" @click="runAction('recheck',[details])"><RotateCcw />Revérifier</button>
        <button class="secondary" :disabled="isBusy(details)" @click="runAction('reannounce',[details])"><Radio />Réannoncer</button>
        <button class="secondary" :disabled="isBusy(details)" @click="openMetaModal([details])"><Tag />Catégorie & Tags</button>
        <button class="secondary danger" :disabled="isBusy(details)" @click="removalTarget=details"><Trash2 />Supprimer</button>
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
          <button type="button" class="secondary" :disabled="busy" @click="metaTarget=null">Annuler</button>
          <button type="submit" class="primary" :disabled="busy">Enregistrer</button>
        </div>
      </form>
    </ModalShell>

    <ModalShell :open="!!removalTarget" title="Supprimer ce torrent" subtitle="Choisis si les données téléchargées doivent être conservées." @close="removalTarget=null">
      <p><strong>{{ removalTarget?.title }}</strong></p>
      <p class="removal-warning">La suppression des fichiers est définitive et peut retirer des médias encore utilisés ailleurs.</p>
      <template #actions>
        <button class="secondary" :disabled="busy" @click="removalTarget=null">Annuler</button>
        <button class="secondary danger" :disabled="busy" @click="confirmRemoval([removalTarget],false)"><Trash2 />Retirer seulement</button>
        <button class="primary danger" :disabled="busy" @click="confirmRemoval([removalTarget],true)"><FileX2 />Supprimer avec les fichiers</button>
      </template>
    </ModalShell>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { AlertTriangle, ArrowUpDown, ChevronDown, ChevronUp, Download, Eye, EyeOff, FileText, FileX2, Gauge, Info, Maximize2, Minimize2, Pause, Play, Radio, RotateCcw, SlidersHorizontal, Tag, Trash2, Upload, Users } from '@lucide/vue';
import { api } from '@/api';
import { useConfirm } from '@/composables/useConfirm';
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

const isCompact = ref(localStorage.getItem('watchdeck:torrent-table-compact') === 'true');
const isIncognito = ref(localStorage.getItem('watchdeck:torrent-table-incognito') === 'true');

function toggleCompact(): void {
  isCompact.value = !isCompact.value;
  localStorage.setItem('watchdeck:torrent-table-compact', String(isCompact.value));
}

function toggleIncognito(): void {
  isIncognito.value = !isIncognito.value;
  localStorage.setItem('watchdeck:torrent-table-incognito', String(isIncognito.value));
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

const COLUMN_PREFERENCES_KEY = `watchdeck:torrent-table-columns:${props.preferenceScope || 'all'}`;
const DEFAULT_VISIBLE_COLUMNS = ['title', 'status', 'progress', 'size', 'download_speed', 'upload_speed', 'eta', 'category'];
const storedColumnPreferences: any = (() => {
  try { return JSON.parse(localStorage.getItem(COLUMN_PREFERENCES_KEY) || 'null'); } catch { return null; }
})();
const validColumnKeys = new Set(ALL_COLUMNS.map(column => column.key));
const savedOrder: string[] = Array.isArray(storedColumnPreferences?.order) ? storedColumnPreferences.order.filter((key: string) => validColumnKeys.has(key)) : [];
const columnOrder = ref<string[]>([...savedOrder, ...ALL_COLUMNS.map(column => column.key).filter(key => !savedOrder.includes(key))]);
const visibleColumnKeys = ref<Set<string>>(new Set((Array.isArray(storedColumnPreferences?.visible) ? storedColumnPreferences.visible : DEFAULT_VISIBLE_COLUMNS).filter((key: string) => validColumnKeys.has(key))));
const showColumnPicker = ref(false);
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

const columnWidths = ref<Record<string, number>>({
  ...DEFAULT_COLUMN_WIDTHS,
  ...(storedColumnPreferences?.widths || {}),
});

const draggedColumnKey = ref('');
const dragOverKey = ref('');

defineExpose({
  openColumnPicker: () => { showColumnPicker.value = true; },
});

function toggleColumnKey(key: string): void {
  const next = new Set(visibleColumnKeys.value);
  if (next.has(key)) {
    if (next.size > 2) next.delete(key);
  } else {
    next.add(key);
  }
  visibleColumnKeys.value = next;
}

function startColumnDrag(key: string, event: DragEvent): void {
  draggedColumnKey.value = key;
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function dragOverColumn(key: string, event: DragEvent): void {
  if (draggedColumnKey.value && draggedColumnKey.value !== key) {
    dragOverKey.value = key;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }
}

function dragLeaveColumn(key: string): void {
  if (dragOverKey.value === key) {
    dragOverKey.value = '';
  }
}

function dropColumn(targetKey: string): void {
  const sourceKey = draggedColumnKey.value;
  draggedColumnKey.value = '';
  dragOverKey.value = '';
  if (!sourceKey || sourceKey === targetKey) return;
  const next = [...columnOrder.value];
  const sourceIndex = next.indexOf(sourceKey);
  const targetIndex = next.indexOf(targetKey);
  next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceKey);
  columnOrder.value = next;
}

let resizingKey: string | null = null;
let resizeStartX = 0;
let resizeStartWidth = 0;

// pointerdown/move/up plutot que mousedown/mousemove/mouseup : le redimensionnement
// fonctionne ainsi aussi au doigt sur tablette, pas seulement a la souris.
function startColumnResize(key: string, event: PointerEvent): void {
  resizingKey = key;
  resizeStartX = event.clientX;
  resizeStartWidth = columnWidths.value[key] || DEFAULT_COLUMN_WIDTHS[key] || 100;
  window.addEventListener('pointermove', onColumnResizeMove);
  window.addEventListener('pointerup', onColumnResizeEnd);
}

function onColumnResizeMove(event: PointerEvent): void {
  if (!resizingKey) return;
  const deltaX = event.clientX - resizeStartX;
  const newWidth = Math.max(50, resizeStartWidth + deltaX);
  columnWidths.value = {
    ...columnWidths.value,
    [resizingKey]: newWidth,
  };
}

function onColumnResizeEnd(): void {
  resizingKey = null;
  window.removeEventListener('pointermove', onColumnResizeMove);
  window.removeEventListener('pointerup', onColumnResizeEnd);
}

// Equivalent clavier/tactile au glisser-deposer des colonnes (le drag-and-drop HTML5
// n'est operable ni au clavier ni au toucher : WCAG 2.1.1 et 2.5.7).
function moveColumnKey(key: string, direction: -1 | 1): void {
  const next = [...columnOrder.value];
  const index = next.indexOf(key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return;
  [next[index], next[target]] = [next[target], next[index]];
  columnOrder.value = next;
}

const orderedColumns = computed(() => columnOrder.value.map(key => ALL_COLUMNS.find(column => column.key === key)).filter((column): column is TorrentColumn => Boolean(column)));
const columns = computed(() => orderedColumns.value.filter(column => column.required || visibleColumnKeys.value.has(column.key)));
watch([visibleColumnKeys, columnOrder, columnWidths], () => {
  try {
    localStorage.setItem(COLUMN_PREFERENCES_KEY, JSON.stringify({
      visible: [...visibleColumnKeys.value],
      order: columnOrder.value,
      widths: columnWidths.value,
    }));
  } catch { /* Préférences non persistables : le tableau reste utilisable. */ }
}, { deep: true });
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
let observer: IntersectionObserver | null = null;

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
  selectedKeys: selected, selectedRows, allSelected, partiallySelected,
  toggle: toggleRow, toggleAll, clear: clearSelection, setKeys: setSelection, lastIndex: lastSelectedIndex,
} = useTableSelection(() => sortedRows.value, rowKey);

const displayedRows = computed(() => sortedRows.value.slice(0, displayLimit.value));
const hasMore = computed(() => displayLimit.value < sortedRows.value.length);

function loadMore(): void {
  displayLimit.value += BATCH_SIZE;
}

function sortBy(key: string): void {
  displayLimit.value = BATCH_SIZE;
  if (sortKey.value === key) sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  else {
    sortKey.value = key;
    sortDirection.value = 'asc';
  }
}

function handleRowClick(row: any, index: number, event?: MouseEvent): void {
  if (event?.shiftKey || event?.ctrlKey || event?.metaKey) {
    toggleRow(row, index, event);
    return;
  }
  details.value = row;
  lastSelectedIndex.value = index;
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
  window.addEventListener('keydown', handleKeyDown);
  if (sentinelRef.value && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore.value) {
        loadMore();
      }
    }, { rootMargin: '200px' });
    observer.observe(sentinelRef.value);
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  if (observer) observer.disconnect();
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

const contextMenuOpen = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });
const contextTarget = ref<any>(null);

function openContextMenu(row: any, index: number, event: MouseEvent): void {
  const key = rowKey(row);
  if (!selected.value.has(key)) {
    setSelection([key]);
    lastSelectedIndex.value = index;
  }
  contextTarget.value = row;
  contextMenuPos.value = { x: event.clientX, y: event.clientY };
  contextMenuOpen.value = true;
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
.global-speed-bar{position:fixed;left:248px;right:0;bottom:0;z-index:35;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:4px 10px;border:0;border-top:1px solid var(--border);border-radius:0;background:color-mix(in srgb,var(--surface) 94%,transparent);box-shadow:0 -6px 22px rgb(0 0 0 / 18%);backdrop-filter:blur(12px);flex-wrap:nowrap;overflow-x:auto;overscroll-behavior-x:contain}
:global(.shell.sidebar-collapsed) .global-speed-bar{left:72px}
.speed-counters{display:flex;align-items:center;gap:18px;min-width:max-content}
.speed-item{display:inline-flex;align-items:center;gap:8px;color:var(--text)}
.speed-item>span{display:grid;gap:1px}
.speed-item small{color:var(--accent);font-size:11px;font-weight:700}
.speed-item strong{font-size:13px}
.speed-item svg{width:15px;height:15px;color:var(--muted)}
.connection-status{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;font-weight:700;white-space:nowrap}.connection-status i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 14%,transparent)}.connection-status.connected{color:var(--success)}.connection-status.partial{color:var(--warning)}.connection-status.offline{color:var(--danger)}
.speed-bar-actions{display:flex;align-items:center;gap:6px;min-width:max-content}
.speed-bar-actions button{min-height:32px;padding:4px 9px;white-space:nowrap}
.tool-toggle-btn.active{background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);border-color:var(--accent)}
.alt-speed-btn.active{background:color-mix(in srgb,var(--warning) 16%,transparent);color:var(--warning);border-color:var(--warning)}

.torrent-table.compact-table th,.torrent-table.compact-table td{padding:4px 7px!important;font-size:11px!important}
.torrent-table.compact-table .progress-cell progress{height:4px!important}
.torrent-table.incognito-mode .torrent-title{font-family:monospace;letter-spacing:0.5px}
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
.prio-select{padding:2px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);font-size:11px}

.torrent-manager{display:grid;gap:var(--space-3);padding-bottom:52px}.bulk-toolbar{position:sticky;top:8px;z-index:4;display:flex;align-items:center;gap:var(--space-2);padding:10px 12px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--border));border-radius:var(--radius-md);background:color-mix(in srgb,var(--surface) 94%,transparent);box-shadow:var(--shadow-md);backdrop-filter:blur(12px)}.bulk-toolbar strong{margin-right:auto}.bulk-toolbar button,.drawer-actions button{display:inline-flex;align-items:center;gap:6px}.bulk-toolbar svg,.row-actions svg,.drawer-actions svg{width:14px;height:14px}.torrent-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface)}.torrent-table{width:100%;min-width:900px;border-collapse:collapse;table-layout:fixed}.torrent-table th,.torrent-table td{padding:10px 9px;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle;font-size:var(--fs-xs);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative}.torrent-table th{user-select:none;cursor:grab;background:var(--surface)}.torrent-table th.is-dragging{opacity:0.45}.torrent-table th.drag-over{border-left:3px solid var(--accent);background:color-mix(in srgb,var(--accent) 15%,var(--surface-2))}.th-content{display:flex;align-items:center;width:100%;overflow:hidden}.col-resize-handle{position:absolute;top:0;right:0;width:8px;height:100%;cursor:col-resize;user-select:none;z-index:3;touch-action:none}.col-resize-handle:hover,.col-resize-handle:active{background:var(--accent);opacity:0.85}.torrent-table tbody tr:last-child td{border-bottom:0}.torrent-table tbody tr{transition:background .15s;cursor:pointer}.torrent-table tbody tr:hover,.torrent-table tbody tr.selected{background:var(--surface-2)}.select-cell{width:38px;text-align:center!important}.sort-button{display:inline-flex;align-items:center;gap:4px;padding:0;border:0;background:transparent;color:var(--muted);font:inherit;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sort-button:hover{color:var(--text)}.sort-button svg{width:12px;flex-shrink:0}.torrent-name{min-width:0}.torrent-title{display:block;max-width:100%;overflow:hidden;padding:0;border:0;background:transparent;color:var(--text);font:inherit;font-weight:700;text-align:left;text-overflow:ellipsis;white-space:nowrap}.torrent-title:hover{color:var(--accent);text-decoration:underline}.torrent-name small{display:block;overflow:hidden;margin-top:3px;color:var(--muted);text-overflow:ellipsis;white-space:nowrap}.progress-cell{min-width:0}.progress-cell>div{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px}.progress-cell progress{width:100%;height:6px}.state-badge{display:inline-flex;padding:4px 7px;border-radius:var(--radius-pill);background:var(--surface-2);color:var(--muted);font-weight:700;white-space:nowrap}.state-badge.active{background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}.state-badge.complete{background:color-mix(in srgb,var(--success) 14%,transparent);color:var(--success)}.state-badge.paused{background:color-mix(in srgb,var(--warning) 14%,transparent);color:var(--warning)}.state-badge.error{background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger)}.actions-cell{position:sticky;right:0;z-index:1;min-width:118px;width:118px;background:var(--surface)}.torrent-table tbody tr:hover .actions-cell,.torrent-table tbody tr.selected .actions-cell{background:var(--surface-2)}.row-actions{display:flex;justify-content:flex-end;gap:3px}.row-actions .icon-button{width:30px;height:30px}.torrent-detail-summary{display:flex;flex-wrap:wrap;gap:var(--space-2);padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)}.drawer-section h3{margin:0 0 12px}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2);margin:0}.detail-grid div,.detail-list div{padding:10px;border-radius:var(--radius-sm);background:var(--surface-2)}.detail-grid dt,.detail-list dt{color:var(--muted);font-size:var(--fs-xs)}.detail-grid dd,.detail-list dd{margin:4px 0 0;font-weight:700}.detail-list{display:grid;gap:var(--space-2);margin:0}.hash-value{overflow-wrap:anywhere;font-family:monospace;font-size:var(--fs-xs)}.drawer-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--space-2);margin-top:auto;padding-top:var(--space-3);border-top:1px solid var(--border)}.removal-warning{color:var(--danger)}
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
.stale-cache-banner p{margin:2px 0 0;font-size:11px;color:var(--muted)}

.column-picker-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:10px 0}
.torrent-table tbody tr{user-select:none;-webkit-user-select:none}
.column-picker-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--radius-sm);background:var(--surface-2);font-size:var(--fs-xs);user-select:none;cursor:grab}.column-picker-item.dragging{opacity:.45}.column-picker-item>span:not(.column-drag-handle):not(.column-reorder-buttons){flex:1}.column-picker-item input{cursor:pointer}.column-reorder-buttons{display:inline-flex;gap:2px}.column-reorder-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:var(--radius-xs);background:transparent;color:var(--muted);cursor:pointer}.column-reorder-btn:hover:not(:disabled){color:var(--text);background:var(--surface-3)}.column-reorder-btn:disabled{opacity:.35;cursor:not-allowed}.column-reorder-btn svg{width:14px;height:14px}.column-drag-handle{color:var(--muted);font-size:18px;line-height:1}
.column-picker-item.disabled{opacity:0.6;cursor:not-allowed}

@media(min-width:761px){
  .torrent-table th,.torrent-table td{padding:11px 10px;font-size:13px}
  .torrent-title{font-size:14px}
  .torrent-name small{color:var(--accent);font-size:12px;font-weight:600}
  .sort-button,.state-badge,.action-trigger-btn{font-size:13px}
  .global-speed-bar button,.bulk-toolbar button{font-size:13px}
  .detail-grid dt,.detail-list dt{color:var(--accent);font-size:12px}
}

@media(max-width:760px){
  .torrent-manager{min-width:0}
  .global-speed-bar{left:0;bottom:calc(var(--mobile-nav-h,64px) + var(--safe-bottom));min-width:0;min-height:42px;padding:3px 8px}
  .speed-counters{gap:12px}
  .speed-item{gap:5px}.speed-item small{display:none}.speed-item strong{font-size:12px}
  .speed-bar-actions{gap:4px}
  .speed-bar-actions button{justify-content:center;min-width:0;padding:3px 7px;font-size:11px}
  .bulk-toolbar{top:4px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:hidden}
  .bulk-toolbar strong{grid-column:1/-1;margin:0}
  .bulk-toolbar button{justify-content:center;min-width:0;white-space:normal;text-align:center}
  .bulk-toolbar .text-button{grid-column:1/-1}
  .torrent-table-wrap{max-width:100%;overflow:visible;border:0;background:transparent}
  .torrent-table{display:block;width:100%;min-width:0}
  .torrent-table thead{display:none}
  .torrent-table tbody{display:grid;gap:8px;min-width:0}
  .torrent-table tr{display:grid;grid-template-columns:28px minmax(0,1fr) auto;min-width:0;align-items:center;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface)}
  .torrent-table tr{content-visibility:auto;contain-intrinsic-size:0 142px}
  .torrent-table td{display:none;min-width:0;padding:7px 10px;border:0}
  .torrent-table .select-cell,.torrent-table .torrent-name,.torrent-table .progress-cell,.torrent-table td[data-label="État"],.torrent-table .actions-cell{display:block}
  .torrent-table .select-cell{grid-column:1;grid-row:1/3;padding-right:0}
  .torrent-table .torrent-name{grid-column:2;grid-row:1;padding-bottom:2px}
  .torrent-table td[data-label="État"]{grid-column:3;grid-row:1;max-width:34vw}
  .torrent-table .progress-cell{grid-column:2/4;grid-row:2;padding-top:2px}
  .torrent-table .actions-cell{position:static;grid-column:1/4;grid-row:3;width:auto;min-width:0;padding-top:3px;border-top:1px solid var(--border)}
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
  .torrent-table tr{grid-template-columns:26px minmax(0,1fr)}
  .torrent-table td[data-label="État"]{grid-column:2;grid-row:2;max-width:100%;padding-top:2px;padding-bottom:2px}
  .torrent-table .select-cell{grid-row:1/4}
  .torrent-table .progress-cell{grid-column:2;grid-row:3}
  .torrent-table .actions-cell{grid-column:1/3;grid-row:4}
  .detail-grid,.column-picker-grid{grid-template-columns:1fr}
}
</style>
