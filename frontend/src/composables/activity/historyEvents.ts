/* L'historique (gabarit Comprendre) : une ligne par reprise repliee, avec son mode de
   lecture comme resultat. Un transcodage est un avertissement, la lecture directe un succes.
   Fonctions pures. */
import { playbackMethodLabel } from '@/utils/labels';
import { formatBandwidth, formatDuration } from '@/utils/format';
import { playbackDisplayTitle, playbackLocation, type PlaybackRun } from '@/activity/playbackRuns';
import { plexClientName } from '@/utils/plexClient';
import type { UnderstandEvent, UnderstandFact, UnderstandOutcome } from '@/components/templates/understand/types';

const METHOD_OUTCOME: Record<string, UnderstandOutcome>={direct_play:'success',direct_stream:'info',transcode:'warning',mixed:'warning'};
export const METHOD_CHOICES=[{value:'',label:'Tous les modes'},{value:'direct_play',label:'Lecture directe'},{value:'direct_stream',label:'Conversion légère'},{value:'transcode',label:'Transcodage'}];

/* Ce qu'une ligne de l'historique dit en plus : combien a ete regarde, a quelle qualite et
   a quel debit, d'ou. Seules les donnees connues s'affichent. */
function runProgress(run: PlaybackRun): number|null {
  const total=Number(run.item.duration_ms)||0;
  if(!total)return typeof run.item.progress==='number'?Math.min(100,Math.max(0,run.item.progress)):null;
  return Math.min(100,Math.round(run.watchedMs/total*100));
}
function runFacts(run: PlaybackRun): UnderstandFact[] {
  const item=run.item;
  const total=Number(item.duration_ms)||0;
  const quality=[item.quality,item.video_codec&&String(item.video_codec).toUpperCase()].filter(Boolean).join(' · ');
  const facts: Array<UnderstandFact|null>=[
    run.watchedMs?{label:'Regardé',value:total?`${formatDuration(run.watchedMs)} sur ${formatDuration(total)}`:formatDuration(run.watchedMs)}:null,
    quality?{label:'Qualité',value:quality}:null,
    item.bandwidth_kbps?{label:'Débit',value:formatBandwidth(item.bandwidth_kbps)}:null,
    item.geo_status?{label:'Lieu',value:playbackLocation(item)}:null,
  ];
  return facts.filter((fact): fact is UnderstandFact=>fact!==null);
}

export function historyEventOf(run: PlaybackRun): UnderstandEvent {
  return {
    key:run.key,
    at:run.item.started_at||'',
    outcome:METHOD_OUTCOME[run.method]||'info',
    title:`${playbackDisplayTitle(run.item)||'Lecture Plex'}${run.count>1?` ×${run.count}`:''}`,
    detail:[run.item.user_name||'Utilisateur Plex',run.count>1?`${run.count} lectures consécutives`:''].filter(Boolean).join(' · '),
    tags:run.method?[playbackMethodLabel(run.method,{fallback:run.method==='mixed'?'Lecture mixte':run.method})]:[],
    context:plexClientName(run.item),
    poster:run.item.thumb_url||null,
    progress:runProgress(run),
    facts:runFacts(run),
  };
}
