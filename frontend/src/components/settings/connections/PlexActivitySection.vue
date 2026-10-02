<template>
  <SettingsSection
    title="Activité Plex"
    subtitle="Collecte des lectures directement depuis Plex. Elle ne dépend pas de Tautulli."
    :status="form.live_activity_enabled ? 'active' : 'inactive'"
  >
    <SettingsRow
      label="Activité Plex en direct"
      :description="form.live_activity_enabled
        ? 'Watchdeck collecte directement les lectures Plex et les affiche sur le tableau de bord et dans Activité Plex.'
        : 'Aucune lecture en cours ne sera collectée ni affichée.'"
    >
      <ToggleSwitch v-model="form.live_activity_enabled" title="Activité Plex en direct" />
    </SettingsRow>
    <SettingsRow
      label="Anonymiser les adresses IP"
      :description="form.activity_anonymize_ips
        ? 'Le dernier segment de l’IP est remplacé par 0 avant stockage : la géolocalisation reste approximative.'
        : 'L’adresse IP complète de chaque lecture est conservée dans l’historique.'"
    >
      <ToggleSwitch v-model="form.activity_anonymize_ips" title="Anonymiser les adresses IP" />
    </SettingsRow>
    <SettingsRow label="Historique à conserver" description="En jours : les sessions plus anciennes sont supprimées automatiquement.">
      <RetentionDaysInput v-model="form.activity_retention_days" :default-days="365" placeholder="365"/>
    </SettingsRow>
    <SettingsRow label="Lieux des lectures" :description="status || 'Complète les sessions sans lieu à partir de leur IP, sans toucher aux lieux déjà enregistrés.'">
      <UiButton :disabled="busy" @click="recalculateLocations"><MapPinned/>Recalculer les lieux</UiButton>
    </SettingsRow>
  </SettingsSection>
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)"/>
</template>

<script setup lang="ts">
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { ref } from 'vue';
import { MapPinned } from '@lucide/vue';
import { api } from '@/api';
import { form, save } from '@/settingsForm';
import ConfirmModal from '@/components/ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import SettingsSection from '../SettingsSection.vue';
import SettingsRow from '../SettingsRow.vue';
import RetentionDaysInput from '../RetentionDaysInput.vue';

const busy=ref(false),status=ref('');
const {dialog:confirmDialog,askConfirm,resolveConfirm}=useConfirm();
async function recalculateLocations(): Promise<void> {
  if(!await askConfirm({
    title:'Recalculer les localisations ?',
    message:'Les sessions sans lieu seront complétées à partir de leur IP, et celles déjà localisées mais sans FAI, organisation ou ASN seront enrichies. Les villes, régions, pays et coordonnées déjà enregistrés sont toujours conservés.',
    confirmLabel:'Recalculer',
  }))return;
  busy.value=true;status.value='';
  try{
    await save();
    const result=await api('/api/playback/locations/recalculate',{method:'POST'});
    status.value=`${result.locations_added} localisation(s) ajoutée(s), ${result.network_enriched} enrichie(s) (FAI/organisation/ASN), ${result.preserved} conservée(s), ${result.unresolved} non résolue(s), pour ${result.addresses} IP distincte(s).`;
  }catch(error: any){status.value=error.message}
  finally{busy.value=false}
}
</script>
