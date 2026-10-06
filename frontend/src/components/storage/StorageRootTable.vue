<template>
  <div class="association-workspace" aria-label="Correspondance des racines Arr et Plex">
    <section v-for="group in groups" :key="group.id" class="association-group">
      <header class="association-group-heading"><h3>{{ group.name }} <span>· {{ group.kind==='radarr'?'Films':'Séries' }}</span></h3><small>{{ group.rows.length }} racine(s)</small></header>
      <UiDataTable class="root-table association-table" :label="`Correspondances ${group.name}`" :rows="group.rows" :columns="ROOT_COLUMNS" :row-key="row=>row.key">
        <template #cell-arr_root="{row}"><strong>{{ storageName(row.arr_root) }}</strong><small class="association-path"><code :title="row.arr_root">{{ row.arr_root || 'Aucune racine détectée' }}</code><UiButton v-if="row.arr_root" variant="ghost" :aria-label="`Copier le chemin ${row.arr_root}`" @click="copyPath(row.arr_root)">Copier</UiButton></small></template>
        <template #cell-plex_root="{row}"><label class="association-choice"><span class="association-arrow" aria-hidden="true">→</span><span class="sr-only">Dossier Plex correspondant à {{ row.instance }} {{ row.arr_root }}</span><select v-model="rootPairs[row.key]" :disabled="busy || Boolean(row.error)"><option value="">Choisir le dossier Plex</option><option v-for="plex in row.plex_roots" :key="plex.section_id+plex.path" :value="JSON.stringify([plex.section_id,plex.path])">{{ storageName(plex.path) }} · {{ plex.library }}</option></select></label><small v-if="rootPairs[row.key]" class="association-path"><code :title="rootMapping(row).plex_root">{{ rootMapping(row).plex_root }}</code><UiButton variant="ghost" :aria-label="`Copier le chemin ${rootMapping(row).plex_root}`" @click="copyPath(rootMapping(row).plex_root)">Copier</UiButton></small></template>
        <template #cell-access="{row}"><StorageRootAccess :row="row" :binding="bindingDrafts?.[row.key] || binding(row)" :connections="connections || []" :busy="busy" :dirty="Boolean(bindingDrafts?.[row.key])" :validated="validated(row)" @change="$emit('binding',row.key,$event)" /></template>
        <template #cell-status="{row}"><span class="association-status"><span aria-hidden="true">{{ statusIcon(row) }}</span> {{ statusLabel(row) }}</span>
          <small>Les dossiers utilisés seront contrôlés lors de l’aperçu du déplacement.</small>
        </template>
      </UiDataTable>
    </section>
    <div class="association-actionbar">
      <div v-if="progress.total" role="status" aria-live="polite" class="scan-progress"><progress :value="progress.completed" :max="progress.total" aria-label="Progression de l’enregistrement" /><p>{{ progress.completed }} / {{ progress.total }} · {{ progress.current || 'Terminé' }} · {{ elapsed }} s</p><small>{{ progress.saved }} enregistrée(s) · {{ progress.failed }} à corriger</small></div>
      <div class="association-actions"><span>{{ dirtyCount ? `${dirtyCount} modification(s) à enregistrer` : 'Aucune modification à enregistrer' }}</span><UiButton variant="primary" :loading="busy" :disabled="busy || !dirtyCount" @click="$emit('save')">Enregistrer</UiButton></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import {rootMapping as mappingFromPair} from './storageAssociations';
import {computed,onUnmounted,ref} from 'vue';
import StorageRootAccess from './StorageRootAccess.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDataTable, {type UiColumn} from '@/components/ui/UiDataTable.vue';
const props=defineProps<{connections?:any[],accesses?:any[],bindingDrafts?:Record<string,any>,savedPairs:Record<string,string>,dirtyCount:number,rootRows:any[],busy:boolean,progress:{total:number,completed:number,current:string,saved:number,empty:number,failed:number,started:number,finished:number}}>();
const rootPairs=defineModel<Record<string,string>>('pairs',{required:true});
const rootMapping=(row:any)=>mappingFromPair(row,rootPairs.value[row.key]);
const ROOT_COLUMNS:UiColumn[]=[{key:'arr_root',label:'Dossier Sonarr / Radarr',card:'title'},{key:'plex_root',label:'Dossier Plex'},{key:'access',label:'Accès aux fichiers (SSH / Montage)'},{key:'status',label:'État'}];
const groups=computed(()=>{const grouped=new Map<number,any>();for(const row of props.rootRows){if(!grouped.has(row.arr_instance_id))grouped.set(row.arr_instance_id,{id:row.arr_instance_id,name:row.instance,kind:row.kind,rows:[]});grouped.get(row.arr_instance_id).rows.push(row);}return [...grouped.values()];});
function storageName(path:string){const first=path.split('/').filter(Boolean)[0]||'';const match=/^(?:usb|data|media)(\d*)$/i.exec(first);return match?`${first.toLowerCase().startsWith('usb')?'USB':'DATA'} ${match[1]||'1'}`:first||'Dossier';}
const copyPath=async(path:string)=>{try{await navigator.clipboard.writeText(path);}catch{ /* Le chemin reste sélectionnable si le presse-papiers est indisponible. */ }};
const tick=ref(Date.now());const timer=setInterval(()=>{tick.value=Date.now();},1000);onUnmounted(()=>clearInterval(timer));
const elapsed=computed(()=>props.progress.started?Math.max(0,Math.floor(((props.progress.finished||tick.value)-props.progress.started)/1000)):0);
function statusLabel(row:any){const choice=rootPairs.value[row.key];if(!choice)return 'À associer';if(choice!==props.savedPairs[row.key])return 'À enregistrer';return 'Configuré · contrôle à l’aperçu';}
const statusIcon=(row:any)=>({'À associer':'○','À enregistrer':'●'} as Record<string,string>)[statusLabel(row)]||'✓';
function rootAccesses(row:any){return (props.accesses||[]).filter(a=>a.roots.some((r:any)=>r.arr_instance_id===row.arr_instance_id&&r.arr_root===row.arr_root));}
function binding(row:any){return {bindings:rootAccesses(row).map(a=>({connection_id:a.connection_id,path:a.roots.find((r:any)=>r.arr_instance_id===row.arr_instance_id&&r.arr_root===row.arr_root).path})).filter(b=>b.connection_id)};}
function validated(row:any){const accesses=rootAccesses(row);return accesses.length>0 && accesses.every(a=>a.validation?.revision===a.revision && props.connections?.find(c=>c.id===a.connection_id)?.tested);}
defineEmits<{save:[],binding:[key:string,value:any]}>();
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.association-table :deep(th){white-space:normal;overflow-wrap:normal;line-height:1.4}.association-path{display:flex!important}.association-path :deep(code){white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis}.association-actions :deep(button){min-height:44px}@include bp.until(shell-medium){.association-actionbar{position:static!important}.association-actions{align-items:stretch}.association-actions :deep(button){flex:1 1 100%}}
.association-path{display:flex!important;align-items:center;gap:6px;min-width:0}.association-path code{flex:1;min-width:0}.association-path button{flex-shrink:0;font-size:12px;padding:4px 6px}.association-table :deep(code){display:block;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis;max-width:100%}.association-group-heading{display:flex;justify-content:space-between;gap:12px}.association-group-heading small{white-space:nowrap}</style>
