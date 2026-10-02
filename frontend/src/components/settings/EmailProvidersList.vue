<template>
  <SettingsItemList
    title="Fournisseurs d'envoi d'email"
    subtitle="Plusieurs fournisseurs peuvent être actifs : en cas d'échec, l'envoi bascule sur le suivant, dans l'ordre de la liste."
    :count="providers.length"
    :empty="!providers.length"
  >
    <template #actions>
      <UiButton @click="openSheet()"><Plus/>Ajouter</UiButton>
    </template>
    <template #empty>Aucun fournisseur configuré : les notifications par email ne peuvent pas partir.</template>

    <SettingsItem
      v-for="(provider, index) in providers"
      :key="provider.id"
      :title="provider.name"
      :subtitle="providerSummary(provider, index)"
      :icon="Mail"
      :status="provider.enabled ? 'active' : 'inactive'"
      clickable
      @open="openSheet(provider)"
    >
      <template #actions>
        <UiButton size="sm" icon-only title="Monter" aria-label="Monter" :disabled="index===0" @click="move(index,-1)"><ChevronUp/></UiButton>
        <UiButton size="sm" icon-only title="Descendre" aria-label="Descendre" :disabled="index===providers.length-1" @click="move(index,1)"><ChevronDown/></UiButton>
        <UiButton size="sm" icon-only title="Tester" aria-label="Tester" @click="testProvider(provider)"><PlugZap/></UiButton>
        <UiButton size="sm" icon-only :title="provider.enabled?'Désactiver':'Activer'" :aria-label="provider.enabled?'Désactiver':'Activer'" @click="toggle(provider)"><Power/></UiButton>
        <UiButton size="sm" variant="danger" icon-only title="Supprimer" aria-label="Supprimer" @click="remove(provider)"><Trash2/></UiButton>
      </template>
    </SettingsItem>
  </SettingsItemList>

  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue';
import { onMounted } from 'vue';
import { useMutation } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { ChevronDown, ChevronUp, Mail, Plus, PlugZap, Power, Trash2 } from '@lucide/vue';
import { api } from '@/api';
import { success, fail } from '@/settingsForm';
import SettingsItem from './SettingsItem.vue';
import SettingsItemList from './SettingsItemList.vue';
import ConfirmModal from '../ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useCrudResource } from '@/composables/useCrudResource';
import { ouvrirFiche } from '@/composables/useMediaOverlay';

interface EmailProvider {
  id?: number;
  name: string;
  provider_type: string;
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_tls: boolean;
  smtp_user: string;
  smtp_password: string;
  oauth_tenant: string;
  oauth_client_id: string;
  oauth_client_secret: string;
  oauth_mailbox: string;
  brevo_api_key: string;
  oauth_connected?: boolean;
}

const defaults = {
  name: '', provider_type: 'smtp', enabled: true,
  smtp_host: '', smtp_port: 587, smtp_tls: true, smtp_user: '', smtp_password: '',
  oauth_tenant: 'consumers', oauth_client_id: '', oauth_client_secret: '', oauth_mailbox: '',
  brevo_api_key: '',
};
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

// Noms conservés côté template : le composable fournit la mécanique, pas le vocabulaire.
const {
  items: providers, load, toggle, remove: removeProvider,
} = useCrudResource<EmailProvider>('/api/email-providers', defaults, {
  confirmTitle: 'Supprimer ce fournisseur ?',
});

function remove(provider: any): Promise<void> { return removeProvider(provider, askConfirm); }

const typeLabels: Record<string, string> = { smtp: 'SMTP', smtp_oauth2: 'SMTP OAuth2', brevo: 'Brevo' };
function typeLabel(t: string): string { return typeLabels[t] || t; }
// L'ordre compte : c'est celui dans lequel les fournisseurs sont essayes.
function providerSummary(provider: any, index: number): string {
  const parts = [`${index + 1}. ${typeLabel(provider.provider_type)}`];
  if (provider.provider_type === 'smtp_oauth2') parts.push(provider.oauth_connected ? 'Microsoft connecté' : 'Microsoft non connecté');
  return parts.join(' · ');
}

const providerActionMutation = useMutation({
  mutationFn: ({ path, body }: { path: string; body?: Record<string, any> }) => api<any>(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }),
  retry: 0,
});

async function testProvider(provider: any): Promise<void> {
  const recipient = prompt('Adresse de test', '');
  if (!recipient) return;
  try {
    const data = await providerActionMutation.mutateAsync({ path: `/api/test/email-provider/${provider.id}`, body: { recipient } });
    if (data.success) success(data.message); else fail(new Error(data.message));
  } catch (e) { fail(e); }
}

async function move(index: number, delta: number): Promise<void> {
  const target = index + delta;
  if (target < 0 || target >= providers.value.length) return;
  const order = providers.value.map((p: any) => p.id);
  [order[index], order[target]] = [order[target], order[index]];
  await providerActionMutation.mutateAsync({ path: '/api/email-providers/reorder', body: { order } });
  await load();
}

const route = useRoute();
const router = useRouter();

/* Ajout et modification se font dans la feuille, a leur propre adresse. */
function openSheet(provider?: any): void {
  ouvrirFiche(router, `/settings/resource/email-provider/${provider?.id ?? 'new'}`, route.fullPath);
}

onMounted(async () => {
  const status = route.query.email_oauth;
  if (!status) return;
  if (status === 'success') success('Compte Microsoft connecté.');
  else fail(new Error(String(route.query.msg || "Échec de la connexion au compte Microsoft.")));
  const { email_oauth, msg, ...rest } = route.query;
  router.replace({ path: '/settings', query: rest });
});
</script>
