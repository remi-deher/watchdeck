<template>
  <SettingsCard
    title="Activité Plex"
    subtitle="Collecte directe des lectures et conservation de l’historique"
    :icon="Activity"
    :status="form.live_activity_enabled ? 'active' : 'inactive'"
    :default-open="form.live_activity_enabled"
  >
    <div class="settings-grid two">
      <label>Historique à conserver (jours)<RetentionDaysInput v-model="form.activity_retention_days" :default-days="365" placeholder="365"/><small>Sessions plus anciennes supprimées automatiquement.</small></label>
      <label class="collection-toggle span-two" :class="{ active: form.activity_anonymize_ips }">
        <input v-model="form.activity_anonymize_ips" type="checkbox" role="switch" :aria-checked="Boolean(form.activity_anonymize_ips)">
        <span class="collection-toggle-copy">
          <strong>Anonymiser les adresses IP</strong>
          <small v-if="form.activity_anonymize_ips">Activée — le dernier segment de l’IP est remplacé par 0 avant stockage. La géolocalisation reste approximative et l’adresse exacte n’est jamais enregistrée.</small>
          <small v-else>Désactivée — l’adresse IP complète de chaque lecture est conservée dans l’historique.</small>
        </span>
        <span class="collection-state">{{ form.activity_anonymize_ips ? 'Activée' : 'Désactivée' }}</span>
      </label>
      <label class="collection-toggle span-two" :class="{ active: form.live_activity_enabled }">
        <input v-model="form.live_activity_enabled" type="checkbox" role="switch" :aria-checked="Boolean(form.live_activity_enabled)">
        <span class="collection-toggle-copy">
          <strong>Activité Plex en direct</strong>
          <small v-if="form.live_activity_enabled">Activée — Watchdeck collecte directement les lectures Plex et les affiche sur le tableau de bord et dans Activité Plex.</small>
          <small v-else>Désactivée — aucune lecture en cours ne sera collectée ni affichée.</small>
        </span>
        <span class="collection-state">{{ form.live_activity_enabled ? 'Activée' : 'Désactivée' }}</span>
      </label>
    </div>
    <p class="connection-result">Cette collecte utilise directement Plex. Elle ne dépend pas de Tautulli.</p>
    <div class="card-actions">
      <button class="secondary" :disabled="busy" @click="recalculateLocations"><MapPinned/>Recalculer les lieux</button>
    </div>
    <p v-if="status" class="connection-result">{{ status }}</p>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)"/>
  </SettingsCard>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Activity, MapPinned } from '@lucide/vue';
import { api } from '@/api';
import { form, save } from '@/settingsForm';
import ConfirmModal from '@/components/ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import SettingsCard from '../SettingsCard.vue';
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

<style scoped lang="scss">
.card-actions{display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:center;margin-top:4px}.connection-result{margin:0;color:var(--muted);font-size:var(--fs-sm);line-height:1.5}.collection-toggle{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:var(--space-3);padding:15px;border:1px solid rgba(239,68,68,.35);border-radius:var(--radius-md);background:rgba(239,68,68,.06);cursor:pointer}.collection-toggle.active{border-color:rgba(34,197,94,.35);background:rgba(34,197,94,.07)}.collection-toggle>input{width:20px;height:20px;margin:0;accent-color:var(--accent)}.collection-toggle-copy{display:grid;gap:var(--space-1)}.collection-toggle-copy strong{font-size:var(--fs-md)}.collection-toggle-copy small{color:color-mix(in srgb,var(--text) 72%,transparent);font-size:var(--fs-sm);line-height:1.45}.collection-state{padding:5px 9px;border-radius:var(--radius-pill);background:rgba(239,68,68,.13);color:#f87171;font-size:var(--fs-xs);font-weight:750}.collection-toggle.active .collection-state{background:rgba(34,197,94,.13);color:var(--success)}@media(max-width:640px){.card-actions>*{width:100%;min-height:44px}.collection-toggle{grid-template-columns:auto minmax(0,1fr)}.collection-state{grid-column:2;justify-self:start}}
</style>
