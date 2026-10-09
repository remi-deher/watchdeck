import { formatBuffer as formatBuffer } from '@/utils/format';
/* Tampon d'un transcodage en direct : l'avance du transcodeur de Plex sur la tete de
   lecture. Tant qu'il reste du tampon, la lecture ne s'arrete pas ; un tampon qui fond
   annonce une coupure. */

export interface TranscodeState {
  playback_method?: string | null;
  transcode_buffer_ms?: number | null;
  transcode_speed?: number | null;
  transcode_throttled?: boolean | null;
  ended_at?: string | null;
  progress_ms?: number | null;
  duration_ms?: number | null;
  transcode_details?: { transcoder?: { complete?: boolean | null } | null } | null;
}

/** Vrai pour une lecture en cours, convertie, dont Plex donne le tampon.

    Un Direct Stream passe aussi par le transcodeur (sous-titres, conteneur) : il a donc
    un tampon lui aussi. Seule la lecture directe n'en a pas. */
export function hasTranscodeBuffer(session: TranscodeState | null | undefined): boolean {
  return Boolean(session && session.playback_method !== 'direct_play' && session.transcode_buffer_ms != null && !session.ended_at);
}

export type TranscoderTone = 'done' | 'paused' | 'running' | 'low';

/** Ce que fait le transcodeur en ce moment, dit simplement.

    Bride par Plex (« throttled »), il est en pause parce qu'il a assez d'avance : c'est
    le signe d'une lecture confortable, pas d'un souci. Termine, tout le fichier est pret. */
export function transcoderState(session: TranscodeState): { label: string; tone: TranscoderTone } {
  if (session.transcode_details?.transcoder?.complete) return { label: 'Transcodage terminé : tout le fichier est prêt', tone: 'done' };
  if (bufferIsLow(session.transcode_buffer_ms)) return { label: 'Tampon presque vide : coupure possible', tone: 'low' };
  if (session.transcode_throttled) return { label: 'Transcodeur en pause : assez d’avance', tone: 'paused' };
  const speed = session.transcode_speed != null
    ? ` ×${session.transcode_speed.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}`
    : '';
  return { label: `Transcodeur en cours${speed}`, tone: 'running' };
}

/** Position (en %) de la lecture et de la fin du tampon sur la duree du media. */
export function bufferSpan(session: TranscodeState): { played: number; buffered: number } | null {
  const duration = session.duration_ms || 0;
  if (!duration || session.transcode_buffer_ms == null) return null;
  const played = Math.min(100, ((session.progress_ms || 0) / duration) * 100);
  const end = session.transcode_details?.transcoder?.complete
    ? 100
    : Math.min(100, (((session.progress_ms || 0) + session.transcode_buffer_ms) / duration) * 100);
  return { played, buffered: Math.max(played, end) };
}

/** « 45 s », « 1 min 12 s », « 12 min ». */
export { formatBuffer as formatBuffer } from '@/utils/format';

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
