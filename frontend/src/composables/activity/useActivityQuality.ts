/* Activité : la qualité des flux de la periode -- repartitions (mode, resolution, codec,
   raisons, conteneur, debit par utilisateur) et couverture des mesures remontees par Plex. */
import { computed, type Ref } from 'vue';
import { playbackMethodLabel } from '@/utils/labels';
import { formatBandwidth } from '@/utils/format';

export function useActivityQuality(analytics: Ref<Record<string, any>>, summary: Ref<Record<string, any>>) {
  const labelled=(list?: any[])=>(list||[]).map((item: any)=>({label:item.label,value:item.count}));
  const methodBreakdown=computed(()=>(analytics.value.quality?.methods||[]).map((item: any)=>({label:playbackMethodLabel(item.key,{fallback:item.key==='unknown'?'Inconnu':item.key}),value:item.count,suffix:` · ${item.rate} %`})));
  const resolutionBreakdown=computed(()=>labelled(analytics.value.quality?.resolutions));
  const codecBreakdown=computed(()=>labelled(analytics.value.quality?.codecs));
  const transcodeReasonBreakdown=computed(()=>labelled(analytics.value.quality?.transcode_reasons));
  const directStreamReasonBreakdown=computed(()=>labelled(analytics.value.quality?.direct_stream_reasons));
  /* Conteneur du fichier source, et combien de lectures ont dû en changer pour le lecteur. */
  const containerBreakdown=computed(()=>(analytics.value.quality?.containers||[]).map((item: any)=>({label:item.label,value:item.count,suffix:item.converted?` · ${item.converted} converti${item.converted>1?'s':''}`:' · inchangé'})));
  const transcodeDetail=computed(()=>{
    const transcodes=summary.value.transcodes||0;
    const light=summary.value.direct_streams||0;
    return `${transcodes} session${transcodes>1?'s':''}${light?` · ${light} conversion${light>1?'s':''} légère${light>1?'s':''}`:''}`;
  });
  const qualityCoverage=computed(()=>analytics.value.quality?.coverage||{sessions:0,method_known:0,bandwidth_measured:0});
  const bandwidthMeasured=computed(()=>analytics.value.bandwidth?.measured??qualityCoverage.value.bandwidth_measured??0);
  const methodCoverageRate=computed(()=>{
    const total=qualityCoverage.value.sessions||0;
    return total?Math.round((qualityCoverage.value.method_known||0)/total*100):0;
  });
  const bandwidthCoverageLabel=computed(()=>{
    const measured=bandwidthMeasured.value;
    const total=qualityCoverage.value.sessions||0;
    return measured?`mesuré sur ${measured} lecture${measured>1?'s':''} sur ${total}`:'aucun débit communiqué par Plex';
  });
  const bandwidthBreakdown=computed(()=>(analytics.value.bandwidth?.by_user||[]).map((item: any)=>({label:item.name,value:Math.round(item.average_kbps/100)/10,suffix:' Mb/s',detail:`Pic ${formatBandwidth(item.peak_kbps)}`})));

  return {
    methodBreakdown, resolutionBreakdown, codecBreakdown, transcodeReasonBreakdown, directStreamReasonBreakdown,
    containerBreakdown, transcodeDetail, qualityCoverage, bandwidthMeasured, methodCoverageRate,
    bandwidthCoverageLabel, bandwidthBreakdown,
  };
}
