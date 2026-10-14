/* Déroulé d'une lecture : les passages (lecture, pause, mise en mémoire tampon) d'une session,
   et ce qu'on en tire pour la barre et son journal (durées par mode, part en lecture, libellés).
   Fonctions pures, sans état : le composant n'en garde que l'affichage. */
import { formatDurationExact as formatDuration, formatTime } from '@/utils/format';
import type { TrackSegment, TrackTone } from '@/components/ui/UiSegmentTrack.vue';

export interface PlaybackSegment {
  id?: number;
  state: string;
  playback_method?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_ms: number;
  view_offset_start_ms?: number;
  view_offset_end_ms?: number;
}

type Session = Record<string, any> | null | undefined;

const sumDurations = (list: PlaybackSegment[]): number => list.reduce((acc, s) => acc + (s.duration_ms || 0), 0);
const isTranscode = (seg: PlaybackSegment): boolean => seg.playback_method === 'transcode';

/** Les passages détaillés, ou à défaut un seul passage reconstitué depuis la progression. */
export function sessionSegments(session: Session): PlaybackSegment[] {
  if (Array.isArray(session?.segments) && session.segments.length > 0) return session.segments;
  const watched = session?.progress_ms || session?.watched_ms || 0;
  if (watched > 0) {
    return [{
      state: session?.state || 'playing',
      playback_method: session?.playback_method || 'direct_play',
      duration_ms: watched,
      view_offset_start_ms: session?.initial_progress_ms || 0,
      view_offset_end_ms: watched,
    }];
  }
  return [];
}

/** Durée du média (repères sous la barre) : jamais moins que ce qui a été lu. */
export function sessionDurationMs(session: Session, segments: PlaybackSegment[]): number {
  return Math.max(session?.duration_ms || 0, session?.progress_ms || 0, sumDurations(segments), 1);
}

/** Part du média déjà vue, en pour cent. */
export function sessionProgressPercent(session: Session, durationMs: number): number {
  return Math.min(100, Math.round(((session?.progress_ms || session?.watched_ms || 0) / durationMs) * 100));
}

/** Temps passé par mode : lecture directe, transcodage, pause (celle du serveur d'abord). */
export function sessionTotals(session: Session, segments: PlaybackSegment[]) {
  const playing = segments.filter((s) => s.state === 'playing');
  const paused = segments.filter((s) => s.state === 'paused');
  const directPlayMs = sumDurations(playing.filter((s) => !isTranscode(s)));
  const transcodeMs = sumDurations(playing.filter(isTranscode));
  const pausedMs = session?.paused_ms || sumDurations(paused);
  const totalPlay = directPlayMs + transcodeMs;
  const totalOverall = totalPlay + pausedMs;
  return {
    directPlayMs,
    transcodeMs,
    pausedMs,
    pauseCount: paused.length,
    activePlayRatio: totalOverall > 0 ? Math.round((totalPlay / totalOverall) * 100) : null,
  };
}

/** Le dernier passage d'une session qui joue encore est en direct. */
function isLivePlaybackSegment(session: Session, segments: PlaybackSegment[], seg: PlaybackSegment, idx: number): boolean {
  return idx === segments.length - 1 && session?.state === 'playing' && !session?.ended_at && seg.state === 'playing';
}

export function segmentStateLabel(seg: PlaybackSegment): string {
  if (seg.state === 'paused') return 'Pause';
  if (seg.state === 'buffering') return 'Mise en mémoire tampon';
  if (seg.state === 'playing') return isTranscode(seg) ? 'Lecture (Transcodage)' : 'Lecture directe';
  return 'Session';
}

function segmentTooltip(seg: PlaybackSegment): string {
  const label = segmentStateLabel(seg);
  const dur = formatDuration(seg.duration_ms);
  let timeStr = '';
  if (seg.started_at) {
    const start = formatTime(seg.started_at);
    const end = seg.ended_at ? formatTime(seg.ended_at) : 'en cours';
    timeStr = ` [${start} - ${end}]`;
  }
  let offsetStr = '';
  if (seg.view_offset_start_ms !== undefined && seg.view_offset_end_ms !== undefined) {
    offsetStr = ` (Position : ${formatDuration(seg.view_offset_start_ms)} -> ${formatDuration(seg.view_offset_end_ms)})`;
  }
  return `${label} : ${dur}${timeStr}${offsetStr}`;
}

function segmentTone(seg: PlaybackSegment): TrackTone | undefined {
  if (seg.state === 'playing') return isTranscode(seg) ? 'warning' : 'success';
  if (seg.state === 'paused') return 'neutral';
  if (seg.state === 'buffering') return 'accent';
  return undefined;
}

/** Les passages en segments de barre. Chacun reste visible : au moins une seconde comptée. */
export function playbackTrackSegments(session: Session, segments: PlaybackSegment[]): TrackSegment[] {
  return segments.map((seg, idx) => ({
    key: seg.id || idx,
    size: Math.max(seg.duration_ms || 0, 1000),
    tone: segmentTone(seg),
    label: segmentTooltip(seg),
    live: isLivePlaybackSegment(session, segments, seg, idx),
    class: [`seg-${seg.state}`, seg.playback_method ? `method-${seg.playback_method}` : ''],
  }));
}
