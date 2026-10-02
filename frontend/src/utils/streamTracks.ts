/* Resume d'une ligne des flux d'une lecture (video, audio, conteneur), pour les cartes
   du direct : ce qui est lu, et vers quoi c'est converti quand Plex doit convertir. */
import { codecLabel } from './conversionVerdict';

const CHANNELS: Record<number, string> = { 1: 'mono', 2: 'stéréo', 6: '5.1', 8: '7.1' };
const channels = (value: unknown) => (value ? CHANNELS[Number(value)] || `${value} canaux` : '');
const converted = (decision: unknown) => String(decision || '').toLowerCase() === 'transcode';
const join = (parts: unknown[], sep = ' ') => parts.filter(Boolean).join(sep);

function side(kind: 'video' | 'audio', item: Record<string, any> | undefined): string {
  if (!item) return '';
  return kind === 'video'
    ? join([item.codec && codecLabel(item.codec), item.height ? `${item.height}p` : ''])
    : join([item.codec && codecLabel(item.codec), channels(item.channels)]);
}

export function streamTracksSummary(session: Record<string, any>): string {
  const tracks = session.stream_details?.tracks;
  if (!tracks) return '';
  const parts: string[] = [];
  for (const kind of ['video', 'audio'] as const) {
    const track = tracks[kind];
    if (!track) continue;
    const from = side(kind, track.from);
    const to = converted(track.decision) ? side(kind, track.to) : '';
    const label = kind === 'video' ? 'Vidéo' : 'Audio';
    const language = kind === 'audio' && track.from?.language ? ` (${track.from.language})` : '';
    if (from || to) parts.push(`${label} ${to && to !== from ? `${from || '?'} → ${to}` : from}${language}`);
  }
  const container = tracks.container || {};
  const source = String(container.from || '').toUpperCase();
  const target = String(container.to || '').toUpperCase();
  if (source || target) parts.push(source && target && source !== target ? `${source} → ${target}` : source || target);
  return parts.join(' · ');
}
