<template>
  <!-- Serveur Plex, dans la feuille ouverte depuis Connexions. Le principal se configure
       dans la carte Plex (URL, jeton, SSO) : ici on peut seulement le renommer. -->
  <UiFeedback v-if="notFound" type="error" message="Ce serveur n’existe plus." />
  <form v-else class="compact-form" @submit.prevent="enregistrer">
    <UiFeedback v-if="error" type="error" :message="error" />
    <label>Nom<input v-model="form.name" placeholder="Plex 4K"></label>

    <template v-if="form.is_primary">
      <p class="check-hint full-row">Serveur principal : son adresse, son jeton et ses bibliothèques se règlent dans la carte Plex de Connexions.</p>
    </template>
    <template v-else>
      <label>URL
        <input v-model="form.url" type="url" placeholder="http://192.168.1.50:32401">
        <small>Adresse locale du serveur (pas app.plex.tv).</small>
      </label>
      <label>Jeton
        <input v-model="form.token" type="password" autocomplete="off" :placeholder="form.token_configured ? 'Jeton enregistré' : 'X-Plex-Token'">
        <small>Jeton X-Plex-Token d’un compte qui a accès à ce serveur.</small>
      </label>

      <fieldset class="libraries">
        <legend>Bibliothèques suivies</legend>
        <small v-if="!libraries.length">Aucune saisie : Watchdeck suit les bibliothèques de mêmes noms que sur le serveur principal.</small>
        <div v-for="(lib, index) in libraries" :key="index" class="library-row">
          <input v-model="lib.name" :aria-label="`Nom de la bibliothèque ${index + 1}`" placeholder="Films 4K">
          <UiSelect v-model="lib.kind" :aria-label="`Type de la bibliothèque ${index + 1}`" :options="kindOptions" />
          <UiButton icon-only variant="danger" title="Retirer" aria-label="Retirer cette bibliothèque" @click="libraries.splice(index, 1)"><Trash2 /></UiButton>
        </div>
        <UiButton @click="libraries.push({ name: '', kind: 'movie' })"><Plus />Ajouter une bibliothèque</UiButton>
      </fieldset>

      <fieldset class="tautulli">
        <legend>Tautulli de ce serveur (facultatif)</legend>
        <label>URL Tautulli
          <input v-model.trim="form.tautulli_url" type="url" placeholder="http://tautulli-4k:8181">
          <small>L’import de l’historique Tautulli parcourt aussi celui-ci.</small>
        </label>
        <label>Clé API
          <input v-model="form.tautulli_api_key" type="password" autocomplete="off" :disabled="!form.tautulli_url" :placeholder="form.tautulli_api_key_configured ? 'Clé enregistrée' : 'Clé API Tautulli'">
        </label>
      </fieldset>
    </template>

    <div class="form-actions">
      <ConnectionTestAction :loading="testing" :disabled="!form.is_primary && !form.url" label="Tester la connexion" @test="test" />
      <UiButton @click="emit('cancel')">Annuler</UiButton>
      <UiButton variant="primary" type="submit" :loading="saving" :disabled="!canSave"><Save />{{ creating ? 'Ajouter' : 'Mettre à jour' }}</UiButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { useMutation } from '@tanstack/vue-query';
import { Plus, Save, Trash2 } from '@lucide/vue';
import { api } from '@/api';
import { useCrudResource } from '@/composables/useCrudResource';
import { useResourceForm } from '@/composables/useResourceForm';
import { useToast } from '@/composables/useToast';
import { humanizeError } from '@/utils/apiError';
import UiButton from '@/components/ui/UiButton.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import ConnectionTestAction from '../connections/ConnectionTestAction.vue';

interface Library { name: string; kind: string }

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ (e: 'done', message: string): void; (e: 'cancel'): void }>();

const kindOptions = [
  { value: 'movie', label: 'Films' },
  { value: 'series', label: 'Séries' },
  { value: 'music', label: 'Musique' },
];
const defaults = { name: '', url: '', token: '', libraries: '', enabled: true, is_primary: false, token_configured: false, tautulli_url: '', tautulli_api_key: '', tautulli_api_key_configured: false };
const crud = useCrudResource<any>('/api/plex-servers', defaults);
const form = crud.form;
const { creating, item, notFound, error, saving, submit } = useResourceForm(crud, toRef(props, 'id'));
const { addToast } = useToast();

function parseLibraries(raw: string): Library[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map((lib: any) => ({ name: String(lib.name || ''), kind: String(lib.kind || 'movie') })) : [];
  } catch {
    return [];
  }
}

const libraries = ref<Library[]>([]);
watch(() => [item.value, creating.value], () => { libraries.value = parseLibraries(form.libraries); }, { immediate: true });
watch(libraries, (rows) => {
  const kept = rows.filter((lib) => lib.name.trim());
  form.libraries = kept.length ? JSON.stringify(kept.map((lib) => ({ name: lib.name.trim(), kind: lib.kind }))) : '';
}, { deep: true });

const canSave = computed(() => Boolean(form.name?.trim()) && (form.is_primary || (Boolean(form.url) && (Boolean(form.token) || Boolean(form.token_configured)))));

async function enregistrer(): Promise<void> {
  if (await submit()) emit('done', creating.value ? 'Serveur ajouté.' : 'Serveur mis à jour.');
}

const testMutation = useMutation({
  mutationFn: async () => {
    const body = { id: creating.value ? null : Number(props.id), url: form.is_primary ? null : form.url, token: form.token || null };
    const data = await api<any>('/api/test/plex-server', { method: 'POST', body: JSON.stringify(body) });
    if (!data.success) throw new Error(data.message || 'Connexion impossible.');
    return data;
  },
  retry: 0,
});
const testing = computed(() => testMutation.isPending.value);
async function test(): Promise<void> {
  try {
    const data = await testMutation.mutateAsync();
    addToast({ type: 'success', title: 'Connexion', message: data.message || 'Serveur joignable.' });
  } catch (e) { error.value = humanizeError(e); }
}
</script>

<style scoped>
.full-row,.libraries,.tautulli,.form-actions{grid-column:1/-1}
.libraries,.tautulli{display:grid;gap:var(--space-2);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-3);margin:0}
.libraries legend,.tautulli legend{padding:0 var(--space-1);font-weight:600}
.tautulli{grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.library-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(7rem,10rem) auto;gap:var(--space-2);align-items:center}
.form-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--space-2);margin-top:var(--space-2)}
</style>
