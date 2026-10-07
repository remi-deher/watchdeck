<template>
  <details><summary>Options avancées</summary>
    <label class="check"><input v-model="enabled" type="checkbox" @change="sync" />Réserve d’espace libre</label>
    <div v-if="enabled" class="reserve-fields"><label>Valeur<input v-model.number="value" type="number" min="0" :max="unit==='percent'?100:1000000" step="any" required @input="sync" /></label><label>Unité<select v-model="unit" aria-label="Unité" @change="sync"><option value="go">Go</option><option value="percent">%</option></select></label></div>
    <small v-if="enabled">{{ equivalent }}</small><small v-else>Désactivée par défaut.</small>
  </details>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue';const props=defineProps<{totalBytes?:number|null}>();const form=defineModel<any>({required:true});
const enabled=ref(form.value.reserve_percent!=null || form.value.reserve_gb>0),unit=ref(form.value.reserve_percent!=null?'percent':'go'),value=ref<number|null>(form.value.reserve_percent??(form.value.reserve_gb||null));
const fmt=(n:number)=>n.toLocaleString('fr-FR',{maximumFractionDigits:1});
const equivalent=computed(()=>!props.totalBytes?'Équivalent indisponible : capacité inconnue.':value.value==null?'':unit.value==='percent'?`${fmt(value.value)} % ≈ ${fmt(props.totalBytes*value.value/100/1e9)} Go`:`${fmt(value.value)} Go ≈ ${fmt(value.value*1e9/props.totalBytes*100)} %`);
function sync(){form.value={...form.value,reserve_percent:enabled.value&&unit.value==='percent'?value.value:null,reserve_gb:enabled.value&&unit.value==='go'?(value.value||0):0};}
</script>
<style scoped>summary{cursor:pointer;min-height:44px;align-content:center}.reserve-fields{display:grid;grid-template-columns:minmax(0,1fr) 100px;gap:12px}.check{display:flex;align-items:center;gap:10px}small{display:block;color:var(--muted);font-size:var(--fs-sm)}</style>
