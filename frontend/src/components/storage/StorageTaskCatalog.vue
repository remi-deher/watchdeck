<template>
  <section class="task-catalog">
    <template v-if="selectedJob">
      <UiButton variant="ghost" @click="detailId=null">← {{ tab==='history'?'Historique':'Transferts' }}</UiButton>
      <StorageTransferList ref="detailList" :jobs="[selectedJob]" :locations="locations" :instances="instances" :busy="busy" :tab="tab" detail-mode @command="(id,action)=>$emit('command',id,action)" @edit="$emit('edit',$event)" @duplicate="$emit('duplicate',$event)" @verify="$emit('verify',$event)" @remove="$emit('remove',$event)" @relaunch="$emit('relaunch',$event)" />
    </template>
    <template v-else>
      <UiSectionHeader :title="tab==='history'?'Historique':'Vos transferts'" :description="tab==='history'?'Le bilan des tâches terminées.':'Suivre les déplacements et reprendre les tâches qui demandent votre attention.'" />
      <AppSubnav v-model:active="filter" :items="filterItems" variant="tabs" aria-label="Filtrer les tâches" />
      <UiDataTable v-if="tab==='history'" label="Historique des transferts" :rows="filteredJobs" :columns="columns" :row-key="row=>row.id">
        <template #cell-name="{row}"><strong>{{ row.params?.name || `Tâche #${row.id}` }}</strong><small>#{{ row.id }} · {{ status(row.status) }}</small></template>
        <template #cell-media="{row}">{{ recap(row) }}<small v-if="episodeRecap(row)">{{ episodeRecap(row) }}</small></template>
        <template #cell-route="{row}">{{ locationName(row.source_id) }} → {{ locationName(row.destination_id) }}</template>
        <template #cell-dates="{row}"><small>Début : {{ jobStart(row)?date(jobStart(row)):'Non enregistré' }}</small><small>Fin : {{ jobEnd(row)?date(jobEnd(row)):'Non enregistrée' }}</small></template>
        <template #cell-rate="{row}"><strong>{{ averageRate(row) }}</strong><small>Copie uniquement</small></template>
        <template #cell-released="{row}">{{ gb(row.released_bytes) }}</template>
        <template #cell-actions="{row}"><UiButton variant="ghost" @click="detailId=row.id">Détails</UiButton><StorageTaskActions :job="row" :busy="busy" compact @relaunch="$emit('relaunch',$event)" @edit="$emit('edit',$event)" @duplicate="$emit('duplicate',$event)" @remove="confirmAction(row,'remove')" /></template>
      </UiDataTable>
      <template v-else>
        <UiEmptyState v-if="!filteredJobs.length" title="Aucune tâche" message="Créez un transfert ou changez de filtre." compact />
        <PanelCard v-for="job in filteredJobs" :key="job.id">
          <header class="task-head"><div><h2>{{ job.params?.name || `Tâche #${job.id}` }} <UiBadge>{{ status(job.status) }}</UiBadge></h2><p>{{ locationName(job.source_id) }} → {{ locationName(job.destination_id) }} · #{{ job.id }}</p></div></header>
          <p v-if="job.status==='draft'" class="draft-note">Tâche enregistrée, aucun transfert lancé</p><StorageCurrentMedia :job="job" :status="status" />
          <StorageTransferMetrics v-if="job.status!=='draft'" :job="job" compact />
          <UiFeedback v-if="issueCount(job)" type="warning" :message="`${issueCount(job)} titre(s) à traiter. Les motifs et chemins sont accessibles dans le détail.`" />
          <footer><UiButton @click="detailId=job.id">{{ issueCount(job)?'Examiner':'Voir le détail' }}</UiButton><StorageTaskActions :job="job" :busy="busy" compact @command="(id,action)=>$emit('command',id,action)" @edit="$emit('edit',$event)" @duplicate="$emit('duplicate',$event)" @verify="$emit('verify',$event)" @relaunch="$emit('relaunch',$event)" @remove="confirmAction(job,'remove')" @cancel="confirmAction(job,'cancel')" /></footer>
        </PanelCard>
      </template>
    </template>
  </section>
</template>
<script setup lang="ts">
import {computed,nextTick,ref,toRef,watch} from 'vue';
import AppSubnav from '@/components/ui/AppSubnav.vue';import PanelCard from '@/components/ui/PanelCard.vue';import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';import UiButton from '@/components/ui/UiButton.vue';import UiBadge from '@/components/ui/UiBadge.vue';import UiFeedback from '@/components/ui/UiFeedback.vue';import UiEmptyState from '@/components/ui/UiEmptyState.vue';import UiDataTable,{type UiColumn} from '@/components/ui/UiDataTable.vue';
import StorageTransferList from './StorageTransferList.vue';import StorageTaskActions from './StorageTaskActions.vue';import StorageTransferMetrics from './StorageTransferMetrics.vue';import StorageCurrentMedia from './StorageCurrentMedia.vue';import {useStorageTelemetry} from './useStorageTelemetry';
const props=defineProps<{jobs:any[],locations:any[],instances:any[],busy:boolean,tab:string,query?:string}>();
defineEmits<{command:[id:number,action:string],edit:[job:any],duplicate:[job:any],verify:[job:any],remove:[id:number],relaunch:[job:any]}>();
const detailId=ref<number|null>(null),filter=ref('all');watch(()=>props.tab,()=>{detailId.value=null;filter.value='all'});
const detailList=ref<any>(null);
async function confirmAction(job:any,action:string){detailId.value=job.id;await nextTick();if(action==='remove')detailList.value?.confirmRemove(job);else detailList.value?.confirmCancel(job);}
const selectedJob=computed(()=>props.jobs.find(j=>j.id===detailId.value));
const {status,date,gb,locationName,jobStart,jobEnd}=useStorageTelemetry(toRef(props,'locations'),toRef(props,'jobs'),toRef(props,'tab'),ref(null),ref([]));
const terminal=(j:any)=>['completed','cancelled'].includes(j.status);
const pool=computed(()=>props.jobs.filter(j=>props.tab==='history'?terminal(j):!terminal(j)));
const issueCount=(j:any)=>(j.items||[]).filter((i:any)=>['blocked','failed','deferred'].includes(i.status)).length;
const matches=(j:any,key:string)=>key==='all'||(key==='active'?['queued','running','finalizing'].includes(j.status):key==='issues'?issueCount(j)>0||['blocked','failed','cancel_blocked','stopped'].includes(j.status):key==='paused'?j.status==='paused':j.status===key);
const filters=computed(()=>props.tab==='history'?[['all','Toutes'],['completed','Terminées'],['cancelled','Annulées']]:[['all','Toutes'],['active','En cours'],['issues','À traiter'],['paused','En pause'],['draft','Brouillons']]);
const filterItems=computed(()=>filters.value.map(([key,label])=>({key,label,count:pool.value.filter(j=>matches(j,key)).length})));
const filteredJobs=computed(()=>pool.value.filter(j=>matches(j,filter.value)&&(j.params?.name||`Tâche #${j.id}`).toLowerCase().includes((props.query||'').toLowerCase())));
const recap=(j:any)=>{const completed=j.items.filter((i:any)=>i.status==='completed');return `${completed.filter((i:any)=>i.media_type==='movie').length} film(s) · ${completed.filter((i:any)=>i.media_type==='series').length} série(s) transféré(s)`;};
const episodeRecap=(j:any)=>{const series=j.items.filter((i:any)=>i.status==='completed'&&i.media_type==='series');return series.length&&series.every((i:any)=>i.presentation?.counts?.episodes!=null)?`${series.reduce((n:number,i:any)=>n+i.presentation.counts.episodes,0)} épisodes · ${series.reduce((n:number,i:any)=>n+i.presentation.counts.seasons,0)} saisons`:'';};
const averageRate=(j:any)=>{const seconds=j.items.reduce((n:number,i:any)=>n+(i.progress?.copy_seconds||0),0),bytes=j.items.reduce((n:number,i:any)=>n+(i.progress?.measured_copy_bytes||0),0);return seconds>0?`${(bytes/seconds/1e6).toLocaleString('fr-FR',{maximumFractionDigits:1})} Mo/s`:'Non mesuré';};
const columns:UiColumn[]=[{key:'name',label:'Tâche',card:'title'},{key:'media',label:'Médias transférés'},{key:'route',label:'Trajet'},{key:'dates',label:'Début / fin'},{key:'rate',label:'Débit moyen'},{key:'released',label:'Espace libéré'},{key:'actions',label:'Actions',card:'actions'}];
</script>
<style scoped>.task-catalog{display:grid;gap:18px;min-width:0}.task-head h2{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:var(--fs-base);margin:0}.task-head p{font-size:var(--fs-sm);color:var(--muted);margin:8px 0}footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:18px;padding-top:14px;border-top:1px solid var(--border)}</style>
