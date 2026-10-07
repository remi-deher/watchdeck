<template>
  <div class="settings-rows">
    <SettingsSection
      title="Jeton API"
      subtitle="Accès à l'API Watchdeck (création de demandes, lecture des utilisateurs…), à passer en en-tête Authorization: Bearer …"
      :status="tokenActive || apiToken ? 'active' : 'inactive'"
    >
      <p class="token-warning">Le jeton donne un accès complet à l'API. Traitez-le comme un mot de passe : ne le partagez pas et ne le placez pas dans un dépôt.</p>
      <SettingsRow label="État" :description="stateDescription" block>
        <div class="token-line">
          <code class="secret-box">{{ apiToken || (tokenActive ? 'Actif (valeur masquée)' : 'Aucun jeton généré') }}</code>
          <UiButton v-if="apiToken" @click="copyToken"><Check v-if="copied"/><Copy v-else/>{{ copied ? 'Copié' : 'Copier' }}</UiButton>
          <UiButton :variant="tokenActive ? 'secondary' : 'primary'" :loading="tokenMutation.isPending.value" @click="generateToken"><KeyRound/>{{ tokenActive ? 'Régénérer' : 'Générer' }}</UiButton>
          <UiButton v-if="tokenActive || apiToken" variant="danger" @click="deleteToken"><Trash2/>Révoquer</UiButton>
        </div>
        <p v-if="apiToken" class="hint token-once">Copiez-le maintenant : il ne sera plus jamais affiché.</p>
        <UiFeedback v-if="error" type="error" :message="error" />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Exemple d'appel" subtitle="Remplacez le jeton par celui que vous venez de générer.">
      <SettingsRow label="Commande" block>
        <pre class="token-example"><code>{{ example }}</code></pre>
        <UiButton size="sm" @click="copyExample"><Check v-if="exampleCopied"/><Copy v-else/>{{ exampleCopied ? 'Copié' : 'Copier la commande' }}</UiButton>
      </SettingsRow>
    </SettingsSection>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Check, Copy, KeyRound, Trash2 } from '@lucide/vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { api } from '@/api';
import { useConfirm } from '@/composables/useConfirm';
import { humanizeError } from '@/utils/apiError';
import { form } from '@/settingsForm';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';

const queryClient = useQueryClient();
const apiToken = ref('');
const error = ref('');
const copied = ref(false);
const exampleCopied = ref(false);
const tokenQuery = useQuery({ queryKey: ['settings', 'api-token'], queryFn: () => api<any>('/api/settings/token').catch(() => ({})) });
const tokenActive = computed(() => Boolean(tokenQuery.data.value?.active));
const scopes = computed<string[]>(() => tokenQuery.data.value?.scopes || []);
const stateDescription = computed(() => {
  if (!tokenActive.value && !apiToken.value) return 'Aucun accès externe à l’API n’est ouvert.';
  const full = !scopes.value.length || scopes.value.includes('*');
  return full ? 'Périmètre : accès complet. La valeur n’est affichée qu’à la génération.' : `Périmètre : ${scopes.value.join(', ')}. La valeur n’est affichée qu’à la génération.`;
});
const tokenMutation = useMutation({
  mutationFn: ({ method, body }: { method: 'POST' | 'DELETE'; body?: any }) => api<any>('/api/settings/token', { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
  retry: 0,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'api-token'] }),
  gcTime: 0,
});

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

async function generateToken(): Promise<void> {
  error.value = '';
  // Régénérer coupe l'ancien jeton sur-le-champ : on le dit avant, pas après.
  if (tokenActive.value && !await askConfirm({
    title: 'Régénérer le jeton ?',
    message: 'L’ancien jeton cesse de fonctionner immédiatement : les scripts qui l’utilisent recevront une erreur d’authentification.',
    confirmLabel: 'Régénérer',
    danger: true,
  })) return;
  try {
    const data = await tokenMutation.mutateAsync({ method: 'POST', body: { scopes: ['*'] } });
    apiToken.value = data.api_token;
  } catch (e) {
    error.value = humanizeError(e);
  }
  tokenMutation.reset();
}
async function deleteToken(): Promise<void> {
  error.value = '';
  if (!await askConfirm({
    title: 'Révoquer le jeton ?',
    message: 'Les scripts qui l’utilisent perdront leur accès à l’API. Vous pourrez en générer un nouveau.',
    confirmLabel: 'Révoquer',
    danger: true,
  })) return;
  try {
    await tokenMutation.mutateAsync({ method: 'DELETE' });
    apiToken.value = '';
  } catch (e) {
    error.value = humanizeError(e);
  }
}

const origin = computed(() => String(form.public_base_url || '').trim().replace(/\/+$/, '') || window.location.origin);
const example = computed(() => `curl -H "Authorization: Bearer ${apiToken.value || '<jeton>'}" ${origin.value}/api/requests`);

async function copyText(text: string, flag: { value: boolean }): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    flag.value = true;
    setTimeout(() => { flag.value = false; }, 1500);
  } catch {
    // Presse-papiers refusé : le texte reste sélectionnable à l'écran.
  }
}
const copyToken = () => copyText(apiToken.value, copied);
const copyExample = () => copyText(example.value, exampleCopied);
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.settings-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.token-warning {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--inset-radius);
  background: color-mix(in srgb, var(--amber) 9%, transparent);
  color: var(--amber-text);
  font-size: var(--fs-sm);
}
.token-once { margin: var(--space-2) 0 0; }
.token-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.token-line .secret-box {
  flex: 1 1 320px;
  min-width: 0;
  margin: 0;
}
.token-example {
  max-width: 100%;
  margin: 0 0 var(--space-2);
  padding: var(--space-3);
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--inset-radius);
  background: var(--surface-2);
  font-size: var(--fs-xs);
}
@include bp.until(phablet) {
  .token-line > :deep(.ui-button) { flex: 1 1 auto; }
}
</style>
