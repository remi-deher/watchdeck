<template>
  <div class="settings-rows">
    <SettingsItemList title="Canaux" subtitle="Où partent les notifications. Ouvrez un canal pour le configurer ; les événements se choisissent dans Règles.">
      <SettingsItem
        title="Email"
        :subtitle="form.smtp_from ? `Depuis ${form.smtp_from}` : 'Notifications par email (demandes, disponibilité, échecs)'"
        :icon="Mail"
        :status="form.email_enabled ? 'active' : 'inactive'"
        :status-text="form.email_enabled ? 'Activé' : 'Désactivé'"
        keywords="smtp expéditeur administrateur import bloqué"
        saveable
      >
        <template #actions>
          <UiButton size="sm" :disabled="!form.email_enabled" @click="testSmtp"><PlugZap/>Tester</UiButton>
        </template>
        <UiCheckboxField v-model="form.email_enabled" label="Activer les emails" />
        <label>Expéditeur<input v-model="form.smtp_from" type="email"><small>Adresse « De : » utilisée pour tous les emails envoyés par Watchdeck.</small></label>
        <label>Email administrateur<input v-model="form.admin_notification_email"><small>Destinataire des alertes techniques (imports bloqués, échecs), distinct des notifications envoyées aux utilisateurs.</small></label>
        <UiCheckboxField v-model="form.notify_import_blocked" label="Alerter l'administrateur en cas d'import Sonarr bloqué" />
        <small class="check-hint">Distinct d'un échec de transmission. Se déclenche souvent avec les épisodes « TBA » : désactivez si trop fréquent.</small>
        <small class="check-hint">L'adresse publique des liens dans les emails se règle dans <RouterLink to="/settings/security">Sécurité &amp; API</RouterLink>.</small>
      </SettingsItem>

      <SettingsItem
        v-for="channel in channels"
        :key="channel.key"
        :title="channel.label"
        :subtitle="channel.subtitle"
        :icon="channel.icon"
        :status="form[`${channel.key}_enabled`] ? 'active' : 'inactive'"
        :status-text="form[`${channel.key}_enabled`] ? 'Activé' : 'Désactivé'"
        :keywords="channel.keywords"
        saveable
      >
        <template #actions>
          <UiButton size="sm" :disabled="!form[`${channel.key}_enabled`]" @click="testSaved(`/api/test/${channel.key}`)"><PlugZap/>Tester</UiButton>
        </template>
        <UiCheckboxField v-model="form[`${channel.key}_enabled`]" :label="`Activer ${channel.label}`" />
        <template v-if="channel.key==='discord'">
          <label>Webhook<input v-model="form.discord_webhook_url" type="password" placeholder="Laisser vide pour conserver"><small>Sur le serveur Discord : Paramètres du salon → Intégrations → Webhooks → Nouveau webhook → Copier l'URL.</small></label>
        </template>
        <template v-else-if="channel.key==='telegram'">
          <label>Token bot<input v-model="form.telegram_bot_token" type="password"><small>Créez un bot avec @BotFather sur Telegram, qui vous donne ce token.</small></label>
          <label>Chat ID<input v-model="form.telegram_chat_id"><small>Identifiant numérique du salon ou canal à notifier : envoyez un message au bot puis récupérez-le avec @userinfobot ou l'API Telegram.</small></label>
        </template>
        <template v-else-if="channel.key==='ntfy'">
          <label>URL<input v-model="form.ntfy_url"><small>Serveur ntfy, ex. https://ntfy.sh (public) ou l'adresse de votre instance auto-hébergée.</small></label>
          <label>Topic<input v-model="form.ntfy_topic"><small>Nom du canal ntfy auquel s'abonner dans l'application pour recevoir ces notifications.</small></label>
          <label>Token<input v-model="form.ntfy_token" type="password"><small>Uniquement si le topic est protégé par un token d'accès ntfy.</small></label>
        </template>
        <template v-else>
          <label>URL<input v-model="form.gotify_url"><small>Adresse de votre serveur Gotify.</small></label>
          <label>Token<input v-model="form.gotify_token" type="password"><small>Token d'application, créé dans Gotify sous Apps → Create Application.</small></label>
        </template>
      </SettingsItem>
    </SettingsItemList>

    <EmailProvidersList/>
  </div>
</template>
<script setup lang="ts">
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { RouterLink } from 'vue-router';
import { Bell, Mail, Megaphone, MessageSquare, PlugZap, Send } from '@lucide/vue';
import { api } from '@/api';
import { form, success, fail, testSaved, save } from '@/settingsForm';
import SettingsItem from './SettingsItem.vue';
import SettingsItemList from './SettingsItemList.vue';
import EmailProvidersList from './EmailProvidersList.vue';

const channels = [
  { key: 'discord', label: 'Discord', icon: MessageSquare, subtitle: 'Un salon Discord, via un webhook', keywords: 'webhook salon' },
  { key: 'telegram', label: 'Telegram', icon: Send, subtitle: 'Un bot Telegram vers un salon ou canal', keywords: 'bot token chat id' },
  { key: 'ntfy', label: 'ntfy', icon: Bell, subtitle: 'Notifications push via ntfy.sh ou votre instance', keywords: 'push url topic token' },
  { key: 'gotify', label: 'Gotify', icon: Megaphone, subtitle: 'Notifications push via votre serveur Gotify', keywords: 'push url token' },
];

async function testSmtp(): Promise<void> {
  await save();
  const recipient = prompt('Adresse de test', form.admin_notification_email || form.smtp_from);
  if (!recipient) return;
  try {
    const data = await api('/api/test/smtp', { method: 'POST', body: JSON.stringify({ recipient }) });
    success(data.message || 'Email envoyé.');
  } catch (e) { fail(e); }
}
</script>
