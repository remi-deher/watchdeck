<template>
 <section class="job-list">
  <AppSubnav v-model:active="filter" :items="filterItems" variant="tabs" class="compact-subnav" aria-label="Filtrer les tâches" />
  <UiEmptyState v-if="!filteredJobs.length" title="Aucune tâche" message="Aucune tâche dans cette section." compact />
  <PanelCard v-for="job in filteredJobs" :key="job.id" class="transfer-batch">
   <header class="task-main"><div class="task-heading"><h2>{{ job.params?.name || `Tâche #${job.id}` }}</h2><UiBadge :tone="job.status==='completed'?'success':['cancel_blocked','blocked'].includes(job.status)?'warning':'neutral'">{{ status(job.status) }}</UiBadge></div><StorageTaskActions :job="job" :busy="busy" @verify="$emit('verify',$event)" @edit="$emit('edit',$event)" @duplicate="$emit('duplicate',$event)" @remove="removing=$event" @cancel="cancelling=$event" @command="(id,action)=>$emit('command',id,action)" /></header>
   <div class="task-subline"><span class="task-route">{{ instanceName(job) }} · {{ job.params?.source_roots?.join(', ') || locationName(job.source_id) }} → {{ job.params?.destination_root || locationName(job.destination_id) }}</span><span>{{ job.items.length }} titres · {{ gb(job.planned_bytes) }}</span></div>
   <div v-if="job.status!=='draft'" class="batch-summary"><span>{{ finished(job) }} / {{ job.items.length }} terminés</span><span>{{ job.items.filter((item:any)=>!['completed','cancelled'].includes(item.status)).length }} restants</span><span>{{ gb(copied(job)) }} copiés</span><span>{{ gb(awaitingCleanup(job)) }} en attente de suppression</span><span>{{ gb(job.released_bytes) }} réellement libérés</span></div>
   <p v-if="activeItem(job)">Maintenant : <strong>{{ activeItem(job).title }}</strong> · {{ status(activeItem(job).status) }}</p><p v-else-if="job.status!=='draft'">{{ job.status==='completed'?'Lot terminé':job.status==='cancelled'?'Tâche annulée · copies complètes conservées':'En attente du prochain titre' }}</p>
   <UiFeedback v-if="job.error" type="warning" :message="job.error" /><p v-if="!terminal(job) && job.status!=='draft' && job.desired_state !== 'run' && job.desired_state!=='cancel'">{{ job.desired_state==='pause'?'Pause':'Arrêt' }} demandé : {{ job.params?.transfer_mode==='arr'?'les prochains titres sont suspendus ; une copie Arr déjà lancée peut continuer.':'les fichiers partiels restent conservés.' }}</p>

   <UiProgress v-if="job.status!=='draft' && job.items.length" :value="finished(job)" :max="job.items.length" :label="`Titres terminés de la tâche ${job.id}`" /><UiFeedback v-if="job.status==='cancelling'" type="loading" message="Arrêt de la copie et nettoyage des fichiers temporaires. Les copies complètes restent conservées." />
   <p v-if="activeItem(job) && ['arr_pending','copying'].includes(activeItem(job).status) && job.params?.transfer_mode==='arr'">Déplacement en cours dans {{ job.items.some((i:any)=>i.media_type==='series')?'Sonarr':'Radarr' }}. La progression de copie n’est pas fournie ; le suivi compte les titres terminés.</p>
   <div v-if="issues(job).length" class="task-issues"><strong>{{ issues(job).length }} titre(s) à traiter</strong><ul><li v-for="issue in reasons(job)" :key="issue.reason">{{ issue.count }} titre(s) : {{ issue.reason }}<small>{{ advice(issue.reason) }}</small></li></ul><p>Consultez les détails des titres pour corriger le motif, puis réessayez. Les autres titres peuvent continuer.</p></div>
   <details class="task-titles"><summary>Voir les {{ job.items.length }} titres et leurs détails</summary>
   <UiDataTable density="compact" v-if="items(job).length" :label="`Titres du lot ${job.id}`" :rows="items(job)" :columns="columns" :row-key="row=>row.id">
    <template #cell-size="{row}">{{ gb(row.size_bytes) }}</template>
    <template #cell-state="{row}">{{ status(row.status) }}<small v-if="job.params?.transfer_mode!=='arr' && row.status==='copying'">{{ copyPercent(row) }} % · {{ rateLabel(row) }}</small></template>
    <template #cell-updated="{row}">{{ date(row.updated_at) }}</template>
    <template #cell-details="{row}"><UiButton variant="ghost" :aria-label="`Détails de ${row.title}`" @click="detailItem=row">Détails</UiButton></template>
   </UiDataTable><p v-else>Aucun titre ne correspond à ce filtre dans ce lot.</p>
   <details class="task-metadata"><summary>Objectifs et dates</summary><p v-if="job.status==='draft'">Tâche enregistrée, aucun transfert lancé</p><p>{{ job.params?.mode==='minimum_free'?'Espace libre minimum':job.params?.objective_mode==='selection'?'Sélection de titres':'Espace à libérer' }} : {{ gb((job.params?.goal_gb||0)*1e9) }} {{ Object.keys(job.params?.root_goals||{}).length || job.params?.mode==='minimum_free'?'par source':'au total' }}</p><p v-if="job.params?.target_titles">Répartition : {{ job.params.target_titles }} titres</p><p v-for="(value,root) in job.params?.root_goals || {}" :key="root">{{ root }} : {{ gb(Number(value)*1e9) }}</p><p>Dernière activité : {{ date(job.updated_at) }}</p><p>Créé : {{ date(job.created_at) }} · Début : {{ date(jobStart(job)) }} · Fin : {{ date(jobEnd(job)) }} · Durée : {{ elapsed(job) }}</p></details>
   </details>
  </PanelCard>
  <ModalShell :open="Boolean(removing)" title="Supprimer le brouillon ?" :busy="busy" @close="removing=null"><p>Cette tâche et sa sélection seront supprimées. Aucun fichier média ne sera déplacé ou supprimé.</p><div class="actions"><UiButton @click="removing=null">Annuler</UiButton><UiButton :disabled="busy" @click="$emit('remove',removing.id);removing=null">Supprimer le brouillon</UiButton></div></ModalShell>
  <ModalShell :open="Boolean(cancelling)" title="Annuler cette tâche ?" :busy="busy" @close="cancelling=null">
    <p>Les prochains titres ne seront pas transférés. Les fichiers partiels de cette tâche seront nettoyés après l’arrêt de la copie.</p><p>Les copies complètes, les originaux non transférés et les deux emplacements Plex restent conservés. Avec rsync, une série incomplète garde sa racine Arr d’origine.</p>
    <UiFeedback v-if="cancelling?.params?.transfer_mode==='arr'" type="warning" message="Une commande Sonarr / Radarr déjà lancée peut continuer. L’annulation attend sa fin et ne revient pas sur son déplacement." />
    <template #actions><UiButton @click="cancelling=null">Garder la tâche</UiButton><UiButton :disabled="busy" @click="$emit('command',cancelling.id,'cancel');cancelling=null">Annuler et nettoyer</UiButton></template>
  </ModalShell>
  <StorageItemDialog :item="detailItem" :status="status" :date="date" :gb="gb" @close="detailItem=null" />
 </section>
</template>
<script setup lang="ts">
import PanelCard from '@/components/ui/PanelCard.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import StorageTaskActions from './StorageTaskActions.vue';
import StorageItemDialog from './StorageItemDialog.vue';
import AppSubnav from '@/components/ui/AppSubnav.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import {computed,ref,toRef} from 'vue';import UiButton from '@/components/ui/UiButton.vue';import UiDataTable,{type UiColumn} from '@/components/ui/UiDataTable.vue';import {useStorageTelemetry} from './useStorageTelemetry';
const props=defineProps<{jobs:any[],locations:any[],busy:boolean,tab:string,instances?:any[]}>();const tab=toRef(props,'tab');
const {visibleJobs,gb,date,locationName,status,activeItem,copyPercent,rateLabel,jobStart,jobEnd,elapsed}=useStorageTelemetry(toRef(props,'locations'),toRef(props,'jobs'),tab,ref(null),ref<string[]>([]));
const instanceName=(job:any)=>props.instances?.find(i=>i.id===job.params?.arr_instance_id)?.name||`Instance ${job.params?.arr_instance_id || 'non précisée'}`;
function advice(reason:string){if(/lecture|playing/i.test(reason))return 'Attendre la fin de la lecture, puis reprendre.';if(/espace|capacity|insuffisant/i.test(reason))return 'Libérer de la place à destination avant de réessayer.';if(/connexion|accès|accessible/i.test(reason))return 'Vérifier les services et leurs accès avant de réessayer.';return 'Vérifier le motif et les chemins dans les détails avant de réessayer.';}
const filters=[{key:'all',label:'Toutes'},{key:'draft',label:'À lancer'},{key:'active',label:'En cours'},{key:'issues',label:'En pause / À traiter'},{key:'completed',label:'Terminées'},{key:'cancelled',label:'Annulées'}];const filter=ref('all'),removing=ref<any>(null),cancelling=ref<any>(null),detailItem=ref<any>(null);
const terminal=(job:any)=>['completed','cancelled'].includes(job.status);
const filterItems=computed(()=>filters.map(choice=>({...choice,count:countJobs(choice.key)})));
const issues=(job:any)=>job.items.filter((i:any)=>['blocked','failed','deferred','plex_pending'].includes(i.status));
function reasons(job:any){const counts=new Map<string,number>();for(const item of issues(job)){const reason=item.reason||status(item.status);counts.set(reason,(counts.get(reason)||0)+1);}return [...counts].map(([reason,count])=>({reason,count}));}
function matchesJob(job:any,key:string){return key==='all'||(key==='draft'?job.status==='draft':key==='active'?['running','queued'].includes(job.status):key==='completed'?job.status==='completed':key==='cancelled'?job.status==='cancelled':['paused','stopped','blocked','failed','cancel_blocked'].includes(job.status)||issues(job).length>0);}
const taskPool=computed(()=>props.tab==='history'?props.jobs.filter(j=>['completed','blocked','stopped','paused','failed','cancelled','cancel_blocked'].includes(j.status)):props.jobs);
const filteredJobs=computed(()=>taskPool.value.filter(j=>matchesJob(j,filter.value)));
const countJobs=(key:string)=>taskPool.value.filter(j=>matchesJob(j,key)).length;
const items=(job:any)=>filter.value==='issues'?issues(job):job.items;const finished=(job:any)=>job.items.filter((i:any)=>i.status==='completed').length;
const copied=(job:any)=>job.items.reduce((n:number,i:any)=>n+(['switching','plex_pending','cleaning','completed'].includes(i.status)?i.size_bytes:Math.min(i.size_bytes,i.progress?.copied_bytes||0)),0);
const awaitingCleanup=(job:any)=>job.items.filter((i:any)=>['switching','plex_pending','cleaning'].includes(i.status)).reduce((n:number,i:any)=>n+i.size_bytes,0);
const columns:UiColumn[]=[{key:'title',label:'Titre',card:'title'},{key:'size',label:'Volume'},{key:'state',label:'Étape / état'},{key:'updated',label:'Dernière activité',card:'hidden'},{key:'details',label:'Détails',card:'actions'}];
defineEmits<{command:[id:number,action:string],create:[],edit:[job:any],duplicate:[job:any],verify:[job:any],remove:[id:number]}>();
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.job-list{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0;max-width:100%}.compact-subnav :deep(.app-subnav__scroller){justify-content:center}.transfer-batch{padding:14px;min-width:0;width:100%;max-width:100%;box-sizing:border-box}.task-main{display:flex;justify-content:space-between;align-items:center;gap:12px}.task-heading{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}.task-heading h2{margin:0;font-size:var(--fs-base);overflow-wrap:anywhere}.task-subline{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:var(--fs-sm);margin:8px 0}.task-route{min-width:0;overflow-wrap:anywhere}.batch-summary{display:flex;flex-wrap:wrap;gap:12px;font-size:var(--fs-sm);padding:8px 0}.task-titles,.task-metadata{margin-top:8px;min-width:0}.task-titles>summary,.task-metadata>summary{min-height:44px;cursor:pointer;align-content:center}.task-issues{font-size:var(--fs-sm)}.task-issues small{display:block}.transfer-batch :deep(.ui-data-table){margin:8px 0;max-height:none}.transfer-batch :deep(.ui-data-table button){min-height:44px}.transfer-batch p{font-size:var(--fs-sm);overflow-wrap:anywhere}
@container card (max-width:600px){.task-main{display:grid;grid-template-columns:minmax(0,1fr);align-items:start}}
@include bp.until(phablet){.task-main{display:grid;grid-template-columns:minmax(0,1fr);align-items:start}.task-actions{width:100%}.compact-subnav :deep(.app-subnav__scroller){justify-content:flex-start}.transfer-batch :deep(.table-cards){overflow:visible}.transfer-batch :deep(.table-cards td){padding:6px 0}.transfer-batch :deep(.table-cards td.card-actions){justify-content:flex-end}.transfer-batch :deep(.table-cards tr){padding:10px;margin-bottom:8px}}
</style>
