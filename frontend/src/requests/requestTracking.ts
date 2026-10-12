import type { TrackAction, TrackItem, TrackRecent, TrackState } from '@/components/templates/track/types';
import { mediaDetailPath } from '@/mediaUrl';
import { mediaTypeLabel } from '@/utils/labels';

/* Mes demandes : traduction d'une demande (calculee par le serveur, `tracking` ou
   `journey.tracking`) en element du gabarit Suivre. Le serveur dit ou en est la demande ;
   ici on ne fait que choisir le groupe, la cause et les actions d'un moderateur. */

export type RequestTab = 'suivi' | 'disponibles' | 'manquants';

function trackingOf(request: any): any {
  return request.journey ? request.journey.tracking : request.tracking;
}

/** Une demande sans suivi est arrivee : elle releve de « Disponibles ». */
export function requestTabOf(request: any): RequestTab {
  const kind = trackingOf(request)?.kind;
  return kind && kind !== 'rejected' ? 'suivi' : 'disponibles';
}

/** Une demande refusee n'a plus rien a suivre : elle rejoint les derniers termines. */
export function isRefused(request: any): boolean {
  return trackingOf(request)?.kind === 'rejected';
}

const STATE_BY_KIND: Record<string, TrackState> = {
  approval: 'blocked',
  failed: 'blocked',
  not_found: 'blocked',
  missing_episodes: 'blocked',
  downloading: 'running',
  importing: 'running',
  queued: 'waiting',
  unreleased: 'waiting',
};

const SHORT_LABELS: Record<string, string> = {
  approval: 'À approuver',
  failed: 'Échec',
  not_found: 'Introuvable',
  missing_episodes: 'Épisodes manquants',
  downloading: 'Téléchargement',
  queued: 'En file',
  importing: 'Import Plex',
  unreleased: 'Pas encore sorti',
};

const HINTS: Record<string, string> = {
  approval: 'Un modérateur doit valider la demande avant que la recherche ne commence.',
  not_found: 'Aucune release ne correspond encore : une recherche interactive permet de choisir à la main.',
  missing_episodes: 'Des épisodes diffusés manquent : relancer la recherche ou en choisir une release.',
  failed: 'Le téléchargement ou l’import a échoué : le relancer ou annuler la demande.',
};

/** Actions d'un moderateur selon le motif. L'identifiant `interactive` ouvre la fiche de releases. */
export function requestActions(kind: string, canModerate: boolean): TrackAction[] {
  if (!canModerate) return [];
  switch (kind) {
    case 'approval':
      return [{ key: 'approve', label: 'Approuver', tone: 'primary' }, { key: 'reject', label: 'Refuser…', tone: 'danger' }];
    case 'not_found':
    case 'missing_episodes':
      return [
        { key: 'interactive', label: 'Recherche interactive', tone: 'primary' },
        { key: 'retry', label: 'Relancer la recherche' },
        { key: 'withdraw', label: 'Annuler…', tone: 'danger' },
      ];
    case 'failed':
      return [{ key: 'retry', label: 'Relancer', tone: 'primary' }, { key: 'withdraw', label: 'Annuler…', tone: 'danger' }];
    default:
      return [];
  }
}

function episodesNote(request: any): string {
  if (request.media_type !== 'show') return '';
  const total = Number(request.episodes_total_count || 0);
  const available = Number(request.episodes_available_count || 0);
  const aired = Number(request.episodes_aired_count || 0);
  if (!total) return '';
  return `${available}/${total} épisodes${aired > available ? ` · ${aired - available} manquant${aired - available > 1 ? 's' : ''}` : ''}`;
}

function detailTo(request: any): string {
  return mediaDetailPath(request, 'request', { discover: true });
}

export function toTrackItem(request: any, canModerate: boolean): TrackItem {
  const tracking = trackingOf(request) || {};
  const kind: string = tracking.kind || 'unknown';
  const state = STATE_BY_KIND[kind] || 'unknown';
  const label: string = tracking.label || SHORT_LABELS[kind] || '';
  const download = tracking.download;
  const progress = typeof download?.progress === 'number' ? Math.round(download.progress) : null;
  const reasons = kind === 'failed' && request.fulfillment_error ? [String(request.fulfillment_error)] : undefined;
  const timeleft = download?.timeleft ? `encore ${String(download.timeleft).replace(/^00:/, '')}` : '';
  const subtitle = [mediaTypeLabel(request.media_type), request.year, request.requested_by ? `demandé par ${request.requested_by}` : '']
    .filter(Boolean).join(' · ');
  return {
    key: `request-${request.id}`,
    state,
    title: request.title,
    subtitle,
    media: request,
    progress,
    step: SHORT_LABELS[kind] || label,
    eta: timeleft || undefined,
    note: state === 'blocked' ? undefined : (kind === 'unreleased' ? label.split(' · ').slice(1).join(' · ') || undefined : episodesNote(request) || undefined),
    cause: state === 'blocked' ? { headline: label || 'Demande bloquée', reasons, hint: HINTS[kind] } : undefined,
    to: detailTo(request),
    actions: requestActions(kind, canModerate),
  };
}

export function toRecent(request: any): TrackRecent {
  const tracking = trackingOf(request) || {};
  return {
    key: `request-${request.id}`,
    title: request.title,
    detail: tracking.label || 'Refusée',
    poster: request.poster_url,
    failed: true,
    to: detailTo(request),
  };
}
