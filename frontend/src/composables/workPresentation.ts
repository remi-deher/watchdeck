import type { TrackItem, TrackState } from '@/components/templates/track/types';
import type { LiveItem } from '@/components/ui/liveStrip';

/** Adaptation de présentation ; l'état métier est déjà calculé par le serveur.
    Un blocage dont le transfert est fini (100 %) n'a pas de barre : le diagnostic
    de la page (badge, phrase, piste) reste celui qu'on lit. */
export function resolveTrackItem(item: TrackItem): TrackItem {
  const work = item.work;
  if (!work) return item;
  const state: TrackState = work.state;
  const transferDone = state === 'blocked' && (work.progress.percent ?? 0) >= 100;
  return {
    ...item, key: work.key, state,
    progress: transferDone ? null : work.progress.percent,
    step: state === 'blocked' && item.step ? item.step : (work.stage || work.label),
    eta: work.progress.percent === null || transferDone ? undefined : work.progress.label,
    note: state === 'blocked' ? item.note : work.reason || item.note,
    cause: state === 'blocked'
      ? { headline: item.cause?.headline || work.reason || work.label, reasons: item.cause?.reasons, hint: item.cause?.hint }
      : undefined,
  };
}

export function resolveLiveItem(item: LiveItem): LiveItem {
  const work = item.work;
  if (!work) return item;
  return {
    ...item, key: work.key, progress: work.progress.percent,
    paused: work.state === 'paused',
    status: work.progress.percent === null ? work.label : `${Math.round(work.progress.percent)} % · ${work.progress.label}`,
    badge: { label: work.stage || work.label, tone: work.state === 'blocked' ? 'warn' : work.state === 'running' ? 'accent' : 'neutral' },
    note: work.reason || item.note,
  };
}
