<template>
  <AppPage class="storage-page" title="Stockage et transferts">
    <UiFeedback v-if="error" type="error" :message="error" /><UiFeedback v-if="savedMessage" type="success" :message="savedMessage" />
    <AppSubnav v-model:active="tab" :items="tabs" variant="tabs" class="storage-subnav" aria-label="Sections du stockage" />

    <StorageOverviewPanel v-if="tab==='overview'" :jobs="jobs" :locations="locations" :busy="busy" :mapping-count="mappingRows.length" :root-count="rootRows.filter(r=>r.arr_root).length" @navigate="tab=$event" @command="command" @create="createTask" @edit="prepareTask($event,true)" @duplicate="prepareTask($event,false)" @verify="verifyTask" @remove="removeTask" />

    <StoragePreparePanel v-if="tab==='prepare'" v-model="form" :roots="discoveredRoots" :busy="busy" @preview="preview" />

    <StorageTransferList v-if="tab==='transfers' || tab==='history'" :jobs="jobs" :locations="locations" :busy="busy" :tab="tab" :instances="instances" @command="command" @create="createTask" @edit="prepareTask($event,true)" @duplicate="prepareTask($event,false)" @verify="verifyTask" @remove="removeTask" />

    <section v-if="tab === 'settings'" class="storage-card">
      <h2>Stockages et correspondances</h2>
      <StorageRootTable v-model:forced="forcedAssociations" :progress="scanProgress" :saved-pairs="savedPairs" :saved-proofs="savedProofs" :dirty-count="dirtyRows.length" v-model:pairs="rootPairs" :root-rows="rootRows" :draft-comparisons="draftComparisons" :checking="checking" :busy="busy" :date="date" @save="saveRoots(false)" @recheck="saveRoots(true)" />
      <UiButton @click="resetLocation(); locationDialog = true">Configurer une association Arr / Plex</UiButton>
      <StorageAssociationDialog v-model="locationForm" :open="locationDialog" :error="error" :busy="busy" :edit-id="editId" :instances="instances" :roots="discoveredRoots" :checking="checking" :draft-comparisons="draftComparisons" :date="date" @check="checkDraft" @save="saveLocation" @close="resetLocation();locationDialog=false" />
    </section>

    <StoragePreviewDialog v-if="plan" v-model="selected" :plan="plan" :busy="busy" :error="error" :gb="gb" @close="plan=null" @launch="launch(true)" @save="launch(false)" />
  </AppPage>
</template>

<script setup lang="ts">
import AppSubnav from '@/components/ui/AppSubnav.vue';
import {draftKey, comparisonLabel, newAssociationMapping, rootMapping as mappingFromPair, suggestedPlex} from '@/components/storage/storageAssociations';
import {useStorageTelemetry} from '@/components/storage/useStorageTelemetry';
import StorageOverviewPanel from '@/components/storage/StorageOverviewPanel.vue';
import StorageTransferList from '@/components/storage/StorageTransferList.vue';
import StoragePreviewDialog from '@/components/storage/StoragePreviewDialog.vue';
import StoragePreparePanel from '@/components/storage/StoragePreparePanel.vue';
import StorageRootTable from '@/components/storage/StorageRootTable.vue';
import StorageAssociationDialog from '@/components/storage/StorageAssociationDialog.vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
const tabs=[{key:'overview',label:'Vue d’ensemble'},{key:'prepare',label:'Préparer'},{key:'transfers',label:'Transferts'},{key:'history',label:'Historique'},{key:'settings',label:'Stockages'}];
const tab=ref('overview'),locations=ref<any[]>([]),jobs=ref<any[]>([]),instances=ref<any[]>([]),discoveredRoots=ref<any[]>([]),loading=ref(false),busy=ref(false),error=ref(''),plan=ref<any>(null),selected=ref<string[]>([]),editId=ref<number|null>(null);
const rootsLoading=ref(false),checking=ref(''),comparisons=ref<Record<string,any>>({}),draftComparisons=ref<Record<string,any>>({});
const rootPairs=ref<Record<string,string>>({});
const locationDialog=ref(false),savedMessage=ref('');
const forcedAssociations=ref<Record<string,boolean>>({});
const scanProgress=ref({total:0,completed:0,current:'',saved:0,empty:0,failed:0,started:0,finished:0});
const sessionSaved=ref<Record<string,string>>({}),savedProofs=ref<Record<string,any>>({});
const savedPairs=computed(()=>{const pairs:Record<string,string>={};for(const l of locations.value)for(const m of l.mappings)pairs[`${m.arr_instance_id}:${m.arr_root}`]=JSON.stringify([m.plex_section_id,m.plex_root]);return {...pairs,...sessionSaved.value};});
const dirtyRows=computed(()=>rootRows.value.filter(row=>rootPairs.value[row.key] && !row.error && rootPairs.value[row.key]!==savedPairs.value[row.key]));
async function saveRoot(row:any){
 const mapping=rootMapping(row);const comparison:any=await api('/api/storage/roots/check',{method:'POST',body:JSON.stringify(mapping)});
 draftComparisons.value[draftKey(mapping)]=comparison;
 if(!['sample_matched','empty'].includes(comparison.status) && !(forcedAssociations.value[draftKey(mapping)] && ['mismatch','incomplete'].includes(comparison.status)))throw new Error('Correspondance Arr/Plex non confirmée : corrigez cette association avant de l’enregistrer.');
 const existing=locations.value.find(l=>l.mappings.some((m:any)=>m.arr_instance_id===row.arr_instance_id && m.arr_root===row.arr_root));
 if(existing){editLocation(existing,false);const index=locationForm.value.mappings.findIndex((m:any)=>m.arr_instance_id===row.arr_instance_id && m.arr_root===row.arr_root);locationForm.value.mappings[index]={...locationForm.value.mappings[index],...mapping};}
 else{resetLocation();locationForm.value.name=`${row.instance} · ${row.arr_root}`;locationForm.value.mount_path='';locationForm.value.mappings=[mapping];}
 await persistLocation();
 sessionSaved.value[row.key]=rootPairs.value[row.key];savedProofs.value[draftKey(mapping)]={...comparison,forced:!['sample_matched','empty'].includes(comparison.status)};
 return comparison.status!=='sample_matched';
}
const saveRoots=(all=false)=>act(async()=>{
 savedMessage.value='';let saved=0,empty=0;const failures:string[]=[];
 const rows=all?rootRows.value.filter(row=>rootPairs.value[row.key] && !row.error):dirtyRows.value;
 scanProgress.value={total:rows.length,completed:0,current:'',saved:0,empty:0,failed:0,started:Date.now(),finished:0};
 for(const row of rows){scanProgress.value.current=`${row.instance} · ${row.arr_root}`;try{if(await saveRoot(row)){empty++;scanProgress.value.empty++;}saved++;scanProgress.value.saved++;}catch(e:any){scanProgress.value.failed++;failures.push(`${row.instance} · ${row.arr_root} : ${e.message}`);}finally{scanProgress.value.completed++;}}
 scanProgress.value.current='';scanProgress.value.finished=Date.now();
 savedMessage.value=saved?`${saved} correspondance(s) enregistrée(s). ${empty?`${empty} racine(s) vide(s) ou forcée(s) : contenu non confirmé. `:''}Aucun transfert lancé.`:'';
 if(failures.length)error.value=failures.join(' · ');
});
const MAPPING_COLUMNS:UiColumn[]=[{key:'location',label:'Stockage / instance',sortable:true,card:'title'},{key:'arr_root',label:'Racine Arr'},{key:'plex_root',label:'Racine Plex'},{key:'check',label:'Contrôle du contenu'}];
const rootRows=computed(()=>discoveredRoots.value.flatMap(root=>(root.arr_roots.length?root.arr_roots:['']).map((path:string)=>({key:`${root.arr_instance_id}:${path}`,arr_instance_id:root.arr_instance_id,instance:root.name,kind:root.arr_type,arr_root:path,plex_roots:root.plex_roots,error:root.error}))));
const mappingRows=computed(()=>locations.value.flatMap(location=>location.mappings.map((mapping:any,index:number)=>({key:comparisonKey(location.id,index),location:location.name,location_id:location.id,index,instance:instances.value.find(i=>i.id===mapping.arr_instance_id)?.name||mapping.arr_instance_id,mapping}))));
const rootMapping=(row:any)=>mappingFromPair(row,rootPairs.value[row.key]);
async function checkDraft(mapping:any){const key=draftKey(mapping);checking.value=key;try{draftComparisons.value[key]=await api('/api/storage/roots/check',{method:'POST',body:JSON.stringify(mapping)});}catch(e:any){draftComparisons.value[key]={error:e.message};}finally{checking.value='';}}

const comparisonKey=(id:number,index:number|string)=>`${id}:${index}`;
let rootsCheckedAt=0;
async function refreshRoots(silent=false){if(rootsLoading.value)return;rootsLoading.value=true;try{const next=await api<any[]>('/api/storage/roots');if(JSON.stringify(next)!==JSON.stringify(discoveredRoots.value)){discoveredRoots.value=next;const pairs:Record<string,string>={};for(const root of next){for(const path of root.arr_roots){const key=`${root.arr_instance_id}:${path}`;const saved=locations.value.flatMap(l=>l.mappings).find(m=>m.arr_instance_id===root.arr_instance_id && m.arr_root===path);const choice=rootPairs.value[key] ?? (saved?JSON.stringify([saved.plex_section_id,saved.plex_root]):suggestedPlex(path,root.plex_roots));pairs[key]=root.plex_roots.some((p:any)=>JSON.stringify([p.section_id,p.path])===choice)?choice:'';}}rootPairs.value=pairs;instances.value=next.map(r=>({id:r.arr_instance_id,name:r.name,arr_type:r.arr_type}));for(const mapping of locationForm.value.mappings){if(!mapping.arr_instance_id)mapping.arr_instance_id=instances.value[0]?.id||0;}}rootsCheckedAt=Date.now();}catch(e:any){if(!silent)error.value=e.message;}finally{rootsLoading.value=false;}}

async function checkMapping(id:number,index:number|string){const key=comparisonKey(id,index);checking.value=key;try{comparisons.value[key]=await api(`/api/storage/locations/${id}/mappings/${index}/check`,{method:'POST'});}catch(e:any){comparisons.value[key]={error:e.message};}finally{checking.value='';}}
const editingTaskId=ref(0);
const form=ref({name:'',routes:[] as any[],transfer_mode:'arr',arr_instance_id:0,source_root:'',destination_root:'',source_id:0,destination_id:0,mode:'release_space',goal_gb:500,media_type:'all',max_titles:250,auto_resume:true});

const newMapping=()=>newAssociationMapping(instances.value[0]?.id||0);
const locationForm=ref({name:'',mount_path:'',reserve_gb:100,enabled:true,mappings:[newMapping()]});
const {selectedBytes,gb,date,locationName}=useStorageTelemetry(locations,jobs,tab,plan,selected);
async function load(silent=false){if(loading.value)return;loading.value=true;try{const [nextLocations,nextJobs]=await Promise.all([api<any[]>('/api/storage/locations'),api<any[]>('/api/storage/transfers')]);if(JSON.stringify(locations.value.map(l=>[l.id,l.mappings]))!==JSON.stringify(nextLocations.map(l=>[l.id,l.mappings])))comparisons.value={};if(JSON.stringify(locations.value)!==JSON.stringify(nextLocations))locations.value=nextLocations;if(JSON.stringify(jobs.value)!==JSON.stringify(nextJobs))jobs.value=nextJobs;}catch(e:any){if(!silent)error.value=e.message;}finally{loading.value=false;}}
async function act(fn:()=>Promise<void>){busy.value=true;error.value='';try{await fn();}catch(e:any){error.value=e.message;}finally{busy.value=false;}}
const preview=()=>act(async()=>{
 plan.value=null;const {routes,...settings}=form.value;if(editingTaskId.value && routes.length!==1)throw new Error('Modifiez une seule instance pour cette tâche, ou créez une nouvelle tâche.');const requestedRoutes=routes.map((r:any)=>({...r}));
 const groups:any[]=[];for(const route of requestedRoutes){const body={...settings,...route,media_type:'all',root_goals:Object.fromEntries(route.source_roots.map((root:string)=>[root,route.root_goals?.[root] ?? settings.goal_gb])),task_id:editingTaskId.value};const result:any=await api('/api/storage/preview',{method:'POST',body:JSON.stringify(body)});groups.push({...result,body,name:instances.value.find(i=>i.id===route.arr_instance_id)?.name||route.arr_instance_id,submitted:false});}
 plan.value={groups,items:groups.flatMap(g=>g.items)};selected.value=plan.value.items.map((i:any)=>i.key);
});
const launch=(startImmediately=true)=>act(async()=>{
 for(const group of plan.value.groups){if(group.submitted)continue;const keys=group.items.filter((i:any)=>selected.value.includes(i.key)).map((i:any)=>i.key);if(!keys.length)continue;await api('/api/storage/transfers'+(editingTaskId.value?`/${editingTaskId.value}`:''),{method:editingTaskId.value?'PUT':'POST',body:JSON.stringify({...group.body,selection:keys,start_immediately:startImmediately})});group.submitted=true;}
 plan.value=null;editingTaskId.value=0;tab.value='transfers';await load();
});
function createTask(){editingTaskId.value=0;plan.value=null;tab.value='prepare';}
function prepareTask(job:any,editing:boolean){editingTaskId.value=editing?job.id:0;form.value={...form.value,...job.params,mode:job.params.mode==='selection'?'release_space':job.params.mode,media_type:'all',routes:[{arr_instance_id:job.params.arr_instance_id,source_roots:job.params.source_roots?.length?[...job.params.source_roots]:[job.params.source_root],destination_root:job.params.destination_root,root_goals:{...job.params.root_goals}}]};plan.value=null;tab.value='prepare';}
async function verifyTask(job:any){prepareTask(job,true);await preview();}
const removeTask=(id:number)=>act(async()=>{await api(`/api/storage/transfers/${id}`,{method:'DELETE'});await load();});
const command=(id:number,action:string)=>act(async()=>{await api(`/api/storage/transfers/${id}/command`,{method:'POST',body:JSON.stringify({action})});await load();});
function resetLocation(){editId.value=null;locationForm.value={name:'',mount_path:'',reserve_gb:100,enabled:true,mappings:[newMapping()]};}
function editLocation(l:any,open=true){locationDialog.value=open;editId.value=l.id;locationForm.value={name:l.name,mount_path:l.mount_path,reserve_gb:l.reserve_bytes/1e9,enabled:l.enabled,mappings:l.mappings.map((mapping:any)=>({...mapping}))};}
async function persistLocation(){await api('/api/storage/locations'+(editId.value?`/${editId.value}`:''),{method:editId.value?'PUT':'POST',body:JSON.stringify(locationForm.value)});comparisons.value={};resetLocation();locationDialog.value=false;savedMessage.value='Correspondance enregistrée. Aucun transfert lancé.';await load();}
const saveLocation=()=>act(async()=>{
 let emptyWarning=false;
 for(const mapping of locationForm.value.mappings){
  const result:any=await api('/api/storage/roots/check',{method:'POST',body:JSON.stringify(mapping)});
  draftComparisons.value[draftKey(mapping)]=result;
  if(!['sample_matched','empty'].includes(result.status))throw new Error('Correspondance Arr/Plex non confirmée : corrigez cette association avant de l’enregistrer.');
  emptyWarning ||= result.status==='empty';
 }
 await persistLocation();
 if(emptyWarning)savedMessage.value='Correspondance enregistrée. Aucun média trouvé dans au moins une racine : contenu non confirmé. Aucun transfert lancé.';
});
let timer:ReturnType<typeof setInterval>|undefined;
function backgroundRefresh(){if(document.hidden)return;void load(true);if(Date.now()-rootsCheckedAt>=60000)void refreshRoots(true);}
onMounted(async()=>{await load();await refreshRoots();timer=setInterval(backgroundRefresh,5000);document.addEventListener('visibilitychange',backgroundRefresh);});
onUnmounted(()=>{if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',backgroundRefresh);});
useRealtime(['storage.updated'],()=>void load(true),{debounceMs:600});
</script>

<style lang="scss">
@use '@/components/storage/storage' as storage;
.storage-page { @include storage.styles; }
</style>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.storage-subnav :deep(.app-subnav__scroller){justify-content:center}@include bp.until(phablet){.storage-subnav :deep(.app-subnav__scroller){justify-content:flex-start}}</style>
