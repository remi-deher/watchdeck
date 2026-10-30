/* Ce que la vue « Stockages » confie au gabarit « Gérer » : ses colonnes et ses actions,
 * décrites en données. Les clés d'action sont décodées par la page. */
import { Cable, Database, GitCompareArrows, PlugZap, Plus, RefreshCw, Settings } from '@lucide/vue';
import type { ControlAction } from '@/components/ui/ControlTable.vue';
import type { UiColumn } from '@/components/ui/UiDataTable.vue';

export const LOCATION_COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Stockage', card: 'title', sortable: true, sortValue: (row: any) => String(row.name || '').toLocaleLowerCase('fr') },
  { key: 'capacity', label: 'Capacité disponible', sortable: true, sortValue: (row: any) => row.free_bytes ?? -1 },
  { key: 'access', label: 'Connexion / accès' },
];

export const LOCATION_ROW_ACTIONS = (): ControlAction[] => [
  { key: 'configure', label: 'Configurer', icon: Settings },
  { key: 'refresh', label: 'Contrôler la capacité', icon: RefreshCw },
];

export const LOCATION_GLOBAL_ACTIONS: ControlAction[] = [
  { key: 'refresh', label: 'Actualiser les capacités', icon: RefreshCw },
  { key: 'mappings', label: 'Correspondances Arr ↔ Plex', icon: GitCompareArrows },
  { key: 'connections', label: 'Gérer les connexions', icon: Cable },
  { key: 'inventory', label: 'Consulter l’inventaire', icon: Database },
];

export const LOCATION_BULK_ACTIONS: ControlAction[] = [
  { key: 'refresh', label: 'Actualiser la capacité', icon: RefreshCw },
];

export const CONNECTION_COLUMNS: UiColumn[] = [
  { key: 'name', label: 'Connexion', card: 'title', sortable: true, sortValue: (row: any) => String(row.name || '').toLocaleLowerCase('fr') },
  { key: 'method', label: 'Méthode' },
  { key: 'state', label: 'État' },
];

/** Configurer, et pour un serveur SSH dont l'identite n'est pas confirmee, la confirmer. */
export const CONNECTION_ROW_ACTIONS = (row: any): ControlAction[] => [
  { key: 'configure', label: 'Configurer', icon: Settings },
  ...(row.method === 'ssh' && !row.trusted ? [{ key: 'trust', label: 'Confirmer le serveur SSH', icon: PlugZap, tone: 'primary' as const }] : []),
];

export const CONNECTION_GLOBAL_ACTIONS: ControlAction[] = [{ key: 'add', label: 'Ajouter une connexion', icon: Plus, tone: 'primary' }];

export const bytesLabel = (n: number | null | undefined): string => n == null ? '—' : `${(n / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;

/** Les connexions par lesquelles les dossiers associes a un stockage sont atteints. */
export function connectionNames(location: any, accesses: any[], connections: any[]): string {
  const names = new Set<string>();
  for (const mapping of location.mappings || []) {
    for (const access of accesses) {
      if (!access.roots?.some((r: any) => r.arr_instance_id === mapping.arr_instance_id && r.arr_root === mapping.arr_root)) continue;
      const connection = connections.find((c) => c.id === access.connection_id);
      names.add(connection ? `${connection.name} · ${connection.method === 'ssh' ? 'SSH' : 'Local'}` : access.name);
    }
  }
  return [...names].join(' · ') || 'Aucune connexion';
}
