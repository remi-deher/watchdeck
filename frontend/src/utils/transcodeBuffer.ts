/* Tampon d'un transcodage en direct : l'avance du transcodeur de Plex sur la tete de
   lecture. Tant qu'il reste du tampon, la lecture ne s'arrete pas ; un tampon qui fond
   annonce une coupure. */

export interface TranscodeState {
  playback_method?: string | null;
  transcode_buffer_ms?: number | null;
  transcode_speed?: number | null;
  transcode_throttled?: boolean | null;
  ended_at?: string | null;
}

/** Vrai pour une lecture en cours, transcodee, dont Plex donne le tampon. */
export function hasTranscodeBuffer(session: TranscodeState | null | undefined): boolean {
  return Boolean(session && session.playback_method === 'transcode' && session.transcode_buffer_ms != null && !session.ended_at);
}

/** « 45 s », « 1 min 12 s », « 12 min ». */
export function formatBuffer(ms: number | null | undefined): string {
  const seconds = Math.max(0, Math.round((ms || 0) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes >= 10 || !rest) return `${minutes} min`;
  return `${minutes} min ${rest} s`;
}

/** Vitesse du transcodeur (« ×2,4 ») et bridage, pour le detail. */
export function transcodeSpeedLabel(session: TranscodeState): string {
  const parts: string[] = [];
  if (session.transcode_speed != null) {
    parts.push(`Transcodeur ×${session.transcode_speed.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}`);
  }
  // Plex bride le transcodeur quand il a assez d'avance : c'est bon signe, pas un souci.
  if (session.transcode_throttled) parts.push('bridé, assez d’avance');
  return parts.join(' · ') || 'Transcodage en cours';
}

/** Un tampon de moins de 10 s laisse craindre une coupure. */
export function bufferIsLow(ms: number | null | undefined): boolean {
  return (ms || 0) < 10_000;
}
