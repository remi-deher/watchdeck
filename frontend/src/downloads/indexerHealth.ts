import { formatDateTime } from '@/utils/format';
import type { MonitorAttentionItem, MonitorKpi } from '@/components/templates/monitor/types';

/** Un indexeur Prowlarr et ses mesures sur la periode (voir `/api/prowlarr/<id>/indexer-health`). */
export interface IndexerRow {
  id: number;
  name: string;
  protocol?: string;
  privacy?: string;
  state: 'ok' | 'degraded' | 'failing' | 'disabled';
  disabled_till?: string | null;
  queries: number;
  failure_rate: number | null;
  grabs: number;
  failed_grabs: number;
  average_response_ms: number | null;
}

/** La ou se reglent les indexeurs (page des clients et indexeurs d'Acquisition). */
const WHERE_TO_FIX = '/settings/acquisition';

export function indexerStateLabel(row: IndexerRow): string {
  if (row.state === 'failing') return row.disabled_till ? `En pause jusqu'au ${formatDateTime(row.disabled_till)}` : 'En panne';
  return { degraded: 'Dégradé', ok: 'Opérationnel', disabled: 'Désactivé' }[row.state];
}

export function indexerStateTone(state: IndexerRow['state']): string {
  return { failing: 'danger', degraded: 'warning', ok: 'success', disabled: 'neutral' }[state];
}

/** Indicateurs et points d'attention (gabarit Surveiller) : seuls les indexeurs en difficulte comptent. */
export function buildIndexerHealth(rows: IndexerRow[], days: number): { kpis: MonitorKpi[]; items: MonitorAttentionItem[] } {
  const failing = rows.filter((row) => row.state === 'failing');
  const degraded = rows.filter((row) => row.state === 'degraded');
  const active = rows.filter((row) => row.state !== 'disabled').length;
  const queries = rows.reduce((sum, row) => sum + (row.queries || 0), 0);
  const kpis: MonitorKpi[] = [
    { key: 'active', label: 'Indexeurs actifs', value: String(active), status: `sur ${rows.length}`, tone: active ? 'ok' : 'off', to: WHERE_TO_FIX },
    { key: 'failing', label: 'En panne', value: String(failing.length), status: failing.length ? 'Mis en pause par Prowlarr' : 'Aucun', tone: failing.length ? 'error' : 'ok', to: WHERE_TO_FIX },
    { key: 'degraded', label: 'Dégradés', value: String(degraded.length), status: degraded.length ? '20 % d’échecs ou plus' : 'Aucun', tone: degraded.length ? 'warn' : 'ok', to: WHERE_TO_FIX },
    { key: 'queries', label: 'Requêtes', value: String(queries), status: `sur ${days} jour${days > 1 ? 's' : ''}`, tone: 'info', to: WHERE_TO_FIX },
  ];
  const detail = (row: IndexerRow) => [
    row.failure_rate == null ? '' : `${row.failure_rate} % d’échecs sur ${row.queries} requête${row.queries > 1 ? 's' : ''}`,
    row.average_response_ms == null ? '' : `réponse ${Math.round(row.average_response_ms)} ms`,
  ].filter(Boolean).join(' · ');
  const items: MonitorAttentionItem[] = [
    ...failing.map((row): MonitorAttentionItem => ({
      key: `failing-${row.id}`, severity: 'error', area: 'indexer', title: `${row.name} est en panne`,
      detail: [indexerStateLabel(row), detail(row)].filter(Boolean).join(' — '),
      action: { label: 'Voir les indexeurs', to: WHERE_TO_FIX },
    })),
    ...degraded.map((row): MonitorAttentionItem => ({
      key: `degraded-${row.id}`, severity: 'warn', area: 'indexer', title: `${row.name} répond mal`,
      detail: detail(row), action: { label: 'Voir les indexeurs', to: WHERE_TO_FIX },
    })),
  ];
  return { kpis, items };
}
