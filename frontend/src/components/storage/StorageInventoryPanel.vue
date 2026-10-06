<template>
  <section class="storage-card">
    <h2>Inventaire des médias</h2>
    <p>Observations Plex et Arr indépendantes. Les chemins et tailles seront revérifiés avant un déplacement.</p>
    <label>Source <select v-model="source" @change="offset=0;load()"><option value="">Toutes</option><option value="plex">Plex</option><option value="arr">Sonarr / Radarr</option></select></label>
    <UiFeedback v-if="error" type="error" :message="error" />
    <p v-if="loading" role="status">Chargement de l’inventaire…</p>
    <p v-else-if="!rows.length">Aucune observation disponible. L’inventaire se remplit pendant les synchronisations et les actualisations en arrière-plan.</p>
    <ul>
      <li v-for="row in rows" :key="row.id">
        <strong>{{ row.data.title }}</strong> · {{ row.source==='plex'?'Plex':'Arr' }} · {{ row.present?'Observé':'Absent du dernier catalogue complet' }}
        <p>Dernière observation : {{ new Date(row.observed_at+'Z').toLocaleString() }}</p>
        <p v-if="row.data.files_observed_at">Fichiers actualisés : {{ new Date(row.data.files_observed_at+'Z').toLocaleString() }}</p>
        <p v-if="row.source==='arr'">Dossier Arr : <code>{{ row.data.path }}</code></p>
        <ul v-if="row.data.files?.length"><li v-for="file in row.data.files" :key="file.path+file.rating_key"><code>{{ file.path }}</code> · {{ file.size_bytes==null?'Taille inconnue':(file.size_bytes/1e9).toFixed(2)+' Go' }} · {{ file.present?'Observé par '+(row.source==='plex'?'Plex':'Arr'):'Ancien emplacement' }}</li></ul>
        <UiButton v-if="row.source==='plex'" :disabled="refreshing!==0" @click="refresh(row.id)">{{ refreshing===row.id?'Actualisation…':'Actualiser la fiche Plex' }}</UiButton>
      </li>
    </ul>
    <UiButton :disabled="offset===0 || loading" @click="offset=Math.max(0,offset-100);load()">Précédent</UiButton>
    <UiButton :disabled="rows.length < 100 || loading" @click="offset+=100;load()">Suivant</UiButton>
  </section>
</template>
<script setup lang="ts">
import {onMounted,ref} from 'vue';
import {api} from '@/api';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
const rows=ref<any[]>([]),source=ref(''),offset=ref(0),loading=ref(false),refreshing=ref(0),error=ref('');
async function load(){loading.value=true;error.value='';try{rows.value=await api(`/api/storage/inventory?offset=${offset.value}&limit=100${source.value?'&source='+source.value:''}`);}catch(e:any){error.value=e.message;}finally{loading.value=false;}}
async function refresh(id:number){refreshing.value=id;error.value='';try{await api(`/api/storage/inventory/${id}/refresh`,{method:'POST'});await load();}catch(e:any){error.value=e.message;}finally{refreshing.value=0;}}
onMounted(load);
</script>
<style scoped>li{margin-block:12px}code{overflow-wrap:anywhere}p{margin-block:6px}</style>
