/** Copy telemetry, independent from source cleanup and space actually freed. */
export function transferMetrics(job:any, now=Date.now()/1000) {
  const items=job.items || [];
  const size=(item:any)=>Math.max(0,Number(item.size_bytes)||0);
  const total=items.reduce((sum:number,item:any)=>sum+size(item),0);
  const copied=items.reduce((sum:number,item:any)=>sum+(['switching','plex_pending','cleaning','completed'].includes(item.status)?size(item):Math.min(size(item),Math.max(0,Number(item.progress?.copied_bytes)||0))),0);
  const remaining=Math.max(0,total-copied);
  // The display clock ticks once per second and can lag a newly received sample.
  // Allow a small clock skew without keeping genuinely stale measurements alive.
  const rates=items.filter((item:any)=>item.status==='copying').map((item:any)=>item.progress).filter((p:any)=>Number.isFinite(p?.bytes_per_second) && p.bytes_per_second>0 && Number.isFinite(p.updated_at) && now-p.updated_at>=-5 && now-p.updated_at<15);
  const rate=job.desired_state==='run' && job.params?.transfer_mode!=='arr' && ['running','queued'].includes(job.status) && rates.length?rates.reduce((sum:number,p:any)=>sum+p.bytes_per_second,0):null;
  const lastMeasurement=items.map((item:any)=>item.progress).filter((p:any)=>p?.last_bytes_per_second>0).sort((a:any,b:any)=>(b.rate_measured_at||0)-(a.rate_measured_at||0))[0];
  const lastRate=job.params?.transfer_mode==='arr'?null:lastMeasurement?.last_bytes_per_second||null;
  const starts=items.map((item:any)=>item.progress?.started_at).filter(Boolean).map((value:string)=>Date.parse(value.endsWith('Z')?value:value+'Z')/1000);
  const ends=items.map((item:any)=>item.progress?.finished_at).filter(Boolean).map((value:string)=>Date.parse(value.endsWith('Z')?value:value+'Z')/1000);
  const elapsed=starts.length?Math.max(0,(['completed','cancelled'].includes(job.status)&&ends.length?Math.max(...ends):now)-Math.min(...starts)):null;
  return {total,copied,remaining,rate,lastRate,elapsed,seconds:rate && remaining>0?remaining/rate:null,percent:total>0?copied/total*100:0};
}

export function copyDuration(seconds:number|null) {
  if(seconds==null)return '—';
  const minutes=Math.ceil(seconds/60);
  return seconds<60?`${Math.ceil(seconds)} s`:minutes<60?`${minutes} min`:`${Math.floor(minutes/60)} h${minutes%60?` ${minutes%60} min`:''}`;
}
