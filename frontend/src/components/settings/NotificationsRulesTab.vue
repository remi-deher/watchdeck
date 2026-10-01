<template>
  <div class="settings-grid">
    <div class="settings-cards span-two">
      <SettingsCard title="Rétention et digest" subtitle="Durée de conservation des journaux de notifications, et récapitulatif quotidien par email." :icon="Archive" status="active" :collapsible="false">
        <label>Journaux de notifications (jours)<RetentionDaysInput v-model="form.notification_log_retention_days" :default-days="30"/></label>
        <UiCheckboxField v-model="form.digest_enabled" label="Digest actif" />
        <small class="check-hint">Envoie un récapitulatif quotidien par email, à l'heure choisie ci-dessous, aux utilisateurs ayant activé le digest dans leurs préférences — au lieu de recevoir chaque notification individuellement.</small>
        <label>Heure du digest<UiTimeField v-model:hour="form.digest_hour" v-model:minute="form.digest_minute" aria-label="Heure du digest"/></label>
      </SettingsCard>
    </div>

    <section class="panel form-section span-two">
      <h2>Événements et canaux</h2>
      <p class="hint">Choisis, pour chaque type d'événement, quels canaux doivent envoyer une notification. Un canal doit d'abord être activé dans l'onglet Canaux pour que sa case ici ait un effet.</p>
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
      <UiCheckboxField v-model="form.email_on_vf_available" label="Email lors d'une amelioration VO vers VF" />
      <small class="check-hint">Notifie séparément quand un média déjà disponible en VO reçoit sa VF, en plus de la notification de disponibilité initiale.</small>
      <div class="settings-grid two">
        <UiCheckboxField v-model="form.movie_notify_language" label="Distinguer VO/VF pour les films" />
        <small class="check-hint">Actif : un film disponible d'abord en VO puis mis à jour en VF déclenche deux notifications séparées. Désactivé : une seule notification générique "disponible", sans distinction de langue.</small>
        <UiCheckboxField v-model="form.series_notify_language" label="Distinguer VO/VF pour les series" />
        <small class="check-hint">Actif : les jalons VO/VF d'une série suivent la granularité choisie ci-dessous. Désactivé : suivi de disponibilité classique, sans notification liée à la langue.</small>
        <label>Granularite series
          <UiSelect v-model="form.series_notify_granularity" :options="[{ value: 'minimal', label: 'Série complète' }, { value: 'jalons', label: 'Début et fin de saison' }, { value: 'tout', label: 'Chaque épisode' }]" />
          <small>À quel rythme une série en cours déclenche une notification : une seule fois à la fin, à chaque début/fin de saison, ou à chaque épisode disponible.</small>
        </label>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import UiCheckbox from '@/components/ui/UiCheckbox.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import { Archive, Bell, Megaphone, MessageSquare, Send } from '@lucide/vue';
import { form } from '@/settingsForm';
import SettingsCard from './SettingsCard.vue';
import UiTimeField from '@/components/ui/UiTimeField.vue';
import RetentionDaysInput from './RetentionDaysInput.vue';

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
.event-legend {
  grid-column: 1 / -1;
  display: grid;
  gap: var(--space-1) var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin: 0 0 var(--space-2);
}
.event-legend > div { display: flex; flex-direction: column; gap: 2px; }
.event-legend dt { font-weight: 600; font-size: var(--fs-sm); }
.event-legend dd { margin: 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.4; }
</style>
