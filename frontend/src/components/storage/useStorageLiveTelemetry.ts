import {onMounted,onUnmounted,type Ref} from 'vue';
import {api} from '@/api';

/** One lightweight request per second while a visible SSH/local transfer is active. */
export function useStorageLiveTelemetry(jobs:Ref<any[]>,loading:Ref<boolean>){
 let timer:ReturnType<typeof setTimeout>|undefined;
 let pending=false,disposed=false;

 function activeIds(): any[] {
  const before=jobs.value;
  return before.filter(job=>job.desired_state==='run' && ['queued','running','finalizing'].includes(job.status) && job.params?.transfer_mode!=='arr').map(job=>job.id);
 }

 async function refresh(){
  if(disposed || pending || loading.value || document.hidden)return;
  const before=jobs.value;
  const ids=activeIds();
  if(!ids.length)return;
  pending=true;
  try{
   const updates=await api<any[]>(`/api/storage/transfers/telemetry?ids=${ids.join(',')}`);
   // Full refreshes and commands own structural changes. Discard an older response.
   if(disposed || loading.value || jobs.value!==before)return;
   const byId=new Map(updates.map(update=>[update.id,update]));
   jobs.value=before.map(job=>{
    const update=byId.get(job.id);
    if(!update || update.items.length!==job.items.length)return job;
    const items=new Map(update.items.map((item:any)=>[item.id,item]));
    if(job.items.some((item:any)=>!items.has(item.id)))return job;
    return {...job,...update,items:job.items.map((item:any)=>({...item,...items.get(item.id) as any}))};
   });
  }catch{
   // Keep the last measurement; the existing full refresh reports connection errors.
  }finally{pending=false;}
 }

 async function tick(){
  if(disposed)return;
  await refresh();
  if(disposed)return;
  const delay=activeIds().length>0?1000:5000;
  timer=setTimeout(tick,delay);
 }

 onMounted(()=>{timer=setTimeout(tick,1000);});
 onUnmounted(()=>{disposed=true;if(timer)clearTimeout(timer);});
 return {refresh};
}
