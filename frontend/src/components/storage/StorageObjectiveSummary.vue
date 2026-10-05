<template>
 <div class="objective-result" role="status" aria-live="polite">
  <strong>{{ count }}{{ targetTitles ? ' / '+targetTitles : '' }} titres · {{ gb(bytes) }}{{ requested ? ' / '+gb(requested) : '' }}</strong>
  <p v-if="mode!=='selection'">{{ bytes>=requested?'Objectif d’espace atteint':'Il manque '+gb(requested-bytes) }}<span v-if="bytes>requested"> · Dépassement : {{ gb(bytes-requested) }}</span><span v-if="targetTitles && count!==targetTitles"> · {{ targetTitles }} titres demandés</span></p>
  <p v-if="plan.count_covered===false || plan.goal_covered===false" class="warning">La proposition ne remplit pas tous les objectifs. Vous pouvez ajuster la sélection ou revenir à la préparation.</p>
  <p v-for="source in sourceGoals" :key="source.key">{{ source.name }} : {{ gb(source.bytes) }} / {{ gb(source.requested_bytes) }}<span v-if="source.requested_titles"> · {{ source.count }} / {{ source.requested_titles }} titres</span><strong v-if="source.bytes<source.requested_bytes"> · objectif non atteint</strong></p>
  <div v-if="plan.alternatives?.length" class="alternatives"><span>Autres répartitions possibles :</span><UiButton v-for="alternative in plan.alternatives" :key="alternative.title_count" variant="ghost" @click="$emit('alternative',alternative.keys)">{{ alternative.title_count }} titres · {{ gb(alternative.planned_bytes) }}{{ alternative.goal_covered?'':' · espace insuffisant' }}</UiButton></div>
 </div>
</template>
<script setup lang="ts">
import {computed} from 'vue';import UiButton from '@/components/ui/UiButton.vue';
const props=defineProps<{plan:any,selected:string[],gb:(v:any)=>string}>();
const picked=computed(()=>props.plan.groups.flatMap((g:any)=>g.items).filter((i:any)=>props.selected.includes(i.key)));
const count=computed(()=>picked.value.length);const bytes=computed(()=>picked.value.reduce((n:number,i:any)=>n+i.size_bytes,0));
const requested=computed(()=>mode.value==='selection'?0:props.plan.requested_bytes ?? props.plan.groups.reduce((n:number,g:any)=>n+(g.requested_bytes||0),0));
const targetTitles=computed(()=>props.plan.requested_titles ?? props.plan.groups.reduce((n:number,g:any)=>n+(g.requested_titles||0),0));
const mode=computed(()=>props.plan.mode || props.plan.groups[0]?.body.objective_mode || props.plan.groups[0]?.body.mode);
const sourceGoals=computed(()=>props.plan.groups.flatMap((g:any)=> (g.source_objectives||[]).map((source:any)=>{const selected=g.items.filter((i:any)=>props.selected.includes(i.key)&&i.snapshot.source_location_id===source.source_id);return {...source,key:`${g.body.arr_instance_id}:${source.source_id}`,bytes:selected.reduce((n:number,i:any)=>n+i.size_bytes,0),count:selected.length};})));
defineEmits<{alternative:[keys:string[]]}>();
</script>
<style scoped>.objective-result{position:sticky;top:0;background:var(--surface-2,var(--bg));padding:12px;border:1px solid var(--border);border-radius:10px;z-index:1}.objective-result p{margin:8px 0;overflow-wrap:anywhere}.alternatives{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.alternatives button{min-height:44px}</style>
