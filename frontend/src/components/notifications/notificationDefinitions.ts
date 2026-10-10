/* Ce que la page Notifications confie aux gabarits : la file d'attente (« Gérer ») et le
 * journal (« Comprendre »), décrits en données. Les clés d'action (`send`, `handled`,
 * `delete`, `all:delete`) sont décodées par `useNotificationQueue`. */
import { CheckCheck, Send, Trash2 } from '@lucide/vue';
import type { ControlAction } from '@/components/ui/ControlTable.vue';
import type { UiColumn } from '@/components/ui/UiDataTable.vue';

export interface NotificationRow {
  id: number | string;
  event?: string;
  event_label?: string;
  sent_at?: string;
  created_at?: string;
  media_title?: string;
  recipient?: string;
  recipients?: string[];
  success?: boolean;
  valid?: boolean;
  error_msg?: string;
  scope?: string;
  season_number?: number;
  episode_number?: number;
  language?: string;
  is_upgrade?: boolean;
  context?: Record<string, any>;
  event_description?: string;
}

const SCOPE_LABELS: Record<string, string> = {
  episode: 'Épisode',
  season_start: 'Début de saison',
  season_complete: 'Saison complète',
  series_complete: 'Série complète',
  movie: 'Film',
  series_batch: 'Plusieurs épisodes',
};

/** Ce qui précise l'événement : épisode, portée, langue, amélioration. */
export function notificationContext(row: NotificationRow): string {
  const scope = row.scope, season = row.season_number, episode = row.episode_number;
  const parts: string[] = [];
  if (scope === 'episode' && season && episode) parts.push(`S${season}E${episode}`);
  else if (scope && (season || scope !== 'movie')) {
    // Une portée sans libellé connu reste interne : on ne montre pas sa clé brute.
    const label = SCOPE_LABELS[scope];
    if (label) parts.push(season ? `${label} ${season}` : label);
  }
  if (row.language) parts.push(row.language.toUpperCase());
  if (row.is_upgrade) parts.push('amélioration');
  if (parts.length) return parts.join(' · ');
  const c = row.context || {};
  return [c.scope, c.language, c.is_upgrade ? 'amélioration' : ''].filter(Boolean).join(' - ') || row.event_description || '';
}

export const notificationRecipients = (row: NotificationRow): string => row.recipient || (row.recipients || []).join(', ') || '';
export const notificationName = (row: NotificationRow): string => row.event_label || row.event || 'la notification';
export const notificationFailed = (row: NotificationRow): boolean => row.success === false || row.valid === false;

/* Journal : l'état filtre la liste (au-dessus d'elle), le type et l'utilisateur sont dans les filtres. */
export const HISTORY_OUTCOMES = [
  { value: 'all', label: 'Tout' },
  { value: 'success', label: 'Envoyées' },
  { value: 'error', label: 'Erreurs' },
];
export const NOTIFICATION_TYPES = [
  { value: 'request', label: 'Demandes' },
  { value: 'available', label: 'Disponibilités' },
  { value: 'upgrade', label: 'Améliorations (VF)' },
  { value: 'correction', label: 'Corrections' },
  { value: 'failed', label: 'Erreurs système' },
];

export const DELIVERY_STATE_LABELS: Record<string, string> = {
  prepared: 'Préparé',
  sending: 'En cours / à vérifier',
  sent: 'Accepté par le fournisseur',
  uncertain: 'Sans confirmation — à vérifier',
  cancelled: 'Annulé',
  obsolete: 'Devenu inutile',
  failed: 'Refusé',
};
export const DELIVERY_COLUMNS: UiColumn[] = [
  { key: 'request', label: 'Demande', card: 'title' },
  { key: 'event', label: 'Événement' },
  { key: 'recipient', label: 'Destinataire' },
  { key: 'state', label: 'État' },
  { key: 'send_key', label: "Clé d'envoi" },
];

/** File d'attente : la lecture, puis les actions (l'historique garde son ordre serveur). */
export const PENDING_COLUMNS: UiColumn<NotificationRow>[] = [
  { key: 'date', label: 'Date', sortable: true, sortValue: (row) => String(row.created_at || '') },
  { key: 'event', label: 'Événement', card: 'title', sortable: true, sortValue: (row) => notificationName(row).toLocaleLowerCase('fr') },
  { key: 'media', label: 'Média', sortable: true, sortValue: (row) => String(row.media_title || '') },
  { key: 'recipients', label: 'Destinataires', sortable: true, sortValue: notificationRecipients },
  { key: 'state', label: 'État', sortable: true, sortValue: (row) => (notificationFailed(row) ? 0 : 1) },
];

/* Une confirmation qui dit sur quoi elle porte : une notification nommée, un nombre, ou toute la file. */
const subject = (rows: NotificationRow[]) => (rows.length === 1
  ? `« ${rows[0].media_title || notificationName(rows[0])} »`
  : `${rows.length ? rows.length : 'Toute la file'} notification(s)`);
const confirmHandled = (rows: NotificationRow[]) => ({
  title: rows.length === 1 ? 'Marquer cette notification comme traitée ?' : 'Marquer les notifications comme traitées ?',
  message: `${subject(rows)} ${rows.length === 1 ? 'sera marquée comme traitée sans être envoyée' : 'seront marquée(s) comme traitée(s) sans être envoyée(s)'}.`,
  confirmLabel: rows.length === 1 ? 'Marquer comme traitée' : 'Marquer comme traitées',
  danger: false,
});
const confirmDelete = (rows: NotificationRow[]) => ({
  title: rows.length === 1 ? 'Supprimer cette notification ?' : 'Supprimer les notifications ?',
  message: `${subject(rows)} ${rows.length === 1 ? 'sera supprimée' : 'seront supprimée(s)'} définitivement de la file.`,
  confirmLabel: 'Supprimer',
  danger: true,
});

const send: ControlAction<NotificationRow> = { key: 'send', label: 'Envoyer', icon: Send, tone: 'primary', title: 'Envoyer maintenant' };
const handled: ControlAction<NotificationRow> = { key: 'handled', label: 'Marquer comme traitée', icon: CheckCheck, title: 'Marquer comme traitée (sans envoyer)', confirm: confirmHandled };
const remove: ControlAction<NotificationRow> = { key: 'delete', label: 'Supprimer', icon: Trash2, tone: 'danger', confirm: confirmDelete };

export const PENDING_BULK_ACTIONS: ControlAction<NotificationRow>[] = [send, { ...handled, label: 'Marquer comme traitées' }, remove];
/** Sans sélection : agir sur toute la file. */
export const PENDING_GLOBAL_ACTIONS: ControlAction<NotificationRow>[] = [
  { key: 'all', label: 'Vider la file', icon: Trash2, items: [
    { key: 'all:handled', label: 'Tout marquer comme traité', icon: CheckCheck, confirm: confirmHandled },
    { key: 'all:delete', label: 'Tout supprimer', icon: Trash2, tone: 'danger', confirm: confirmDelete },
  ] },
];
/** Une notification en file : envoyer, la marquer traitée (sans envoyer), la supprimer. */
export const pendingRowActions = (): ControlAction<NotificationRow>[] => [send, handled, remove];
