/* Verdict d'une conversion, en francais clair : ce qui est converti, et pourquoi.

   Construit a partir de ce qu'on sait deja -- decisions flux par flux, raison de Plex
   (journaux), parametres envoyes par le lecteur, relais, HDR -- plutot que d'afficher
   la phrase technique de Plex telle quelle. Une cause qu'on ne sait pas nommer laisse la
   place a la phrase de Plex (traduite si possible). */
import { plexPhrase } from './plexDecisionText';

export interface ConversionSession {
  playback_method?: string | null;
  video_decision?: string | null;
  audio_decision?: string | null;
  subtitle_decision?: string | null;
  transcode_details?: Record<string, any> | null;
  stream_details?: Record<string, any> | null;
  transcode_reason?: { source?: string; text?: string | null; code?: number | null; client?: Record<string, string> } | null;
}

export interface ConversionVerdict {
  title: string;
  explanation: string;
  /** 'plex' : cause lue dans la decision de Plex ; 'deduced' : deduite du flux. */
  source: 'plex' | 'deduced';
}

const CODECS: Record<string, string> = { hevc: 'HEVC', h264: 'H.264', av1: 'AV1', truehd: 'TrueHD', eac3: 'E-AC3', ac3: 'AC3', dca: 'DTS', aac: 'AAC', opus: 'Opus', flac: 'FLAC', mp3: 'MP3', ass: 'ASS', srt: 'SRT', webvtt: 'WebVTT', pgs: 'PGS' };
export const codecLabel = (value: unknown): string => (value ? CODECS[String(value).toLowerCase()] || String(value).toUpperCase() : '?');

const converted = (decision: unknown): boolean => ['transcode', 'burn'].includes(String(decision || '').toLowerCase());

function convertedStreams(s: ConversionSession): string[] {
  const d = s.transcode_details || {};
  const parts: string[] = [];
  if (converted(d.video?.decision ?? s.video_decision)) parts.push('vidéo');
  if (converted(d.audio?.decision ?? s.audio_decision)) parts.push('audio');
  if (converted(d.subtitles?.decision ?? s.subtitle_decision)) parts.push('sous-titres');
  return parts;
}

function joinFr(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/** La cause, si on sait la nommer ; sinon `null`. */
function cause(s: ConversionSession): string | null {
  const reason = s.transcode_reason || {};
  const text = String(reason.text || '');
  const client = reason.client || {};
  const range = s.stream_details?.dynamic_range || {};
  if (/audio\.channels limitation/i.test(text)) return 'le lecteur ne gère pas autant de canaux audio';
  if (/bandwidth/i.test(text) || reason.code === 3001) return 'débit insuffisant pour la lecture directe';
  if (s.stream_details?.relayed) return 'la connexion passe par le relais Plex, au débit limité';
  if (client.maxVideoBitrate || client.videoBitrate) return `qualité limitée par le lecteur (${client.maxVideoBitrate || client.videoBitrate} kb/s)`;
  if (range.source && range.source !== 'SDR' && range.output === 'SDR') return 'le lecteur n’affiche pas le HDR';
  if (String(s.subtitle_decision || s.transcode_details?.subtitles?.decision || '').toLowerCase() === 'burn') return 'les sous-titres doivent être incrustés dans l’image';
  if (client.directPlay === '0' || /direct play is disabled/i.test(text)) return 'le lecteur a refusé la lecture directe';
  return null;
}

/** Phrase par flux : « l'audio DTS est converti en AAC, la vidéo est inchangée ». */
function explanation(s: ConversionSession): string {
  const d = s.transcode_details || {};
  const sentences: string[] = [];
  const describe = (stream: any, fem: boolean, label: string) => {
    if (!stream) return;
    const { from, to } = stream;
    if (converted(stream.decision)) {
      const change = from && to && String(from).toLowerCase() !== String(to).toLowerCase()
        ? ` ${codecLabel(from)} ${fem ? 'est convertie' : 'est converti'} en ${codecLabel(to)}`
        : ` ${fem ? 'est réencodée' : 'est réencodé'}`;
      sentences.push(`${label}${change}`);
    } else if (stream.decision) {
      sentences.push(`${label} ${fem ? 'est inchangée' : 'est inchangé'}`);
    }
  };
  describe(d.video, true, 'la vidéo');
  describe(d.audio, false, 'l’audio');
  if (d.subtitles && converted(d.subtitles.decision)) {
    sentences.push(String(d.subtitles.decision).toLowerCase() === 'burn'
      ? `les sous-titres ${codecLabel(d.subtitles.from)} sont incrustés`
      : `les sous-titres ${codecLabel(d.subtitles.from)} sont convertis en ${codecLabel(d.subtitles.to)}`);
  }
  const text = sentences.join(', ');
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : '';
}

export function conversionVerdict(s: ConversionSession): ConversionVerdict | null {
  const streams = convertedStreams(s);
  const d = s.transcode_details || {};
  const containerChanged = d.container?.from && d.container?.to
    && String(d.container.from).toLowerCase() !== String(d.container.to).toLowerCase();
  const reason = s.transcode_reason;
  // Une conversion légère passe par le transcodeur même quand rien ne change en
  // apparence (flux recopiés, diffusion en segments) : elle a droit à son suivi aussi.
  const lightConversion = s.playback_method === 'direct_stream' && Object.keys(d).length > 0;
  if (!streams.length && !containerChanged && !reason && !lightConversion) return null;

  const why = cause(s);
  const source = reason?.source === 'plex' ? 'plex' : 'deduced';
  let title: string;
  if (streams.length) {
    title = `Transcodage ${joinFr(streams)}`;
  } else if (containerChanged) {
    title = 'Conversion légère : seul le conteneur change';
  } else if (lightConversion && !reason) {
    title = 'Conversion légère : flux recopiés sans réencodage';
  } else {
    title = 'Lecture adaptée par Plex';
  }
  if (why) title += ` : ${why}`;
  else if (reason?.text && source === 'plex') title += ` : ${plexPhrase(reason.text).charAt(0).toLowerCase()}${plexPhrase(reason.text).slice(1)}`;
  return { title, explanation: explanation(s), source };
}
