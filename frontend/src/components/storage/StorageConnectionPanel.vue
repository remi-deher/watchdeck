<template>
 <section class="storage-card">
  <h2>Connexions</h2>
  <p>Configurez une connexion réutilisable, puis attribuez-lui vos stockages.</p>
  <UiFeedback v-if="error" type="error" :message="error" />
  <UiDataTable label="Connexions configurées" :columns="columns" :rows="connections" :row-key="(row:any)=>row.id">
   <template #cell-method="{row}">{{ row.method==='ssh'?'SSH':'Fichiers montés' }}</template>
   <template #cell-state="{row}">{{ row.method==='ssh'&&!row.trusted?'Identité à confirmer':'Configurée · contrôle à l’aperçu' }}</template>
   <template #cell-actions="{row}"><UiButton :disabled="busy" @click="edit(row)">Configurer</UiButton><UiButton v-if="row.method==='ssh'&&!row.trusted" :loading="testing===row.id" :disabled="busy" @click="validate(row.id)">Confirmer le serveur SSH</UiButton></template>
  </UiDataTable>
  <UiButton :disabled="busy" @click="edit()">Ajouter une connexion</UiButton>
  <ModalShell :open="open" :busy="busy" title="Configurer une connexion" @close="open=false">
   <form @submit.prevent="save">
    <UiFeedback v-if="error" type="error" :message="error" />
    <div class="form-grid"><label>Nom<input v-model="form.name" required maxlength="100" /></label><label>Méthode<select v-model="form.method"><option value="ssh">SSH</option><option value="local">Fichiers montés dans le moteur</option></select></label></div>
    <template v-if="form.method==='ssh'">
     <p>Python 3 et rsync doivent être installés sur le serveur. L’utilisateur SSH doit pouvoir lire, écrire et supprimer dans les dossiers choisis.</p>
     <div class="form-grid"><label>Serveur<input v-model="form.connection.host" required autocomplete="off" /></label><label>Port<input v-model.number="form.connection.port" type="number" min="1" max="65535" required /></label><label>Utilisateur<input v-model="form.connection.user" required autocomplete="off" /></label></div>
     <h3>Authentification</h3><p>Renseignez une ou deux méthodes, puis choisissez leur ordre.</p>
     <fieldset><legend>Clé SSH · {{ keyAvailable?'disponible':'non renseignée' }}</legend><label>Importer une clé privée<input type="file" accept=".pem,.key,text/plain" @change="importKey" /></label><label>Clé privée<textarea v-model="form.private_key" rows="4" :placeholder="form.has_private_key && !form.clear_private_key?'Clé enregistrée, conservée si ce champ reste vide':'Coller une clé privée SSH'" autocomplete="off" spellcheck="false" /></label><label>Phrase secrète (facultative)<input v-model="form.passphrase" type="password" autocomplete="new-password" /></label><UiButton v-if="keyAvailable" variant="ghost" @click="form.clear_private_key=true;form.private_key='';form.passphrase=''">Supprimer la clé</UiButton></fieldset>
     <fieldset><legend>Mot de passe · {{ passwordAvailable?'disponible':'non renseigné' }}</legend><label>Mot de passe<input v-model="form.password" type="password" autocomplete="new-password" :placeholder="form.has_password && !form.clear_password?'Enregistré, conservé si laissé vide':'Saisir un mot de passe'" /></label><UiButton v-if="passwordAvailable" variant="ghost" @click="form.clear_password=true;form.password=''">Supprimer le mot de passe</UiButton></fieldset>
     <template v-if="keyAvailable && passwordAvailable"><label>Méthode prioritaire<select v-model="form.connection.auth" aria-label="Méthode prioritaire"><option value="key">Clé SSH</option><option value="password">Mot de passe</option></select></label><label class="check"><input v-model="form.connection.auth_fallback" type="checkbox" />Essayer l’autre méthode si l’authentification échoue</label></template><p v-else-if="keyAvailable || passwordAvailable">{{ keyAvailable?'Clé SSH':'Mot de passe' }} utilisé automatiquement.</p>
    </template>
    <template v-else><label>Dossier de départ de l’explorateur<input v-model="form.connection.browse_root" placeholder="/storage" required /></label><p>Les volumes doivent être déclarés dans Docker Compose. Ce réglage choisit leur chemin dans le moteur ; il ne crée pas de montage.</p></template>
    <section v-if="observed" class="trust-server"><h3>Confirmer le serveur SSH</h3><p>Empreinte détectée : <code>{{ observed.fingerprint }}</code></p><p v-if="observed.changed">L’identité du serveur a changé. Vérifiez cette modification avant de continuer.</p><label class="check"><input v-model="trusted" type="checkbox" />Je fais confiance à ce serveur</label><UiButton :disabled="busy || !trusted" @click="trust">Confirmer le serveur</UiButton></section>
    <h3>Stockages utilisant cette connexion</h3><label>Rechercher un stockage<input v-model="stockQuery" placeholder="Nom du stockage…" /></label>
    <fieldset v-for="location in filteredLocations" :key="location.id"><legend><label class="check"><input type="checkbox" :checked="assigned(location)" @change="toggleLocation(location,($event.target as HTMLInputElement).checked)" />{{ location.name }}</label></legend><small>{{ connectionNames(location) }}</small><p v-if="assigned(location) && replacement(location)" class="replacement">La connexion actuelle de même méthode sera remplacée.</p><template v-if="assigned(location)"><label v-for="m in location.mappings" :key="rootKey(m)">Chemin accessible · {{ m.arr_root }}<input v-model="assignments[rootKey(m)]" required placeholder="Chemin vu par cette connexion" /></label></template></fieldset>
    <h3>Tester la connexion</h3><p>Vérifie l’accès SSH et l’authentification. Les dossiers seront contrôlés à l’aperçu.</p><UiButton :disabled="busy" @click="test">Tester la connexion</UiButton><UiFeedback v-if="testResult" type="success" :message="testResult" />
    <div class="actions"><UiButton :disabled="busy" @click="open=false">Annuler</UiButton><UiButton type="submit" variant="primary" :loading="busy">Enregistrer la connexion</UiButton></div>
   </form>
  </ModalShell>
 </section>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue';
import {api} from '@/api';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiDataTable from '@/components/ui/UiDataTable.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
const props=defineProps<{connections:any[],locations?:any[],accesses?:any[]}>();const emit=defineEmits<{changed:[]}>();
const open=ref(false),busy=ref(false),error=ref(''),testing=ref(0),observed=ref<any>(null),trusted=ref(false);
const fresh=()=>({id:0,name:'',method:'ssh',connection:{host:'',port:22,user:'',auth:'key',auth_fallback:false,browse_root:'/storage'},private_key:'',password:'',passphrase:'',has_credentials:false,has_private_key:false,has_password:false,clear_private_key:false,clear_password:false});
const form=ref<any>(fresh()),assignments=ref<Record<string,string>>({}),stockQuery=ref(''),testResult=ref('');
const keyAvailable=computed(()=>Boolean(form.value.private_key || (form.value.has_private_key&&!form.value.clear_private_key)));
const passwordAvailable=computed(()=>Boolean(form.value.password || (form.value.has_password&&!form.value.clear_password)));
const rootKey=(m:any)=>`${m.arr_instance_id}:${m.arr_root}`;
const filteredLocations=computed(()=>(props.locations||[]).filter(l=>l.name.toLowerCase().includes(stockQuery.value.toLowerCase())));
const rootAccesses=(m:any)=>(props.accesses||[]).filter(a=>a.method===form.value.method&&a.roots?.some((r:any)=>rootKey(r)===rootKey(m)));
function assigned(l:any){return l.mappings?.length && l.mappings.every((m:any)=>Object.hasOwn(assignments.value,rootKey(m)));}
function replacement(l:any){return l.mappings?.some((m:any)=>rootAccesses(m).some(a=>a.connection_id!==form.value.id));}
function connectionNames(l:any){return [...new Set(l.mappings?.flatMap((m:any)=>rootAccesses(m).map(a=>a.name)))].join(' · ')||'Aucune connexion de cette méthode';}
function toggleLocation(l:any,checked:boolean){for(const m of l.mappings){const key=rootKey(m);if(checked){const a=rootAccesses(m)[0];assignments.value[key]=a?.roots.find((r:any)=>rootKey(r)===key)?.path||'';}else delete assignments.value[key];}}

const columns=[{key:'name',label:'Connexion',card:'title' as const},{key:'method',label:'Méthode'},{key:'state',label:'Validation'},{key:'actions',label:'Actions'}];
function edit(access?:any){error.value='';observed.value=null;trusted.value=false;form.value=access?{...fresh(),...JSON.parse(JSON.stringify(access)),connection:{...fresh().connection,...access.connection}}:fresh();assignments.value={};for(const a of props.accesses||[])if(a.connection_id===access?.id)for(const r of a.roots||[])assignments.value[rootKey(r)]=r.path;stockQuery.value='';testResult.value='';open.value=true;}
async function importKey(event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];if(file){if(file.size>32768){error.value='Clé trop volumineuse.';return;}form.value.private_key=await file.text();input.value='';}}
async function persist(){const next:any=await api(`/api/storage/connections${form.value.id?'/'+form.value.id:''}`,{method:form.value.id?'PUT':'POST',body:JSON.stringify(form.value)});form.value={...form.value,...next,private_key:'',password:'',passphrase:'',clear_private_key:false,clear_password:false};return next;}
async function save(){busy.value=true;error.value='';try{const next=await persist();if(props.locations){const roots=Object.entries(assignments.value).map(([key,path])=>{const split=key.indexOf(':');return {arr_instance_id:Number(key.slice(0,split)),arr_root:key.slice(split+1),path};});await api(`/api/storage/connections/${next.id}/assignments`,{method:'PUT',body:JSON.stringify({roots})});}open.value=false;emit('changed');}catch(e:any){error.value=e.message;emit('changed');}finally{busy.value=false;}}
async function test(){busy.value=true;error.value='';testResult.value='';try{const next=await persist();emit('changed');if(next.method==='ssh'&&!next.trusted){observed.value=await api(`/api/storage/connections/${next.id}/discover`,{method:'POST'});return;}const result:any=await api(`/api/storage/connections/${next.id}/test`,{method:'POST'});testResult.value=result.method==='local'?'Connexion locale configurée.':`Connexion réussie avec ${result.auth_method==='password'?'le mot de passe':'la clé SSH'}.`;emit('changed');}catch(e:any){error.value=e.message;}finally{busy.value=false;}}

async function trust(){busy.value=true;error.value='';try{await api(`/api/storage/connections/${form.value.id}/trust`,{method:'POST',body:JSON.stringify({fingerprint:observed.value.fingerprint})});observed.value=null;testResult.value='Identité du serveur confirmée. Vous pouvez tester la connexion.';emit('changed');}catch(e:any){error.value=e.message;}finally{busy.value=false;}}
async function validate(id:number){busy.value=true;testing.value=id;error.value='';try{const c=props.connections.find(c=>c.id===id);edit(c);observed.value=await api(`/api/storage/connections/${id}/discover`,{method:'POST'});}catch(e:any){error.value=e.message;}finally{testing.value=0;busy.value=false;}}
</script>
<style scoped>
.replacement{color:var(--accent)}fieldset{min-width:0;padding:16px;margin:16px 0;border:1px solid var(--border);border-radius:var(--radius-md)}.trust-server{padding:12px;border:1px solid var(--border);border-radius:8px}.trust-server code{overflow-wrap:anywhere}label{display:grid;gap:6px;margin:12px 0}label.check{display:flex;align-items:center}textarea{width:100%;box-sizing:border-box;color:var(--text-primary);background:var(--bg-input,var(--bg));border:1px solid var(--border);border-radius:8px;padding:12px}small{color:var(--text-muted);line-height:1.5}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}
</style>
