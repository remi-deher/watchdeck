<template>
  <SettingsCard
    title="Fournisseurs d'envoi d'email"
    :subtitle="`${providers.length} fournisseur(s) configure(s)`"
    :icon="Mail"
    :status="providers.some(p => p.enabled) ? 'active' : 'inactive'"
    :collapsible="false"
  >
    <template #actions>
      <UiButton @click.stop="openSheet()"><Plus/>Ajouter</UiButton>
    </template>
    <small style="margin-top:-4px;margin-bottom:4px;color:var(--muted)">
      Plusieurs fournisseurs peuvent être actifs en parallèle : en cas d'échec, l'envoi bascule
      automatiquement sur le suivant, par ordre de priorité (haut de liste = essayé en premier).
    </small>
    <UiDataTable label="Fournisseurs d'envoi d'email" :rows="providers" :columns="PROVIDER_COLUMNS" :row-key="(p: any) => p.id">
      <template #empty><p class="empty">Aucun fournisseur configuré — les notifications par email ne peuvent pas partir.</p></template>
      <template #cell-order="{ row: provider, index }">
        <UiButton icon-only title="Monter" aria-label="Monter" :disabled="index===0" @click="move(Number(index),-1)"><ChevronUp/></UiButton>
        <UiButton icon-only title="Descendre" aria-label="Descendre" :disabled="index===providers.length-1" @click="move(Number(index),1)"><ChevronDown/></UiButton>
      </template>
      <template #cell-name="{ row: provider }"><strong>{{ provider.name }}</strong></template>
      <template #cell-type="{ row: provider }"><span class="badge">{{ typeLabel(provider.provider_type) }}</span></template>
      <template #cell-status="{ row: provider }">
        <span class="badge" :class="provider.enabled?'available':'failed'">{{ provider.enabled?'Actif':'Inactif' }}</span>
        <span v-if="provider.provider_type==='smtp_oauth2'" class="badge" :class="provider.oauth_connected?'available':'failed'">
          {{ provider.oauth_connected?'Microsoft connecté':'Microsoft non connecté' }}
        </span>
      </template>
      <template #cell-actions="{ row: provider }">
        <UiButton icon-only title="Tester" aria-label="Tester" @click="testProvider(provider)"><PlugZap/></UiButton>
        <UiButton icon-only title="Modifier" aria-label="Modifier" @click="openSheet(provider)"><Pencil/></UiButton>
        <UiButton icon-only :title="provider.enabled?'Desactiver':'Activer'" :aria-label="provider.enabled?'Desactiver':'Activer'" @click="toggle(provider)"><Power/></UiButton>
        <UiButton variant="danger" icon-only title="Supprimer" aria-label="Supprimer" @click="remove(provider)"><Trash2/></UiButton>
      </template>
    </UiDataTable>
  </SettingsCard>

  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
// L'ordre compte : c'est celui dans lequel les fournisseurs sont essayes.
const PROVIDER_COLUMNS: UiColumn[] = [
  { key: 'order', label: 'Ordre', className: 'actions' },
  { key: 'name', label: 'Nom', card: 'title' },
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Statut' },
  { key: 'actions', label: 'Actions', card: 'actions', className: 'actions' },
];
import { onMounted } from 'vue';
import { useMutation } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { ChevronDown, ChevronUp, Mail, Pencil, Plus, PlugZap, Power, Trash2 } from '@lucide/vue';
import { api } from '@/api';
import { success, fail } from '@/settingsForm';
import SettingsCard from './SettingsCard.vue';
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
