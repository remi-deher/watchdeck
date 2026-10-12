<template>
  <CrudResourceList
    subtitle="Plusieurs fournisseurs peuvent être actifs : en cas d'échec, l'envoi bascule sur le suivant, dans l'ordre de la liste."
    :items="providers"
    :item-subtitle="providerSummary"
    :item-actions="moveActions"
    empty-label="Aucun fournisseur configuré : les notifications par email ne peuvent pas partir."
    add-label="Ajouter"
    @open-modal="openSheet"
    @toggle="toggle"
    @remove="remove"
    @test="testProvider"
    @action="onAction"
  />

  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useMutation } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { ChevronDown, ChevronUp } from '@lucide/vue';
import { api } from '@/api';
import { success, fail } from '@/settingsForm';
import CrudResourceList from './CrudResourceList.vue';
import ConfirmModal from '../ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useCrudResource } from '@/composables/useCrudResource';
import { ouvrirFiche } from '@/composables/useMediaOverlay';

interface EmailProvider {
  id?: number;
  name: string;
  provider_type: string;
  enabled: boolean;
  oauth_connected?: boolean;
}

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

// Noms conservés côté template : le composable fournit la mécanique, pas le vocabulaire.
const {
  items: providers, load, toggle, remove: removeProvider,
} = useCrudResource<EmailProvider>('/api/email-providers', {
  confirmTitle: 'Supprimer ce fournisseur ?',
});

function remove(provider: any): Promise<void> { return removeProvider(provider, askConfirm); }

const typeLabels: Record<string, string> = { smtp: 'SMTP', smtp_oauth2: 'SMTP OAuth2', brevo: 'Brevo' };
function typeLabel(t: string): string { return typeLabels[t] || t; }
// L'ordre compte : c'est celui dans lequel les fournisseurs sont essayes.
function providerSummary(provider: any): string {
  const parts = [`${providers.value.findIndex((p: any) => p.id === provider.id) + 1}. ${typeLabel(provider.provider_type)}`];
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

function moveActions(_provider: any, index: number) {
  return [
    { key: 'up', label: 'Monter', icon: ChevronUp, iconOnly: true, disabled: index === 0 },
    { key: 'down', label: 'Descendre', icon: ChevronDown, iconOnly: true, disabled: index === providers.value.length - 1 },
  ];
}
function onAction(provider: any, key: string): void {
  const index = providers.value.findIndex((p: any) => p.id === provider.id);
  void move(index, key === 'up' ? -1 : 1);
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
  router.replace({ path: route.path, query: rest });
});
</script>
