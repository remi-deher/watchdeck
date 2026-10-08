/* État réel des clients de téléchargement (`GET /api/download-clients/status`) : une
 * requête partagée par le verdict et les lignes, que « Tout tester » relance. */
import { computed } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import type { RowState } from './connectionsStatus';

export interface ClientLine {
  id: number;
  name: string;
  client_type: string;
  state: 'ok' | 'error' | 'off';
  message?: string;
  response_ms?: number | null;
  downloading?: number;
  seeding?: number;
}

export interface ClientsPayload {
  checked_at: string | null;
  items: ClientLine[];
}

export const CLIENTS_STATUS_KEY = ['settings', 'download-clients', 'status'] as const;

/** Ce que la ligne d'un client affiche : sa réponse, ou la cause de l'échec. */
export function clientRow(line: ClientLine | undefined): RowState {
  if (!line) return { status: 'neutral', text: '', detail: '' };
  if (line.state === 'off') return { status: 'inactive', text: 'Désactivé', detail: '' };
  if (line.state === 'error') return { status: 'error', text: 'Erreur', detail: line.message || 'Connexion impossible' };
  const counts = typeof line.downloading === 'number'
    ? `${line.downloading} en téléchargement, ${line.seeding ?? 0} en partage`
    : '';
  return { status: 'active', text: 'Opérationnel', detail: [line.message, counts].filter(Boolean).join(' · ') };
}

export function useClientsStatus() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: CLIENTS_STATUS_KEY,
    queryFn: ({ signal }) => api<ClientsPayload>('/api/download-clients/status', { signal }),
    staleTime: 30_000,
  });
  const items = computed<ClientLine[]>(() => query.data.value?.items || []);
  async function refreshAll(): Promise<void> {
    queryClient.setQueryData(CLIENTS_STATUS_KEY, await api<ClientsPayload>('/api/download-clients/status?refresh=true'));
  }
  return {
    items,
    rowFor: (id: number) => clientRow(items.value.find((line) => line.id === id)),
    checkedAt: computed(() => query.data.value?.checked_at || null),
    loading: computed(() => query.isPending.value),
    failed: computed(() => query.isError.value),
    refreshAll,
  };
}
