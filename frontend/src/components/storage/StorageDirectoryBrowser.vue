<template>
 <ModalShell :open="open" title="Choisir un dossier" @close="$emit('close')">
  <p v-if="rootLabel" class="configured-root">Dossier à configurer : <strong>{{ rootLabel }}</strong></p>
  <p>{{ connection?.method==='ssh'?'Serveur SSH':'Moteur local' }} : {{ connection?.name }} · exploration en lecture seule</p>
  <UiFeedback v-if="error" type="error" :message="error" />
  <form class="browser-path" @submit.prevent="load(path)"><label>Chemin courant<input v-model="path" /></label><UiButton type="submit" :loading="busy">Ouvrir</UiButton></form>
  <UiButton v-if="connection?.method==='local'" :disabled="busy" @click="load('/')">Voir les volumes montés</UiButton>
  <UiButton :disabled="busy || !listing?.parent" @click="load(listing.parent)">↑ Dossier parent</UiButton>
  <p v-if="busy" role="status">Chargement des dossiers…</p>
  <ul class="folder-list"><li v-for="folder in listing?.directories||[]" :key="folder.path"><UiButton :disabled="busy" @click="load(folder.path)">📁 {{ folder.name }}</UiButton></li></ul>
  <p v-if="listing && !listing.directories.length && !busy">{{ listing.selectable===false ? `Aucun volume monté dans ${listing.path}.` : 'Aucun sous-dossier accessible.' }}</p>
  <div class="actions"><UiButton @click="$emit('close')">Annuler</UiButton><UiButton variant="primary" :disabled="busy || !listing || listing.path==='/' || listing.selectable===false" @click="$emit('choose',listing.path)">Choisir ce dossier</UiButton></div>
 </ModalShell>
</template>
<script setup lang="ts">
import {ref,watch} from 'vue';
import {api} from '@/api';
import ModalShell from '@/components/ui/ModalShell.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
const props=defineProps<{open:boolean,connection:any,initialPath:string,rootLabel?:string}>();const path=ref(''),listing=ref<any>(null),busy=ref(false),error=ref('');
async function load(next:string){busy.value=true;error.value='';listing.value=null;path.value=next;try{listing.value=await api(`/api/storage/connections/${props.connection.id}/browse`,{method:'POST',body:JSON.stringify({path:next})});path.value=listing.value.path;}catch(e:any){error.value=e.message;}finally{busy.value=false;}}
watch(()=>props.open,open=>{if(open)load(props.initialPath || (props.connection.method==='ssh'?'/':props.connection.connection?.browse_root||'/storage'));});
defineEmits<{close:[],choose:[path:string]}>();
</script>
<style scoped>.configured-root{padding:10px 12px;background:var(--bg-input,var(--bg));border-radius:8px;overflow-wrap:anywhere}.browser-path,.actions{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.browser-path label{display:grid;gap:6px;flex:1;min-width:0}.folder-list{list-style:none;padding:0;max-height:40vh;overflow:auto}.folder-list button{justify-content:flex-start;width:100%;margin:3px 0}.actions{margin-top:16px}</style>
