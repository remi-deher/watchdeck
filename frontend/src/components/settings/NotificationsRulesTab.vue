<template>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template #section-summary>
      <div class="notify-summary" aria-live="polite">
        <p v-for="line in summary" :key="line">{{ line }}</p>
      </div>
    </template>

    <template #section-matrix>
      <div class="matrix-wrap">
        <table class="notify-matrix">
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
              <td v-for="channel in allChannels" :key="channel.key" :class="{ 'is-off': !channelOn(channel.key) }">
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
      <ConfigureField label="Alerte de panne d'indexeur" help="Prévient l'email administrateur, et Discord s'il est actif, quand un indexeur Prowlarr tombe en panne ou fonctionne de nouveau.">
        <ToggleSwitch v-model="form.indexer_alerts_enabled" title="Alerte de panne d'indexeur" />
      </ConfigureField>
      <ConfigureField label="Email lors d'une amélioration VO vers VF" help="Notifie séparément quand un média déjà disponible en VO reçoit sa VF, en plus de la notification de disponibilité initiale.">
        <ToggleSwitch v-model="form.email_on_vf_available" title="Email lors d'une amélioration VO vers VF" />
      </ConfigureField>
    </template>

    <template #section-language>
      <ConfigureField label="Distinguer VO/VF pour les films" help="Activé : un film disponible en VO puis en VF déclenche deux notifications. Désactivé : une seule notification « disponible », sans distinction de langue.">
        <ToggleSwitch v-model="form.movie_notify_language" title="Distinguer VO/VF pour les films" />
      </ConfigureField>
      <ConfigureField label="Distinguer VO/VF pour les séries" help="Activé : les jalons VO/VF suivent la granularité ci-dessous. Désactivé : suivi de disponibilité classique, sans notification liée à la langue.">
        <ToggleSwitch v-model="form.series_notify_language" title="Distinguer VO/VF pour les séries" />
      </ConfigureField>
      <ConfigureField label="Granularité des séries" help="Une seule fois à la fin, à chaque début et fin de saison, ou à chaque épisode disponible.">
        <UiSelect v-model="form.series_notify_granularity" aria-label="Granularité des séries" :options="[{ value: 'minimal', label: 'Série complète' }, { value: 'jalons', label: 'Début et fin de saison' }, { value: 'tout', label: 'Chaque épisode' }]" />
      </ConfigureField>
    </template>

    <template #section-retention>
      <ConfigureField label="Journaux de notifications" help="En jours.">
        <RetentionDaysInput v-model="form.notification_log_retention_days" :default-days="30"/>
      </ConfigureField>
      <ConfigureField label="Digest quotidien" help="Un récapitulatif par jour, à l'heure choisie, pour les utilisateurs qui l'ont activé dans leurs préférences, au lieu de chaque notification.">
        <ToggleSwitch v-model="form.digest_enabled" title="Digest quotidien" />
      </ConfigureField>
      <ConfigureField label="Heure du digest">
        <UiTimeField v-model:hour="form.digest_hour" v-model:minute="form.digest_minute" aria-label="Heure du digest"/>
      </ConfigureField>
    </template>

    <template #section-newsletter>
      <div class="newsletter-actions">
        <UiButton href="/api/newsletter/preview" target="_blank" rel="noopener"><Eye />Aperçu</UiButton>
        <UiButton :loading="sendingTest" @click="sendTest"><MailCheck />M'envoyer un test</UiButton>
      </div>
      <ConfigureField label="Envoi hebdomadaire">
        <ToggleSwitch v-model="form.newsletter_enabled" title="Envoi hebdomadaire" />
      </ConfigureField>
      <ConfigureField label="Jour et heure" help="Heure locale. La lettre couvre les ajouts depuis le précédent envoi.">
        <div class="newsletter-when">
          <UiSelect v-model="form.newsletter_weekday" aria-label="Jour d'envoi" :disabled="!form.newsletter_enabled" :options="weekdays" />
          <UiSelect v-model="form.newsletter_hour" aria-label="Heure d'envoi" :disabled="!form.newsletter_enabled" :options="hours" />
        </div>
      </ConfigureField>
      <ConfigureField label="Publier aussi sur Discord" help="Sur le webhook Discord global (Canaux), en plus des emails.">
        <ToggleSwitch v-model="form.newsletter_discord" :disabled="!form.newsletter_enabled" title="Publier aussi sur Discord" />
      </ConfigureField>
    </template>
  </ConfigureTemplate>
</template>
<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import UiCheckbox from '@/components/ui/UiCheckbox.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import { Bell, CalendarClock, Eye, Globe2, Grid3x3, Mail, MailCheck, Megaphone, MessageSquare, Newspaper, Send, Sparkles } from '@lucide/vue';
import { computed, ref } from 'vue';
import { api } from '@/api';
import UiButton from '@/components/ui/UiButton.vue';
import { form, success, fail } from '@/settingsForm';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';
import UiTimeField from '@/components/ui/UiTimeField.vue';
import RetentionDaysInput from './RetentionDaysInput.vue';

const page = useSettingsPage();
const sections = [
  { key: 'summary', title: 'En clair', description: 'Ce que font ces règles, en phrases : à vérifier d\'un coup d\'œil avant d\'enregistrer.', icon: Sparkles, keywords: ['résumé'] },
  { key: 'matrix', title: 'Qui est prévenu, par quel canal', description: 'Une ligne par événement, une colonne par canal. Un canal désactivé se rallume dans Canaux.', icon: Grid3x3, keywords: ['événement', 'canal', 'email', 'discord', 'telegram', 'ntfy', 'gotify', 'indexeur'] },
  { key: 'language', title: 'Langue des notifications', description: 'Distinguer la VO et la VF, et le rythme des notifications de séries.', icon: Globe2, keywords: ['vo', 'vf', 'séries', 'granularité', 'saison'] },
  { key: 'retention', title: 'Rétention et digest', description: 'Conservation des journaux de notifications, et récapitulatif quotidien par email.', icon: CalendarClock, keywords: ['digest', 'journaux', 'jours'] },
  { key: 'newsletter', title: 'Nouveautés de la semaine', description: 'Une lettre hebdomadaire avec les films et séries ajoutés à Plex, leur affiche et leur langue, pour les utilisateurs qui l\'ont activée dans leur profil.', icon: Newspaper, keywords: ['lettre', 'newsletter', 'hebdomadaire'] },
];

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
.notify-summary p { margin: 0 0 var(--space-1); font-size: var(--fs-sm); line-height: 1.55; }
.newsletter-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.newsletter-when { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.matrix-wrap { overflow-x: auto; }
.notify-matrix { width: 100%; border-collapse: collapse; }
.notify-matrix th, .notify-matrix td { padding: var(--space-2); border-top: 1px solid var(--border); text-align: center; vertical-align: middle; }
/* Les en-têtes globaux sont en capitales : ici, des noms de canaux, lus tels quels et sur une ligne. */
.notify-matrix th { text-transform: none; letter-spacing: normal; }
.notify-matrix thead th { min-width: 4.5rem; border-top: 0; color: var(--muted); font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; }
.notify-matrix thead th > * { display: block; margin: 0 auto; }
.notify-matrix thead th svg { width: 16px; height: 16px; margin-bottom: 2px; }
.notify-matrix thead th.is-off { opacity: .55; }
.notify-matrix tbody th { min-width: 12rem; color: var(--text); font-size: var(--fs-sm); text-align: left; font-weight: 400; }
.notify-matrix td.is-off { opacity: .35; }
.notify-matrix tbody th strong { display: block; }
.notify-matrix tbody th small { display: block; color: var(--muted); font-size: var(--fs-xs); line-height: 1.4; }

</style>
