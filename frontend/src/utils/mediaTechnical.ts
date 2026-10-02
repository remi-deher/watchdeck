import { codecLabel } from '@/utils/conversionVerdict';
import { formatBandwidth } from '@/utils/format';

/* Libelles des caracteristiques techniques d'un fichier (inventaire, fiche fichier). */

const CHANNELS: Record<number, string> = { 1: 'mono', 2: 'stéréo', 3: '2.1', 6: '5.1', 7: '6.1', 8: '7.1' };

/** « 6 » -> « 5.1 » ; un nombre inhabituel reste en toutes lettres. */
export function channelsLabel(value: unknown): string {
  const count = Number(value || 0);
  if (!count) return '';
  return CHANNELS[count] || `${count} canaux`;
}

/** « 4k » -> « 4K », « 1080 » -> « 1080p », « sd » -> « SD ». */
export function resolutionLabel(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw || /^inconnue?$/i.test(raw)) return '';
  if (/^\d+$/.test(raw)) return `${raw}p`;
  return raw.toUpperCase();
}

/** Sous 1 Mb/s (l'audio le plus souvent), les kb/s restent lisibles : « 0,6 Mb/s » ne l'est pas. */
export function bitrateLabel(kbps: unknown): string {
  const value = Number(kbps || 0);
  if (!value) return '';
  return value < 1000 ? `${Math.round(value)} kb/s` : formatBandwidth(value);
}

export function frameRateLabel(value: unknown): string {
  const rate = Number(value || 0);
  if (!rate) return '';
  return `${rate.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} i/s`;
}

export function samplingLabel(value: unknown): string {
  const rate = Number(value || 0);
  if (!rate) return '';
  return `${(rate / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kHz`;
}

/** Part d'un fichier vue lors d'une lecture, bornee a 100 % (une relecture partielle
 *  peut depasser la duree du fichier quand Plex compte les retours en arriere). */
export function watchedPercent(watchedMs: unknown, durationMs: unknown): number | null {
  const watched = Number(watchedMs || 0);
  const duration = Number(durationMs || 0);
  if (!duration) return null;
  return Math.max(0, Math.min(100, Math.round((watched / duration) * 100)));
}

const join = (parts: unknown[]): string => parts.filter(Boolean).join(' · ');

export interface AudioTrack {
  language?: string | null;
  codec?: string | null;
  profile?: string | null;
  channels?: number | null;
  layout?: string | null;
  bitrate_kbps?: number | null;
  sampling_rate?: number | null;
  title?: string | null;
  default?: boolean;
}

export interface SubtitleTrack {
  language?: string | null;
  codec?: string | null;
  title?: string | null;
  forced?: boolean;
  hearing_impaired?: boolean;
  external?: boolean;
  default?: boolean;
}

export function audioTrackDetail(track: AudioTrack): string {
  const codec = track.codec ? codecLabel(track.codec) : '';
  const profile = track.profile && track.profile.toLowerCase() !== String(track.codec || '').toLowerCase() ? track.profile.toUpperCase() : '';
  // « dts » + « dts-hd ma » : le profil nomme deja le codec, on ne le repete pas.
  const name = profile && codec && profile.startsWith(codec) ? profile : [codec, profile].filter(Boolean).join(' ');
  return join([name, channelsLabel(track.channels), bitrateLabel(track.bitrate_kbps), samplingLabel(track.sampling_rate)]);
}

export function subtitleTrackDetail(track: SubtitleTrack): string {
  return join([
    track.codec ? codecLabel(track.codec) : '',
    track.external ? 'externe' : 'intégré',
    track.forced ? 'forcé' : '',
    track.hearing_impaired ? 'SDH' : '',
  ]);
}
