<template>
  <div class="settings-rows">
    <SettingsSection
      v-if="!form.webhook_secret"
      title="Webhooks entrants"
      subtitle="Plex, Sonarr et Radarr préviennent Watchdeck en temps réel au lieu d'attendre le prochain passage."
      status="inactive"
    >
      <SettingsRow label="Secret webhook" description="Pas encore configuré : l'authentification des webhooks entrants est désactivée.">
        <UiButton variant="primary" @click="generateWebhookSecret">Générer un secret</UiButton>
      </SettingsRow>
    </SettingsSection>

    <template v-else>
      <SettingsItemList title="Webhooks entrants" subtitle="Plex, Sonarr et Radarr préviennent Watchdeck en temps réel au lieu d'attendre le prochain passage.">
        <!-- Une ligne par service : sa dernière réception, et ce qu'on peut faire. Pour Sonarr et
             Radarr, « Configurer automatiquement » crée ou corrige le connecteur dans chaque
             instance active ; Plex n'a pas d'API pour cela : on copie l'adresse. -->
        <div v-for="svc in SERVICES" :key="svc.key" class="webhook-item" role="listitem">
          <div class="webhook-item__head">
            <div class="webhook-item__text">
              <strong>{{ svc.label }}</strong>
              <small>{{ receivedLabel(svc.key) }}</small>
            </div>
            <span class="webhook-pill" :class="`is-${received(svc.key) ? 'ok' : 'off'}`">{{ received(svc.key) ? 'Reçoit' : 'Rien reçu' }}</span>
          </div>
          <div class="webhook-line">
            <input type="text" readonly :aria-label="`URL webhook ${svc.label}`" :value="urlFor(svc.key)">
            <UiButton icon-only title="Copier l'adresse" aria-label="Copier l'adresse" @click="copyWebhook(svc.key)"><Copy/></UiButton>
            <UiButton v-if="svc.auto" variant="primary" :loading="configuringWebhook === svc.key" @click="configureWebhook(svc.key)"><template #icon><Wand2/></template>Configurer automatiquement</UiButton>
            <UiButton :loading="testingWebhook === svc.key" @click="testWebhook(svc.key)"><template #icon><PlugZap/></template>Tester</UiButton>
          </div>
          <p v-if="!svc.auto" class="webhook-hint">Collez cette adresse dans Plex → Paramètres → Webhooks : Plex ne permet pas de la configurer à distance.</p>
          <!-- Un résultat par instance : avec deux Radarr, un seul message cachait l'autre. -->
          <ul v-for="(results, kind) in { configure: configureResults[svc.key], test: testResults[svc.key] }" v-show="results?.length" :key="kind" class="webhook-results" :aria-label="kind === 'configure' ? 'Résultat de la configuration' : 'Résultat du test'">
            <li v-for="(result, index) in results || []" :key="index" :class="result.success ? 'ok' : 'ko'">
              <Check v-if="result.success" aria-hidden="true"/><X v-else aria-hidden="true"/>
              <span><strong v-if="result.instance">{{ result.instance }} : </strong>{{ result.message }}</span>
            </li>
          </ul>
        </div>
      </SettingsItemList>

      <SettingsSection title="Secret" subtitle="Il authentifie chaque appel entrant. Le régénérer invalide les adresses ci-dessus : il faudra les reconfigurer dans chaque service.">
        <SettingsRow label="Secret webhook">
          <UiButton @click="generateWebhookSecret">Régénérer le secret</UiButton>
        </SettingsRow>
      </SettingsSection>
    </template>
  </div>
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>
<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue';
import { reactive, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Check, Copy, PlugZap, Wand2, X } from '@lucide/vue';
import { form, success, fail } from '@/settingsForm';
import { formatRelativeDate } from '@/utils/format';
import SettingsSection from './SettingsSection.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsItemList from './SettingsItemList.vue';
import ConfirmModal from '../ConfirmModal.vue';
import { api } from '@/api';
import { useConfirm } from '@/composables/useConfirm';

interface WebhookResult { instance?: string | null; success: boolean; message: string }
type Service = 'plex' | 'sonarr' | 'radarr';

const SERVICES: Array<{ key: Service; label: string; auto: boolean }> = [
  { key: 'sonarr', label: 'Sonarr', auto: true },
  { key: 'radarr', label: 'Radarr', auto: true },
  { key: 'plex', label: 'Plex', auto: false },
];

const baseUrl = window.location.origin;
const configureResults = reactive<Record<Service, WebhookResult[] | null>>({ plex: null, radarr: null, sonarr: null });
const testResults = reactive<Record<Service, WebhookResult[] | null>>({ plex: null, radarr: null, sonarr: null });
const testingWebhook = ref<Service | null>(null);
const configuringWebhook = ref<Service | null>(null);
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const queryClient = useQueryClient();

/* Dernier appel reçu par service : ce qui dit si le webhook fonctionne vraiment. */
const statusQuery = useQuery({
  queryKey: ['settings', 'webhook-status'],
  queryFn: () => api<Record<Service, { received: boolean; at: string | null }>>('/webhook/status'),
  staleTime: 30_000,
});
const received = (svc: Service) => Boolean(statusQuery.data.value?.[svc]?.received);
function receivedLabel(svc: Service): string {
  const at = statusQuery.data.value?.[svc]?.at;
  return at ? `Dernier appel reçu ${formatRelativeDate(at).toLowerCase()}` : 'Aucun appel reçu depuis le démarrage';
}

const urlFor = (svc: Service) => `${baseUrl}/webhook/${svc}?secret=${form.webhook_secret}`;

const webhookMutation = useMutation({
  mutationFn: ({ path, body }: { path: string; body?: any }) => api<any>(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }),
  retry: 0,
});

async function generateWebhookSecret(): Promise<void> {
  if (form.webhook_secret && !await askConfirm({ title: 'Régénérer le secret webhook ?', message: "L’ancien secret sera invalidé et les webhooks actuellement configurés ne fonctionneront plus.", confirmLabel: 'Régénérer', danger: true })) return;
  try {
    const res = await webhookMutation.mutateAsync({ path: '/api/settings/webhook-secret' });
    form.webhook_secret = res.webhook_secret;
    success('Secret généré.');
  } catch (e) { fail(e); }
}
async function copyWebhook(svc: Service): Promise<void> {
  try {
    await navigator.clipboard.writeText(urlFor(svc));
    success('Adresse copiée.');
  } catch {
    fail(new Error('Copie refusée par le navigateur : sélectionnez l’adresse à la main.'));
  }
}

function resultsOf(res: any): WebhookResult[] {
  const rows = Array.isArray(res?.results) ? res.results : [];
  return rows.length ? rows : [{ success: false, message: 'Aucun résultat.' }];
}

async function configureWebhook(svc: Service): Promise<void> {
  configuringWebhook.value = svc;
  configureResults[svc] = null;
  try {
    const res = await webhookMutation.mutateAsync({ path: `/webhook/configure/${svc}`, body: { webhook_url: urlFor(svc) } });
    configureResults[svc] = resultsOf(res);
    const failed = configureResults[svc]!.filter((result) => !result.success).length;
    if (!failed) success(`Webhook ${svc === 'sonarr' ? 'Sonarr' : 'Radarr'} configuré.`);
  } catch (e: any) {
    configureResults[svc] = [{ success: false, message: e.message }];
  } finally {
    configuringWebhook.value = null;
  }
}
async function testWebhook(svc: Service): Promise<void> {
  testingWebhook.value = svc;
  try {
    const res = await webhookMutation.mutateAsync({ path: `/webhook/check-live/${svc}` });
    testResults[svc] = resultsOf(res);
  } catch (e: any) {
    testResults[svc] = [{ success: false, message: e.message }];
  } finally {
    testingWebhook.value = null;
    void queryClient.invalidateQueries({ queryKey: ['settings', 'webhook-status'] });
  }
}
</script>
<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.webhook-item {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
}
.webhook-item:last-child { border-bottom: 0; }
.webhook-item__head { display: flex; align-items: center; gap: var(--space-3); }
.webhook-item__text { display: grid; flex: 1; min-width: 0; }
.webhook-item__text small { color: var(--muted); font-size: var(--fs-sm); }
.webhook-pill { padding: 2px 10px; border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 700; white-space: nowrap; }
.webhook-pill.is-ok { background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green-text); }
.webhook-pill.is-off { background: var(--surface-2); color: var(--muted); }
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
.webhook-hint { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.webhook-results { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; font-size: var(--fs-sm); }
.webhook-results li { display: flex; gap: 6px; align-items: flex-start; }
.webhook-results svg { flex: none; width: 14px; height: 14px; margin-top: 3px; }
.webhook-results .ok { color: var(--green-text); }
.webhook-results .ko { color: var(--red-text); }
@include bp.until(phablet) {
  .webhook-line > :deep(.ui-button) { flex: 1 1 auto; }
}
</style>
