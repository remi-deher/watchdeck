<template>
  <div class="settings-rows">
    <SettingsSection title="Événements et canaux" subtitle="Pour chaque type d'événement, les canaux qui envoient une notification. Un canal doit d'abord être activé dans Canaux pour que sa case ait un effet.">
      <SettingsRow label="Matrice des envois" block>
        <dl class="event-legend">
          <div v-for="event in notificationEvents" :key="event.key">
            <dt>{{ event.label }}</dt>
            <dd>{{ event.description }}</dd>
          </div>
        </dl>
        <div class="event-matrix">
          <div></div><strong>Email</strong><strong>Discord</strong><strong>Telegram</strong><strong>ntfy</strong><strong>Gotify</strong>
          <template v-for="event in notificationEvents" :key="event.key">
            <strong :title="event.description">{{ event.label }}</strong>
            <!-- Une case au croisement d'une ligne et d'une colonne n'a de sens que
                 reliee aux deux : le libelle enveloppant etait vide, et un lecteur
                 d'ecran n'annoncait qu'« case à cocher ». -->
            <label class="check"><UiCheckbox v-model="form[`email_on_${event.key}`]" :aria-label="`${event.label} — Email`" /></label>
            <label v-for="channel in channels" :key="channel.key" class="check"><UiCheckbox v-model="form[`${channel.key}_send_${event.key}`]" :aria-label="`${event.label} — ${channel.label}`" /></label>
          </template>
        </div>
      </SettingsRow>
      <SettingsRow label="Alerte de panne d'indexeur" description="Prévient l'email administrateur, et Discord s'il est actif, quand un indexeur Prowlarr tombe en panne ou fonctionne de nouveau.">
        <ToggleSwitch v-model="form.indexer_alerts_enabled" title="Alerte de panne d'indexeur" />
      </SettingsRow>
      <SettingsRow label="Email lors d'une amélioration VO vers VF" description="Notifie séparément quand un média déjà disponible en VO reçoit sa VF, en plus de la notification de disponibilité initiale.">
        <ToggleSwitch v-model="form.email_on_vf_available" title="Email lors d'une amélioration VO vers VF" />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Langue des notifications" subtitle="Distinguer la VO et la VF, et le rythme des notifications de séries.">
      <SettingsRow label="Distinguer VO/VF pour les films" description="Activé : un film disponible en VO puis en VF déclenche deux notifications. Désactivé : une seule notification « disponible », sans distinction de langue.">
        <ToggleSwitch v-model="form.movie_notify_language" title="Distinguer VO/VF pour les films" />
      </SettingsRow>
      <SettingsRow label="Distinguer VO/VF pour les séries" description="Activé : les jalons VO/VF suivent la granularité ci-dessous. Désactivé : suivi de disponibilité classique, sans notification liée à la langue.">
        <ToggleSwitch v-model="form.series_notify_language" title="Distinguer VO/VF pour les séries" />
      </SettingsRow>
      <SettingsRow label="Granularité des séries" description="Une seule fois à la fin, à chaque début et fin de saison, ou à chaque épisode disponible.">
        <UiSelect v-model="form.series_notify_granularity" aria-label="Granularité des séries" :options="[{ value: 'minimal', label: 'Série complète' }, { value: 'jalons', label: 'Début et fin de saison' }, { value: 'tout', label: 'Chaque épisode' }]" />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Rétention et digest" subtitle="Conservation des journaux de notifications, et récapitulatif quotidien par email.">
      <SettingsRow label="Journaux de notifications" description="En jours.">
        <RetentionDaysInput v-model="form.notification_log_retention_days" :default-days="30"/>
      </SettingsRow>
      <SettingsRow label="Digest quotidien" description="Un récapitulatif par jour, à l'heure choisie, pour les utilisateurs qui l'ont activé dans leurs préférences, au lieu de chaque notification.">
        <ToggleSwitch v-model="form.digest_enabled" title="Digest quotidien" />
      </SettingsRow>
      <SettingsRow label="Heure du digest" :disabled="!form.digest_enabled">
        <UiTimeField v-model:hour="form.digest_hour" v-model:minute="form.digest_minute" aria-label="Heure du digest"/>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      title="Nouveautés de la semaine"
      subtitle="Une lettre hebdomadaire avec les films et séries ajoutés à Plex, leur affiche et leur langue, pour les utilisateurs qui l'ont activée dans leur profil."
      :status="form.newsletter_enabled ? 'active' : 'inactive'"
    >
      <template #actions>
        <UiButton href="/api/newsletter/preview" target="_blank" rel="noopener"><Eye />Aperçu</UiButton>
        <UiButton :loading="sendingTest" @click="sendTest"><MailCheck />M'envoyer un test</UiButton>
      </template>
      <SettingsRow label="Envoi hebdomadaire">
        <ToggleSwitch v-model="form.newsletter_enabled" title="Envoi hebdomadaire" />
      </SettingsRow>
      <SettingsRow label="Jour et heure" description="Heure locale. La lettre couvre les ajouts depuis le précédent envoi." :disabled="!form.newsletter_enabled">
        <div class="newsletter-when">
          <UiSelect v-model="form.newsletter_weekday" aria-label="Jour d'envoi" :disabled="!form.newsletter_enabled" :options="weekdays" />
          <UiSelect v-model="form.newsletter_hour" aria-label="Heure d'envoi" :disabled="!form.newsletter_enabled" :options="hours" />
        </div>
      </SettingsRow>
      <SettingsRow label="Publier aussi sur Discord" description="Sur le webhook Discord global (Canaux), en plus des emails." :disabled="!form.newsletter_enabled">
        <ToggleSwitch v-model="form.newsletter_discord" :disabled="!form.newsletter_enabled" title="Publier aussi sur Discord" />
      </SettingsRow>
    </SettingsSection>
  </div>
</template>
<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import UiCheckbox from '@/components/ui/UiCheckbox.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import { Bell, Eye, MailCheck, Megaphone, MessageSquare, Send } from '@lucide/vue';
import { ref } from 'vue';
import { api } from '@/api';
import UiButton from '@/components/ui/UiButton.vue';
import { form, success, fail } from '@/settingsForm';
import SettingsSection from './SettingsSection.vue';
import SettingsRow from './SettingsRow.vue';
import UiTimeField from '@/components/ui/UiTimeField.vue';
import RetentionDaysInput from './RetentionDaysInput.vue';

const weekdays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((label, value) => ({ value, label }));
const hours = Array.from({ length: 24 }, (_, value) => ({ value, label: `${String(value).padStart(2, '0')} h` }));

/* Envoi de test a l'adresse de l'administrateur, avec les ajouts de la periode en cours. */
const sendingTest = ref(false);
async function sendTest(): Promise<void> {
  sendingTest.value = true;
  try {
    const result = await api<any>('/api/newsletter/test', { method: 'POST', body: '{}' });
    success(`Lettre de test envoyée à ${result.recipient} (${result.items} ajout(s)).`);
  } catch (e) { fail(e); } finally { sendingTest.value = false; }
}

const channels = [
  { key: 'discord', label: 'Discord', icon: MessageSquare },
  { key: 'telegram', label: 'Telegram', icon: Send },
  { key: 'ntfy', label: 'ntfy', icon: Bell },
  { key: 'gotify', label: 'Gotify', icon: Megaphone },
];
// Descriptions alignees sur app/services/notification_catalog.py (source de verite
// utilisee aussi par l'editeur de modeles d'email) pour ne pas raconter une autre
// histoire que celle des emails reellement envoyes.
const notificationEvents = [
  { key: 'request', label: 'Nouvelle demande', description: 'Confirmation envoyée quand une demande est enregistrée.' },
  { key: 'available', label: 'Disponibilité', description: "Un média (ou un épisode/une saison suivie) est disponible sur Plex — VO, VF, amélioration VO→VF, ou jalon de série, selon le contexte." },
  { key: 'failure', label: 'Échec', description: "La demande n'a pas pu être transmise à Sonarr ou Radarr." },
];
</script>
<style scoped lang="scss">
.event-matrix { width: 100%; }
.newsletter-when { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.event-legend {
  display: grid;
  gap: var(--space-1) var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin: 0 0 var(--space-2);
}
.event-legend > div { display: flex; flex-direction: column; gap: 2px; }
.event-legend dt { font-weight: 600; font-size: var(--fs-sm); }
.event-legend dd { margin: 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.4; }
</style>
