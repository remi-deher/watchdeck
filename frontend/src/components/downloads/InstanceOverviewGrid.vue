<template>
  <section class="instance-overview-section" aria-label="Instances configurées">
    <div v-if="mediaInstances.length" class="instance-family">
      <h2><Library /> Gestionnaires de médias</h2>
      <div class="instance-grid">
        <article v-for="inst in mediaInstances" :key="`arr-${inst.id}`" class="instance-card" :class="{ disabled: !inst.enabled }" @click="filterByArr(inst)">
          <header class="instance-header">
            <div class="instance-identity">
              <span class="icon-avatar" :class="inst.arr_type"><Film v-if="inst.arr_type === 'radarr'" /><Tv v-else /></span>
              <div class="instance-title-wrap"><span class="type-label" :class="inst.arr_type">{{ inst.arr_type }}</span><div class="title-line"><strong>{{ inst.name }}</strong><ExternalLink /></div><small>{{ formatHost(inst.url) }}</small></div>
            </div>
            <div class="badges-row"><span v-if="inst.is_default" class="badge default-badge">Défaut</span><span class="connection-state" :class="inst.enabled ? 'ok' : 'off'">{{ inst.enabled ? 'Connecté' : 'Inactif' }}</span></div>
          </header>
          <div class="instance-stats">
            <div class="stat-item"><strong class="stat-value">{{ getArrRows(inst).length }}</strong><span class="stat-label">Dans la file</span></div>
            <div class="stat-item"><strong class="stat-value">{{ getArrActiveCount(inst) }}</strong><span class="stat-label">En cours</span></div>
            <div class="stat-item"><strong class="stat-value" :class="{ danger: getArrIssueCount(inst) }">{{ getArrIssueCount(inst) }}</strong><span class="stat-label">À traiter</span></div>
          </div>
          <div class="detail-list"><span><Download /> Téléchargements <strong>{{ getArrActiveCount(inst) }}</strong></span><span><Clock3 /> En attente <strong>{{ getArrWaitingCount(inst) }}</strong></span><span :class="{ danger: getWantedCount(inst) }"><AlertTriangle /> Éléments manquants <strong>{{ getWantedCount(inst) }}</strong></span><span :class="{ danger: getArrIssueCount(inst) }"><AlertTriangle /> À traiter <strong>{{ getArrIssueCount(inst) }}</strong></span></div>
          <footer class="instance-footer"><span class="action-link">Filtrer l'activité <ArrowRight /></span></footer>
        </article>
      </div>
    </div>

    <div v-if="prowlarrInstances.length" class="instance-family">
      <h2><Search /> Indexeurs</h2>
      <div class="instance-grid">
        <article v-for="inst in prowlarrInstances" :key="`prowlarr-${inst.id}`" class="instance-card prowlarr-card" :class="{ disabled: !inst.enabled, error: getProwlarrStats(inst).connected === false }" @click="openProwlarr">
          <header class="instance-header">
            <div class="instance-identity"><span class="icon-avatar prowlarr"><Search /></span><div class="instance-title-wrap"><span class="type-label prowlarr">Prowlarr</span><div class="title-line"><strong>{{ inst.name }}</strong><ExternalLink /></div><small>{{ formatHost(inst.url) }}<template v-if="getProwlarrStats(inst).version"> · v{{ getProwlarrStats(inst).version }}</template></small></div></div>
            <span class="connection-state" :class="prowlarrConnectionClass(inst)">{{ prowlarrConnectionLabel(inst) }}</span>
          </header>
          <div class="instance-stats"><div class="stat-item"><strong class="stat-value">{{ getProwlarrStats(inst).total ?? '—' }}</strong><span class="stat-label">Indexeurs</span></div><div class="stat-item"><strong class="stat-value">{{ getProwlarrStats(inst).enabled ?? '—' }}</strong><span class="stat-label">Actifs</span></div><div class="stat-item"><strong class="stat-value" :class="{ danger: getProwlarrStats(inst).issues }">{{ getProwlarrStats(inst).issues ?? '—' }}</strong><span class="stat-label">Alertes</span></div></div>
          <div class="detail-list"><span><Search /> Rôle <strong>Recherche & indexation</strong></span><span><Network /> Protocoles <strong>{{ formatProtocols(getProwlarrStats(inst).protocols) }}</strong></span><span :class="{ danger: getProwlarrStats(inst).issues }"><AlertTriangle /> Santé <strong>{{ getProwlarrStats(inst).issues ? `${getProwlarrStats(inst).issues} alerte(s)` : 'Opérationnelle' }}</strong></span></div>
          <footer class="instance-footer"><span class="action-link">Gérer les indexeurs <ArrowRight /></span></footer>
        </article>
      </div>
    </div>

    <div v-if="configuredClients.length" class="instance-family">
      <h2><Server /> Clients de téléchargement</h2>
      <div class="instance-grid">
        <article v-for="client in configuredClients" :key="`client-${client.id}`" class="instance-card client-card" :class="{ disabled: !client.enabled, error: getClientError(client.id) }" @click="filterByClient(client)">
          <header class="instance-header">
            <div class="instance-identity"><span class="icon-avatar client"><Server /></span><div class="instance-title-wrap"><span class="type-label client">{{ clientLabel(client) }}</span><div class="title-line"><strong>{{ client.name }}</strong><ExternalLink /></div><small>{{ formatHost(client.url) }}<template v-if="getClientOverview(client.id).version"> · {{ getClientOverview(client.id).version }}</template></small></div></div>
            <span class="connection-state" :class="getClientBadgeClass(client)">{{ getClientBadgeText(client) }}</span>
          </header>
          <div class="instance-stats"><div class="stat-item"><strong class="stat-value">{{ getClientStats(client.id).downloading }}</strong><span class="stat-label">Téléchargements</span></div><div class="stat-item"><strong class="stat-value">{{ getClientStats(client.id).active }}</strong><span class="stat-label">Actifs</span></div><div class="stat-item"><strong class="stat-value" :class="{ danger: getClientStats(client.id).errors }">{{ getClientStats(client.id).errors }}</strong><span class="stat-label">Erreurs</span></div></div>
          <div class="detail-list"><span><Download /> Descendant <strong>{{ formatSpeed(getClientOverview(client.id).download_speed ?? getClientSpeed(client.id)) }}</strong></span><span><Upload /> Montant <strong>{{ formatSpeed(getClientOverview(client.id).upload_speed ?? getClientUploadSpeed(client.id)) }}</strong></span><span><Gauge /> Ratio <strong>{{ formatRatio(getClientOverview(client.id).ratio ?? getClientStats(client.id).ratio) }}</strong></span><span><Share2 /> En seed <strong>{{ getClientStats(client.id).seeding }}</strong></span><span><HardDrive /> Espace libre <strong>{{ getClientOverview(client.id).free_space ? formatBytes(getClientOverview(client.id).free_space) : '—' }}</strong></span></div>
          <footer class="instance-footer"><span class="action-link">Voir les torrents <ArrowRight /></span></footer>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { AlertTriangle, ArrowRight, Clock3, Download, ExternalLink, Film, Gauge, HardDrive, Library, Network, Search, Server, Share2, Tv, Upload } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    arrInstances?: any[];
    configuredClients?: any[];
    arrQueue?: any[];
    clientQueue?: any[];
    wantedItems?: any[];
    prowlarrStats?: Record<string, any>;
    clientStats?: Record<string, any>;
  }>(),
  {
    arrInstances: () => [],
    configuredClients: () => [],
    arrQueue: () => [],
    clientQueue: () => [],
    wantedItems: () => [],
    prowlarrStats: () => ({}),
    clientStats: () => ({}),
  }
);

const router = useRouter();
const mediaInstances = computed(() => props.arrInstances.filter((inst: any) => ['radarr', 'sonarr'].includes(inst.arr_type)));
const prowlarrInstances = computed(() => props.arrInstances.filter((inst: any) => inst.arr_type === 'prowlarr'));

function getArrActiveCount(instance: any): number {
  return getArrRows(instance).filter((row: any) => ['downloading', 'queued'].includes(String(row.operational_status || row.status || '').toLowerCase())).length;
}

function getArrRows(instance: any): any[] { return props.arrQueue.filter((row: any) => String(row.instance_id) === String(instance.id) || (!row.instance_id && row.instance === instance.name)); }
function getWantedCount(instance: any): number {
  const rows = props.wantedItems.filter((row: any) => String(row.instance_id) === String(instance.id));
  return instance.arr_type === 'sonarr' ? new Set(rows.map((row: any) => row.arr_id)).size : rows.length;
}
function getArrIssueCount(instance: any): number { return getArrRows(instance).filter((row: any) => ['error', 'import_pending', 'unmatched'].includes(String(row.operational_status || row.status || '').toLowerCase())).length; }
function getArrWaitingCount(instance: any): number { return Math.max(0, getArrRows(instance).length - getArrActiveCount(instance) - getArrIssueCount(instance)); }

function getClientTorrents(clientId: string | number): any[] {
  return props.clientQueue.filter((row: any) => String(row.client_id) === String(clientId) && !row.client_error);
}

function getClientTorrentsCount(clientId: string | number): number {
  return getClientTorrents(clientId).length;
}

function getClientError(clientId: string | number): string | undefined {
  return props.clientQueue.find((row: any) => String(row.client_id) === String(clientId) && row.client_error)?.client_error;
}

function getClientSpeed(clientId: string | number): number {
  return getClientTorrents(clientId).reduce((acc: number, row: any) => acc + Number(row.download_speed || 0), 0);
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec) return '0 o/s';
  const units = ['o/s', 'Ko/s', 'Mo/s', 'Go/s'];
  const i = Math.min(Math.floor(Math.log(bytesPerSec) / Math.log(1024)), units.length - 1);
  return `${(bytesPerSec / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
}

function formatHost(url: string): string {
  if (!url) return '—';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `http://${url}`);
    return parsed.host || url;
  } catch {
    return url;
  }
}

function getClientUploadSpeed(clientId: string | number): number {
  return getClientTorrents(clientId).reduce((acc: number, row: any) => acc + Number(row.upload_speed || 0), 0);
}

function getClientStats(clientId: string | number) {
  const torrents = getClientTorrents(clientId);
  const active = torrents.filter((t: any) => (t.download_speed || 0) > 0 || (t.upload_speed || 0) > 0).length;
  const downloading = torrents.filter((t: any) => String(t.status || '').toLowerCase().includes('down')).length;
  const total = torrents.length;
  const size = torrents.reduce((acc: number, row: any) => acc + Number(row.size || 0), 0);
  const seeding = torrents.filter((t: any) => ['seeding', 'uploading', 'stalledup', 'forcedup'].some(state => String(t.status || t.state || '').toLowerCase().includes(state))).length;
  const errors = torrents.filter((t: any) => ['error', 'missingfiles', 'stalleddl'].some(state => String(t.status || t.state || '').toLowerCase().includes(state))).length;
  const ratios = torrents.map((t: any) => Number(t.ratio || 0)).filter(Number.isFinite);
  const ratio = ratios.length ? ratios.reduce((sum: number, value: number) => sum + value, 0) / ratios.length : 0;
  return { active, downloading, total, size, seeding, errors, ratio };
}

function getClientOverview(clientId: string | number): Record<string, any> { return props.clientStats[clientId] || {}; }
function getProwlarrStats(instance: any): Record<string, any> { return props.prowlarrStats[instance.id] || (instance.enabled ? {} : { connected: false }); }
function formatRatio(value: number): string { return Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatProtocols(protocols: string[]): string { return Array.isArray(protocols) && protocols.length ? protocols.map(value => value.toUpperCase()).join(' · ') : '—'; }
function prowlarrConnectionClass(instance: any): string { return !instance.enabled ? 'off' : getProwlarrStats(instance).connected === false ? 'error-badge' : 'ok'; }
function prowlarrConnectionLabel(instance: any): string { return !instance.enabled ? 'Inactif' : getProwlarrStats(instance).connected === false ? 'Hors ligne' : 'Connecté'; }
function openProwlarr(): void { router.push({ path: '/settings', query: { tab: 'services' } }); }

function getClientBadgeClass(client: any): string {
  if (!client.enabled) return 'disabled-badge';
  if (getClientError(client.id) || getClientOverview(client.id).connected === false) return 'error-badge';
  return 'active';
}

function getClientBadgeText(client: any): string {
  if (!client.enabled) return 'Désactivé';
  if (getClientError(client.id) || getClientOverview(client.id).connected === false) return 'Hors ligne';
  return 'En ligne';
}

function clientLabel(client: any): string { return client.client_type === 'qbittorrent' ? 'qBittorrent' : client.client_type === 'transmission' ? 'Transmission' : client.client_type; }

function filterByArr(inst: any): void {
  router.replace({
    path: '/downloads',
    query: { view: inst.arr_type, instance: inst.id },
  });
}

function filterByClient(client: any): void {
  router.replace({
    path: '/downloads',
    query: { view: 'clients', sub: 'instances', client: client.id },
  });
}
</script>

<style scoped lang="scss">
.instance-overview-section {
  display: grid;
  gap: var(--space-5);
  margin-bottom: var(--space-4);
}

.instance-family { display:grid; gap:var(--space-3); min-width:0; }
.instance-family>h2 { display:flex; align-items:center; gap:8px; margin:0; color:var(--text); font-size:var(--fs-sm); }
.instance-family>h2 svg { width:17px; height:17px; color:var(--accent); }

.instance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-4);
}

.instance-card {
  display: flex;
  flex-direction: column;
  min-height: 290px;
  padding: 22px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.instance-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  box-shadow: var(--shadow-md);
}

.instance-card.disabled {
  opacity: 0.65;
}

.instance-card.error {
  border-color: color-mix(in srgb, var(--danger) 50%, var(--border));
}

.instance-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.instance-identity { display:flex; align-items:flex-start; gap:11px; min-width:0; }
.type-label { display:block; margin-bottom:3px; color:var(--muted); font-size:10px; font-weight:800; letter-spacing:.09em; text-transform:uppercase; }
.type-label.radarr { color:#e5a00d; }.type-label.sonarr { color:#00c49f; }.type-label.prowlarr { color:#8b7cf6; }.type-label.client { color:var(--accent); }

.instance-title-wrap {
  min-width: 0;
}

.title-line { display:flex; align-items:center; gap:7px; }
.title-line svg { width:15px; color:var(--muted); }
.instance-title-wrap small { display:flex; gap:9px; margin-top:7px; }
.instance-title-wrap small span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.icon-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text);
}

.icon-avatar svg {
  width: 18px;
  height: 18px;
}

.icon-avatar.radarr {
  background: color-mix(in srgb, #e5a00d 20%, var(--surface-2));
  color: #e5a00d;
}

.icon-avatar.sonarr {
  background: color-mix(in srgb, #00c49f 20%, var(--surface-2));
  color: #00c49f;
}

.icon-avatar.client {
  background: color-mix(in srgb, var(--accent) 20%, var(--surface-2));
  color: var(--accent);
}

.icon-avatar.prowlarr { background:color-mix(in srgb,#8b7cf6 20%,var(--surface-2)); color:#a99cff; }

.instance-title-wrap strong {
  display: block;
  font-size: var(--fs-sm);
}

.instance-title-wrap small {
  color: var(--muted);
  font-size: var(--fs-xs);
}

.instance-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 28px;
  padding: 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  text-align: center;
}

.stat-label {
  color: var(--muted);
  font-size: var(--fs-xs);
}

.stat-value {
  margin: 0 0 4px;
  font-size: var(--fs-lg);
  font-weight: 700;
}
.stat-value.danger { color: var(--danger); }

.badges-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.default-badge {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}

.detail-list { display:grid; gap:10px; margin-top:28px; }
.detail-list span { display:grid; grid-template-columns:18px minmax(0,1fr) auto; align-items:center; gap:7px; color:var(--muted); font-size:var(--fs-xs); }
.detail-list svg { width:15px; height:15px; }
.detail-list strong { color:var(--text); font-weight:700; }
.detail-list span.danger,.detail-list span.danger strong { color:var(--danger); }

.connection-state { padding:4px 0; font-size:var(--fs-xs); font-weight:700; white-space:nowrap; }
.connection-state.ok,.connection-state.active { color:var(--success); }
.connection-state.off,.connection-state.disabled-badge { color:var(--muted); }
.connection-state.error-badge { color:var(--danger); }

.stat-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: var(--fs-xs);
  font-weight: 600;
}

.stat-status svg {
  width: 13px;
  height: 13px;
}

.stat-status.ok {
  color: var(--success);
}

.stat-status.off {
  color: var(--muted);
}

.instance-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: auto;
  padding-top: 22px;
}

.action-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #f4bd00;
  font-size: var(--fs-xs);
  font-weight: 600;
}

.action-link svg {
  width: 12px;
  height: 12px;
  transition: transform 0.15s ease;
}

.instance-card:hover .action-link svg {
  transform: translateX(3px);
}

.disabled-badge {
  background: var(--surface-2);
  color: var(--muted);
}

.error-badge {
  background: color-mix(in srgb, var(--danger) 15%, transparent);
  color: var(--danger);
}
</style>
