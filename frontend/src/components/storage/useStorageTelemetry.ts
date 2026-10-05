import {computed,type Ref} from 'vue';
import type {UiColumn} from '@/components/ui/UiDataTable.vue';
export function useStorageTelemetry(locations:Ref<any[]>,jobs:Ref<any[]>,tab:Ref<string>,plan:Ref<any>,selected:Ref<string[]>){
const allItems=computed(()=>jobs.value.flatMap(j=>j.items.map((item:any)=>({...item,source_id:item.snapshot?.source_location_id||j.source_id}))));
const remainingItems=computed(()=>allItems.value.filter(i=>i.status!=='completed'));
const completedItems=computed(()=>allItems.value.filter(i=>i.status==='completed'));
const remainingBytes=computed(()=>remainingItems.value.reduce((sum,item)=>sum+item.size_bytes,0));
const releasedBytes=computed(()=>completedItems.value.reduce((sum,item)=>sum+item.size_bytes,0));
const activeJobs=computed(()=>jobs.value.filter(j=>['queued','running'].includes(j.status)));
const pausedJobs=computed(()=>jobs.value.filter(j=>['paused','stopped'].includes(j.status)));
const remainingFor=(id:number)=>remainingItems.value.filter(i=>i.source_id===id);
const REMAINING_COLUMNS:UiColumn[]=[{key:'location',label:'Stockage source',card:'title'},{key:'type',label:'Type'},{key:'count',label:'Titres restants'},{key:'bytes',label:'Volume restant'}];
const remainingRows=computed(()=>locations.value.flatMap(l=>['movie','series'].map(type=>{const items=remainingFor(l.id).filter(i=>i.media_type===type);return {key:`${l.id}:${type}`,location:l.name,type:type==='movie'?'Films':'Séries',count:items.length,bytes:items.reduce((sum,i)=>sum+i.size_bytes,0)};})).filter(r=>r.count));
const usedPercent=(l:any)=>l.total_bytes>0?Math.min(100,Math.max(0,Math.round((l.total_bytes-l.free_bytes)/l.total_bytes*100))):0;
const reservePercent=(l:any)=>l.total_bytes>0?Math.min(100-usedPercent(l),l.reserve_bytes/l.total_bytes*100):0;
function projectedFree(l:any){if(l.free_bytes==null)return null;const outgoing=remainingFor(l.id).reduce((n,i)=>n+i.size_bytes,0);const incoming=jobs.value.filter(j=>j.destination_id===l.id).flatMap(j=>j.items).filter(i=>i.status!=='completed').reduce((n,i)=>n+Math.max(0,i.size_bytes-(i.progress?.copied_bytes||0)),0);return Math.max(0,l.free_bytes+outgoing-incoming);}
const activeItem=(job:any)=>job.items.find((i:any)=>['prepared','copying','verifying','switching','plex_pending','cleaning','arr_pending'].includes(i.status));
const copyPercent=(i:any)=>i.size_bytes>0?Math.min(100,Math.max(0,Math.round((i.progress?.copied_bytes||0)/i.size_bytes*100))):0;
const duration=(seconds:number)=>seconds<60?`${Math.ceil(seconds)} s`:seconds<3600?`${Math.ceil(seconds/60)} min`:`${Math.floor(seconds/3600)} h ${Math.ceil(seconds%3600/60)} min`;
function measuredRate(i:any){const p=i?.progress;return i?.status==='copying' && p?.bytes_per_second>0 && Date.now()/1000-p.updated_at<15?p.bytes_per_second:null;}
const rateLabel=(i:any)=>measuredRate(i)?`${(measuredRate(i)/1e6).toLocaleString('fr-FR',{maximumFractionDigits:1})} Mo/s`:'Débit en attente de mesure';
function copyEta(job:any){const item=activeItem(job),rate=measuredRate(item);if(!rate || job.desired_state!=='run')return 'Estimation indisponible';const bytes=job.items.filter((i:any)=>i.status!=='completed').reduce((n:number,i:any)=>n+Math.max(0,i.size_bytes-(i.progress?.copied_bytes||0)),0);return `≈ ${duration(bytes/rate)}`;}
const HISTORY_COLUMNS:UiColumn[]=[{key:'route',label:'Trajet',card:'title'},{key:'state',label:'État'},{key:'titles',label:'Films / séries'},{key:'volume',label:'Volume libéré'},{key:'dates',label:'Début / fin'},{key:'duration',label:'Durée écoulée'},{key:'deferred',label:'À traiter'}];
function jobStart(j:any){return j.items.map((i:any)=>i.progress?.started_at).filter(Boolean).sort()[0];}
function jobEnd(j:any){return j.status==='completed'?j.items.map((i:any)=>i.progress?.finished_at).filter(Boolean).sort().at(-1):null;}
function elapsed(j:any){const start=jobStart(j),end=jobEnd(j);return start && end?duration(Math.max(0,(new Date(end).getTime()-new Date(start).getTime())/1000)):'Indisponible';}
const recentRows=computed(()=>jobs.value.filter(j=>['completed','blocked','stopped','paused'].includes(j.status)).slice(0,5).map(j=>({id:j.id,route:`${locationName(j.source_id)} → ${locationName(j.destination_id)}`,state:status(j.status),titles:`${j.items.filter((i:any)=>i.media_type==='movie').length} film(s) / ${j.items.filter((i:any)=>i.media_type==='series').length} série(s)`,volume:j.released_bytes,dates:`${jobStart(j)?date(jobStart(j)):'Début non enregistré'} / ${jobEnd(j)?date(jobEnd(j)):'Non terminé'}`,duration:elapsed(j),deferred:j.items.filter((i:any)=>['blocked','deferred','plex_pending'].includes(i.status)).length})));
const issues=computed(()=>jobs.value.flatMap(j=>j.items).filter(i=>['blocked','deferred','plex_pending'].includes(i.status)));
const visibleJobs=computed(()=>jobs.value.filter(j=>tab.value==='history'?['completed','blocked','stopped','paused'].includes(j.status):j.status!=='completed'));
const selectedBytes=computed(()=>plan.value?.items.filter((i:any)=>selected.value.includes(i.key)).reduce((a:number,i:any)=>a+i.size_bytes,0)||0);
const gb=(n:any)=>n==null?'—':`${(Number(n)/1e9).toLocaleString('fr-FR',{maximumFractionDigits:1})} Go`;
const date=(n:any)=>n?new Date(n.endsWith('Z')?n:n+'Z').toLocaleString('fr-FR'):'Non contrôlé';
const locationName=(id:number)=>locations.value.find(l=>l.id===id)?.name||`Stockage ${id}`;
const labels:Record<string,string>={draft:'À lancer',queued:'En attente',running:'En cours',pending:'En attente',prepared:'Préparé',copying:'Copie',verifying:'Vérification',switching:'Bascule Arr',plex_pending:'Confirmation Plex',arr_pending:'Déplacement confié à Arr',cleaning:'Nettoyage',completed:'Terminé',blocked:'À traiter',deferred:'Reporté',paused:'En pause',stopped:'Arrêté'};
const status=(value:string)=>labels[value]||value;

return {remainingItems,completedItems,remainingBytes,releasedBytes,activeJobs,pausedJobs,remainingFor,REMAINING_COLUMNS,remainingRows,usedPercent,reservePercent,projectedFree,activeItem,copyPercent,rateLabel,copyEta,HISTORY_COLUMNS,jobStart,jobEnd,elapsed,recentRows,issues,visibleJobs,selectedBytes,gb,date,locationName,status};
}
