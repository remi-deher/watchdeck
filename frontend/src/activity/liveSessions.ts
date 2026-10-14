/* Les lectures Plex en cours, traduites en cartes du bandeau commun (LiveStrip) : ici, ce qui
   est propre a Plex -- la position qui avance entre deux releves, l'heure de fin, la qualite,
   le son, les sous-titres, le reseau. Partage par l'accueil et la vue « En direct » d'Activite. */
import { Captions, Globe, Monitor, MonitorPlay, Server, Sparkles, Volume2, Wifi } from '@lucide/vue';
import type { LiveFact, LiveItem } from '@/components/ui/liveStrip';
import type { LiveSession } from '@/components/activity/LiveSessionsPanel.vue';
import { episodeLabel } from '@/utils/episode';
import { formatTime, timecode } from '@/utils/format';
import { channelsLabel } from '@/utils/mediaTechnical';
import { proxyUrl } from '@/utils/mediaImage';

/** Quand les lectures ont ete relevees, et l'heure d'affichage : la position avance entre deux releves. */
export interface LiveClock {
  now: number;
  receivedAt: number;
}

/* Logo de l'oeuvre : le bandeau commun rend la main au titre si l'image manque. */
function logoUrl(session: LiveSession): string {
  return `${session.logo_url}${String(session.logo_url).includes('?') ? '&' : '?'}width=600`;
}
/* Sous le logo, ce qu'il ne dit pas : l'episode, ou l'annee d'un film. Le titre complet
   reste lisible par les lecteurs d'ecran via l'etiquette de la carte. */
function logoCaption(session: LiveSession): string {
  if (session.grandparent_title) return episodeLabel(session) || session.title || '';
  return session.year ? String(session.year) : '';
}
/* Affiche floutee en fond quand l'oeuvre n'a pas de fanart : petite largeur suffit. */
function posterUrl(session: LiveSession): string {
  const src = String(session.thumb_url || '');
  if (src.startsWith('/api/playback/thumb')) return `${src}${src.includes('?') ? '&' : '?'}width=300`;
  return proxyUrl(src, { width: 300 }) ?? src;
}

export function isPaused(session: LiveSession): boolean {
  return ['paused', 'buffering'].includes(String(session.state || '').toLowerCase());
}
function elapsedMs(session: LiveSession, clock: LiveClock): number {
  const base = session.progress_ms || 0;
  if (String(session.state || 'playing').toLowerCase() !== 'playing') return base;
  const projected = base + (clock.now - clock.receivedAt);
  return session.duration_ms ? Math.min(projected, session.duration_ms) : projected;
}
function percent(session: LiveSession, clock: LiveClock): number {
  if (session.duration_ms) return Math.min(100, Math.round((elapsedMs(session, clock) / session.duration_ms) * 100));
  return Math.min(100, Math.round(session.progress || 0));
}
function remaining(session: LiveSession, clock: LiveClock): string {
  if (String(session.state || '').toLowerCase() === 'paused') return 'En pause';
  if (String(session.state || '').toLowerCase() === 'buffering') return 'Mise en mémoire tampon';
  if (!session.duration_ms) return `${percent(session, clock)} %`;
  const left = Math.max(0, session.duration_ms - elapsedMs(session, clock));
  return left < 1000 ? 'Bientôt terminé' : `${timecode(left)} restantes`;
}
function displayTitle(session: LiveSession): string {
  if (!session.grandparent_title) return session.title || '';
  const episode = episodeLabel(session);
  return episode ? `${session.grandparent_title} · ${episode}` : session.grandparent_title;
}
/* Heure de fin si la lecture va au bout sans nouvelle pause ; en pause, si elle reprend
   maintenant. Rien sans duree connue. */
export function endsAt(session: LiveSession, clock: LiveClock): number | null {
  if (!session.duration_ms) return null;
  return clock.now + Math.max(0, session.duration_ms - elapsedMs(session, clock));
}
function endLabel(session: LiveSession, clock: LiveClock): string {
  const end = endsAt(session, clock);
  if (end === null) return '';
  return isPaused(session) ? `fin vers ${formatTime(end)} si reprise` : `fin vers ${formatTime(end)}`;
}

/* Plex note la hauteur du flux : 1080 pour un 1920x800 recadre se lit par la largeur. */
function sourceResolution(video: Record<string, any> | undefined): string {
  const width = Number(video?.width || 0);
  const height = Number(video?.height || 0);
  if (width >= 3200 || height >= 2000) return '4K';
  if (width >= 1800 || height >= 1000) return '1080p';
  if (width >= 1200 || height >= 700) return '720p';
  return height ? `${height}p` : '';
}
function qualityLabel(session: LiveSession): string {
  const video = session.stream_details?.tracks?.video;
  const raw = String(session.quality || '').trim();
  const fallback = !raw ? '' : /^\d+$/.test(raw) ? `${raw}p` : raw.toUpperCase();
  const source = sourceResolution(video?.from) || fallback;
  if (String(video?.decision || '').toLowerCase() !== 'transcode') return source;
  const output = sourceResolution({ height: video?.to?.height });
  return source && output && output !== source ? `${source} → ${output}` : source || output;
}
function dynamicRange(session: LiveSession): string {
  const range = session.stream_details?.dynamic_range || {};
  const source = range.source && range.source !== 'SDR' ? String(range.source) : '';
  if (!source) return '';
  return range.output === 'SDR' ? `${source} → SDR` : source;
}
/* « Français », « fre », « fr-FR » -> FR ; une langue inconnue garde ses deux premieres lettres. */
function languageCode(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(fr|fre|fra)\b|^fran/i.test(raw)) return 'FR';
  if (/^(en|eng)\b|^engl|^angl/i.test(raw)) return 'EN';
  return raw.slice(0, 2).toUpperCase();
}
function audioLabel(session: LiveSession): string {
  const from = session.stream_details?.tracks?.audio?.from;
  return [channelsLabel(from?.channels), languageCode(from?.language)].filter(Boolean).join(' · ');
}
function subtitleLabel(session: LiveSession): string {
  const subtitles = session.stream_details?.tracks?.subtitles?.languages || [];
  const selected = subtitles.find((item: Record<string, any>) => item.selected);
  if (!selected) return '';
  return `ST ${languageCode(selected.language) || 'actifs'}${session.subtitle_decision === 'burn' ? ' incrustés' : ''}`;
}
function networkLabel(session: LiveSession): string {
  if (session.stream_details?.relayed) return 'Relais Plex';
  if (session.location === 'lan' || session.stream_details?.local) return 'Local';
  return session.geo_city ? `Distant · ${session.geo_city}` : 'Distant';
}
function networkTone(session: LiveSession): string {
  if (session.stream_details?.relayed) return 'warn';
  return networkLabel(session) === 'Local' ? '' : 'remote';
}

function liveFacts(session: LiveSession): LiveFact[] {
  const out: LiveFact[] = [];
  const push = (key: string, label: string, icon: any, tone?: LiveFact['tone']) => { if (label) out.push({ key, label, icon, tone }); };
  push('quality', qualityLabel(session), Monitor);
  push('hdr', dynamicRange(session), Sparkles, 'hdr');
  push('audio', audioLabel(session), Volume2);
  push('subtitles', subtitleLabel(session), Captions);
  const tone = networkTone(session);
  push('network', networkLabel(session), tone === 'remote' ? Globe : Wifi, tone === 'warn' ? 'warn' : tone === 'remote' ? 'remote' : undefined);
  if (session.is_download) push('download', 'Téléchargement', MonitorPlay);
  push('server', session.server_name || '', Server);
  return out;
}

/** Une lecture traduite en carte du bandeau commun. */
export function liveItemOf(session: LiveSession, clock: LiveClock): LiveItem {
  return {
    key: String(session.session_id),
    session,
    title: displayTitle(session),
    logo: session.logo_url ? logoUrl(session) : null,
    logoCaption: logoCaption(session),
    status: `${remaining(session, clock)}${endLabel(session, clock) ? ` · ${endLabel(session, clock)}` : ''}`,
    progress: percent(session, clock),
    paused: isPaused(session),
    backdrop: session.art_url || null,
    poster: session.thumb_url ? posterUrl(session) : null,
    corner: { person: session },
    person: session,
    client: session,
    facts: liveFacts(session),
  };
}
