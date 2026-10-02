<template>
  <!-- Client torrent (qBittorrent, Transmission, Deluge), dans la feuille ouverte depuis
       Integrations. -->
  <UiFeedback v-if="notFound" type="error" message="Ce client n’existe plus." />
  <form v-else class="compact-form" @submit.prevent="enregistrer">
    <UiFeedback v-if="error" type="error" :message="error" />
    <label>Nom<input v-model="form.name"></label>
    <label>Type
      <UiSelect v-model="form.client_type" :options="[{ value: 'qbittorrent', label: 'qBittorrent' }, { value: 'transmission', label: 'Transmission' }, { value: 'deluge', label: 'Deluge' }]" />
    </label>
    <label>URL<input v-model="form.url" type="url"></label>
    <label>Utilisateur <small>(facultatif)</small>
      <input v-model="form.username" autocomplete="username">
      <small>Laisser vide si le client autorise Watchdeck par adresse IP ou sous-réseau.</small>
    </label>
    <label>Mot de passe <small>(facultatif)</small>
      <input v-model="form.password" type="password" autocomplete="current-password">
    </label>
    <label>Catégorie
      <input v-model="form.category">
      <small>Catégorie appliquée aux torrents envoyés, pour les retrouver facilement dans le client.</small>
    </label>
    <label>Tags
      <input v-model="form.tags">
      <small>Tags séparés par des virgules, appliqués aux torrents envoyés depuis Watchdeck.</small>
    </label>
    <UiCheckboxField v-model="form.is_default" label="Client par défaut" />
    <small class="check-hint">Client présélectionné quand plusieurs sont configurés et qu'aucun n'est explicitement choisi lors d'un envoi manuel.</small>

    <div class="form-actions">
      <ConnectionTestAction :loading="testing" :disabled="!form.url" label="Tester la connexion" @test="test" />
      <UiButton @click="emit('cancel')">Annuler</UiButton>
      <UiButton variant="primary" type="submit" :loading="saving" :disabled="!form.name || !form.url"><Save />{{ creating ? 'Ajouter' : 'Mettre à jour' }}</UiButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useMutation } from '@tanstack/vue-query';
import { Save } from '@lucide/vue';
import { api } from '@/api';
import { useCrudResource } from '@/composables/useCrudResource';
import { useResourceForm } from '@/composables/useResourceForm';
import { useToast } from '@/composables/useToast';
import { humanizeError } from '@/utils/apiError';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import ConnectionTestAction from '../connections/ConnectionTestAction.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ (e: 'done', message: string): void; (e: 'cancel'): void }>();

const defaults = { name: '', client_type: 'qbittorrent', url: '', username: '', password: '', category: '', tags: '', is_default: false, enabled: true };
const crud = useCrudResource<any>('/api/download-clients', defaults);
const form = crud.form;
const { creating, notFound, error, saving, submit } = useResourceForm(crud, toRef(props, 'id'));
const { addToast } = useToast();

async function enregistrer(): Promise<void> {
  if (await submit()) emit('done', creating.value ? 'Client ajouté.' : 'Client mis à jour.');
}

const testMutation = useMutation({
  mutationFn: async () => {
    const data = await api<any>('/api/test/download-client', { method: 'POST', body: JSON.stringify(form) });
    if (!data.success) throw new Error(data.message || 'Connexion impossible.');
    return data;
  },
  retry: 0,
});
const testing = computed(() => testMutation.isPending.value);
async function test(): Promise<void> {
  try {
    const data = await testMutation.mutateAsync();
    addToast({ type: 'success', title: 'Connexion', message: data.message || 'Client joignable.' });
  } catch (e) { error.value = humanizeError(e); }
}
</script>

<style scoped>
.form-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--space-2);margin-top:var(--space-2)}
</style>
