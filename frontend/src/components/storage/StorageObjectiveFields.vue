<template>
 <div class="objective-fields">
  <label>Nom de la tâche<input v-model="form.name" maxlength="100" placeholder="Ex. Faire de la place" :disabled="busy" /></label>
  <template v-if="form.mode!=='selection'">
   <label>{{ form.mode==='minimum_free'?'Espace libre minimum par source (Go)':'Espace à libérer au total (Go)' }}<input :value="form.goal_gb" type="number" min="0.1" step="0.1" max="1000000" required :disabled="busy" @input="setGeneral(($event.target as HTMLInputElement).value)" /></label>
   <label v-if="form.mode==='release_space'" class="check"><input v-model="perSource" type="checkbox" :disabled="busy" @change="resetScope" /> Définir un objectif par source</label>
   <div v-if="perSource || form.mode==='minimum_free'" class="source-goals"><template v-for="route in form.routes" :key="route.arr_instance_id"><label v-for="root in route.source_roots" :key="root">{{ root }}<input type="number" min="0.1" step="0.1" max="1000000" :value="route.root_goals?.[root] ?? form.goal_gb" :disabled="busy" @input="route.root_goals={...route.root_goals,[root]:Number(($event.target as HTMLInputElement).value)}" /></label></template></div>
   <label>Répartition<select v-model="distribution" :disabled="busy" @change="form.target_titles=distribution==='count'?5:null"><option value="auto">Automatique</option><option value="count">Sur un nombre de titres</option></select></label>
   <label v-if="distribution==='count'">Nombre de titres<input v-model.number="form.target_titles" type="number" min="1" :max="form.max_titles" required :disabled="busy" /><small>Un film ou une série entière compte pour un titre. En mode par source, ce nombre s’applique à chaque source.</small></label>
  </template>
  <label>Titres à privilégier<select v-model="form.preference" :disabled="busy"><option value="closest">Au plus proche de l’objectif</option><option value="oldest_added">Les plus anciens ajouts</option><option value="least_recently_watched">Les moins récemment regardés sur Plex</option></select><small>Si les données Plex manquent, l’aperçu vous demandera de choisir un autre critère.</small></label>
  <label class="check"><input v-model="form.auto_resume" type="checkbox" :disabled="busy" /> Reprendre le suivi après redémarrage</label>
  <details v-if="protectedTitles.length"><summary>{{ protectedTitles.length }} titre(s) protégé(s)</summary><div v-for="title in protectedTitles" :key="title.key" class="protected-title"><span>{{ title.title }}</span><UiButton :disabled="busy" variant="ghost" @click="$emit('unprotect',title.key)">Autoriser le déplacement</UiButton></div></details>
  <p class="objective-summary" role="status">{{ summary }}</p>
 </div>
</template>
<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import UiButton from '@/components/ui/UiButton.vue';
const props=defineProps<{busy:boolean,protectedTitles:any[]}>();
const form=defineModel<any>({required:true});
const perSource=ref(form.value.per_source_goal ?? form.value.routes.some((r:any)=>Object.keys(r.root_goals||{}).length));
const distribution=ref(form.value.target_titles?'count':'auto');
watch(()=>form.value.mode,()=>{perSource.value=false;form.value.per_source_goal=false;for(const route of form.value.routes)route.root_goals={};if(form.value.mode==='selection'){form.value.target_titles=null;distribution.value='auto';}});
function setGeneral(value:string){form.value.goal_gb=value===''?null:Number(value);for(const route of form.value.routes)route.root_goals={};if(perSource.value)resetScope();}
function resetScope(){form.value.per_source_goal=perSource.value;for(const route of form.value.routes)route.root_goals=perSource.value?Object.fromEntries(route.source_roots.map((root:string)=>[root,form.value.goal_gb])):{};}
const summary=computed(()=>form.value.mode==='selection'?'Choisissez les titres dans l’aperçu.':`${form.value.mode==='minimum_free'?'Atteindre':'Libérer'} ${form.value.goal_gb || 0} Go ${form.value.mode==='minimum_free'||perSource.value?'par source':'au total'}${form.value.target_titles?` sur ${form.value.target_titles} titres`:''}.`);
defineEmits<{unprotect:[key:string]}>();
</script>
<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.objective-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:20px 0}.objective-fields label{min-width:0;display:grid;gap:8px}.objective-fields small{color:var(--text-muted);line-height:1.5}.source-goals,.objective-summary,.objective-fields details{grid-column:1/-1}.source-goals{display:grid;gap:12px}.protected-title{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.objective-fields .check{display:flex;align-items:center;min-height:44px}.objective-summary{padding:12px;border:1px solid var(--border);border-radius:8px;overflow-wrap:anywhere}@include bp.until(tablet){.objective-fields{grid-template-columns:minmax(0,1fr)}}
</style>
