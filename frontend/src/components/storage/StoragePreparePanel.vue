<template>
 <section class="storage-card prepare-workspace">
  <h2>Préparer un déplacement</h2>
  <nav class="prepare-steps" aria-label="Étapes de préparation"><span :class="{active:step===1}">1 · Stockages</span><span :class="{active:step===2}">2 · Objectif</span><span>3 · Aperçu</span></nav>
  <form @submit.prevent="step===1?step=2:$emit('preview')">
   <template v-if="step===1">
    <h3>Instances à déplacer</h3><div class="instance-choices"><label v-for="instance in roots" :key="instance.arr_instance_id" class="check instance-choice"><input type="checkbox" :checked="selected(instance.arr_instance_id)" :disabled="busy || Boolean(instance.error)" @change="toggle(instance)" />{{ instance.name }} · {{ instance.arr_type==='radarr'?'Films':'Séries' }}</label></div>
    <fieldset class="route-card" v-for="route in form.routes" :key="route.arr_instance_id"><legend>{{ instanceName(route.arr_instance_id) }}</legend><div class="prepare-route"><fieldset class="source-choices"><legend>Déplacer depuis</legend><label v-for="root in rootsFor(route)" :key="root" class="check"><input v-model="route.source_roots" type="checkbox" :value="root" :disabled="busy || root===route.destination_root" />{{ root }}</label></fieldset><span class="route-arrow" aria-hidden="true">→</span><label class="destination-choice">Destination<select v-model="route.destination_root" required :disabled="busy"><option value="" disabled>Choisir la destination</option><option v-for="root in rootsFor(route).filter(r=>!route.source_roots.includes(r))" :key="root" :value="root">{{ root }}</option></select></label></div></fieldset>
    <StorageTransferMethod v-model="form" :accesses="accesses||[]" :busy="busy" @configure="$emit('configure')" />
    <div class="prepare-footer"><span>{{ form.routes.length }} instance(s) · {{ form.routes.reduce((n:number,r:any)=>n+r.source_roots.length,0) }} source(s)</span><UiButton type="submit" variant="primary" :disabled="!validRoutes || busy">Continuer vers l’objectif</UiButton></div>
   </template>
   <template v-else>
    <ul class="objective-routes"><li v-for="route in form.routes" :key="route.arr_instance_id"><strong>{{ instanceName(route.arr_instance_id) }}</strong> · {{ route.source_roots.join(', ') }} → {{ route.destination_root }}</li></ul>
    <fieldset class="objective-options"><legend>Que souhaitez-vous faire ?</legend><label v-for="choice in objectives" :key="choice.value" :class="{chosen:form.mode===choice.value}"><input v-model="form.mode" type="radio" :value="choice.value" :disabled="busy" /><strong>{{ choice.label }}</strong><small>{{ choice.description }}</small></label></fieldset>
    <div class="form-grid">
     <label>Nom de la tâche<input v-model="form.name" maxlength="100" placeholder="Ex. Libérer de la place pour les prochaines sorties" /></label>
     <label>{{ form.mode==='minimum_free'?'Espace libre souhaité par racine (Go)':'Quantité d’espace à libérer par racine (Go)' }}<input :value="form.goal_gb" type="number" min="1" max="1000000" required :disabled="busy" @input="setGeneral(($event.target as HTMLInputElement).value)" /><small>Changer cette valeur réinitialise les personnalisations de toutes les racines.</small></label>
     <label class="check"><input v-model="form.auto_resume" type="checkbox" /> Reprendre automatiquement le suivi après redémarrage</label>
    </div>
    <details class="root-objectives"><summary>Personnaliser par racine · {{ form.routes.reduce((n:number,r:any)=>n+r.source_roots.length,0) }} source(s)</summary><fieldset class="route-card" v-for="route in form.routes" :key="route.arr_instance_id"><legend>{{ instanceName(route.arr_instance_id) }}</legend><div v-for="root in route.source_roots" :key="root" class="root-goal"><label :for="`goal-${route.arr_instance_id}-${root}`"><code>{{ root }}</code><small>{{ route.root_goals?.[root] != null?'Personnalisé':'Valeur générale' }}</small></label><input type="range" min="1" :max="Math.max(10000,form.goal_gb,route.root_goals?.[root]||0)" :value="route.root_goals?.[root] ?? form.goal_gb" :aria-label="`Objectif en Go pour ${instanceName(route.arr_instance_id)} ${root}`" :disabled="busy" @input="setRoot(route,root,($event.target as HTMLInputElement).value)" /><input :id="`goal-${route.arr_instance_id}-${root}`" type="number" min="1" max="1000000" required :value="route.root_goals?.[root] ?? form.goal_gb" :aria-label="`Objectif précis en Go pour ${instanceName(route.arr_instance_id)} ${root}`" :disabled="busy" @input="setRoot(route,root,($event.target as HTMLInputElement).value)" /><UiButton v-if="route.root_goals?.[root] != null" :disabled="busy" @click="delete route.root_goals[root]">Réinitialiser</UiButton></div></fieldset></details>
    <details class="advanced-objectives"><summary>Options avancées</summary><label class="check"><input v-model="limitTitles" type="checkbox" :disabled="busy" @change="form.max_titles=limitTitles?20:250" />Limiter le nombre de titres par instance</label><label v-if="limitTitles">Maximum de titres<input v-model.number="form.max_titles" type="number" min="1" max="250" required :disabled="busy" /><small>Cette limite peut empêcher d’atteindre l’objectif d’espace ; l’aperçu le signalera.</small></label></details>
    <div class="actions"><UiButton :disabled="busy" @click="step=1">Retour aux stockages</UiButton><UiButton type="submit" variant="primary" :loading="busy">Calculer l’aperçu</UiButton></div>
   </template>
  </form>
 </section>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue';
import StorageTransferMethod from './StorageTransferMethod.vue';
import UiButton from '@/components/ui/UiButton.vue';
const props=defineProps<{roots:any[],accesses?:any[],busy:boolean}>();const form=defineModel<any>({required:true});const step=ref(1);
const selected=(id:number)=>form.value.routes?.some((r:any)=>r.arr_instance_id===id);
function toggle(instance:any){const routes=form.value.routes||[];form.value.routes=selected(instance.arr_instance_id)?routes.filter((r:any)=>r.arr_instance_id!==instance.arr_instance_id):[...routes,{arr_instance_id:instance.arr_instance_id,source_roots:[],root_goals:{},destination_root:''}];}
const rootsFor=(route:any):string[]=>props.roots.find(r=>r.arr_instance_id===route.arr_instance_id)?.arr_roots||[];
const instanceName=(id:number)=>props.roots.find(r=>r.arr_instance_id===id)?.name||id;
const validRoutes=computed(()=>form.value.routes?.length && form.value.routes.every((route:any)=>route.source_roots?.length && route.destination_root && !route.source_roots.includes(route.destination_root)) && validAccess.value);
const validAccess=computed(()=>{const modes=form.value.transfer_methods ?? [form.value.transfer_mode];return modes.length>0 && modes.every((mode:string)=>{if(mode==='arr')return true;const id=form.value.access_ids?.[mode] ?? (form.value.transfer_mode===mode?form.value.access_id:0);const access=props.accesses?.find(a=>a.id===id && a.method===(mode==='rsync_ssh'?'ssh':'local') && a.validation?.revision===a.revision);return Boolean(access && form.value.routes.every((route:any)=>[...route.source_roots,route.destination_root].every(root=>access.roots.some((r:any)=>r.arr_instance_id===route.arr_instance_id && r.arr_root===root))));});});
const limitTitles=ref(form.value.max_titles<250);
function setGeneral(value:string){form.value.goal_gb=value===''?null:Number(value);for(const route of form.value.routes)route.root_goals={};}
function setRoot(route:any,root:string,value:string){route.root_goals={...route.root_goals,[root]:value===''?null:Number(value)};}
const objectives=[{value:'release_space',label:'Libérer de l’espace',description:'Déplacer une quantité de données depuis chaque racine.'},{value:'minimum_free',label:'Atteindre un espace libre minimum',description:'Obtenir au moins l’espace souhaité sur chaque racine.'}];
defineEmits<{preview:[],configure:[]}>();
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.source-choices{display:grid;gap:10px;margin:0;min-width:0}.source-choices label{overflow-wrap:anywhere}.objective-routes{padding-left:20px;overflow-wrap:anywhere}.objective-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.objective-options legend{margin-bottom:12px}.objective-options label{border:1px solid var(--border);border-radius:12px;padding:16px;cursor:pointer;display:grid;gap:8px}.objective-options label.chosen{border-color:var(--accent);background:var(--bg-hover)}.objective-options small,.form-grid small{line-height:1.5;color:var(--text-muted)}@include bp.until(tablet){.objective-options{grid-template-columns:1fr}}
</style>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.root-objectives,.advanced-objectives{margin:20px 0}.root-goal{display:grid;grid-template-columns:minmax(180px,1fr) minmax(100px,1fr) 110px auto;gap:12px;align-items:center;margin:12px 0}.root-goal label{min-width:0}.root-goal code{overflow-wrap:anywhere}.root-goal small{display:block;color:var(--text-muted)}.root-goal input[type=range]{padding:0;width:100%;height:24px;accent-color:var(--accent)}@include bp.until(tablet){.root-goal{grid-template-columns:1fr 100px}.root-goal label{grid-column:1/-1}}</style>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.prepare-workspace .instance-choices{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 20px}.prepare-workspace .instance-choice{display:flex;flex-direction:row;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;margin:0;cursor:pointer}.prepare-workspace .instance-choice:has(input:checked){border-color:var(--accent);background:var(--bg-hover)}.prepare-workspace input[type=checkbox]{width:18px!important;height:18px!important;min-height:18px!important;max-height:18px!important;min-width:18px;padding:0!important;margin:0;flex:0 0 18px;accent-color:var(--accent)}.prepare-workspace .route-card{padding:16px;margin:16px 0;border:1px solid var(--border);border-radius:12px;min-width:0}.prepare-workspace .prepare-route{display:grid;grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr);gap:20px;align-items:start}.prepare-workspace .source-choices{border:0;padding:0;gap:6px}.prepare-workspace .source-choices legend{font-size:14px;color:var(--text-muted);margin-bottom:8px}.prepare-workspace .source-choices label{display:flex;flex-direction:row;align-items:center;gap:10px;padding:8px 10px;min-height:44px;box-sizing:border-box;margin:0;border-radius:8px;background:var(--surface-2);font-family:monospace;font-size:14px}.prepare-workspace .destination-choice{display:grid;gap:8px;margin:0;min-width:0}.route-arrow{align-self:center;color:var(--text-muted)}.prepare-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:20px}.prepare-footer span{color:var(--text-muted);font-size:13px}@include bp.until(tablet){.prepare-workspace .prepare-route{grid-template-columns:1fr;gap:12px}.route-arrow{display:none}.prepare-footer{flex-wrap:wrap}.prepare-footer button{width:100%}}
</style>
