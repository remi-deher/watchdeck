<template>
  <!-- Les règles à gauche, ce qu'elles font à droite : qui est prévenu de quoi, par quel
       canal, dit en une phrase qui reste visible pendant qu'on coche. -->
  <div class="notify-rules">
  <div class="settings-rows">
    <SettingsSection title="Qui est prévenu, par quel canal" subtitle="Une ligne par événement, une colonne par canal. Un canal désactivé se rallume dans Canaux.">
      <div class="matrix-wrap">
        <table class="event-matrix">
          <caption class="sr-only">Canaux utilisés pour chaque événement</caption>
          <thead>
            <tr>
              <th scope="col"><span class="sr-only">Événement</span></th>
              <th v-for="channel in allChannels" :key="channel.key" scope="col" :class="{ 'is-off': !channelOn(channel.key) }">
                <component :is="channel.icon" aria-hidden="true" />
                <span>{{ channel.label }}</span>
                <small v-if="!channelOn(channel.key)">désactivé</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="event in notificationEvents" :key="event.key">
              <th scope="row"><strong>{{ event.label }}</strong><small>{{ event.description }}</small></th>
              <!-- Une case n'a de sens que reliée à sa ligne et à sa colonne : son nom dit les deux. -->
              <td v-for="channel in allChannels" :key="channel.key">
                <UiCheckbox
                  v-model="form[fieldOf(event.key, channel.key)]"
                  :disabled="!channelOn(channel.key)"
                  :aria-label="`${event.label} par ${channel.label}`"
                  :title="channelOn(channel.key) ? '' : `Activez ${channel.label} dans Canaux`"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
  <aside class="notify-summary" aria-live="polite">
    <strong>En clair</strong>
    <p v-for="line in summary" :key="line">{{ line }}</p>
  </aside>
  </div>
</template>
<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import UiCheckbox from '@/components/ui/UiCheckbox.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import { Bell, Eye, Mail, MailCheck, Megaphone, MessageSquare, Send } from '@lucide/vue';
import { computed, ref } from 'vue';
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

const allChannels = [
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'discord', label: 'Discord', icon: MessageSquare },
  { key: 'telegram', label: 'Telegram', icon: Send },
  { key: 'ntfy', label: 'ntfy', icon: Bell },
  { key: 'gotify', label: 'Gotify', icon: Megaphone },
];
const channelOn = (key: string) => Boolean(form[`${key}_enabled`]);
/* Les cases email s'appellent `email_on_<événement>`, les autres `<canal>_send_<événement>`. */
const fieldOf = (event: string, channel: string) => (channel === 'email' ? `email_on_${event}` : `${channel}_send_${event}`);
// Descriptions alignees sur app/services/notification_catalog.py (source de verite
// utilisee aussi par l'editeur de modeles d'email) pour ne pas raconter une autre
// histoire que celle des emails reellement envoyes.
const notificationEvents = [
  { key: 'request', label: 'Nouvelle demande', description: 'Confirmation envoyée quand une demande est enregistrée.' },
  { key: 'available', label: 'Disponibilité', description: "Un média (ou un épisode/une saison suivie) est disponible sur Plex — VO, VF, amélioration VO→VF, ou jalon de série, selon le contexte." },
  { key: 'failure', label: 'Échec', description: "La demande n'a pas pu être transmise à Sonarr ou Radarr." },
];

const GRANULARITY: Record<string, string> = {
  minimal: 'quand la série est complète',
  jalons: 'au début et à la fin de chaque saison',
  tout: 'à chaque épisode',
};
const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const pad = (value: unknown) => String(value ?? 0).padStart(2, '0');
/* Ce que font ces règles, en phrases : ce qu'on vérifie d'un coup d'œil avant d'enregistrer. */
const summary = computed(() => {
  const lines = notificationEvents.map((event) => {
    const who = allChannels.filter((channel) => channelOn(channel.key) && form[fieldOf(event.key, channel.key)]).map((channel) => channel.label);
    return `${event.label} : ${who.length ? who.join(', ') : 'personne n’est prévenu'}.`;
  });
  const series = GRANULARITY[String(form.series_notify_granularity)] || GRANULARITY.jalons;
  lines.push(`Pour une série, on prévient ${series}${form.series_notify_language ? ', puis à l’arrivée de la VF' : ''}.`);
  if (form.digest_enabled) lines.push(`Un résumé part chaque jour à ${pad(form.digest_hour)} h ${pad(form.digest_minute)}.`);
  if (form.newsletter_enabled) lines.push(`La lettre de la semaine part le ${WEEKDAYS[Number(form.newsletter_weekday)] || 'dimanche'} à ${pad(form.newsletter_hour)} h.`);
  return lines;
});
</script>
<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.notify-rules { display: grid; grid-template-columns: minmax(0, 1fr) minmax(15rem, 19rem); gap: var(--space-4); align-items: start; }
.notify-summary { position: sticky; top: var(--space-4); padding: var(--space-3) var(--space-4); border-radius: var(--panel-radius); background: var(--surface-2); font-size: var(--fs-sm); line-height: 1.55; }
.notify-summary p { margin: var(--space-1) 0 0; }
.newsletter-when { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.matrix-wrap { overflow-x: auto; }
.event-matrix { width: 100%; border-collapse: collapse; }
.event-matrix th, .event-matrix td { padding: var(--space-2); border-top: 1px solid var(--border); text-align: center; vertical-align: middle; }
.event-matrix thead th { border-top: 0; color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.event-matrix thead th > * { display: block; margin: 0 auto; }
.event-matrix thead th svg { width: 16px; height: 16px; margin-bottom: 2px; }
.event-matrix thead th.is-off { opacity: .55; }
.event-matrix tbody th { min-width: 12rem; text-align: left; font-weight: 400; }
.event-matrix tbody th strong { display: block; }
.event-matrix tbody th small { display: block; color: var(--muted); font-size: var(--fs-xs); line-height: 1.4; }

@include bp.until(desktop) {
  .notify-rules { grid-template-columns: minmax(0, 1fr); }
  .notify-summary { position: static; order: -1; }
}
</style>
