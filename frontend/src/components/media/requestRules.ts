import { format, formatDistanceStrict } from 'date-fns';
import { fr } from 'date-fns/locale';
import { parseApiDate } from '@/utils/format';

/**
 * État de notification d'un co-demandeur pour l'évènement courant.
 * @returns `true` notifié, `false` pas encore, `null` rien à notifier.
 */
export function notifiedStatus(row: any, uid: string | number): boolean | null {
  const notified = row.requester_notifications?.[uid];
  if (!notified) return null;
  return row.status === 'available' ? notified.available : notified.request;
}

/** Au moins un co-demandeur attend encore sa notification. */
export function hasUnnotified(row: any): boolean {
  return (row.requester_ids || []).some((uid: string | number) => notifiedStatus(row, uid) === false);
}

/**
 * La demande peut-elle être clôturée manuellement ?
 * Une demande déjà disponible reste clôturable tant qu'elle est suivie pour une
 * amélioration VF — c'est justement la clôture qui arrête ce suivi.
 */
export function canClose(row: any): boolean {
  return row.status !== 'available' || (row.has_vf !== true && !row.vf_tracking_disabled);
}

/** « 3/8 complètes » — avancement par saison d'une série. */
export function seasonsSummary(seasons: any[]): string {
  const available = seasons.filter((season) => season.status === 'available').length;
  return `${available}/${seasons.length} complètes`;
}

export type MailState = 'sent' | 'pending' | 'none';

/**
 * Où en est un demandeur pour un mail donné : `sent` reçu, `pending` pas encore
 * reçu alors que l'étape est franchie, `none` rien à recevoir (étape pas atteinte ou
 * aucune adresse connue).
 */
export function mailState(row: any, uid: string | number, event: 'request' | 'available'): MailState {
  if (event === 'available' && !['available', 'partially_available'].includes(row.status)) return 'none';
  // Un média ajouté directement dans *ARR ou déjà présent dans Plex n'a jamais de mail
  // « demande » : l'afficher « en attente » laisserait croire qu'il va partir.
  if (event === 'request' && row.origin_kind && row.origin_kind !== 'request') return 'none';
  const value = row.requester_notifications?.[uid]?.[event];
  if (value === true) return 'sent';
  // Co-demandeur ajouté une fois le média disponible : le mail « demande » n'a plus
  // de sens, seul celui de disponibilité reste à envoyer.
  if (value === false && event === 'request' && isAvailable(row)) return 'none';
  if (value === false) return 'pending';
  return 'none';
}

// ---------------------------------------------------------------------------
// Onglet « Demandes » : parcours, alertes et journal
// ---------------------------------------------------------------------------

/** Radarr pour un film, Sonarr pour une série. */
export function arrName(row: any): string {
  return row?.media_type === 'show' ? 'Sonarr' : 'Radarr';
}

const AVAILABLE_STATUSES = ['available', 'partially_available'];
const isAvailable = (row: any): boolean => row?.journey ? row.journey.availability.plex === 'present' : AVAILABLE_STATUSES.includes(row?.status);

/** « 20 sept. 10:02 », avec l'année quand elle diffère de l'année en cours. */
export function shortDateTime(value?: string | null, now: Date = new Date()): string {
  if (!value) return '';
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const pattern = date.getFullYear() === now.getFullYear() ? 'd MMM HH:mm' : 'd MMM yyyy HH:mm';
  return format(date, pattern, { locale: fr });
}

/** « 20 sept. » (année ajoutée si elle diffère). */
export function shortDate(value?: string | null, now: Date = new Date()): string {
  if (!value) return '';
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, date.getFullYear() === now.getFullYear() ? 'd MMM' : 'd MMM yyyy', { locale: fr });
}

/** Date de la demande : le champ direct s'il existe, sinon l'étape « requested » du parcours. */
export function requestedAt(row: any): string | null {
  return (
    row?.requested_at ||
    (row?.workflow_timeline || []).find((step: any) => step.key === 'requested')?.occurred_at ||
    null
  );
}

/** Nom affiché du demandeur d'indice `index`. */
export function requesterName(row: any, index: number): string {
  const uid = row?.requester_ids?.[index];
  return row?.requesters?.[index] || (uid === undefined ? '' : String(uid));
}

/** « A », « A et B », « A, B et C ». */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/** Demandeurs qui attendent encore le mail de disponibilité alors que le média est là. */
export function pendingAvailableRequesters(row: any): { uid: string; name: string }[] {
  if (!isAvailable(row)) return [];
  return (row.requester_ids || [])
    .map((uid: string, index: number) => ({ uid, name: requesterName(row, index) }))
    .filter(({ uid }: { uid: string }) => mailState(row, uid, 'available') === 'pending');
}

/** Combien de demandeurs ont reçu le mail de disponibilité, sur combien le pouvaient. */
export function availableMailProgress(row: any): { sent: number; total: number } {
  const states = (row.requester_ids || []).map((uid: string) => mailState(row, uid, 'available'));
  const concerned = states.filter((state: MailState) => state !== 'none');
  return { sent: concerned.filter((state: MailState) => state === 'sent').length, total: concerned.length };
}

/** Pourquoi un mail est « sans objet » pour ce demandeur. */
export function mailNoneReason(row: any, uid: string | number, event: 'request' | 'available'): string {
  if (event === 'request' && row.origin_kind && row.origin_kind !== 'request') return 'ajouté sans demande';
  if (event === 'available' && !isAvailable(row)) return 'pas encore disponible';
  const value = row.requester_notifications?.[uid]?.[event];
  if (value == null) return 'aucune adresse mail';
  if (value === false && event === 'request') return "ajouté après l'envoi";
  return '';
}

export type JourneyState = 'done' | 'current' | 'upcoming' | 'error';
export interface JourneyStep {
  key: string;
  label: string;
  at: string | null;
  state: JourneyState;
  note?: string;
  noteTone?: 'positive' | 'attention';
}

/* Rang atteint par chaque statut opérationnel dans la frise :
   0 demandée, 1 transmise, 2 téléchargée, 3 importée, 4 dans Plex, 5 prévenus. */
const REACHED: Record<string, number> = {
  not_submitted: 0,
  awaiting_submission: 0,
  submitted: 1,
  queued: 1,
  downloading: 1,
  importing: 2,
  awaiting_plex: 3,
  partially_available: 4,
  completed: 4,
};

/**
 * Frise datée d'une demande. N'invente aucune date : une étape dont le serveur ne
 * connaît pas l'instant n'affiche que son libellé.
 */
export function journeySteps(row: any): JourneyStep[] {
  if (row.journey) return row.journey.steps.map((step: any) => ({
    key: step.key, label: step.label, at: step.occurred_at,
    state: step.state === 'completed' ? 'done' : step.state,
  }));
  const arr = arrName(row);
  const fromArr = row.origin_kind === 'arr';
  const steps: Omit<JourneyStep, 'state'>[] = [
    fromArr
      ? { key: 'requested', label: `Ajoutée dans ${arr}`, at: row.arr_processed_at || null }
      : { key: 'requested', label: 'Demandée', at: requestedAt(row) },
    { key: 'submitted', label: fromArr ? `Suivie par ${arr}` : `Transmise à ${arr}`, at: fromArr ? null : row.arr_processed_at || null },
    { key: 'downloaded', label: 'Téléchargée', at: row.torrent_completed_at || null },
    { key: 'imported', label: 'Importée', at: row.torrent_import_verified_at || null },
    { key: 'plex', label: 'Dans Plex', at: row.available_at || null },
    { key: 'notified', label: 'Demandeurs prévenus', at: null },
  ];
  if (fromArr) steps.splice(1, 1);

  const indexOf = (key: string) => steps.findIndex((step) => step.key === key);
  const operational = row.operational_status || 'not_submitted';
  let reached = REACHED[operational] ?? 0;
  if (isAvailable(row)) reached = Math.max(reached, 4);
  // Rang -> indice dans la frise (l'étape « transmise » manque pour une origine *ARR).
  const keys = ['requested', 'submitted', 'downloaded', 'imported', 'plex'];
  let lastDone = Math.max(0, ...keys.slice(0, reached + 1).map(indexOf));

  let errorIndex = -1;
  let errorLabel = '';
  if (row.status === 'rejected') {
    errorIndex = Math.min(1, steps.length - 1);
    errorLabel = 'Refusée';
    lastDone = 0;
  } else if (row.status === 'failed' || ['failed', 'removed'].includes(operational)) {
    lastDone = row.arr_processed_at ? Math.max(0, indexOf('submitted'), 0) : 0;
    errorIndex = lastDone + 1;
    errorLabel = operational === 'removed' ? `Retirée de ${arr}` : 'En erreur';
  }

  const progress = availableMailProgress(row);
  const notifiedIndex = indexOf('notified');
  return steps.map((step, index) => {
    let state: JourneyState = index <= lastDone ? 'done' : index === lastDone + 1 ? 'current' : 'upcoming';
    let label = step.label;
    if (index === errorIndex) {
      state = 'error';
      label = errorLabel;
    } else if (errorIndex >= 0 && index > errorIndex) {
      state = 'upcoming';
    }
    const result: JourneyStep = { ...step, label, state };
    if (index === notifiedIndex) {
      if (isAvailable(row) && errorIndex < 0) {
        const complete = progress.sent === progress.total;
        result.state = complete ? 'done' : 'current';
        result.note = progress.total ? `${progress.sent} sur ${progress.total}` : 'aucun mail à envoyer';
        result.noteTone = complete ? 'positive' : 'attention';
      } else if (result.state === 'current') {
        result.state = 'upcoming';
      }
    }
    return result;
  });
}

const HEADLINES: Record<string, (arr: string) => string> = {
  not_submitted: () => "En attente d'approbation",
  awaiting_submission: (arr) => `En attente d'envoi à ${arr}`,
  submitted: (arr) => `Suivie par ${arr}, en attente d'une release`,
  queued: () => 'Release en file de téléchargement',
  downloading: () => 'Téléchargement en cours',
  importing: (arr) => `Import en cours dans ${arr}`,
  awaiting_plex: () => 'Importée, en attente de Plex',
  removed: (arr) => `Retirée de ${arr}`,
};

/** Titre d'état en une phrase : « Disponible dans Plex depuis 2 jours ». */
export function journeyHeadline(row: any, now: Date = new Date()): string {
  if (row.journey) return row.journey.label;
  const arr = arrName(row);
  if (row.status === 'rejected') return 'Demande refusée';
  if (row.status === 'failed' || row.operational_status === 'failed') return 'Traitement en erreur';
  if (row.status === 'pending_approval') return "En attente d'approbation";
  if (isAvailable(row)) {
    const prefix = row.status === 'partially_available' ? 'Partiellement disponible dans Plex' : 'Disponible dans Plex';
    if (!row.available_at) return prefix;
    const since = parseApiDate(row.available_at);
    if (Number.isNaN(since.getTime())) return prefix;
    return `${prefix} depuis ${formatDistanceStrict(since, now, { locale: fr })}`;
  }
  const headline = HEADLINES[row.operational_status];
  return headline ? headline(arr) : row.operational_status_label || 'Demande en cours';
}

/** Sous-titre : qui a demandé et quand, état de la VF, fin du suivi. */
export function journeySubtitle(row: any, now: Date = new Date()): string {
  const parts: string[] = [];
  if (row.origin_kind === 'arr') {
    const at = shortDate(row.arr_processed_at, now);
    parts.push(at ? `Ajoutée directement dans ${arrName(row)} le ${at}` : `Ajoutée directement dans ${arrName(row)}`);
  } else if (row.origin_kind === 'plex') {
    parts.push('Déjà présente dans Plex');
  } else {
    const who = requesterName(row, 0);
    const at = shortDate(requestedAt(row), now);
    parts.push(['Demandée', who && `par ${who}`, at && `le ${at}`].filter(Boolean).join(' '));
  }
  if (row.status === 'failed' || row.operational_status === 'failed') {
    if (row.fulfillment_error) parts.push(row.fulfillment_error);
  }
  if (isAvailable(row)) {
    if (row.has_vf === true) parts.push('VF présente');
    else if (row.has_vf === false) parts.push(row.vf_tracking_disabled ? 'VF absente, suivi VF arrêté' : 'VF absente, suivi VF en cours');
    if (!canClose(row)) parts.push('suivi terminé');
  }
  return parts.join(' · ');
}

/** Pastille de statut : ton selon l'état de la demande. */
export function statusTone(status?: string | null): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (status === 'available' || status === 'completed') return 'success';
  if (status === 'failed' || status === 'rejected') return 'danger';
  if (status === 'pending_approval' || status === 'partially_available') return 'warning';
  if (['sent_to_arr', 'processing', 'awaiting_submission', 'submitted', 'queued', 'downloading', 'importing', 'awaiting_plex'].includes(status || '')) return 'info';
  return 'neutral';
}

/** Origine lisible, avec accents (le serveur envoie un libellé technique). */
export function originLabel(row: any): string {
  if (row.journey) return row.journey.origin.label;
  if (row.origin_kind === 'arr') return `Ajoutée dans ${arrName(row)}`;
  if (row.origin_kind === 'plex') return 'Déjà dans Plex';
  if (/seerr/i.test(row.origin_label || '') || /seerr/i.test(row.source || '')) return 'Demande via Seerr';
  return 'Demande utilisateur';
}

export interface JournalEvent {
  key: string;
  at: string;
  label: string;
  tone?: 'error';
}

const triggerWord = (mail: any): string => (mail?.triggered_by === 'manual' ? 'manuel' : 'auto');

/**
 * Journal d'une demande, du plus récent au plus ancien. Mêmes sources que l'ancien
 * historique des mails : dates de la demande et dernier mail de chaque type.
 */
export function journalEvents(row: any): JournalEvent[] {
  const arr = arrName(row);
  const events: JournalEvent[] = [];
  const push = (key: string, at: string | null | undefined, label: string, tone?: 'error') => {
    if (!at || Number.isNaN(parseApiDate(at).getTime())) return;
    events.push(tone ? { key, at, label, tone } : { key, at, label });
  };

  if (row.origin_kind === 'arr') {
    push('requested', row.arr_processed_at, `Ajoutée directement dans ${arr}`);
  } else {
    const who = requesterName(row, 0);
    push('requested', requestedAt(row), who ? `Demandée par ${who}` : 'Demandée');
    push('submitted', row.arr_processed_at, `Transmise à ${arr}`);
  }
  push('downloaded', row.torrent_completed_at, 'Téléchargement terminé');
  push('imported', row.torrent_import_verified_at, `Import vérifié par ${arr}`);
  push('available', row.available_at, row.has_vf === true ? 'Détectée dans Plex, piste française trouvée' : 'Détectée dans Plex');
  for (const [event, mail, name] of [
    ['request', row.last_request_mail, 'demande reçue'],
    ['available', row.last_available_mail, 'disponible'],
  ] as const) {
    if (!mail) continue;
    if (mail.success === false) push(`mail-${event}`, mail.sent_at, `Échec du mail « ${name} » (${triggerWord(mail)})`, 'error');
    else push(`mail-${event}`, mail.sent_at, `Mail « ${name} » envoyé (${triggerWord(mail)})`);
  }
  if (row.status === 'failed' || row.operational_status === 'failed') {
    push('failed', row.fulfillment_updated_at, 'Traitement en erreur', 'error');
  }
  return events.sort((a, b) => parseApiDate(b.at).getTime() - parseApiDate(a.at).getTime());
}

/** Sous-ligne d'un mail reçu : « 20 sept. 10:03 · auto » (dernier envoi de ce type). */
export function mailSentDetail(row: any, event: 'request' | 'available', now: Date = new Date()): string {
  const mail = event === 'request' ? row.last_request_mail : row.last_available_mail;
  if (!mail?.sent_at) return '';
  return `${shortDateTime(mail.sent_at, now)} · ${triggerWord(mail)}`;
}
