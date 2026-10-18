/* Les chiffres cles (gabarit Analyser) : la tendance vient du serveur, qui compare a la
   periode precedente. Fonction pure, appelee par une valeur calculee. */
import { formatBandwidth, formatDuration } from '@/utils/format';
import type { AnalyzeKpi } from '@/components/templates/analyze/types';

interface KpiSource {
  view: string;
  summary: Record<string, any>;
  analytics: Record<string, any>;
  liveCount: number;
  periodLabel: string;
  averageWatch: number;
  transcodeDetail: string;
  bandwidthCoverageLabel: string;
  bandwidthMeasured: number;
}

export function activityKpis({view,summary,analytics,liveCount,periodLabel,averageWatch,transcodeDetail,bandwidthCoverageLabel,bandwidthMeasured}: KpiSource): AnalyzeKpi[] {
  const plural=(count: number,word: string)=>`${count} ${word}${count>1?'s':''}`;
  if(view==='overview'){
    return [
      {key:'live',label:'En direct',value:String(liveCount),detail:'lectures maintenant'},
      {key:'sessions',label:'Sessions',value:String(summary.sessions||0),detail:`sur ${periodLabel}`,change:analytics.comparison?.sessions_change},
      {key:'watch',label:'Temps regardé',value:formatDuration(summary.watch_ms),detail:'durée cumulée',change:analytics.comparison?.watch_change},
      {key:'transcode',label:'Transcodage',value:`${summary.transcode_rate||0} %`,detail:transcodeDetail},
      {key:'completed',label:'Terminées',value:String(analytics.engagement?.completed||0),detail:'seuil Tautulli ou générique'},
      {key:'abandoned',label:'Abandonnées',value:String(analytics.engagement?.abandoned||0),detail:'avant le premier quart du seuil'},
      {key:'resumed',label:'Reprises',value:String(analytics.engagement?.resumed||0),detail:'sessions regroupées'},
      {key:'rewatches',label:'Revisionnages',value:String(analytics.engagement?.rewatches||0),detail:'nouvelle lecture du même média'},
      {key:'average',label:'Durée moyenne',value:formatDuration(averageWatch),detail:'par session'},
    ];
  }
  if(view==='quality'){
    const transcodes=summary.transcodes||0;
    const light=summary.direct_streams||0;
    return [
      {key:'bandwidth',label:'Débit moyen',value:formatBandwidth(analytics.bandwidth?.average_kbps),detail:bandwidthCoverageLabel},
      {key:'p95',label:'Débit P95',value:formatBandwidth(analytics.bandwidth?.p95_kbps),detail:`95 % sous ce seuil · ${bandwidthMeasured} mesurées`},
      {key:'peak',label:'Débit maximal',value:formatBandwidth(analytics.bandwidth?.peak_kbps),detail:'pic observé'},
      {key:'transcode',label:'Transcodage',value:`${summary.transcode_rate||0} %`,detail:`${plural(transcodes,'session')} réencodée${transcodes>1?'s':''}`},
      {key:'light',label:'Conversion légère',value:`${summary.direct_stream_rate||0} %`,detail:`${plural(light,'session')} sans réencodage`},
      {key:'storage',label:'Rendement stockage',value:analytics.storage?.watch_hours_per_gb==null?'—':`${analytics.storage.watch_hours_per_gb} h/Go`,detail:`${analytics.storage?.known_items||0} fichiers mesurés`},
    ];
  }
  return [];
}
