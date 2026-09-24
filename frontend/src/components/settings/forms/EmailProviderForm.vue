<template>
  <!-- Fournisseur d'envoi d'email (SMTP, SMTP OAuth2 Microsoft, API Brevo), dans la
       feuille ouverte depuis Notifications. -->
  <UiFeedback v-if="notFound" type="error" message="Ce fournisseur n’existe plus." />
  <form v-else class="compact-form" @submit.prevent="enregistrer">
    <UiFeedback v-if="error" type="error" :message="error" />
    <label>Nom<input v-model="form.name" placeholder="ex: Hotmail perso"></label>
    <label>Type
      <UiSelect v-model="form.provider_type" :options="[{ value: 'smtp', label: 'SMTP — Utilisateur / mot de passe' }, { value: 'smtp_oauth2', label: 'SMTP — OAuth2 (Microsoft — hotmail.fr / outlook.com)' }, { value: 'brevo', label: 'API Brevo (sans serveur SMTP)' }]" />
    </label>

    <template v-if="form.provider_type === 'smtp'">
      <label>Serveur SMTP<input v-model="form.smtp_host"></label>
      <label>Port<UiNumberField v-model="form.smtp_port" /></label>
      <UiCheckboxField v-model="form.smtp_tls" label="TLS" />
      <label>Utilisateur<input v-model="form.smtp_user"></label>
      <label>Mot de passe<input v-model="form.smtp_password" type="password" placeholder="Laisser vide pour conserver"></label>
    </template>

    <template v-else-if="form.provider_type === 'smtp_oauth2'">
      <small class="provider-hint">
        Microsoft a désactivé l'authentification par mot de passe pour outlook.com/hotmail.fr : il faut
        enregistrer une application dans <a href="https://portal.azure.com" target="_blank" rel="noopener">Azure AD (App registrations)</a>,
        l'autoriser pour les comptes personnels, y ajouter l'URI de redirection
        <code>{{ redirectUri }}</code>, puis renseigner ci-dessous son Client ID (et son secret s'il s'agit d'un client confidentiel).
      </small>
      <label>Serveur SMTP<input v-model="form.smtp_host" placeholder="smtp-mail.outlook.com"></label>
      <label>Port<UiNumberField v-model="form.smtp_port" /></label>
      <UiCheckboxField v-model="form.smtp_tls" label="TLS" />
      <label>Boîte Microsoft (hotmail.fr / outlook.com)<input v-model="form.oauth_mailbox" type="email" placeholder="vous@hotmail.fr"></label>
      <label>Tenant<input v-model="form.oauth_tenant" placeholder="consumers"><small>« consumers » pour un compte personnel hotmail.fr/outlook.com</small></label>
      <label>Client ID<input v-model="form.oauth_client_id"></label>
      <label>Client secret (optionnel)<input v-model="form.oauth_client_secret" type="password" placeholder="Laisser vide pour conserver / si client public"></label>
      <div v-if="!creating" class="oauth-state">
        <span class="settings-card-status" :class="connected ? 'active' : 'error'">
          {{ connected ? 'Compte Microsoft connecté' : 'Non connecté' }}
        </span>
        <UiButton @click="connectMicrosoft"><PlugZap />{{ connected ? 'Reconnecter' : 'Connecter avec Microsoft' }}</UiButton>
        <UiButton v-if="connected" @click="disconnectMicrosoft">Déconnecter</UiButton>
      </div>
      <small v-else class="provider-hint">Enregistrez d'abord le fournisseur pour pouvoir le connecter à un compte Microsoft.</small>
    </template>

    <template v-else-if="form.provider_type === 'brevo'">
      <small class="provider-hint">
        Envoi via l'API <a href="https://developers.brevo.com/docs/getting-started" target="_blank" rel="noopener">Brevo</a>
        (pas de serveur SMTP) : créez une clé API dans Brevo (Paramètres &gt; Clés API), et vérifiez
        l'adresse expéditrice de l'application dans Brevo (Expéditeurs &amp; IP) avant le premier envoi.
      </small>
      <label>Clé API Brevo<input v-model="form.brevo_api_key" type="password" placeholder="Laisser vide pour conserver"></label>
    </template>

    <UiCheckboxField v-model="form.enabled" label="Fournisseur actif" />

    <div class="form-actions">
      <UiButton @click="emit('cancel')">Annuler</UiButton>
      <UiButton variant="primary" type="submit" :loading="saving" :disabled="!form.name"><Save />{{ creating ? 'Ajouter' : 'Mettre à jour' }}</UiButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import { PlugZap, Save } from '@lucide/vue';
import { api } from '@/api';
import { useCrudResource } from '@/composables/useCrudResource';
import { useResourceForm } from '@/composables/useResourceForm';
import { useToast } from '@/composables/useToast';
import { humanizeError } from '@/utils/apiError';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ (e: 'done', message: string): void; (e: 'cancel'): void }>();

const defaults = {
  name: '', provider_type: 'smtp', enabled: true,
  smtp_host: '', smtp_port: 587, smtp_tls: true, smtp_user: '', smtp_password: '',
  oauth_tenant: 'consumers', oauth_client_id: '', oauth_client_secret: '', oauth_mailbox: '',
  brevo_api_key: '',
};
const crud = useCrudResource<any>('/api/email-providers', defaults);
const form = crud.form;
const { creating, item, notFound, error, saving, submit } = useResourceForm(crud, toRef(props, 'id'));
const { addToast } = useToast();

const redirectUri = `${window.location.origin}/api/email-providers/smtp-oauth/callback`;
const connected = computed(() => Boolean(item.value?.oauth_connected));

async function enregistrer(): Promise<void> {
  if (await submit()) emit('done', creating.value ? 'Fournisseur ajouté.' : 'Fournisseur mis à jour.');
}

/* On enregistre avant de partir chez Microsoft : l'autorisation revient sur la page de
   reglages, et ce qu'on venait de saisir serait perdu. */
async function connectMicrosoft(): Promise<void> {
  if (creating.value) return;
  if (!(await submit())) return;
  window.location.href = `/api/email-providers/${props.id}/smtp-oauth/authorize`;
}

async function disconnectMicrosoft(): Promise<void> {
  try {
    await api(`/api/email-providers/${props.id}/smtp-oauth/disconnect`, { method: 'POST' });
    addToast({ type: 'success', title: 'Email', message: 'Compte Microsoft déconnecté.' });
    await crud.load();
  } catch (e) { error.value = humanizeError(e); }
}
</script>

<style scoped>
.form-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--space-2);margin-top:var(--space-2)}
.provider-hint{color:var(--muted)}
.oauth-state{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
</style>
