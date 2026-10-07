<template>
 <div class="transfer-summary">
  <header><div class="heading"><div class="title"><h2>{{ job.params?.name || `Tâche #${job.id}` }}</h2><UiBadge :tone="job.status==='completed'?'success':['blocked','failed','cancel_blocked'].includes(job.status)?'warning':'neutral'">{{ status(job.status) }}</UiBadge></div><p class="caption">Tâche #{{ job.id }} · {{ instance }} · {{ method }} · {{ job.params?.verification==='sha256'?'SHA 256':'Vérification standard' }}</p></div><div class="summary-actions"><slot name="actions" /></div></header>
  <div class="route"><div><small>Depuis</small><strong>{{ job.params?.source_roots?.join(' · ') || source }}</strong></div><ArrowRight :size="20" aria-hidden="true" /><div><small>Vers</small><strong>{{ job.params?.destination_root || destination }}</strong></div></div>
  <StorageTransferMetrics :job="job" />
  <StoragePlexFinalization :job="job" :gb="gb" />
  <StorageCurrentMedia :job="job" :status="status" hero />
  <footer><span><b>{{ gb(job.released_bytes || 0) }} réellement libérés</b><template v-if="awaiting"> · {{ gb(awaiting) }} en attente de suppression</template></span><span>Créé : {{ date(job.created_at) }}</span></footer>
 </div>
</template>
<script setup lang="ts">
import StorageCurrentMedia from './StorageCurrentMedia.vue';
import {computed} from 'vue';
import {ArrowRight,ArrowUpRight} from '@lucide/vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import StorageTransferMetrics from './StorageTransferMetrics.vue';
import StoragePlexFinalization from './StoragePlexFinalization.vue';
const props=defineProps<{job:any,instance:string,source:string,destination:string,status:(value:string)=>string,gb:(value:any)=>string,date:(value:any)=>string}>();
const method=computed(()=>(({arr:'API Sonarr / Radarr',rsync_ssh:'Rsync par SSH',rsync_local:'Rsync local'} as Record<string,string>)[props.job.params?.transfer_mode as string] || 'Rsync'));
const current=computed(()=>props.job.items.find((i:any)=>i.status==='copying') || props.job.items.find((i:any)=>['prepared','copying','verifying','switching','plex_pending','cleaning','arr_pending'].includes(i.status)));
const awaiting=computed(()=>props.job.items.filter((i:any)=>['switching','plex_pending','cleaning'].includes(i.status)).reduce((n:number,i:any)=>n+i.size_bytes,0));
</script>
<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.transfer-summary{min-width:0}header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.heading{min-width:0;flex:1}.title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.title h2{margin:0;font-size:var(--fs-lg);overflow-wrap:anywhere}.caption{color:var(--muted);font-size:var(--fs-sm);margin:5px 0 0}.summary-actions{min-width:0}.route{display:flex;align-items:center;gap:14px;margin:18px 0;padding:12px 15px;background:var(--surface-2);border-radius:var(--radius-md);min-width:0}.route>div{flex:1;min-width:0}.route svg{flex-shrink:0;color:var(--accent)}.route small,.current small{display:block;color:var(--muted);font-size:var(--fs-sm)}.route strong{display:block;overflow-wrap:anywhere;font-size:var(--fs-sm)}.current{display:flex;align-items:flex-start;gap:12px;border-top:1px solid var(--border);padding-top:14px;margin-top:18px}.current>div{min-width:0}.current strong{display:block}.current p{overflow-wrap:anywhere;margin:4px 0 0;font-size:var(--fs-sm);color:var(--muted)}.current-icon{background:var(--surface-2);padding:8px;border-radius:var(--radius-md);color:var(--accent)}footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:16px;color:var(--muted);font-size:var(--fs-sm)}footer b{color:var(--green-text)}@include bp.until(phablet){.summary-actions{width:100%}.route{gap:10px;padding:11px}.title h2{font-size:var(--fs-base)}footer{display:grid;gap:6px}}
</style>
