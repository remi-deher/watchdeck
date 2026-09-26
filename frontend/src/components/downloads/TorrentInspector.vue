<template>
  <!-- Inspection d'un torrent : general, puis fichiers, trackers et paires lus a la
       demande aupres du client. Les actions remontent a la fiche, qui les execute. -->
  <div class="torrent-inspector">
    <AppSubnav :items="tabs" :active="tab" variant="tabs" aria-label="Sections du torrent" @update:active="changeTab" />

    <template v-if="tab==='general'">
      <section class="torrent-detail-summary">
        <TorrentStateBadge :torrent="torrent" />
      </section>
      <section class="drawer-section">
        <h3>Transfert</h3>
        <dl class="detail-grid">
          <div><dt>Progression</dt><dd>{{ Number(torrent.progress||0).toFixed(1) }} %</dd></div>
          <div><dt>Taille</dt><dd>{{ formatBytes(torrent.size) }}</dd></div>
          <div><dt>Réception</dt><dd>{{ formatSpeed(torrent.download_speed) }}</dd></div>
          <div><dt>Envoi</dt><dd>{{ formatSpeed(torrent.upload_speed) }}</dd></div>
          <div><dt>Ratio</dt><dd>{{ Number(torrent.ratio||0).toFixed(2) }}</dd></div>
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
          <UiSelect :model-value="f.priority" class="prio-select" :aria-label="`Priorité de ${f.name}`" @update:model-value="changeFilePriority(f.id, $event)" :options="[{ value: 1, label: 'Normale' }, { value: 6, label: 'Haute' }, { value: 0, label: 'Ne pas télécharger' }]" />
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

    <div class="drawer-actions">
      <UiButton :disabled="busy" @click="emit('action', isPaused(torrent) ? 'resume' : 'pause')"><Play v-if="isPaused(torrent)"/><Pause v-else/>{{ isPaused(torrent) ? 'Reprendre' : 'Mettre en pause' }}</UiButton>
      <UiButton :disabled="busy" @click="emit('action', 'recheck')"><RotateCcw />Revérifier</UiButton>
      <UiButton :disabled="busy" @click="emit('action', 'reannounce')"><Radio />Réannoncer</UiButton>
      <UiButton :disabled="busy" @click="emit('meta')"><Tag />Catégorie & Tags</UiButton>
      <UiButton variant="danger" :disabled="busy" @click="emit('remove')"><Trash2 />Supprimer</UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import { computed, ref, watch } from 'vue';
import { FileText, Info, Pause, Play, Radio, RotateCcw, Tag, Trash2, Users } from '@lucide/vue';
import { api } from '@/api';
import UiButton from '@/components/ui/UiButton.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import AppSubnav from '@/components/ui/AppSubnav.vue';
import TorrentStateBadge from './TorrentStateBadge.vue';
import { formatBytes, formatEta, formatSpeed, formatTimestamp, isPaused } from '@/downloads/torrentFormat';

const props = defineProps<{ torrent: any; busy?: boolean }>();
const emit = defineEmits<{
  (e: 'action', action: string): void;
  (e: 'meta'): void;
  (e: 'remove'): void;
  (e: 'error', message: string): void;
}>();

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

const tab = ref('general');
const files = ref<any[]>([]);
const trackers = ref<any[]>([]);
const peers = ref<any[]>([]);
const loading = ref(false);
const tabs = computed(() => [
  { key: 'general', label: 'Général', icon: Info },
  { key: 'files', label: 'Fichiers', icon: FileText, count: files.value.length },
  { key: 'trackers', label: 'Trackers', icon: Radio, count: trackers.value.length },
  { key: 'peers', label: 'Peers', icon: Users, count: peers.value.length },
]);

function changeTab(name: string): void {
  if (name === 'general') tab.value = name;
  else void selectTab(name);
}

// Un autre torrent : on repart de l'onglet general, sans les listes du precedent.
watch(() => `${props.torrent.client_id}:${props.torrent.hash}`, () => {
  tab.value = 'general';
  files.value = [];
  trackers.value = [];
  peers.value = [];
});

async function selectTab(name: string): Promise<void> {
  tab.value = name;
  loading.value = true;
  try {
    const base = `/api/downloads/clients/${props.torrent.client_id}/${props.torrent.hash}`;
    if (name === 'files') files.value = await api(`${base}/files`);
    else if (name === 'trackers') trackers.value = await api(`${base}/trackers`);
    else if (name === 'peers') peers.value = await api(`${base}/peers`);
  } catch (e: any) {
    emit('error', e.message);
  } finally {
    loading.value = false;
  }
}

async function changeFilePriority(fileId: number, priority: string): Promise<void> {
  try {
    await api(`/api/downloads/clients/${props.torrent.client_id}/${props.torrent.hash}/files/priority`, {
      method: 'POST',
      body: JSON.stringify({ file_ids: [fileId], priority: Number(priority) }),
    });
    selectTab('files');
  } catch (e: any) {
    emit('error', `Erreur de modification de la priorité : ${e.message}`);
  }
}
</script>

<style scoped>
.torrent-inspector{display:grid;gap:var(--space-4)}
.torrent-detail-summary{display:flex;flex-wrap:wrap;gap:var(--space-2);padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2)}
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
.drawer-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--space-2);margin-top:auto;padding-top:var(--space-3);border-top:1px solid var(--border)}
.drawer-actions button{display:inline-flex;align-items:center;gap:6px}
.drawer-actions svg{width:14px;height:14px}
@media(min-width:761px){.detail-grid dt,.detail-list dt{color:var(--accent);font-size:12px}}
@media(max-width:380px){.detail-grid{grid-template-columns:1fr}}
</style>
