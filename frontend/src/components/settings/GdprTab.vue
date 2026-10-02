<template>
  <div class="settings-rows">
    <SettingsSection
      title="Responsable de traitement"
      subtitle="Identité affichée sur la page publique /privacy."
      :status="form.gdpr_contact_email ? 'active' : 'inactive'"
    >
      <p v-if="!form.gdpr_contact_email" class="warning-text gdpr-warning">
        Sans contact renseigné, la page de confidentialité ne peut pas indiquer à qui s'adresser
        pour exercer ses droits (accès, rectification, suppression…).
      </p>
      <SettingsRow label="Nom" label-for="gdpr-contact-name">
        <input id="gdpr-contact-name" v-model="form.gdpr_contact_name" placeholder="Jean Dupont">
      </SettingsRow>
      <SettingsRow label="Email de contact" label-for="gdpr-contact-email">
        <input id="gdpr-contact-email" v-model="form.gdpr_contact_email" type="email" placeholder="contact@exemple.fr">
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      title="Rétention des données personnelles"
      subtitle="Durée de conservation des traces contenant des données personnelles (minimisation, art. 5-1-e)."
      status="active"
    >
      <SettingsRow label="Tentatives de connexion et adresses IP" description="En jours. Conservation indéfinie déconseillée pour ces données.">
        <RetentionDaysInput v-model="form.login_attempt_retention_days" :default-days="90" placeholder="90"/>
      </SettingsRow>
      <SettingsRow label="Journaux d'audit et de diagnostic" description="En jours : actions admin, événements de diagnostic, exécutions de tâches.">
        <RetentionDaysInput v-model="form.audit_log_retention_days" :default-days="90"/>
      </SettingsRow>
    </SettingsSection>
  </div>
</template>
<script setup lang="ts">
import { form } from '@/settingsForm';
import SettingsSection from './SettingsSection.vue';
import SettingsRow from './SettingsRow.vue';
import RetentionDaysInput from './RetentionDaysInput.vue';
</script>
<style scoped lang="scss">
.gdpr-warning {
  margin: 10px 0 0;
  font-size: var(--fs-sm);
}
</style>
