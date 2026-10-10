/* La synthèse des clients torrent, pour le gabarit « Surveiller » : des indicateurs de
 * santé, un point d'attention par client hors ligne, une zone par client et la répartition
 * par tracker. Une fonction pure : la page lui donne les clients et leurs torrents. */
import { Server } from '@lucide/vue';
import type { MonitorAttentionItem, MonitorKpi, MonitorZoneGroup } from '@/components/templates/MonitorTemplate.vue';
import { formatPreciseBytes } from '@/utils/format';
import { formatSpeed } from '@/downloads/torrentFormat';

const state = (row: any) => String(row.status || '').toLowerCase();
const sum = (rows: any[], key: string) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const isActive = (row: any) => Number(row.download_speed) > 0 || Number(row.upload_speed) > 0;
const isDownloading = (row: any) => state(row).includes('down');
const isSeeding = (row: any) => ['uploading', 'stalledup', 'forcedup'].some((key) => state(row).includes(key));
const clientError = (torrents: any[], client: any): string => torrents.find((row) => String(row.client_id) === String(client.id) && row.client_error)?.client_error || '';
const link = (clientId?: string | number) => (clientId ? `/downloads?view=clients&sub=instances&client=${clientId}` : '/downloads?view=clients&sub=instances');

export interface TrackerRow { name: string; count: number; size: number; downloadSpeed: number; uploadSpeed: number; ratioSum: number }

function trackerName(value: string): string {
  try { return new URL(value).host; } catch { return value; }
}

export function trackerBreakdown(rows: any[]): TrackerRow[] {
  const grouped = new Map<string, TrackerRow>();
  for (const torrent of rows) {
    for (const tracker of String(torrent.trackers || torrent.tracker || '').split(',').map((value) => value.trim()).filter(Boolean)) {
      const name = trackerName(tracker);
      const entry = grouped.get(name) || { name, count: 0, size: 0, downloadSpeed: 0, uploadSpeed: 0, ratioSum: 0 };
      entry.count += 1;
      entry.size += Number(torrent.size || 0);
      entry.downloadSpeed += Number(torrent.download_speed || 0);
      entry.uploadSpeed += Number(torrent.upload_speed || 0);
      entry.ratioSum += Number(torrent.ratio || 0);
      grouped.set(name, entry);
    }
  }
  return [...grouped.values()].sort((a, b) => b.size - a.size).slice(0, 12);
}

export function torrentOverview(clients: any[], torrents: any[], clientId = '') {
  const visible = clients.filter((client) => !clientId || String(client.id) === String(clientId));
  const rows = torrents.filter((row) => !row.client_error && (!clientId || String(row.client_id) === String(clientId)));
  const enabled = visible.filter((client) => client.enabled);
  const connected = enabled.filter((client) => !clientError(torrents, client));

  const kpis: MonitorKpi[] = [
    { key: 'clients', label: 'Instances', value: `${connected.length}/${enabled.length}`, status: 'instances connectées', tone: connected.length === enabled.length ? 'ok' : 'error', to: link(clientId) },
    { key: 'torrents', label: 'Torrents', value: String(rows.length), status: `${rows.filter(isActive).length} actifs · ${formatPreciseBytes(sum(rows, 'size'))}`, tone: 'info', to: link(clientId) },
    { key: 'down', label: 'Téléchargement', value: formatSpeed(sum(rows, 'download_speed')), status: `${rows.filter(isDownloading).length} en téléchargement`, tone: 'info', to: link(clientId) },
    { key: 'up', label: 'Envoi', value: formatSpeed(sum(rows, 'upload_speed')), status: `${rows.filter(isSeeding).length} en partage`, tone: 'info', to: link(clientId) },
  ];

  const items: MonitorAttentionItem[] = enabled.flatMap((client) => {
    const error = clientError(torrents, client);
    return error ? [{
      key: `client-${client.id}`, severity: 'error' as const, area: 'client', title: `${client.name} est hors ligne`,
      detail: `Données en cache : ${error}`, action: { label: 'Voir les torrents', to: link(client.id) },
    }] : [];
  });

  const zones: MonitorZoneGroup[] = [{
    label: 'Clients',
    items: visible.map((client) => {
      const own = rows.filter((row) => String(row.client_id) === String(client.id));
      const error = clientError(torrents, client);
      return {
        key: String(client.id),
        label: client.name,
        to: { path: '/downloads', query: { view: 'clients', sub: 'instances', client: client.id } },
        icon: Server,
        line: !client.enabled ? 'Inactif' : error ? 'Hors ligne' : `${own.filter(isDownloading).length} en téléchargement · ${own.filter(isActive).length} actifs · ${own.length} torrents`,
        severity: client.enabled && error ? 'error' as const : null,
      };
    }),
  }];

  return { kpis, items, zones, trackers: trackerBreakdown(rows) };
}
