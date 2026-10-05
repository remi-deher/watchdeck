<template>
  <div class="association-workspace" aria-label="Correspondance des racines Arr et Plex">
    <section v-for="group in groups" :key="group.id" class="association-group">
      <header class="association-group-heading"><h3>{{ group.name }} <span>· {{ group.kind==='radarr'?'Films':'Séries' }}</span></h3><small>{{ group.rows.length }} racine(s)</small></header>
      <UiDataTable class="root-table association-table" :label="`Correspondances ${group.name}`" :rows="group.rows" :columns="ROOT_COLUMNS" :row-key="row=>row.key">
        <template #cell-arr_root="{row}"><strong>{{ storageName(row.arr_root) }}</strong><small><code>{{ row.arr_root || 'Aucune racine détectée' }}</code></small></template>
        <template #cell-plex_root="{row}"><label class="association-choice"><span class="association-arrow" aria-hidden="true">→</span><span class="sr-only">Dossier Plex correspondant à {{ row.instance }} {{ row.arr_root }}</span><select v-model="rootPairs[row.key]" :disabled="busy || Boolean(row.error)"><option value="">Choisir le dossier Plex</option><option v-for="plex in row.plex_roots" :key="plex.section_id+plex.path" :value="JSON.stringify([plex.section_id,plex.path])">{{ storageName(plex.path) }} · {{ plex.library }}</option></select></label><small v-if="rootPairs[row.key]"><code>{{ rootMapping(row).plex_root }}</code></small></template>
        <template #cell-status="{row}"><span class="association-status" :class="{'warning':hasIssue(row),'healthy':statusLabel(row)==='Vérifiée'}"><span aria-hidden="true">{{ statusIcon(row) }}</span> {{ statusLabel(row) }}</span>
          <details class="association-details"><summary>{{ hasIssue(row)?'Voir les écarts':'Détails' }}</summary><p>{{ row.error || comparisonLabel(result(row)) }}</p><small v-if="result(row)?.checked_at">Dernier contrôle : {{ date(result(row).checked_at) }}</small><p v-for="item in result(row)?.items || []" :key="item.title">{{ item.title }} : {{ item.reason || `${item.files} fichier(s) et identité concordants` }}</p><label v-if="hasIssue(row)" class="check"><input v-model="forced[draftKey(rootMapping(row))]" type="checkbox" :disabled="busy" /> Forcer l’enregistrement de cette association malgré les écarts</label><small v-if="forced[draftKey(rootMapping(row))]">Le contenu reste non confirmé. Les contrôles des transferts restent actifs.</small></details>
        </template>
      </UiDataTable>
    </section>
    <div class="association-actionbar">
      <div v-if="progress.total" role="status" aria-live="polite" class="scan-progress"><progress :value="progress.completed" :max="progress.total" aria-label="Progression des contrôles" /><p>{{ progress.completed }} / {{ progress.total }} · {{ progress.current || 'Terminé' }} · {{ elapsed }} s</p><small>{{ progress.saved }} enregistrée(s) · {{ progress.empty }} vide(s) ou forcée(s) · {{ progress.failed }} à corriger</small></div>
      <div class="association-actions"><span>{{ dirtyCount ? `${dirtyCount} modification(s) à enregistrer` : 'Aucune modification à enregistrer' }}</span><UiButton variant="ghost" :disabled="busy || !rootRows.some(row=>rootPairs[row.key] && !row.error)" @click="$emit('recheck')">Tout revérifier</UiButton><UiButton variant="primary" :loading="busy" :disabled="busy || checking !== '' || !dirtyCount" @click="$emit('save')">Vérifier et enregistrer les {{ dirtyCount }} modifications</UiButton></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import {draftKey,comparisonLabel,rootMapping as mappingFromPair} from './storageAssociations';
import {computed,onUnmounted,ref} from 'vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDataTable, {type UiColumn} from '@/components/ui/UiDataTable.vue';
const props=defineProps<{savedPairs:Record<string,string>,savedProofs:Record<string,any>,dirtyCount:number,rootRows:any[],draftComparisons:Record<string,any>,checking:string,busy:boolean,progress:{total:number,completed:number,current:string,saved:number,empty:number,failed:number,started:number,finished:number},date:(value:any)=>string}>();
const forced=defineModel<Record<string,boolean>>('forced',{required:true});
const rootPairs=defineModel<Record<string,string>>('pairs',{required:true});
const rootMapping=(row:any)=>mappingFromPair(row,rootPairs.value[row.key]);
const ROOT_COLUMNS:UiColumn[]=[{key:'arr_root',label:'Dossier Sonarr / Radarr',card:'title'},{key:'plex_root',label:'Dossier Plex'},{key:'status',label:'État'}];
const groups=computed(()=>{const grouped=new Map<number,any>();for(const row of props.rootRows){if(!grouped.has(row.arr_instance_id))grouped.set(row.arr_instance_id,{id:row.arr_instance_id,name:row.instance,kind:row.kind,rows:[]});grouped.get(row.arr_instance_id).rows.push(row);}return [...grouped.values()];});
function storageName(path:string){const first=path.split('/').filter(Boolean)[0]||'';const match=/^(?:usb|data|media)(\d*)$/i.exec(first);return match?`${first.toLowerCase().startsWith('usb')?'USB':'DATA'} ${match[1]||'1'}`:first||'Dossier';}
const tick=ref(Date.now());const timer=setInterval(()=>{tick.value=Date.now();},1000);onUnmounted(()=>clearInterval(timer));
const elapsed=computed(()=>props.progress.started?Math.max(0,Math.floor(((props.progress.finished||tick.value)-props.progress.started)/1000)):0);
const proof=(row:any)=>props.savedProofs[draftKey(rootMapping(row))];
const result=(row:any)=>props.draftComparisons[draftKey(rootMapping(row))]||proof(row);
const hasIssue=(row:any)=>Boolean(row.error)||['mismatch','incomplete'].includes(result(row)?.status);
function statusLabel(row:any){const choice=rootPairs.value[row.key],result=props.draftComparisons[draftKey(rootMapping(row))];if(!choice)return 'À associer';if(result?.status==='mismatch' && !proof(row)?.forced)return 'Écart';if(proof(row)?.forced && choice===props.savedPairs[row.key])return 'Forcée';if(result?.status==='empty')return 'Vide';if(choice!==props.savedPairs[row.key])return 'À enregistrer';return proof(row)?.status==='sample_matched'?'Vérifiée':'À vérifier';}
const statusIcon=(row:any)=>({'À associer':'○','Écart':'⚠','Forcée':'⚠','Vide':'○','À enregistrer':'●','Vérifiée':'✓'} as Record<string,string>)[statusLabel(row)]||'✓';
defineEmits<{save:[],recheck:[]}>();
</script>
