<template>
 <section class="storage-card prepare-workspace">
  <h2>Préparer un déplacement</h2>
  <nav class="prepare-steps" aria-label="Étapes de préparation"><span :class="{active:step===1}">1 · Stockages</span><span :class="{active:step===2}">2 · Objectif</span><span>3 · Aperçu</span></nav>
  <form @submit.prevent="step===1?step=2:$emit('preview')">
   <template v-if="step===1">
    <h3>Instances à déplacer</h3><div class="instance-choices"><label v-for="instance in roots" :key="instance.arr_instance_id" class="check instance-choice"><input type="checkbox" :checked="selected(instance.arr_instance_id)" :disabled="busy || Boolean(instance.error)" @change="toggle(instance)" />{{ instance.name }} · {{ instance.arr_type==='radarr'?'Films':'Séries' }}</label></div>
    <fieldset class="route-card" v-for="route in form.routes" :key="route.arr_instance_id"><legend>{{ instanceName(route.arr_instance_id) }}</legend><div class="prepare-route"><fieldset class="source-choices"><legend>Déplacer depuis</legend><label v-for="root in rootsFor(route)" :key="root" class="check"><input v-model="route.source_roots" type="checkbox" :value="root" :disabled="busy || root===route.destination_root" />{{ root }}<small class="root-capacity">{{ capacity(route.arr_instance_id,root) }}</small></label></fieldset><span class="route-arrow" aria-hidden="true">→</span><label class="destination-choice">Destination<select v-model="route.destination_root" required :disabled="busy"><option value="" disabled>Choisir la destination</option><option v-for="root in rootsFor(route).filter(r=>!route.source_roots.includes(r))" :key="root" :value="root">{{ root }} · {{ capacity(route.arr_instance_id,root) }}</option></select><small class="root-capacity">{{ capacity(route.arr_instance_id,route.destination_root) }}</small></label></div></fieldset>
    <StorageTransferMethod v-model="form" :accesses="accesses||[]" :busy="busy" @configure="$emit('configure')" />
    <div class="prepare-footer"><span>{{ form.routes.length }} instance(s) · {{ form.routes.reduce((n:number,r:any)=>n+r.source_roots.length,0) }} source(s)</span><UiButton type="submit" variant="primary" :disabled="!validRoutes || busy">Continuer vers l’objectif</UiButton></div>
   </template>
   <template v-else>
    <ul class="objective-routes"><li v-for="route in form.routes" :key="route.arr_instance_id"><strong>{{ instanceName(route.arr_instance_id) }}</strong> · {{ route.source_roots.join(', ') }} → {{ route.destination_root }}</li></ul>
    <fieldset class="objective-options"><legend>Que souhaitez-vous faire ?</legend><label v-for="choice in objectives" :key="choice.value" :class="{chosen:form.mode===choice.value}"><input v-model="form.mode" type="radio" :value="choice.value" :disabled="busy" /><strong>{{ choice.label }}</strong><small>{{ choice.description }}</small></label></fieldset>
    <StorageObjectiveFields v-model="form" :busy="busy" :protected-titles="protectedTitles || []" @unprotect="$emit('unprotect',$event)" />
    <div class="actions"><UiButton :disabled="busy" @click="step=1">Retour aux stockages</UiButton><UiButton type="submit" variant="primary" :loading="busy">Calculer l’aperçu</UiButton></div>
   </template>
  </form>
 </section>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue';
import StorageObjectiveFields from './StorageObjectiveFields.vue';
import StorageTransferMethod from './StorageTransferMethod.vue';
import {selectedRootAccess} from './transferAccess';
import UiButton from '@/components/ui/UiButton.vue';
const props=defineProps<{roots:any[],accesses?:any[],locations?:any[],protectedTitles?:any[],busy:boolean}>();const form=defineModel<any>({required:true});const step=ref(1);
const selected=(id:number)=>form.value.routes?.some((r:any)=>r.arr_instance_id===id);
function toggle(instance:any){const routes=form.value.routes||[];form.value.routes=selected(instance.arr_instance_id)?routes.filter((r:any)=>r.arr_instance_id!==instance.arr_instance_id):[...routes,{arr_instance_id:instance.arr_instance_id,source_roots:[],root_goals:{},destination_root:''}];}
function capacity(instance:number,root:string){
 if(!root)return '';
 const endpoint=selectedRootAccess(form.value,props.accesses||[],instance,root);
 const proof=endpoint?.validation?.roots?.find((r:any)=>r.arr_instance_id===instance && r.arr_root===root);
 const arr=props.roots.find(r=>r.arr_instance_id===instance)?.capacities?.[root];
 const saved=props.locations?.find(l=>l.mappings?.some((m:any)=>m.arr_instance_id===instance&&m.arr_root===root));
 const bytes=proof?.free_bytes ?? arr?.free_bytes ?? saved?.free_bytes;
 return bytes==null?'Espace disponible inconnu':`${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(bytes/1e9)} Go libres · dernier contrôle`;
}
const rootsFor=(route:any):string[]=>props.roots.find(r=>r.arr_instance_id===route.arr_instance_id)?.arr_roots||[];
const instanceName=(id:number)=>props.roots.find(r=>r.arr_instance_id===id)?.name||id;
const validRoutes=computed(()=>form.value.routes?.length && form.value.routes.every((route:any)=>route.source_roots?.length && route.destination_root && !route.source_roots.includes(route.destination_root)) && (form.value.transfer_methods ?? [form.value.transfer_mode]).length>0);
const objectives=[{value:'release_space',label:'Libérer une quantité d’espace',description:'Récupérer une quantité de Go sur l’ensemble des sources.'},{value:'minimum_free',label:'Atteindre un espace libre minimum',description:'Obtenir le seuil souhaité sur chaque source.'},{value:'selection',label:'Déplacer des titres choisis',description:'Choisir des films ou des séries sans objectif d’espace.'}];
defineEmits<{preview:[],configure:[],unprotect:[key:string]}>();
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.root-capacity{font-family:inherit;font-size:12px;color:var(--text-muted);margin-left:auto;white-space:normal}.source-choices{display:grid;gap:10px;margin:0;min-width:0}.source-choices label{overflow-wrap:anywhere}.objective-routes{padding-left:20px;overflow-wrap:anywhere}.objective-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.objective-options legend{margin-bottom:12px}.objective-options label{border:1px solid var(--border);border-radius:12px;padding:16px;cursor:pointer;display:grid;gap:8px}.objective-options label.chosen{border-color:var(--accent);background:var(--bg-hover)}.objective-options small,.form-grid small{line-height:1.5;color:var(--text-muted)}@include bp.until(tablet){.objective-options{grid-template-columns:1fr}}
</style>



<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.prepare-workspace .instance-choices{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 20px}.prepare-workspace .instance-choice{display:flex;flex-direction:row;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;margin:0;cursor:pointer}.prepare-workspace .instance-choice:has(input:checked){border-color:var(--accent);background:var(--bg-hover)}.prepare-workspace input[type=checkbox]{width:18px!important;height:18px!important;min-height:18px!important;max-height:18px!important;min-width:18px;padding:0!important;margin:0;flex:0 0 18px;accent-color:var(--accent)}.prepare-workspace .route-card{padding:16px;margin:16px 0;border:1px solid var(--border);border-radius:12px;min-width:0}.prepare-workspace .prepare-route{display:grid;grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr);gap:20px;align-items:start}.prepare-workspace .source-choices{border:0;padding:0;gap:6px}.prepare-workspace .source-choices legend{font-size:14px;color:var(--text-muted);margin-bottom:8px}.prepare-workspace .source-choices label{display:flex;flex-direction:row;align-items:center;gap:10px;padding:8px 10px;min-height:44px;box-sizing:border-box;margin:0;border-radius:8px;background:var(--surface-2);font-family:monospace;font-size:14px}.prepare-workspace .destination-choice{display:grid;gap:8px;margin:0;min-width:0}.route-arrow{align-self:center;color:var(--text-muted)}.prepare-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:20px}.prepare-footer span{color:var(--text-muted);font-size:13px}@include bp.until(tablet){.prepare-workspace .prepare-route{grid-template-columns:1fr;gap:12px}.route-arrow{display:none}.prepare-footer{flex-wrap:wrap}.prepare-footer button{width:100%}}
</style>
