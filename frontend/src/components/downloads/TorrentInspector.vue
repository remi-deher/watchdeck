<template>
  <div class="torrent-inspector">
    <template v-if="tab==='general'">
      <section class="drawer-section">
        <h3>Transfert</h3>
        <dl class="detail-grid">
          <div><dt>Progression</dt><dd>{{ Number(torrent.progress||0).toFixed(1) }} %</dd></div>
          <div><dt>Taille</dt><dd>{{ formatBytes(torrent.size) }}</dd></div>
          <div><dt>Réception</dt><dd>{{ formatSpeed(torrent.download_speed) }}</dd></div>
          <div><dt>Envoi</dt><dd>{{ formatSpeed(torrent.upload_speed) }}</dd></div>
          <div><dt>Temps restant</dt><dd>{{ formatEta(torrent.eta) }}</dd></div>
        </dl>
      </section>
      <section class="drawer-section">
        <h3>Classement et Horodatage</h3>
        <dl class="detail-list">
          <div><dt>Client</dt><dd>{{ torrent.client_name }}</dd></div>
          <div><dt>Catégorie</dt><dd>{{ torrent.category||'Aucune' }}</dd></div>
          <div><dt>Tags</dt><dd>{{ torrent.tags||'Aucun' }}</dd></div>
          <div v-if="torrent.added_on"><dt>Ajouté le</dt><dd>{{ formatTimestamp(torrent.added_on) }}</dd></div>
          <div v-if="torrent.completed_on"><dt>Fin de téléchargement</dt><dd>{{ formatTimestamp(torrent.completed_on) }}</dd></div>
          <div v-if="torrent.comment"><dt>Commentaire</dt><dd>{{ torrent.comment }}</dd></div>
          <div v-if="torrent.trackers||torrent.tracker"><dt>Trackers</dt><dd class="hash-value">{{ torrent.trackers||torrent.tracker }}</dd></div>
          <div><dt>Hash</dt><dd class="hash-value">{{ torrent.hash }}</dd></div>
        </dl>
      </section>
    </template>

    <section v-else-if="tab==='files'" class="drawer-section">
      <h3>Contenu du torrent</h3>
      <div v-if="loading" class="inspector-loading">Chargement des fichiers...</div>
      <UiDataTable v-else-if="files.length" class="inspector-table-wrap" label="Contenu du torrent" :rows="files" :columns="FILE_COLUMNS" :row-key="(f: any) => f.id">
        <template #cell-name="{ row: f }"><span class="file-name-cell" :title="f.name">{{ f.name }}</span></template>
        <template #cell-size="{ row: f }">{{ formatBytes(f.size) }}</template>
        <template #cell-progress="{ row: f }">{{ f.progress }}%</template>
        <template #cell-priority="{ row: f }">
          <UiSelect :model-value="f.priority" class="prio-select" :aria-label="`Priorité de ${f.name}`" @update:model-value="emit('priority', f.id, $event)" :options="[{ value: 1, label: 'Normale' }, { value: 6, label: 'Haute' }, { value: 0, label: 'Ne pas télécharger' }]" />
        </template>
      </UiDataTable>
      <p v-else class="empty">Aucun fichier à afficher.</p>
    </section>

    <section v-else-if="tab==='trackers'" class="drawer-section">
      <h3>Annonces Trackers</h3>
      <div v-if="loading" class="inspector-loading">Chargement des trackers...</div>
      <UiDataTable v-else-if="trackers.length" class="inspector-table-wrap" label="Annonces trackers" :rows="trackers" :columns="TRACKER_COLUMNS" :row-key="(tr: any) => tr.url">
        <template #cell-url="{ row: tr }"><span class="file-name-cell" :title="tr.url">{{ tr.url }}</span></template>
        <template #cell-msg="{ row: tr }"><small>{{ tr.msg || 'Actif' }}</small></template>
      </UiDataTable>
      <p v-else class="empty">Aucun tracker à afficher.</p>
    </section>

    <section v-else-if="tab==='peers'" class="drawer-section">
      <h3>Paires connectées</h3>
      <div v-if="loading" class="inspector-loading">Chargement des paires...</div>
      <UiDataTable v-else-if="peers.length" class="inspector-table-wrap" label="Paires connectées" :rows="peers" :columns="PEER_COLUMNS" :row-key="(peer: any) => `${peer.ip}:${peer.port ?? ''}`">
        <template #cell-speed="{ row: peer }">{{ formatSpeed(peer.download_speed) }} / {{ formatSpeed(peer.upload_speed) }}</template>
        <template #cell-progress="{ row: peer }">{{ peer.progress }}%</template>
      </UiDataTable>
      <p v-else class="empty">Aucune paire connectée actuellement.</p>
    </section>

  </div>
</template>

<script setup lang="ts">
/* Contenu des onglets d'un torrent (general, fichiers, trackers, paires). L'en-tete, les
   onglets et les actions sont ceux du gabarit Fiche ; les listes sont lues par
   `useTorrentInspection`. */
import UiSelect from '@/components/ui/UiSelect.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import { formatBytes, formatEta, formatSpeed, formatTimestamp } from '@/downloads/torrentFormat';

defineProps<{ torrent: any; tab: string; files: any[]; trackers: any[]; peers: any[]; loading: boolean }>();
const emit = defineEmits<{ (e: 'priority', fileId: number, priority: string | number): void }>();

/* Toutes les colonnes triables, avec leur role dans la carte de telephone. */
const FILE_COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Nom du fichier', card: 'title', sortable: true },
  { key: 'size', label: 'Taille', sortable: true },
  { key: 'progress', label: 'Progrès', sortable: true },
  { key: 'priority', label: 'Priorité' },
];
const TRACKER_COLUMNS: UiColumn[] = [
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
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.torrent-inspector{display:grid;gap:var(--space-4)}
.drawer-section h3{margin:0 0 12px}
.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2);margin:0}
.detail-list{display:grid;gap:var(--space-2);margin:0}
.detail-grid div,.detail-list div{padding:10px;border-radius:var(--radius-sm);background:var(--surface-2)}
.detail-grid dt,.detail-list dt{color:var(--muted);font-size:var(--fs-xs)}
.detail-grid dd,.detail-list dd{margin:4px 0 0;font-weight:700}
.hash-value{overflow-wrap:anywhere;font-family: var(--font-mono);font-size:var(--fs-xs)}
.inspector-loading{padding:16px 0;font-size:var(--fs-xs);color:var(--muted)}
.inspector-table-wrap{overflow-x:auto;margin-top:8px;border:1px solid var(--border);border-radius:var(--radius-sm)}
.file-name-cell{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prio-select{padding:2px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);font-size:var(--fs-xs)}
@include bp.from(tablet) {.detail-grid dt,.detail-list dt{color:var(--accent);font-size:var(--fs-xs)}}
@container sheet (max-width: 342px) {.detail-grid{grid-template-columns:1fr}}
</style>
