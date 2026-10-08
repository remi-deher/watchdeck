/* État réel des connexions (`GET /api/connections/status`), partagé par toutes les lignes
 * de la zone Connexions : une seule requête, que « Tout tester » relance pour tout le
 * monde. Les lignes n'affichent plus « Configuré » (l'URL est remplie) mais ce que le
 * service a répondu. */
import { computed } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { queryKeys } from '@/queryKeys';
import { formatRelativeDate } from '@/utils/format';

export interface ConnectionLine {
  key: string;
  kind: string;
  name: string;
  state: 'ok' | 'error' | 'off';
  message?: string;
  url?: string;
  response_ms?: number | null;
  version?: string;
  instance_id?: number;
  issue_count?: number;
  sessions?: number;
}

export interface ConnectionsPayload {
  checked_at: string | null;
  items: ConnectionLine[];
}

export interface RowState {
  /** Valeur de `SettingsItem.status`. */
  status: 'active' | 'error' | 'inactive' | 'neutral';
  text: string;
  /** Détail du dernier contrôle : la réponse en cas de succès, la cause en cas d'erreur. */
  detail: string;
}

/** Ce qu'une ligne affiche pour une connexion. Tant que l'état n'est pas connu, rien :
 *  la ligne garde son état de configuration plutôt qu'un « Vérification… » qui dure. */
export function rowState(line: ConnectionLine | undefined): RowState {
  if (!line) return { status: 'neutral', text: '', detail: '' };
  if (line.state === 'off') return { status: 'inactive', text: 'Désactivé', detail: line.message || '' };
  if (line.state === 'error') return { status: 'error', text: 'Erreur', detail: line.message || 'Connexion impossible' };
  const parts = [
    typeof line.response_ms === 'number' ? `Joignable en ${line.response_ms} ms` : 'Joignable',
    line.version ? `version ${line.version}` : '',
    typeof line.sessions === 'number' && line.sessions > 0 ? `${line.sessions} lecture${line.sessions > 1 ? 's' : ''} en cours` : '',
    line.issue_count ? `${line.issue_count} alerte${line.issue_count > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  return { status: 'active', text: 'Opérationnel', detail: parts.join(' · ') };
}

/** Verdict de la zone : les connexions en erreur, et combien répondent sur combien d'actives. */
export function verdictOf(items: ConnectionLine[]) {
  const active = items.filter((item) => item.state !== 'off');
  const errors = active.filter((item) => item.state === 'error');
  return { errors, okCount: active.length - errors.length, activeCount: active.length };
}

export function checkedLabel(checkedAt: string | null | undefined): string {
  return checkedAt ? `vérifié ${formatRelativeDate(checkedAt).toLowerCase()}` : 'jamais vérifié';
}

export function useConnectionsStatus() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.admin.connections,
    queryFn: ({ signal }) => api<ConnectionsPayload>('/api/connections/status', { signal }),
    staleTime: 30_000,
  });
  const items = computed<ConnectionLine[]>(() => query.data.value?.items || []);
  const byKey = (key: string) => items.value.find((item) => item.key === key);

  /** « Tout tester » : relance tous les contrôles côté serveur, sans attendre le cache. */
  async function refreshAll(): Promise<void> {
    const fresh = await api<ConnectionsPayload>('/api/connections/status?refresh=true');
    queryClient.setQueryData(queryKeys.admin.connections, fresh);
  }

  return {
    items,
    byKey,
    rowFor: (key: string) => rowState(byKey(key)),
    checkedAt: computed(() => query.data.value?.checked_at || null),
    loading: computed(() => query.isPending.value),
    failed: computed(() => query.isError.value),
    refreshAll,
  };
}
