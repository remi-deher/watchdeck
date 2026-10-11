/* La vue d'ensemble d'Acquisition, pour le gabarit « Surveiller » : tout va-t-il bien du
 * côté de ce qui télécharge ? Des indicateurs de santé, un point d'attention par chose à
 * traiter (interventions, client hors ligne, indexeur en défaut, disque presque plein),
 * une zone par gestionnaire, indexeur et client. Une fonction pure : la page lui donne ce
 * qu'elle a lu. */
import { Download as DownloadIcon, Film, Search, Server, Tv } from '@lucide/vue';
import type { MonitorAttentionItem, MonitorKpi, MonitorZone, MonitorZoneGroup } from '@/components/templates/MonitorTemplate.vue';
import type { LiveItem } from '@/components/ui/LiveStrip.vue';
import { queueCounts, queueDetailPath, requiresIntervention } from '@/downloads/queueRules';

/** Au-delà de ce taux d'occupation, un import peut échouer (même seuil que le panneau des disques). */
export const FULL_DISK_RATIO = 0.9;

const QUEUE = '/downloads?view=queue';
const CLIENTS = '/downloads?view=clients&sub=instances';
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count > 1 ? many : one}`;
const usedRatio = (volume: any) => (volume.total_bytes ? (volume.total_bytes - (volume.free_bytes || 0)) / volume.total_bytes : 0);

export interface AcquisitionInput {
  queue: any[];
  arrInstances: any[];
  clients: any[];
  torrents: any[];
  volumes: any[];
  prowlarr: Record<string, any>;
}

/** Les téléchargements qui tournent, en cartes du bandeau commun. */
export function liveItems(queue: any[]): LiveItem[] {
  return queue.filter((row) => row.work?.state === 'running').map((row) => ({
    key: row.work.key,
    work: row.work,
    title: row.title,
    media: row.media,
    poster: row.media ? undefined : row.poster_url,
    backdrop: row.media ? undefined : row.backdrop_url,
    to: queueDetailPath(row),
    who: row.instance || row.download_client,
  }));
}

export function acquisitionOverview({ queue, arrInstances, clients, torrents, volumes, prowlarr }: AcquisitionInput) {
  const counts = queueCounts(queue);
  const interventions = queue.filter(requiresIntervention).length;
  const fullVolumes = volumes.filter((volume) => usedRatio(volume) >= FULL_DISK_RATIO);
  const clientError = (client: any): string => torrents.find((row) => String(row.client_id) === String(client.id) && row.client_error)?.client_error || '';
  const enabledClients = clients.filter((client) => client.enabled);
  const offline = enabledClients.filter(clientError);
  const indexers = arrInstances.filter((instance) => instance.arr_type === 'prowlarr' && instance.enabled);
  const indexerDown = indexers.filter((instance) => prowlarr[instance.id]?.connected === false);

  const total = volumes.reduce((sum, volume) => sum + (volume.total_bytes || 0), 0);
  const free = volumes.reduce((sum, volume) => sum + (volume.free_bytes || 0), 0);
  const storage = total > 0 ? `${Math.round(((total - free) / total) * 100)} %` : '—';

  const kpis: MonitorKpi[] = [
    { key: 'attention', label: 'À traiter', value: String(interventions + offline.length), status: interventions + offline.length ? 'demandent votre action' : 'rien à traiter', tone: interventions + offline.length ? 'error' : 'ok', to: QUEUE },
    { key: 'running', label: 'En cours', value: String(counts.downloading), status: 'transferts actifs', tone: 'info', to: QUEUE },
    { key: 'waiting', label: 'En attente', value: String(counts.queued + counts.paused), status: 'en file ou en pause', tone: 'info', to: QUEUE },
    { key: 'storage', label: 'Stockage', value: fullVolumes.length ? String(fullVolumes.length) : storage, status: fullVolumes.length ? plural(fullVolumes.length, 'disque presque plein', 'disques presque pleins') : 'capacité utilisée', tone: fullVolumes.length ? 'warn' : total ? 'ok' : 'off', to: '/storage' },
  ];

  const items: MonitorAttentionItem[] = [
    ...(interventions ? [{
      key: 'interventions', severity: 'error' as const, area: 'queue',
      title: `${plural(interventions, 'téléchargement demande', 'téléchargements demandent')} une intervention`,
      detail: 'Imports bloqués, médias à associer ou erreurs de téléchargement.',
      action: { label: 'Ouvrir la file', to: QUEUE },
    }] : []),
    ...offline.map((client) => ({
      key: `client-${client.id}`, severity: 'error' as const, area: 'client',
      title: `${client.name} est hors ligne`, detail: `Données en cache : ${clientError(client)}`,
      action: { label: 'Voir les torrents', to: `${CLIENTS}&client=${client.id}` },
    })),
    ...indexerDown.map((instance) => ({
      key: `indexer-${instance.id}`, severity: 'warn' as const, area: 'indexer',
      title: `${instance.name} ne répond pas`, detail: 'Les recherches de releases ne passent plus par cet indexeur.',
      action: { label: 'Voir la connexion', to: '/settings/services/media' },
    })),
    ...fullVolumes.map((volume) => ({
      key: `disk-${volume.path}`, severity: 'warn' as const, area: 'storage',
      title: `${volume.path} est presque plein`, detail: `${Math.round(usedRatio(volume) * 100)} % utilisé : un import peut échouer.`,
      action: { label: 'Voir le stockage', to: '/storage' },
    })),
  ];

  const managers: MonitorZone[] = arrInstances.filter((instance) => ['radarr', 'sonarr'].includes(instance.arr_type)).map((instance) => {
    const own = queue.filter((row) => String(row.instance_id) === String(instance.id));
    const stuck = own.filter(requiresIntervention).length;
    return {
      key: `arr-${instance.id}`,
      label: instance.name,
      to: QUEUE,
      icon: instance.arr_type === 'radarr' ? Film : Tv,
      line: !instance.enabled ? 'Inactif' : `${plural(own.length, 'téléchargement')}${stuck ? ` · ${stuck} à traiter` : ''}`,
      severity: instance.enabled && stuck ? 'error' as const : null,
    };
  });
  const indexerZones: MonitorZone[] = indexers.map((instance) => {
    const stats = prowlarr[instance.id] || {};
    const down = stats.connected === false;
    return {
      key: `prowlarr-${instance.id}`,
      label: instance.name,
      to: '/settings/services/media',
      icon: Search,
      line: down ? 'Ne répond pas' : stats.total != null ? `${stats.enabled ?? 0}/${stats.total} indexeurs actifs${stats.issues ? ` · ${stats.issues} alertes` : ''}` : 'Indexeur',
      severity: down ? 'error' as const : stats.issues ? 'warn' as const : null,
    };
  });
  const clientZones: MonitorZone[] = clients.map((client) => {
    const error = clientError(client);
    const own = torrents.filter((row) => String(row.client_id) === String(client.id) && !row.client_error);
    return {
      key: `client-${client.id}`,
      label: client.name,
      to: { path: '/downloads', query: { view: 'clients', sub: 'instances', client: client.id } },
      icon: Server,
      line: !client.enabled ? 'Inactif' : error ? 'Hors ligne' : plural(own.length, 'torrent'),
      severity: client.enabled && error ? 'error' as const : null,
    };
  });
  const zones: MonitorZoneGroup[] = [
    { label: 'Radarr et Sonarr', items: managers },
    { label: 'Indexeurs', items: indexerZones },
    { label: 'Clients de téléchargement', items: clientZones },
  ].filter((group) => group.items.length);

  return { kpis, items, zones, live: liveItems(queue), icons: { queue: DownloadIcon, client: Server, indexer: Search, storage: Server } };
}
