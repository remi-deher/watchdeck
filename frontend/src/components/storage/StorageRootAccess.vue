<template>
 <div class="root-access">
  <div class="root-access-summary"><span v-for="entry in entries" :key="entry.connection_id" class="root-access-entry"><strong>{{ connections.find(c=>c.id===entry.connection_id)?.method==='ssh'?'SSH':'Montage' }} · {{ connections.find(c=>c.id===entry.connection_id)?.name }}</strong><code :title="entry.path">{{ entry.path || 'Chemin à configurer' }}</code></span><span v-if="!entries.length">Non configuré</span><UiButton variant="ghost" :disabled="busy" :aria-label="`Configurer les accès pour ${row.instance} ${row.arr_root}`" @click="configuring=true">Configurer</UiButton></div>
  <ModalShell :open="configuring" :title="`Accès aux fichiers · ${row.instance}`" :subtitle="row.arr_root" :busy="busy" @close="configuring=false">
  <div v-for="method in methods.filter(m=>connections.some(c=>c.method===m.value))" :key="method.value" class="root-method">
   <label><span>{{ method.label }}</span><select :value="chosen(method.value)?.connection_id||0" :disabled="busy || !row.arr_root" :aria-label="`${method.label} pour ${row.instance} ${row.arr_root}`" @change="select(method.value,Number(($event.target as HTMLSelectElement).value))"><option :value="0">Non configuré</option><option v-for="c in connections.filter(c=>c.method===method.value)" :key="c.id" :value="c.id">{{ c.name }}{{ c.tested?'':' · à tester' }}</option></select></label>
   <template v-if="chosen(method.value)"><div class="path-picker"><label><span class="sr-only">Chemin {{ method.label }} pour {{ row.instance }} {{ row.arr_root }}</span><input :value="chosen(method.value).path" :disabled="busy" placeholder="Chemin accessible" @input="path(method.value,($event.target as HTMLInputElement).value)" /></label><UiButton :disabled="busy || !connection(method.value)?.tested" :aria-label="`Parcourir les dossiers ${method.label} pour ${row.instance} ${row.arr_root}`" @click="browsing=method.value">…</UiButton></div></template>
  </div>
  <small v-if="entries.length">{{ dirty?'À enregistrer':validated?'Accès aux fichiers validés':'Accès aux fichiers à vérifier' }}</small>
  <div class="actions"><UiButton @click="configuring=false">Terminer</UiButton></div>
  </ModalShell>
  <StorageDirectoryBrowser :open="Boolean(browsing)" :connection="connection(browsing)" :initial-path="chosen(browsing)?.path||''" :root-label="`${row.instance} · ${row.arr_root}`" @close="browsing=''" @choose="choose" />
 </div>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import StorageDirectoryBrowser from './StorageDirectoryBrowser.vue';
const props=defineProps<{row:any,binding:any,connections:any[],busy:boolean,validated:boolean,dirty:boolean}>();
const emit=defineEmits<{change:[binding:any]}>();const browsing=ref(''),configuring=ref(false);
const methods=[{value:'ssh',label:'SSH'},{value:'local',label:'Local'}];
const entries=computed(()=>props.binding.bindings || (props.binding.connection_id?[props.binding]:[]));
const connection=(method:string)=>props.connections.find(c=>c.id===chosen(method)?.connection_id);
const chosen=(method:string)=>entries.value.find((b:any)=>props.connections.find(c=>c.id===b.connection_id)?.method===method);
function select(method:string,id:number){const bindings=entries.value.filter((b:any)=>b!==chosen(method));if(id)bindings.push({connection_id:id,path:''});emit('change',{bindings});}
function path(method:string,value:string){emit('change',{bindings:entries.value.map((b:any)=>b===chosen(method)?{...b,path:value}:b)});}
function choose(value:string){path(browsing.value,value);browsing.value='';}
</script>
<style scoped lang="scss">.root-access-summary{display:grid;gap:6px}.root-access-entry{display:grid;gap:2px;min-width:0}.root-access-entry code{white-space:nowrap!important;overflow:hidden;text-overflow:ellipsis}.root-access-summary>span{color:var(--text-muted)}.root-access-summary button{justify-self:start}.root-access{display:grid;gap:8px;min-width:0}.root-method{display:grid;gap:6px}.root-method>label{display:flex;gap:8px;align-items:center}.root-method>label>span{min-width:40px}.root-method select{flex:1;min-width:0}.path-picker{display:flex;gap:6px;align-items:center}.path-picker label{flex:1;min-width:0}.path-picker input{width:100%;box-sizing:border-box}.root-access small{color:var(--text-muted);line-height:1.4}</style>
