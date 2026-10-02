<template>
  <div class="settings-rows">
    <SettingsSection
      title="Webhooks entrants"
      subtitle="Plex, Sonarr et Radarr préviennent Watchdeck en temps réel au lieu d'attendre le prochain passage."
      :status="form.webhook_secret ? 'active' : 'inactive'"
    >
      <template v-if="!form.webhook_secret">
        <SettingsRow label="Secret webhook" description="Pas encore configuré : l'authentification des webhooks entrants est désactivée.">
          <UiButton variant="primary" @click="generateWebhookSecret">Générer un secret</UiButton>
        </SettingsRow>
      </template>
      <template v-else>
        <SettingsRow v-for="svc in ['plex', 'radarr', 'sonarr']" :key="svc" :label="serviceLabel(svc)" block>
          <div class="webhook-line">
            <input type="text" readonly :aria-label="`URL webhook ${serviceLabel(svc)}`" :value="`${baseUrl}/webhook/${svc}?secret=${form.webhook_secret}`">
            <UiButton icon-only @click="copyWebhook(svc)" title="Copier" aria-label="Copier"><Copy/></UiButton>
            <UiButton v-if="svc === 'sonarr' || svc === 'radarr'" @click="configureWebhook(svc)" :disabled="configuringWebhook === svc">
              <RefreshCw v-if="configuringWebhook === svc" class="spin" />
              <span v-else>Configurer automatiquement</span>
            </UiButton>
            <UiButton @click="testWebhook(svc)" :disabled="testingWebhook === svc">
              <RefreshCw v-if="testingWebhook === svc" class="spin" />
              <span v-else>Tester</span>
            </UiButton>
          </div>
          <p v-if="configureStatus[svc]" class="webhook-result" :class="configureStatus[svc].success ? 'ok' : 'ko'">
            <template v-if="configureStatus[svc].success"><Check /> {{ configureStatus[svc].message }}</template>
            <template v-else>Erreur : {{ configureStatus[svc].message }}</template>
          </p>
          <p v-if="webhookStatus[svc]" class="webhook-result" :class="webhookStatus[svc].success ? 'ok' : 'ko'">
            <template v-if="webhookStatus[svc].success"><Check /> {{ webhookStatus[svc].message || 'Succès' }}</template>
            <template v-else>Erreur : {{ webhookStatus[svc].message }}</template>
          </p>
        </SettingsRow>
        <SettingsRow label="Secret webhook" description="Le régénérer invalide les adresses ci-dessus : il faudra les reconfigurer dans chaque service.">
          <UiButton @click="generateWebhookSecret">Régénérer le secret</UiButton>
        </SettingsRow>
      </template>
    </SettingsSection>

    <SettingsSection
      title="Reverse-proxy"
      subtitle="Adresse IP réelle des visiteurs derrière Nginx Proxy Manager, Traefik ou Caddy."
      :status="form.trusted_proxies ? 'active' : 'inactive'"
    >
      <SettingsRow
        label="Proxies de confiance"
        description="IP ou réseaux (CIDR) séparés par des virgules. Seules ces adresses peuvent indiquer l'IP du visiteur (X-Forwarded-For) ; sans proxy déclaré, l'anti-bruteforce voit toutes les tentatives venir du proxy. N'indiquez que l'adresse de votre proxy."
        label-for="trusted-proxies"
      >
        <input id="trusted-proxies" v-model="form.trusted_proxies" placeholder="172.16.0.0/12, 192.168.1.10" autocomplete="off" spellcheck="false">
      </SettingsRow>
      <SettingsRow label="IP détectée" :description="clientIpDescription">
        <UiButton @click="clientIpQuery.refetch()" :disabled="clientIpQuery.isFetching.value"><RefreshCw/>Vérifier</UiButton>
      </SettingsRow>
      <p v-if="clientIp?.forwarded_for && clientIp.client_ip === clientIp.connection_ip" class="hint webhook-hint">
        Votre proxy transmet <code>{{ clientIp.forwarded_for }}</code> : ajoutez <code>{{ clientIp.connection_ip }}</code> aux proxies de confiance puis enregistrez.
      </p>
    </SettingsSection>

    <SettingsSection
      title="Jeton API"
      subtitle="Accès complet à l'API Watchdeck (création de demandes, lecture des utilisateurs…), à passer en en-tête Authorization: Bearer …"
      :status="tokenActive || apiToken ? 'active' : 'inactive'"
    >
      <SettingsRow label="Jeton" description="Affiché une seule fois, à la génération : régénérez-le si vous le perdez." block>
        <div class="webhook-line">
          <code class="secret-box">{{ apiToken || (tokenActive ? 'Actif (valeur masquée)' : 'Aucun jeton généré') }}</code>
          <UiButton @click="generateToken"><KeyRound/>Générer</UiButton>
          <UiButton variant="danger" @click="deleteToken"><Trash2/>Révoquer</UiButton>
        </div>
      </SettingsRow>
    </SettingsSection>
  </div>
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>
<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue';
import { computed, reactive, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Check, Copy, KeyRound, RefreshCw, Trash2 } from '@lucide/vue';
import { api } from '@/api';
import { form, success, fail } from '@/settingsForm';
import SettingsSection from './SettingsSection.vue';
import SettingsRow from './SettingsRow.vue';
import ConfirmModal from '../ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';

const baseUrl = window.location.origin;
const webhookStatus = reactive<Record<string, { success: boolean; message: string } | null>>({ plex: null, radarr: null, sonarr: null });
const configureStatus = reactive<Record<string, { success: boolean; message: string } | null>>({ plex: null, radarr: null, sonarr: null });
const testingWebhook = ref<string | null>(null);
const configuringWebhook = ref<string | null>(null);
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const queryClient = useQueryClient();

const clientIpQuery = useQuery({
  queryKey: ['settings', 'client-ip'],
  queryFn: () => api<{ connection_ip: string | null; client_ip: string; forwarded_for: string | null }>('/api/settings/client-ip').catch(() => null),
});
const clientIp = computed(() => clientIpQuery.data.value);
const clientIpDescription = computed(() => {
  const ip = clientIp.value;
  if (!ip) return 'Adresse vue par Watchdeck pour ce navigateur.';
  return `Connexion depuis ${ip.connection_ip || '?'}, IP retenue pour ce navigateur : ${ip.client_ip}.`;
});
function serviceLabel(svc: string): string { return svc.charAt(0).toUpperCase() + svc.slice(1); }

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

const webhookMutation = useMutation({
  mutationFn: ({ path, body }: { path: string; body?: any }) => api<any>(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }),
  retry: 0,
});

async function generateWebhookSecret(): Promise<void> {
  if (form.webhook_secret && !await askConfirm({ title: 'Régénérer le secret webhook ?', message: "L’ancien secret sera invalidé et les webhooks actuellement configurés ne fonctionneront plus.", confirmLabel: 'Régénérer', danger: true })) return;
  try {
    const res = await webhookMutation.mutateAsync({ path: '/api/settings/webhook-secret' });
    form.webhook_secret = res.webhook_secret;
    success('Secret genere avec succes.');
  } catch (e) { fail(e); }
}
async function copyWebhook(svc: string): Promise<void> {
  const url = `${baseUrl}/webhook/${svc}?secret=${form.webhook_secret}`;
  await navigator.clipboard.writeText(url);
  success('URL copiee dans le presse-papier.');
}
async function configureWebhook(svc: string): Promise<void> {
  configuringWebhook.value = svc;
  configureStatus[svc] = null;
  try {
    const url = `${baseUrl}/webhook/${svc}?secret=${form.webhook_secret}`;
    const res = await webhookMutation.mutateAsync({ path: `/webhook/configure/${svc}`, body: { webhook_url: url } });
    const result = res.results && res.results[0];
    if (result && result.success) {
      configureStatus[svc] = { success: true, message: `Webhook ${svc.charAt(0).toUpperCase() + svc.slice(1)} correctement configuré : ${result.message}` };
      success(`Webhook ${svc} correctement configuré.`);
    } else {
      configureStatus[svc] = { success: false, message: result ? result.message : 'Aucun résultat.' };
    }
  } catch (e: any) {
    configureStatus[svc] = { success: false, message: e.message };
  } finally {
    configuringWebhook.value = null;
  }
}
async function testWebhook(svc: string): Promise<void> {
  testingWebhook.value = svc;
  try {
    const res = await webhookMutation.mutateAsync({ path: `/webhook/check-live/${svc}` });
    const result = res.results && res.results[0];
    webhookStatus[svc] = result ? { success: result.success, message: result.message } : { success: true, message: 'Test effectué (pas de résultat précis)' };
  } catch (e: any) {
    webhookStatus[svc] = { success: false, message: e.message };
  } finally {
    testingWebhook.value = null;
  }
}
</script>
<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.webhook-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.webhook-line input {
  flex: 1 1 320px;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
}
.webhook-line .secret-box {
  flex: 1 1 320px;
  min-width: 0;
  margin: 0;
}
.webhook-result {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: var(--fs-sm);
}
.webhook-result svg { width: 14px; height: 14px; }
.webhook-result.ok { color: var(--green-text); }
.webhook-result.ko { color: var(--red-text); }
.webhook-hint { margin: 8px 0 0; }
@include bp.until(phablet) {
  .webhook-line > :deep(.ui-button) { flex: 1 1 auto; }
}
</style>
