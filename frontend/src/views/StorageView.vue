<template>
  <AppPage class="storage-page" title="Stockage et transferts">
    <UiFeedback v-if="error" type="error" :message="error" /><UiFeedback v-if="savedMessage" type="success" :message="savedMessage" />
    <AppSubnav v-model:active="tab" :items="tabs" variant="tabs" class="storage-subnav" aria-label="Sections du stockage" />

    <StorageOverviewPanel :instances="instances" v-if="tab==='overview'" :jobs="jobs" :locations="locations" :busy="busy" :mapping-count="mappingRows.length" :root-count="configuredRootCount" @navigate="tab=$event" @command="command" @create="createTask" @edit="prepareTask($event,true)" @relaunch="relaunchTask" @duplicate="prepareTask($event,false)" @verify="verifyTask" @remove="removeTask" />

    <UiFeedback v-if="previewProgress" type="info" :message="previewProgress" role="status" aria-live="polite" />
    <StoragePreparePanel v-if="tab==='prepare'" v-model="form" :roots="prepareRoots" :accesses="accesses" :locations="locations" :protected-titles="protectedTitles" :editing="Boolean(editingTaskId)" :busy="busy" @save="saveTaskSettings" @unprotect="unprotectTitle" @configure="tab='settings'" @preview="preview" />

    <StorageTransferList v-if="tab==='transfers' || tab==='history'" :jobs="jobs" :locations="locations" :busy="busy" :tab="tab" :instances="instances" @command="command" @create="createTask" @edit="prepareTask($event,true)" @relaunch="relaunchTask" @duplicate="prepareTask($event,false)" @verify="verifyTask" @remove="removeTask" />

    <section v-if="tab === 'settings'" class="storage-card">
      <AppSubnav v-model:active="settingsTab" :items="settingsTabs" variant="tabs" class="storage-subnav" aria-label="Configuration des stockages" />
      <StorageConnectionPanel v-if="settingsTab==='connections'" :connections="connections" @changed="load()" />
      <StorageInventoryPanel v-if="settingsTab==='inventory'" />
      <template v-if="settingsTab==='roots'">
      <h2>Stockages et correspondances</h2>
      <StorageRootTable :connections="connections" :accesses="accesses" :binding-drafts="bindingDrafts" @binding="(key,value)=>bindingDrafts[key]=value" :progress="scanProgress" :saved-pairs="savedPairs" :dirty-count="dirtyRows.length" v-model:pairs="rootPairs" :root-rows="rootRows" :busy="busy" @save="saveRoots" />
      <UiButton @click="resetLocation(); locationDialog = true">Configurer une association Arr / Plex</UiButton>
      <StorageAssociationDialog v-model="locationForm" :open="locationDialog" :error="error" :busy="busy" :edit-id="editId" :instances="instances" :roots="discoveredRoots" @save="saveLocation" @close="resetLocation();locationDialog=false" />
      </template>
    </section>

    <ModalShell v-if="previewOpening && !plan" :open="true" title="Aperçu des déplacements" :busy="busy" :error="error" @close="previewOpening=false">
      <p v-if="busy" role="status"><span class="preview-spinner" aria-hidden="true" /> {{ previewProgress || 'Préparation de l’aperçu…' }}</p>
      <UiButton v-if="!busy && error" @click="previewOpening=false;tab='prepare'">Modifier les réglages</UiButton>
    </ModalShell>
    <StoragePreviewDialog v-if="plan" v-model="selected" :plan="plan" :busy="busy" :error="error" :gb="gb" @close="plan=null;previewOpening=false" @launch="launch(true)" @save="launch(false)"  @protect="protectTitle"/>
  </AppPage>
</template>

<script setup lang="ts">
import AppSubnav from '@/components/ui/AppSubnav.vue';
import {newAssociationMapping, rootMapping as mappingFromPair, suggestedPlex} from '@/components/storage/storageAssociations';
import {useStorageTelemetry} from '@/components/storage/useStorageTelemetry';
import StorageOverviewPanel from '@/components/storage/StorageOverviewPanel.vue';
import StorageTransferList from '@/components/storage/StorageTransferList.vue';
import StoragePreviewDialog from '@/components/storage/StoragePreviewDialog.vue';
import StorageConnectionPanel from '@/components/storage/StorageConnectionPanel.vue';
import StorageInventoryPanel from '@/components/storage/StorageInventoryPanel.vue';
import {calculatePreview} from '@/components/storage/previewJob';
import {selectedRootAccess} from '@/components/storage/transferAccess';
import StoragePreparePanel from '@/components/storage/StoragePreparePanel.vue';
import StorageRootTable from '@/components/storage/StorageRootTable.vue';
import StorageAssociationDialog from '@/components/storage/StorageAssociationDialog.vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import {useStorageLiveTelemetry} from '@/components/storage/useStorageLiveTelemetry';
import UiButton from '@/components/ui/UiButton.vue';

import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
const tabs=[{key:'overview',label:'Vue d’ensemble'},{key:'prepare',label:'Préparer'},{key:'transfers',label:'Transferts'},{key:'history',label:'Historique'},{key:'settings',label:'Stockages'}];
const settingsTab=ref('roots');
const settingsTabs=[{key:'roots',label:'Stockages'},{key:'connections',label:'Connexions'},{key:'inventory',label:'Inventaire'}];
const tab=ref('overview'),locations=ref<any[]>([]),jobs=ref<any[]>([]),instances=ref<any[]>([]),discoveredRoots=ref<any[]>([]),loading=ref(false),busy=ref(false),error=ref(''),plan=ref<any>(null),selected=ref<string[]>([]),editId=ref<number|null>(null);
const rootsLoading=ref(false);
const rootPairs=ref<Record<string,string>>({});
const locationDialog=ref(false),savedMessage=ref('');
const scanProgress=ref({total:0,completed:0,current:'',saved:0,empty:0,failed:0,started:0,finished:0});
const sessionSaved=ref<Record<string,string>>({});
const savedPairs=computed(()=>{const pairs:Record<string,string>={};for(const l of locations.value)if(l.virtual!==true)for(const m of l.mappings)pairs[`${m.arr_instance_id}:${m.arr_root}`]=JSON.stringify([m.plex_section_id,m.plex_root]);return {...pairs,...sessionSaved.value};});
const dirtyRows=computed(()=>rootRows.value.filter(row=>rootPairs.value[row.key] && !row.error && (rootPairs.value[row.key]!==savedPairs.value[row.key] || Boolean(bindingDrafts.value[row.key]))));
async function saveRoot(row:any){
 const mapping=rootMapping(row);
 const existing=locations.value.find(l=>l.mappings.some((m:any)=>m.arr_instance_id===row.arr_instance_id && m.arr_root===row.arr_root));
 if(existing){editLocation(existing,false);const index=locationForm.value.mappings.findIndex((m:any)=>m.arr_instance_id===row.arr_instance_id && m.arr_root===row.arr_root);locationForm.value.mappings[index]={...locationForm.value.mappings[index],...mapping};}
 else{resetLocation();locationForm.value.name=`${row.instance} · ${row.arr_root}`;locationForm.value.mount_path='';locationForm.value.mappings=[mapping];}
 await persistLocation();
 sessionSaved.value[row.key]=rootPairs.value[row.key];

}
const saveRoots=()=>act(async()=>{
 savedMessage.value='';let saved=0;const failures:string[]=[];
 const rows=dirtyRows.value;
 scanProgress.value={total:rows.length,completed:0,current:'',saved:0,empty:0,failed:0,started:Date.now(),finished:0};
 for(const row of rows){scanProgress.value.current=`${row.instance} · ${row.arr_root}`;try{if(rootPairs.value[row.key]!==savedPairs.value[row.key])await saveRoot(row);if(bindingDrafts.value[row.key]){await api('/api/storage/bindings/multiple',{method:'POST',body:JSON.stringify({arr_instance_id:row.arr_instance_id,arr_root:row.arr_root,...bindingDrafts.value[row.key]})});delete bindingDrafts.value[row.key];}saved++;scanProgress.value.saved++;}catch(e:any){scanProgress.value.failed++;failures.push(`${row.instance} · ${row.arr_root} : ${e.message}`);}finally{scanProgress.value.completed++;}}
 await load();
 scanProgress.value.current='';scanProgress.value.finished=Date.now();
 savedMessage.value=saved?`${saved} correspondance(s) enregistrée(s). Les dossiers utilisés seront contrôlés lors de l’aperçu. Aucun transfert lancé.`:'';
 if(failures.length)error.value=failures.join(' · ');
});
const MAPPING_COLUMNS:UiColumn[]=[{key:'location',label:'Stockage / instance',sortable:true,card:'title'},{key:'arr_root',label:'Racine Arr'},{key:'plex_root',label:'Racine Plex'},{key:'check',label:'Contrôle du contenu'}];
const rootRows=computed(()=>discoveredRoots.value.flatMap(root=>(root.arr_roots.length?root.arr_roots:['']).map((path:string)=>({key:`${root.arr_instance_id}:${path}`,arr_instance_id:root.arr_instance_id,instance:root.name,kind:root.arr_type,arr_root:path,plex_roots:root.plex_roots,error:root.error}))));
const configuredRootCount=computed(()=>new Set(locations.value.filter((location:any)=>location.virtual!==true).flatMap((location:any)=>location.mappings.map((mapping:any)=>`${mapping.arr_instance_id}:${mapping.arr_root}`))).size);
const prepareRoots=computed(()=>{
 const rootsByInstance=new Map<number,any>();
 const ensure=(id:number)=>{
  const instance=instances.value.find((entry:any)=>entry.id===id);
  if(!rootsByInstance.has(id))rootsByInstance.set(id,{arr_instance_id:id,name:instance?.name||`Instance ${id}`,arr_type:instance?.arr_type||'sonarr',arr_roots:[],capacities:{},plex_roots:[]});
  return rootsByInstance.get(id);
 };
 for(const location of locations.value){
  for(const mapping of location.mappings||[]){
   const item=ensure(mapping.arr_instance_id);
   if(!item.arr_roots.includes(mapping.arr_root))item.arr_roots.push(mapping.arr_root);
   item.plex_roots.push({path:mapping.plex_root,section_id:String(mapping.plex_section_id)});
  }
 }
 for(const access of accesses.value){
  for(const root of access.roots||[]){
   const item=ensure(root.arr_instance_id);
   if(!item.arr_roots.includes(root.arr_root))item.arr_roots.push(root.arr_root);
  }
 }
 for(const instance of instances.value)if(instance.enabled!==false)ensure(instance.id);
 for(const route of form.value.routes||[]){
  const item=ensure(route.arr_instance_id);
  for(const path of [...(route.source_roots||[]),route.destination_root].filter(Boolean))if(!item.arr_roots.includes(path))item.arr_roots.push(path);
 }
 for(const location of locations.value){
  const mapping=location.mappings?.[0];if(!mapping)continue;
  const item=ensure(mapping.arr_instance_id);
  if(location.free_bytes!=null)item.capacities[mapping.arr_root]={free_bytes:location.free_bytes};
 }
 return [...rootsByInstance.values()].filter((item:any)=>instances.value.find((entry:any)=>entry.id===item.arr_instance_id)?.enabled!==false);
});
const mappingRows=computed(()=>locations.value.flatMap(location=>location.mappings.map((mapping:any,index:number)=>({key:comparisonKey(location.id,index),location:location.name,location_id:location.id,index,instance:instances.value.find(i=>i.id===mapping.arr_instance_id)?.name||mapping.arr_instance_id,mapping}))));
const rootMapping=(row:any)=>mappingFromPair(row,rootPairs.value[row.key]);

const comparisonKey=(id:number,index:number|string)=>`${id}:${index}`;
let rootsCheckedAt=0;
async function refreshRoots(silent=false){if(rootsLoading.value)return;rootsLoading.value=true;try{const next=await api<any[]>('/api/storage/roots');if(JSON.stringify(next)!==JSON.stringify(discoveredRoots.value)){discoveredRoots.value=next;const pairs:Record<string,string>={};for(const root of next){for(const path of root.arr_roots){const key=`${root.arr_instance_id}:${path}`;const candidates=locations.value.flatMap(l=>l.mappings.map((m:any)=>({mapping:m,virtual:l.virtual===true}))).filter(({mapping}:any)=>mapping.arr_instance_id===root.arr_instance_id && mapping.arr_root===path);const saved=(candidates.find(({virtual}:any)=>!virtual)||candidates[0])?.mapping;const choice=rootPairs.value[key] ?? (saved?JSON.stringify([saved.plex_section_id,saved.plex_root]):suggestedPlex(path,root.plex_roots));pairs[key]=root.plex_roots.some((p:any)=>JSON.stringify([p.section_id,p.path])===choice)?choice:'';}}rootPairs.value=pairs;instances.value=next.map(r=>({id:r.arr_instance_id,name:r.name,arr_type:r.arr_type}));for(const mapping of locationForm.value.mappings){if(!mapping.arr_instance_id)mapping.arr_instance_id=instances.value[0]?.id||0;}}rootsCheckedAt=Date.now();}catch(e:any){if(!silent)error.value=e.message;}finally{rootsLoading.value=false;}}

const editingTaskId=ref(0);
const accesses=ref<any[]>([]),connections=ref<any[]>([]),bindingDrafts=ref<Record<string,any>>({});
const protectedTitles=ref<any[]>([]);
async function loadProtections(){protectedTitles.value=await api('/api/storage/protected-titles');}
const protectTitle=(item:any)=>act(async()=>{await api(`/api/storage/protected-titles/${item.arr_instance_id}/${item.arr_id}`,{method:'PUT',body:JSON.stringify({title:item.title})});selected.value=selected.value.filter(key=>key!==item.key);item.protected=true;await loadProtections();});
const unprotectTitle=(key:string)=>act(async()=>{await api('/api/storage/protected-titles/'+key.replace(':','/'),{method:'DELETE'});await loadProtections();});
const form=ref({transfer_methods:['arr'] as string[],access_ids:{} as Record<string,number>,root_access_ids:{} as Record<string,number>,access_id:0,verification:'standard',name:'',routes:[] as any[],transfer_mode:'arr',arr_instance_id:0,source_root:'',destination_root:'',source_id:0,destination_id:0,mode:'release_space',goal_gb:20,target_titles:null as number|null,preference:"closest",media_type:'all',max_titles:250,auto_resume:true});

const newMapping=()=>newAssociationMapping(instances.value[0]?.id||0);
const locationForm=ref({name:'',mount_path:'',reserve_gb:100,enabled:true,mappings:[newMapping()]});
const {selectedBytes,gb,date,locationName}=useStorageTelemetry(locations,jobs,tab,plan,selected);
useStorageLiveTelemetry(jobs,loading);
async function load(silent=false){if(loading.value)return;loading.value=true;try{const [nextLocations,nextJobs,nextAccesses,nextConnections,nextInstances]=await Promise.all([api<any[]>('/api/storage/locations'),api<any[]>('/api/storage/transfers'),api<any[]>('/api/storage/accesses'),api<any[]>('/api/storage/connections'),api<any[]>('/api/storage/instances')]);if(JSON.stringify(connections.value)!==JSON.stringify(nextConnections))connections.value=nextConnections;if(JSON.stringify(accesses.value)!==JSON.stringify(nextAccesses))accesses.value=nextAccesses;if(JSON.stringify(instances.value)!==JSON.stringify(nextInstances))instances.value=nextInstances;if(JSON.stringify(locations.value)!==JSON.stringify(nextLocations))locations.value=nextLocations;if(JSON.stringify(jobs.value)!==JSON.stringify(nextJobs))jobs.value=nextJobs;}catch(e:any){if(!silent)error.value=e.message;}finally{loading.value=false;}}
async function act(fn:()=>Promise<void>){busy.value=true;error.value='';try{await fn();}catch(e:any){error.value=e.message;}finally{busy.value=false;previewProgress.value="";}}
const previewProgress=ref('');
const previewOpening=ref(false);
const preview=()=>act(async()=>{
 await loadProtections();
 plan.value=null;const {routes,...settings}=form.value;if(editingTaskId.value && routes.length!==1)throw new Error('Modifiez une seule instance pour cette tâche, ou créez une nouvelle tâche.');const requestedRoutes=routes.map((r:any)=>({...r}));
 const preparedRoutes=requestedRoutes.map((route:any)=>{const root_access_ids={...settings.root_access_ids};for(const root of [...route.source_roots,route.destination_root]){const endpoint=selectedRootAccess(settings,accesses.value,route.arr_instance_id,root);if(endpoint)root_access_ids[`${route.arr_instance_id}:${root}`]=endpoint.id;}return {...route,root_access_ids,name:settings.name || instances.value.find(i=>i.id===route.arr_instance_id)?.name||String(route.arr_instance_id)};});
 const result:any=await calculatePreview({...settings,routes:preparedRoutes,task_id:editingTaskId.value},(seconds,phase)=>{previewProgress.value=`Calcul de l’aperçu · ${seconds} s · ${phase}`;});
 plan.value=result.groups?result:{groups:[{...result,body:settings,name:'Sélection',submitted:false}]};selected.value=settings.mode==='selection'?[]:plan.value.groups.flatMap((g:any)=>g.items.map((i:any)=>i.key));previewProgress.value='';

});
const launch=(startImmediately=true)=>act(async()=>{
 for(const group of plan.value.groups){if(group.submitted)continue;const keys=group.items.filter((i:any)=>selected.value.includes(i.key)).map((i:any)=>i.key);if(!keys.length)continue;await api('/api/storage/transfers'+(editingTaskId.value?`/${editingTaskId.value}`:''),{method:editingTaskId.value?'PUT':'POST',body:JSON.stringify({...group.body,selection:keys,start_immediately:startImmediately})});group.submitted=true;}
 plan.value=null;previewOpening.value=false;editingTaskId.value=0;tab.value='transfers';await load();
});
const saveTaskSettings=()=>act(async()=>{
 const {routes,...settings}=form.value;
 if(routes.length!==1)throw new Error('Une tâche correspond à une instance. Créez une copie pour une autre tâche.');
 await api(`/api/storage/transfers/${editingTaskId.value}`,{method:'PUT',body:JSON.stringify({...settings,...routes[0],source_root:routes[0].source_roots[0],routes:[],selection:[],start_immediately:false})});
 savedMessage.value='Paramètres enregistrés dans la tâche existante. Aucun transfert lancé.';
 editingTaskId.value=0;tab.value='transfers';await load();
});
function createTask(){previewOpening.value=false;void loadProtections().catch((e:any)=>error.value=e.message);editingTaskId.value=0;plan.value=null;previewProgress.value='';savedMessage.value='';error.value='';tab.value='prepare';}
function prepareTask(job:any,editing:boolean){previewOpening.value=false;editingTaskId.value=editing?job.id:0;form.value={...form.value,...job.params,transfer_methods:job.params.preferred_methods?.length?[...job.params.preferred_methods]:[job.params.transfer_mode||'arr'],access_ids:{...job.params.access_ids,...(job.params.access_id?{[job.params.transfer_mode]:job.params.access_id}:{})},mode:job.params.objective_mode || job.params.mode,media_type:job.params.media_type||'all',routes:[{arr_instance_id:job.params.arr_instance_id,source_roots:job.params.source_roots?.length?[...job.params.source_roots]:[job.params.source_root],destination_root:job.params.destination_root,root_goals:{...job.params.root_goals}}]};plan.value=null;previewProgress.value='';savedMessage.value='';error.value='';tab.value='prepare';}
async function relaunchTask(job:any){
 const previousTab=tab.value;
 prepareTask(job,true);
 tab.value=previousTab;
 previewOpening.value=true;
 previewProgress.value='Paramètres repris depuis la tâche terminée. Calcul de l’aperçu…';
 await preview();
}
async function verifyTask(job:any){prepareTask(job,true);await preview();}
const removeTask=(id:number)=>act(async()=>{const result:any=await api(`/api/storage/transfers/${id}`,{method:'DELETE'});savedMessage.value=result.deletion_pending?'Suppression demandée : annulation et nettoyage en cours.':'Tâche supprimée.';await load();});
const command=(id:number,action:string)=>act(async()=>{await api(`/api/storage/transfers/${id}/command`,{method:'POST',body:JSON.stringify({action})});await load();});
function resetLocation(){editId.value=null;locationForm.value={name:'',mount_path:'',reserve_gb:100,enabled:true,mappings:[newMapping()]};}
function editLocation(l:any,open=true){locationDialog.value=open;editId.value=l.id;locationForm.value={name:l.name,mount_path:l.mount_path,reserve_gb:l.reserve_bytes/1e9,enabled:l.enabled,mappings:l.mappings.map((mapping:any)=>({...mapping}))};}
async function persistLocation(){await api('/api/storage/locations'+(editId.value?`/${editId.value}`:''),{method:editId.value?'PUT':'POST',body:JSON.stringify(locationForm.value)});resetLocation();locationDialog.value=false;savedMessage.value='Correspondance enregistrée. Aucun transfert lancé.';await load();}
const saveLocation=()=>act(persistLocation);
let timer:ReturnType<typeof setInterval>|undefined;
function backgroundRefresh(){if(document.hidden)return;void load(true);if(tab.value==='settings' && settingsTab.value==='roots' && Date.now()-rootsCheckedAt>=60000)void refreshRoots(true);}
watch([tab,settingsTab],([current,sub])=>{if(current==='settings' && sub==='roots' && Date.now()-rootsCheckedAt>=60000)void refreshRoots(true);});
onMounted(async()=>{await load();void loadProtections().catch((e:any)=>error.value=e.message);if(tab.value==='settings' && settingsTab.value==='roots')await refreshRoots();timer=setInterval(backgroundRefresh,5000);document.addEventListener('visibilitychange',backgroundRefresh);});
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

<style scoped>.preview-spinner{display:inline-block;width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:preview-spin .8s linear infinite;margin-right:8px}@keyframes preview-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.preview-spinner{animation:none}}</style>
