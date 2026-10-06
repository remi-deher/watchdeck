<template>
 <section class="storage-card">
  <h2>Connexions</h2>
  <p>SSH exécute rsync sur un serveur qui voit les deux stockages. L’accès aux fichiers utilise les volumes montés dans le moteur. Ces accès sont indépendants des associations Arr / Plex.</p>
  <UiFeedback v-if="error" type="error" :message="error" />
  <UiDataTable label="Connexions configurées" :columns="columns" :rows="connections" :row-key="(row:any)=>row.id">
   <template #cell-method="{row}">{{ row.method==='ssh'?'SSH':'Fichiers montés' }}</template>
   <template #cell-state="{row}">{{ row.method==='ssh'&&!row.trusted?'Identité à confirmer':'Configurée · contrôle à l’aperçu' }}</template>
   <template #cell-actions="{row}"><UiButton :disabled="busy" @click="edit(row)">Configurer</UiButton><UiButton v-if="row.method==='ssh'&&!row.trusted" :loading="testing===row.id" :disabled="busy" @click="validate(row.id)">Confirmer le serveur SSH</UiButton></template>
  </UiDataTable>
  <UiButton :disabled="busy" @click="edit()">Ajouter une connexion</UiButton>
  <ModalShell :open="open" title="Configurer une connexion" @close="open=false">
   <form @submit.prevent="save">
    <UiFeedback v-if="error" type="error" :message="error" />
    <div class="form-grid"><label>Nom<input v-model="form.name" required maxlength="100" /></label><label>Méthode<select v-model="form.method"><option value="ssh">SSH</option><option value="local">Fichiers montés dans le moteur</option></select></label></div>
    <template v-if="form.method==='ssh'">
     <p>Python 3 et rsync doivent être installés sur le serveur. L’utilisateur SSH doit pouvoir lire, écrire et supprimer dans les dossiers choisis.</p>
     <div class="form-grid"><label>Serveur<input v-model="form.connection.host" required autocomplete="off" /></label><label>Port<input v-model.number="form.connection.port" type="number" min="1" max="65535" required /></label><label>Utilisateur<input v-model="form.connection.user" required autocomplete="off" /></label><label>Authentification<select v-model="form.connection.auth"><option value="key">Clé SSH privée</option><option value="password">Mot de passe</option></select></label></div>
     <template v-if="form.connection.auth==='key'"><label>Importer une clé privée<input type="file" accept=".pem,.key,text/plain" @change="importKey" /></label><label>Clé privée<textarea v-model="form.private_key" rows="4" :placeholder="form.has_credentials?'Clé conservée si ce champ reste vide':'-----BEGIN OPENSSH PRIVATE KEY-----'" autocomplete="off" /></label><label>Phrase secrète<input v-model="form.passphrase" type="password" autocomplete="new-password" /></label></template>
     <label v-else>Mot de passe<input v-model="form.password" type="password" autocomplete="new-password" :placeholder="form.has_credentials?'Conservé si laissé vide':''" /></label>
    </template>
    <template v-else><label>Dossier de départ de l’explorateur<input v-model="form.connection.browse_root" placeholder="/storage" required /></label><p>Les volumes doivent être déclarés dans Docker Compose. Ce réglage choisit leur chemin dans le moteur ; il ne crée pas de montage.</p></template>
    <section v-if="observed" class="trust-server"><h3>Confirmer le serveur SSH</h3><p>Empreinte détectée : <code>{{ observed.fingerprint }}</code></p><p v-if="observed.changed">L’identité du serveur a changé. Vérifiez cette modification avant de continuer.</p><label class="check"><input v-model="trusted" type="checkbox" />Je fais confiance à ce serveur</label><UiButton :disabled="busy || !trusted" @click="trust">Confirmer le serveur</UiButton></section>
    <p>Les chemins sont configurés séparément dans le tableau des stockages. Aucun transfert n’est lancé.</p>
    <div class="actions"><UiButton :disabled="busy" @click="open=false">Annuler</UiButton><UiButton type="submit" variant="primary" :loading="busy">Enregistrer la connexion</UiButton></div>
   </form>
  </ModalShell>
 </section>
</template>
<script setup lang="ts">
import {ref} from 'vue';
import {api} from '@/api';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiDataTable from '@/components/ui/UiDataTable.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
const props=defineProps<{connections:any[]}>();const emit=defineEmits<{changed:[]}>();
const open=ref(false),busy=ref(false),error=ref(''),testing=ref(0),observed=ref<any>(null),trusted=ref(false);
const fresh=()=>({id:0,name:'',method:'ssh',connection:{host:'',port:22,user:'',auth:'key',browse_root:'/storage'},private_key:'',password:'',passphrase:'',has_credentials:false});
const form=ref<any>(fresh());
const columns=[{key:'name',label:'Connexion',card:'title' as const},{key:'method',label:'Méthode'},{key:'state',label:'Validation'},{key:'actions',label:'Actions'}];
function edit(access?:any){error.value='';observed.value=null;trusted.value=false;form.value=access?{...fresh(),...JSON.parse(JSON.stringify(access)),connection:{...fresh().connection,...access.connection}}:fresh();open.value=true;}
async function importKey(event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];if(file){if(file.size>32768){error.value='Clé trop volumineuse.';return;}form.value.private_key=await file.text();input.value='';}}
async function save(){busy.value=true;error.value='';try{await api(`/api/storage/connections${form.value.id?'/'+form.value.id:''}`,{method:form.value.id?'PUT':'POST',body:JSON.stringify(form.value)});open.value=false;emit('changed');}catch(e:any){error.value=e.message;}finally{busy.value=false;}}
async function trust(){busy.value=true;error.value='';try{await api(`/api/storage/connections/${form.value.id}/trust`,{method:'POST',body:JSON.stringify({fingerprint:observed.value.fingerprint})});open.value=false;emit('changed');}catch(e:any){error.value=e.message;}finally{busy.value=false;}}
async function validate(id:number){busy.value=true;testing.value=id;error.value='';try{const c=props.connections.find(c=>c.id===id);edit(c);observed.value=await api(`/api/storage/connections/${id}/discover`,{method:'POST'});}catch(e:any){error.value=e.message;}finally{testing.value=0;busy.value=false;}}
</script>
<style scoped>
.trust-server{padding:12px;border:1px solid var(--border);border-radius:8px}.trust-server code{overflow-wrap:anywhere}label{display:grid;gap:6px;margin:12px 0}label.check{display:flex;align-items:center}textarea{width:100%;box-sizing:border-box;color:var(--text-primary);background:var(--bg-input,var(--bg));border:1px solid var(--border);border-radius:8px;padding:12px}small{color:var(--text-muted);line-height:1.5}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}
</style>
