<template>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <template #section-page>
      <div class="gdpr-verdict" :class="complete ? 'is-good' : 'is-warn'" role="status">
        <p>{{ complete ? 'Les visiteurs savent à qui adresser leurs demandes d’accès, de rectification ou de suppression.' : 'Sans adresse de contact, les visiteurs ne savent pas à qui exercer leurs droits (accès, rectification, suppression…).' }}</p>
        <UiButton href="/privacy" target="_blank" rel="noopener"><ExternalLink/>Voir la page /privacy</UiButton>
      </div>
    </template>
    <template #section-controller>
      <ConfigureField label="Nom" for-id="gdpr-contact-name">
        <input id="gdpr-contact-name" v-model="form.gdpr_contact_name" placeholder="Jean Dupont">
      </ConfigureField>
      <ConfigureField label="Email de contact" for-id="gdpr-contact-email">
        <input id="gdpr-contact-email" v-model="form.gdpr_contact_email" type="email" placeholder="contact@exemple.fr">
      </ConfigureField>
    </template>
    <template #section-retention>
      <ConfigureField label="Tentatives de connexion et adresses IP" help="En jours. Conservation indéfinie déconseillée pour ces données.">
        <RetentionDaysInput v-model="form.login_attempt_retention_days" :default-days="90" placeholder="90"/>
      </ConfigureField>
      <ConfigureField label="Journaux d'audit et de diagnostic" help="En jours : actions admin, événements de diagnostic, exécutions de tâches.">
        <RetentionDaysInput v-model="form.audit_log_retention_days" :default-days="90"/>
      </ConfigureField>
    </template>
    <template #section-rights>
      <ConfigureField label="Exporter ou effacer les données d'une personne" help="Ouvrez la fiche de l'utilisateur concerné.">
        <UiButton to="/users"><Users/>Ouvrir Utilisateurs</UiButton>
      </ConfigureField>
    </template>
  </ConfigureTemplate>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { ExternalLink, FileLock2, Hourglass, ShieldCheck, UserRound, Users } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import { form } from '@/settingsForm';
import { useSettingsPage } from '@/composables/useSettingsPage';
import RetentionDaysInput from './RetentionDaysInput.vue';

const page = useSettingsPage();
const complete = computed(() => Boolean(String(form.gdpr_contact_email || '').trim()));
const sections = computed(() => [
  { key: 'page', title: complete.value ? 'Page de confidentialité complète' : 'Contact manquant', description: 'Ce que lisent les visiteurs sur la page publique /privacy.', icon: ShieldCheck, keywords: ['rgpd', 'confidentialité', 'privacy'] },
  { key: 'controller', title: 'Responsable de traitement', description: 'Identité affichée sur la page publique /privacy.', icon: UserRound, keywords: ['contact', 'nom', 'email'] },
  { key: 'retention', title: 'Durées de conservation', description: 'Les traces contenant des données personnelles sont supprimées automatiquement une fois ce délai passé (minimisation, art. 5-1-e).', icon: Hourglass, keywords: ['rétention', 'jours', 'audit', 'ip', 'connexion'] },
  { key: 'rights', title: 'Droits des personnes', description: 'L\'export et l\'effacement des données d\'une personne se font depuis sa fiche utilisateur.', icon: FileLock2, keywords: ['export', 'effacement', 'suppression'] },
]);
</script>
<style scoped lang="scss">
.gdpr-verdict { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
.gdpr-verdict p { margin: 0; color: var(--muted); font-size: var(--fs-sm); max-width: 60ch; }
</style>
