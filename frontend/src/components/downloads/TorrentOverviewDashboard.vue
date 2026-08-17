<template>
  <section class="torrent-dashboard" aria-label="Vue d’ensemble des clients torrent">
    <MetricGrid aria-label="Indicateurs clés des téléchargements">
      <MetricCard
        :icon="Server"
        label="Instances"
        :value="`${connectedClients}/${visibleEnabledClients}`"
        detail="instances connectées"
      />
      <MetricCard
        :icon="Activity"
        label="Torrents totaux"
        :value="torrents.length"
        :detail="`${activeCount} actifs · ${formatBytes(totalSize)}`"
      />
      <MetricCard
        :icon="Download"
        label="Téléchargement total"
        :value="formatSpeed(downloadSpeed)"
        :detail="`${downloadingCount} en téléchargement`"
      />
      <MetricCard
        :icon="Upload"
        label="Envoi total"
        :value="formatSpeed(uploadSpeed)"
        :detail="`${seedingCount} en partage`"
      />
    </MetricGrid>

    <div class="client-grid">
      <article v-for="client in visibleClients" :key="client.id" class="client-card" @click="$emit('select', client)">
        <header>
          <div>
            <div class="client-name"><strong>{{ client.name }}</strong><ExternalLink /></div>
            <div class="client-meta"><span>{{ clientLabel(client) }}</span><span>{{ formatHost(client.url) }}</span></div>
          </div>
          <span class="state" :class="clientState(client).className">{{ clientState(client).label }}</span>
        </header>

        <div class="client-counts">
          <div><strong>{{ clientStats(client).downloading }}</strong><span>En téléchargement</span></div>
          <div><strong>{{ clientStats(client).active }}</strong><span>Actifs</span></div>
          <div><strong>{{ clientStats(client).total }}</strong><span>Total</span></div>
        </div>

        <p v-if="clientError(client)" class="client-warning"><AlertTriangle /> Données en cache : {{ clientError(client) }}</p>
        <dl>
          <div><dt><Download /> Téléchargement</dt><dd>{{ formatSpeed(clientStats(client).downloadSpeed) }}</dd></div>
          <div><dt><Upload /> Envoi</dt><dd>{{ formatSpeed(clientStats(client).uploadSpeed) }}</dd></div>
          <div><dt><Activity /> Ratio moyen</dt><dd>{{ formatRatio(clientStats(client).ratio) }}</dd></div>
          <div><dt><HardDrive /> Taille totale</dt><dd>{{ formatBytes(clientStats(client).totalSize) }}</dd></div>
        </dl>

        <footer>Voir la file <ChevronRight /></footer>
      </article>
    </div>

    <section v-if="trackerRows.length" class="tracker-panel">
      <header><h3>Répartition par tracker</h3><span>{{ trackerRows.length }} tracker(s)</span></header>
      <div class="tracker-scroll">
        <table>
          <thead><tr><th>Tracker</th><th>Torrents</th><th>Envoi</th><th>Téléchargement</th><th>Ratio</th><th>Taille</th></tr></thead>
          <tbody>
            <tr v-for="row in trackerRows" :key="row.name">
              <td>{{ row.name }}</td><td>{{ row.count }}</td><td>{{ formatSpeed(row.uploadSpeed) }}</td><td>{{ formatSpeed(row.downloadSpeed) }}</td><td>{{ formatRatio(row.ratioSum / row.count) }}</td><td>{{ formatBytes(row.size) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Activity, AlertTriangle, ChevronRight, Download, ExternalLink, HardDrive, Server, Upload } from '@lucide/vue';
import MetricCard from '@/components/ui/MetricCard.vue';
import MetricGrid from '@/components/ui/MetricGrid.vue';

const props = withDefaults(
  defineProps<{
    clients?: any[];
    torrents?: any[];
    clientId?: string | number;
  }>(),
  {
    clients: () => [],
    torrents: () => [],
    clientId: '',
  }
);
defineEmits<{
  (e: 'select', client: any): void;
}>();

const visibleClients = computed(() => props.clients.filter((client: any) => !props.clientId || String(client.id) === String(props.clientId)));
const visibleEnabledClients = computed(() => visibleClients.value.filter((client: any) => client.enabled).length);
const torrentRows = computed(() => props.torrents.filter((row: any) => !row.client_error && (!props.clientId || String(row.client_id) === String(props.clientId))));
const torrents = computed(() => torrentRows.value);
const activeCount = computed(() => torrents.value.filter((row: any) => Number(row.download_speed) > 0 || Number(row.upload_speed) > 0).length);
const downloadingCount = computed(() => torrents.value.filter((row: any) => String(row.status).toLowerCase().includes('down')).length);
const seedingCount = computed(() => torrents.value.filter((row: any) => ['uploading', 'stalledup', 'forcedup'].some(state => String(row.status).toLowerCase().includes(state))).length);
const totalSize = computed(() => sum('size'));
const downloadSpeed = computed(() => sum('download_speed'));
const uploadSpeed = computed(() => sum('upload_speed'));
const connectedClients = computed(() => visibleClients.value.filter((client: any) => client.enabled && !clientError(client)).length);

function sum(key: string): number { return torrents.value.reduce((total: number, row: any) => total + Number(row[key] || 0), 0); }
function rowsFor(client: any): any[] { return torrentRows.value.filter((row: any) => String(row.client_id) === String(client.id)); }
function clientError(client: any): string { return props.torrents.find((row: any) => String(row.client_id) === String(client.id) && row.client_error)?.client_error || ''; }
function clientStats(client: any) {
  const rows = rowsFor(client);
  const state = (value: any) => String(value.status || '').toLowerCase();
  return {
    total: rows.length,
    active: rows.filter((row: any) => Number(row.download_speed) > 0 || Number(row.upload_speed) > 0).length,
    downloading: rows.filter((row: any) => state(row).includes('down')).length,
    downloadSpeed: rows.reduce((total: number, row: any) => total + Number(row.download_speed || 0), 0),
    uploadSpeed: rows.reduce((total: number, row: any) => total + Number(row.upload_speed || 0), 0),
    ratio: rows.length ? rows.reduce((total: number, row: any) => total + Number(row.ratio || 0), 0) / rows.length : 0,
    totalSize: rows.reduce((total: number, row: any) => total + Number(row.size || 0), 0),
  };
}
function clientState(client: any): { label: string; className: string } {
  if (!client.enabled) return { label: 'Inactif', className: 'off' };
  if (clientError(client)) return { label: 'Hors ligne', className: 'error' };
  return { label: 'Connecté', className: 'ok' };
}
function clientLabel(client: any): string { return client.client_type === 'qbittorrent' ? 'qBittorrent' : client.client_type === 'transmission' ? 'Transmission' : client.client_type; }
function formatHost(url: string): string { try { return new URL(url).host; } catch { return url || '—'; } }
function formatBytes(value: number): string { if (!value) return '0 o'; const units = ['o', 'Ko', 'Mo', 'Go', 'To']; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / (1024 ** index)).toFixed(index > 1 ? 2 : 0)} ${units[index]}`; }
function formatSpeed(value: number): string { return `${formatBytes(value)}/s`; }
function formatRatio(value: number): string { return Number(value || 0).toFixed(2); }
function trackerName(value: string): string { try { return new URL(value).host; } catch { return value; } }
const trackerRows = computed(() => {
  const grouped = new Map<string, { name: string; count: number; size: number; downloadSpeed: number; uploadSpeed: number; ratioSum: number }>();
  torrents.value.forEach((torrent: any) => String(torrent.trackers || torrent.tracker || '').split(',').map((value: string) => value.trim()).filter(Boolean).forEach((tracker: string) => {
    const name = trackerName(tracker); const entry = grouped.get(name) || { name, count: 0, size: 0, downloadSpeed: 0, uploadSpeed: 0, ratioSum: 0 };
    entry.count += 1; entry.size += Number(torrent.size || 0); entry.downloadSpeed += Number(torrent.download_speed || 0); entry.uploadSpeed += Number(torrent.upload_speed || 0); entry.ratioSum += Number(torrent.ratio || 0); grouped.set(name, entry);
  }));
  return [...grouped.values()].sort((a, b) => b.size - a.size).slice(0, 12);
});
</script>

<style scoped lang="scss">
.torrent-dashboard {
  display: grid;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}
.client-card, .tracker-panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.client-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
  gap: var(--space-3);
}
.client-card {
  padding: 18px;
  cursor: pointer;
  transition: border-color .15s ease, transform .15s ease;
}
.client-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}
.client-card>header, .client-name, .client-meta, .client-card footer, .tracker-panel>header {
  display: flex;
  align-items: center;
}
.client-card>header, .tracker-panel>header {
  justify-content: space-between;
  gap: var(--space-2);
}
.client-name {
  gap: 7px;
}
.client-name strong {
  font-size: var(--fs-md);
}
.client-name svg {
  width: 14px;
  color: var(--muted);
}
.client-meta {
  gap: 8px;
  margin-top: 7px;
  color: var(--muted);
  font-size: var(--fs-xs);
}
.client-meta span+span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.state {
  border-radius: var(--radius-pill);
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 700;
}
.state.ok {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
}
.state.off {
  color: var(--muted);
  background: var(--surface-2);
}
.state.error {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}
.client-counts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 20px 0;
  gap: 8px;
  text-align: center;
}
.client-counts div {
  display: grid;
  gap: 4px;
}
.client-counts strong {
  font-size: var(--fs-lg);
}
.client-counts span {
  font-size: 11px;
  color: var(--muted);
}
.client-warning {
  display: flex;
  gap: 7px;
  margin: 0 0 10px;
  color: var(--warning);
  font-size: var(--fs-xs);
}
.client-warning svg {
  width: 15px;
  flex: 0 0 auto;
}
.client-card dl {
  display: grid;
  gap: 8px;
  margin: 0;
}
.client-card dl div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: var(--fs-xs);
}
.client-card dt {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
}
.client-card dt svg {
  width: 14px;
}
.client-card dd {
  margin: 0;
  font-weight: 700;
}
.client-card footer {
  justify-content: flex-end;
  gap: 3px;
  margin-top: 16px;
  color: var(--accent);
  font-size: var(--fs-xs);
  font-weight: 700;
}
.client-card footer svg {
  width: 15px;
}
.tracker-panel {
  overflow: hidden;
}
.tracker-panel>header {
  padding: 15px 18px;
  border-bottom: 1px solid var(--border);
}
.tracker-panel h3 {
  margin: 0;
  font-size: var(--fs-sm);
}
.tracker-panel header span {
  color: var(--muted);
  font-size: var(--fs-xs);
}
.tracker-scroll {
  overflow-x: auto;
}
.tracker-panel table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-xs);
}
.tracker-panel th, .tracker-panel td {
  padding: 12px 18px;
  text-align: right;
  border-bottom: 1px solid var(--border);
}
.tracker-panel th:first-child, .tracker-panel td:first-child {
  text-align: left;
}
.tracker-panel th {
  color: var(--muted);
  font-weight: 600;
}
.tracker-panel td {
  font-weight: 600;
}
.tracker-panel tbody tr:last-child td {
  border: 0;
}
@media (max-width: 520px) {
  .client-grid {
    grid-template-columns: 1fr;
  }
  .tracker-panel th, .tracker-panel td {
    padding: 11px 12px;
  }
}
</style>
