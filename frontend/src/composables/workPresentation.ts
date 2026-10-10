import type { TrackItem, TrackState } from '@/components/templates/track/types';
import type { LiveItem } from '@/components/ui/liveStrip';

/** Adaptation de présentation ; l'état métier est déjà calculé par le serveur. */
export function resolveTrackItem(item: TrackItem): TrackItem {
  const work = item.work;
  if (!work) return item;
  const state: TrackState = work.state;
  return {
    ...item, key: work.key, state,
    progress: work.progress.percent,
    step: work.stage || work.label,
    eta: work.progress.percent === null ? undefined : work.progress.label,
    note: work.state === 'blocked' ? item.note : work.reason || item.note,
    cause: work.state === 'blocked'
      ? { ...item.cause, headline: work.reason || item.cause?.headline || work.label } : undefined,
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
