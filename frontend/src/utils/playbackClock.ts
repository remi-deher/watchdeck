/* Horloge d'une lecture en cours, comme la tient Tracearr : entre deux releves de Plex
   (toutes les quelques secondes), la position avance d'elle-meme tant que la lecture
   joue. On part du dernier releve -- `progress_ms` au moment de `last_seen_at` -- et on
   y ajoute le temps ecoule depuis ; en pause ou terminee, elle reste figee. Le releve
   suivant remet l'estimation a l'heure, sans etat a tenir. */

export interface PlaybackClockSession {
  state?: string | null;
  ended_at?: string | null;
  last_seen_at?: string | null;
  progress_ms?: number | null;
  watched_ms?: number | null;
  duration_ms?: number | null;
}

/** Vrai si la position avance : lecture en cours, ni en pause ni terminee. */
export function isAdvancing(session: PlaybackClockSession): boolean {
  return !session.ended_at && (session.state || 'playing') === 'playing';
}

/** Position estimee (ms) a l'instant `now`, bornee a la duree du media. */
export function estimateProgressMs(session: PlaybackClockSession, now: number): number {
  const base = session.progress_ms || session.watched_ms || 0;
  if (!isAdvancing(session) || !session.last_seen_at) return base;
  const seen = Date.parse(session.last_seen_at);
  if (Number.isNaN(seen)) return base;
  // Pas plus d'une minute d'avance : au-dela, la collecte a decroche et l'estimation
  // partirait seule dans le vide.
  const elapsed = Math.min(Math.max(0, now - seen), 60_000);
  const estimate = base + elapsed;
  return session.duration_ms ? Math.min(estimate, session.duration_ms) : estimate;
}

/** « 1:04:09 », « 12:07 » : la position telle que l'affiche un lecteur. */
export function timecode(ms: number | null | undefined): string {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** Heure de fin estimee (ETA), seulement tant que la lecture avance. */
export function estimatedEnd(session: PlaybackClockSession, now: number): Date | null {
  if (!isAdvancing(session) || !session.duration_ms) return null;
  const remaining = session.duration_ms - estimateProgressMs(session, now);
  return remaining > 0 ? new Date(now + remaining) : null;
}
