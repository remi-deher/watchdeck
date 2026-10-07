<template>
  <div class="settings-rows">
    <SettingsSection
      title="Jeton API"
      subtitle="Accès complet à l'API Watchdeck (création de demandes, lecture des utilisateurs…), à passer en en-tête Authorization: Bearer …"
      :status="tokenActive || apiToken ? 'active' : 'inactive'"
    >
      <SettingsRow label="Jeton" description="Affiché une seule fois, à la génération : régénérez-le si vous le perdez." block>
        <div class="token-line">
          <code class="secret-box">{{ apiToken || (tokenActive ? 'Actif (valeur masquée)' : 'Aucun jeton généré') }}</code>
          <UiButton @click="generateToken"><KeyRound/>Générer</UiButton>
          <UiButton variant="danger" @click="deleteToken"><Trash2/>Révoquer</UiButton>
        </div>
      </SettingsRow>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { KeyRound, Trash2 } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import { api } from '@/api';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';

const queryClient = useQueryClient();
const apiToken = ref('');
const tokenQuery = useQuery({ queryKey: ['settings', 'api-token'], queryFn: () => api<any>('/api/settings/token').catch(() => ({})) });
const tokenActive = computed(() => Boolean(tokenQuery.data.value?.active));
const tokenMutation = useMutation({
  mutationFn: ({ method, body }: { method: 'POST' | 'DELETE'; body?: any }) => api<any>('/api/settings/token', { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
  retry: 0,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'api-token'] }),
  gcTime: 0,
});
async function generateToken(): Promise<void> {
  const data = await tokenMutation.mutateAsync({ method: 'POST', body: { scopes: ['*'] } });
  apiToken.value = data.api_token;
  tokenMutation.reset();
}
async function deleteToken(): Promise<void> {
  await tokenMutation.mutateAsync({ method: 'DELETE' });
  apiToken.value = '';
}
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.settings-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
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
@include bp.until(phablet) {
  .token-line > :deep(.ui-button) { flex: 1 1 auto; }
}
</style>
