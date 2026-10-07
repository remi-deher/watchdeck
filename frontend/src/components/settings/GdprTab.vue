<template>
  <div class="settings-rows">
    <!-- Le verdict avant le détail : la page publique /privacy dit-elle à qui s'adresser ? -->
    <section class="gdpr-verdict" :class="complete ? 'is-good' : 'is-warn'" aria-labelledby="gdpr-verdict-title">
      <div>
        <h3 id="gdpr-verdict-title">{{ complete ? 'Page de confidentialité complète' : 'Contact manquant' }}</h3>
        <p>{{ complete ? 'Les visiteurs savent à qui adresser leurs demandes d’accès, de rectification ou de suppression.' : 'Sans adresse de contact, les visiteurs ne savent pas à qui exercer leurs droits (accès, rectification, suppression…).' }}</p>
      </div>
      <UiButton href="/privacy" target="_blank" rel="noopener"><ExternalLink/>Voir la page /privacy</UiButton>
    </section>

    <SettingsSection
      title="Responsable de traitement"
      subtitle="Identité affichée sur la page publique /privacy."
      :status="form.gdpr_contact_email ? 'active' : 'inactive'"
    >
      <SettingsRow label="Nom" label-for="gdpr-contact-name">
        <input id="gdpr-contact-name" v-model="form.gdpr_contact_name" placeholder="Jean Dupont">
      </SettingsRow>
      <SettingsRow label="Email de contact" label-for="gdpr-contact-email">
        <input id="gdpr-contact-email" v-model="form.gdpr_contact_email" type="email" placeholder="contact@exemple.fr">
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      title="Durées de conservation"
      subtitle="Les traces contenant des données personnelles sont supprimées automatiquement une fois ce délai passé (minimisation, art. 5-1-e)."
      status="active"
    >
      <SettingsRow label="Tentatives de connexion et adresses IP" description="En jours. Conservation indéfinie déconseillée pour ces données.">
        <RetentionDaysInput v-model="form.login_attempt_retention_days" :default-days="90" placeholder="90"/>
      </SettingsRow>
      <SettingsRow label="Journaux d'audit et de diagnostic" description="En jours : actions admin, événements de diagnostic, exécutions de tâches.">
        <RetentionDaysInput v-model="form.audit_log_retention_days" :default-days="90"/>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Droits des personnes" subtitle="L'export et l'effacement des données d'une personne se font depuis sa fiche utilisateur.">
      <SettingsRow label="Exporter ou effacer les données d'une personne" description="Ouvrez la fiche de l'utilisateur concerné.">
        <UiButton to="/users"><Users/>Ouvrir Utilisateurs</UiButton>
      </SettingsRow>
    </SettingsSection>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { ExternalLink, Users } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import { form } from '@/settingsForm';
import SettingsSection from './SettingsSection.vue';
import SettingsRow from './SettingsRow.vue';
import RetentionDaysInput from './RetentionDaysInput.vue';
const complete = computed(() => Boolean(String(form.gdpr_contact_email || '').trim()));
</script>
<style scoped lang="scss">
.gdpr-verdict {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
}
.gdpr-verdict.is-good { border-color: color-mix(in srgb, var(--green) 45%, var(--border)); background: color-mix(in srgb, var(--green) 7%, var(--surface)); }
.gdpr-verdict.is-warn { border-color: color-mix(in srgb, var(--amber) 45%, var(--border)); background: color-mix(in srgb, var(--amber) 7%, var(--surface)); }
.gdpr-verdict h3 { margin: 0 0 2px; font-size: var(--fs-md); }
.gdpr-verdict p { margin: 0; color: var(--muted); font-size: var(--fs-sm); max-width: 60ch; }
</style>
