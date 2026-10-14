import { formatDateTimeSeconds, parseApiDate } from '@/utils/format';
import type { UnderstandDetail, UnderstandEvent, UnderstandOutcome } from '@/components/templates/UnderstandTemplate.vue';

/* Journaux : lecture des quatre sources (demandes, application, taches, audit) comme des
   evenements du gabarit Comprendre. Chaque source a ses propres champs ; ici on ne fait que
   les traduire. */

export type LogType = 'diagnostic' | 'app' | 'polls' | 'audit';
export const LOG_TYPES: Array<{ key: LogType; label: string }> = [
  { key: 'diagnostic', label: 'Demandes' },
  { key: 'app', label: 'Application' },
  { key: 'polls', label: 'Tâches' },
  { key: 'audit', label: 'Audit admin' },
];

const CATEGORY_LABELS: Record<string, string> = { request: 'Demande', arr: 'Arr', plex: 'Plex', vf_vo: 'VF / VO', notification: 'Notification' };
/* Les statuts arrivent tels quels de la base et s'affichaient en anglais dans une interface francaise. */
const STATUS_LABELS: Record<string, string> = {
  success: 'Succès', ok: 'Succès', error: 'Échec', failed: 'Échec', warning: 'Avertissement',
  pending: 'En attente', skipped: 'Ignoré', ignored: 'Ignoré', started: 'Démarré', info: 'Information',
};

const rawDate = (row: any): string | undefined => row.created_at || row.time || row.started_at;
export function timeOf(row: any): number { const value = rawDate(row); return value ? parseApiDate(String(value)).getTime() || 0 : 0; }
const isoOf = (row: any): string => { const value = rawDate(row); return value ? String(value).replace(' ', 'T') : ''; };
export const dateOf = (row: any): string => formatDateTimeSeconds(isoOf(row) || undefined);
export const keyOf = (type: LogType, row: any): string => `${type}-${row.id || row.time || row.created_at}-${row.message || row.action || row.job}`;

export function typeOf(type: LogType, row: any): string {
  if (type === 'diagnostic') return CATEGORY_LABELS[row.category] || row.category || '-';
  return row.level || row.job || row.action || row.event_label || row.event || '-';
}
/* « Demande #– » s'affichait sur toute ligne sans titre : on ne nomme une demande que lorsqu'il y en a une. */
export function titleOf(type: LogType, row: any): string {
  if (type === 'diagnostic') return row.title || (row.request_id ? `Demande #${row.request_id}` : (row.action || row.message || 'Évènement'));
  return row.message || row.summary || row.media_title || (row.req_id ? `Demande #${row.req_id}` : 'Évènement');
}
export function detailOf(type: LogType, row: any): string {
  if (type === 'diagnostic') return [row.action, row.message].filter(Boolean).join(' — ');
  if (type === 'app') return row.logger || '';
  if (type === 'polls') return row.error_detail || `${row.items_processed || 0} élément(s) traité(s)`;
  return row.actor_name || '';
}
export function resultOf(type: LogType, row: any): string {
  if (type === 'diagnostic') return STATUS_LABELS[String(row.status || '').toLowerCase()] || row.status || '—';
  if (type === 'polls') return row.errors ? `${row.errors} erreur(s)` : `${row.duration_ms || 0} ms`;
  if (type === 'audit') return `${row.target_count || 0} cible(s)`;
  return row.level || (row.valid === false ? 'Invalide' : 'Information');
}
export function outcomeOf(type: LogType, row: any): UnderstandOutcome {
  if (row.status === 'error' || row.level === 'ERROR' || row.level === 'CRITICAL' || row.errors || row.valid === false) return 'failed';
  if (row.status === 'warning' || row.status === 'ignored' || row.level === 'WARNING') return 'warning';
  if (type === 'app' && (!row.level || row.level === 'INFO')) return 'info';
  return 'success';
}
function payloadOf(type: LogType, row: any): string {
  if (type !== 'diagnostic' || !row.details) return '';
  try { return JSON.stringify(row.details, null, 2); } catch { return String(row.details); }
}

export function toEvent(type: LogType, row: any): UnderstandEvent {
  const detail = detailOf(type, row);
  const source = typeOf(type, row);
  return {
    key: keyOf(type, row),
    at: isoOf(row),
    outcome: outcomeOf(type, row),
    title: titleOf(type, row),
    detail: detail ? `${source} · ${detail}` : source,
    context: resultOf(type, row),
  };
}

export function toDetail(type: LogType, row: any): UnderstandDetail {
  const outcome = outcomeOf(type, row);
  const requestId = row.request_id || row.req_id;
  return {
    title: titleOf(type, row),
    subtitle: `${dateOf(row)} · ${typeOf(type, row)}`,
    outcome,
    cause: detailOf(type, row) || undefined,
    tags: [resultOf(type, row)],
    payload: payloadOf(type, row) || undefined,
    links: requestId ? [{ label: `Ouvrir la demande #${requestId}`, to: `/library/media/request/${requestId}` }] : undefined,
  };
}
