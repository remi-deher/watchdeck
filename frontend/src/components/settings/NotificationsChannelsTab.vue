<template>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template #section-email>
      <UiCheckboxField v-model="form.email_enabled" label="Activer les emails" />
      <ConfigureField label="Expéditeur" help="Adresse « De : » utilisée pour tous les emails envoyés par Watchdeck." for-id="smtp-from">
        <input id="smtp-from" v-model="form.smtp_from" type="email">
      </ConfigureField>
      <ConfigureField label="Email administrateur" help="Destinataire des alertes techniques (imports bloqués, échecs), distinct des notifications envoyées aux utilisateurs." for-id="admin-email">
        <input id="admin-email" v-model="form.admin_notification_email">
      </ConfigureField>
      <UiCheckboxField v-model="form.notify_import_blocked" label="Alerter l'administrateur en cas d'import Sonarr bloqué" hint="Distinct d'un échec de transmission. Se déclenche souvent avec les épisodes « TBA » : désactivez si trop fréquent." />
      <p class="check-hint">L'adresse publique des liens dans les emails se règle dans <RouterLink to="/settings/security">Sécurité &amp; API</RouterLink>.</p>
      <ConfigureTest label="Envoyer un email de test" :testing="testingKey === 'email'" @test="testSmtp" />
    </template>

    <template v-for="channel in channels" :key="channel.key" #[`section-${channel.key}`]>
      <UiCheckboxField v-model="form[`${channel.key}_enabled`]" :label="`Activer ${channel.label}`" />
      <template v-if="channel.key==='discord'">
        <ConfigureField label="Webhook" help="Sur le serveur Discord : Paramètres du salon → Intégrations → Webhooks → Nouveau webhook → Copier l'URL." for-id="discord-webhook">
          <input id="discord-webhook" v-model="form.discord_webhook_url" type="password" placeholder="Laisser vide pour conserver">
        </ConfigureField>
      </template>
      <template v-else-if="channel.key==='telegram'">
        <ConfigureField label="Token bot" help="Créez un bot avec @BotFather sur Telegram, qui vous donne ce token." for-id="telegram-token">
          <input id="telegram-token" v-model="form.telegram_bot_token" type="password">
        </ConfigureField>
        <ConfigureField label="Chat ID" help="Identifiant numérique du salon ou canal à notifier : envoyez un message au bot puis récupérez-le avec @userinfobot ou l'API Telegram." for-id="telegram-chat">
          <input id="telegram-chat" v-model="form.telegram_chat_id">
        </ConfigureField>
      </template>
      <template v-else-if="channel.key==='ntfy'">
        <ConfigureField label="URL" help="Serveur ntfy, ex. https://ntfy.sh (public) ou l'adresse de votre instance auto-hébergée." for-id="ntfy-url">
          <input id="ntfy-url" v-model="form.ntfy_url">
        </ConfigureField>
        <ConfigureField label="Topic" help="Nom du canal ntfy auquel s'abonner dans l'application pour recevoir ces notifications." for-id="ntfy-topic">
          <input id="ntfy-topic" v-model="form.ntfy_topic">
        </ConfigureField>
        <ConfigureField label="Token" help="Uniquement si le topic est protégé par un token d'accès ntfy." for-id="ntfy-token">
          <input id="ntfy-token" v-model="form.ntfy_token" type="password">
        </ConfigureField>
      </template>
      <template v-else>
        <ConfigureField label="URL" help="Adresse de votre serveur Gotify." for-id="gotify-url">
          <input id="gotify-url" v-model="form.gotify_url">
        </ConfigureField>
        <ConfigureField label="Token" help="Token d'application, créé dans Gotify sous Apps → Create Application." for-id="gotify-token">
          <input id="gotify-token" v-model="form.gotify_token" type="password">
        </ConfigureField>
      </template>
      <ConfigureTest :testing="testingKey === channel.key" label="Envoyer un test" @test="testChannel(channel.key)" />
    </template>

    <template #section-providers><EmailProvidersList/></template>
  </ConfigureTemplate>
</template>
<script setup lang="ts">
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import { RouterLink } from 'vue-router';
import { Bell, Mail, Megaphone, MessageSquare, Send, Server } from '@lucide/vue';
import { computed, ref } from 'vue';
import { api } from '@/api';
import { form, success, fail, testSaved, save } from '@/settingsForm';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import ConfigureTest from '@/components/templates/configure/ConfigureTest.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';
import EmailProvidersList from './EmailProvidersList.vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { channelState, type LastSend } from './channelLastSend';

/* Dernier envoi de chaque canal : la ligne dit si le canal fonctionne vraiment. */
const queryClient = useQueryClient();
const lastQuery = useQuery({
  queryKey: ['settings', 'notification-channels-last'],
  queryFn: () => api<Record<string, LastSend | null>>('/api/notifications/channels/last'),
  staleTime: 30_000,
});
const stateOf = (key: string) => channelState(Boolean(form[`${key}_enabled`]), lastQuery.data.value?.[key]);
const refreshLast = () => queryClient.invalidateQueries({ queryKey: ['settings', 'notification-channels-last'] });
/* Le resultat d'un test passe par une notification : la section n'affiche que « en cours ». */
const testingKey = ref('');
async function testChannel(key: string): Promise<void> {
  testingKey.value = key;
  try {
    await testSaved(`/api/test/${key}`);
  } finally {
    testingKey.value = '';
  }
  void refreshLast();
}

const channels = [
  { key: 'discord', label: 'Discord', icon: MessageSquare, subtitle: 'Un salon Discord, via un webhook', keywords: 'webhook salon' },
  { key: 'telegram', label: 'Telegram', icon: Send, subtitle: 'Un bot Telegram vers un salon ou canal', keywords: 'bot token chat id' },
  { key: 'ntfy', label: 'ntfy', icon: Bell, subtitle: 'Notifications push via ntfy.sh ou votre instance', keywords: 'push url topic token' },
  { key: 'gotify', label: 'Gotify', icon: Megaphone, subtitle: 'Notifications push via votre serveur Gotify', keywords: 'push url token' },
];

async function testSmtp(): Promise<void> {
  testingKey.value = 'email';
  try {
    await save();
    const recipient = prompt('Adresse de test', form.admin_notification_email || form.smtp_from);
    if (!recipient) return;
    try {
      const data = await api('/api/test/smtp', { method: 'POST', body: JSON.stringify({ recipient }) });
      success(data.message || 'Email envoyé.');
    } catch (e) { fail(e); }
  } finally {
    testingKey.value = '';
  }
  void refreshLast();
}

const page = useSettingsPage();
/* Une section par canal : son etat (d'apres le dernier envoi) dit s'il fonctionne vraiment. */
function describe(key: string, base: string): string {
  const state = stateOf(key);
  return [state.text, state.status === 'error' ? state.detail : [base, state.detail].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
}
const sections = computed(() => [
  { key: 'email', title: 'Email', description: describe('email', form.smtp_from ? `Depuis ${form.smtp_from}` : 'Notifications par email (demandes, disponibilité, échecs)'), icon: Mail, keywords: ['smtp', 'expéditeur', 'administrateur', 'import bloqué'] },
  ...channels.map((channel) => ({ key: channel.key, title: channel.label, description: describe(channel.key, channel.subtitle), icon: channel.icon, keywords: channel.keywords.split(' ') })),
  { key: 'providers', title: 'Fournisseurs d\'envoi d\'email', description: 'Plusieurs fournisseurs peuvent être actifs : en cas d\'échec, l\'envoi bascule sur le suivant, dans l\'ordre de la liste.', icon: Server, keywords: ['smtp', 'gmail', 'oauth', 'bascule'] },
]);
</script>
