<template>
  <div class="settings-grid"><div class="settings-cards span-two">
    <section class="effective-summary" :class="{ inactive: !form.vf_upgrade_enabled }">
      <div><strong>Comportement effectif</strong><p>{{ effectiveSummary }}</p></div>
      <span>{{ form.vf_upgrade_enabled ? 'Actif' : 'Désactivé' }}</span>
    </section>
    <SettingsCard title="Activation et périmètre" subtitle="Choisit quels médias peuvent recevoir une meilleure release française." :icon="Languages" :status="form.vf_upgrade_enabled?'active':'inactive'" :default-open="true">
      <label class="check"><input v-model="form.vf_upgrade_enabled" type="checkbox"> Activer les améliorations VF</label>
      <div class="choice-grid"><label class="check"><input v-model="form.vf_upgrade_include_vo" :disabled="!form.vf_upgrade_enabled" type="checkbox"> Médias VO</label><label class="check"><input v-model="form.vf_upgrade_include_mixed" :disabled="!form.vf_upgrade_enabled" type="checkbox"> Saisons mixtes</label><label class="check"><input v-model="form.vf_upgrade_include_vf" :disabled="!form.vf_upgrade_enabled || form.vf_upgrade_protect_existing_vf" type="checkbox"> Médias déjà en VF</label></div>
      <label>Stratégie automatique des saisons mixtes<select v-model="form.vf_upgrade_mixed_mode" :disabled="!form.vf_upgrade_enabled || !form.vf_upgrade_include_mixed || form.vf_upgrade_protect_existing_vf"><option value="episodes">Épisodes VO uniquement</option><option value="season">Pack saison complet</option></select><small>{{ mixedModeHelp }}</small></label>
      <label class="check"><input v-model="form.vf_upgrade_protect_existing_vf" type="checkbox"> Protéger les fichiers déjà en VF</label>
    </SettingsCard>

    <SettingsCard title="Langues et confiance" subtitle="Filtre et ordonne les releases candidates." :icon="BadgeCheck" :default-open="true">
      <label>Marqueurs acceptés<input v-model="form.vf_upgrade_markers" placeholder="truefrench,vff,multi,vfi,vfq"><small>Séparés par des virgules.</small></label>
      <label>Ordre de préférence<input v-model="form.vf_upgrade_preference" placeholder="truefrench,vff,multi,vfi,vfq"></label>
      <label>Confiance minimale : {{ form.vf_upgrade_min_confidence }} %<input v-model.number="form.vf_upgrade_min_confidence" type="range" min="0" max="100" step="5"></label>
      <label class="check"><input v-model="form.vf_upgrade_accept_secondary" type="checkbox"> Accepter une piste française secondaire</label>
      <label class="check"><input v-model="form.vf_upgrade_require_default" type="checkbox"> Exiger que la piste française soit par défaut après import</label>
    </SettingsCard>

    <SettingsCard title="Qualité et sécurité" subtitle="Empêche un gain de langue au prix d'une régression technique." :icon="ShieldCheck">
      <div class="choice-grid"><label class="check"><input v-model="form.vf_upgrade_block_arr_rejected" type="checkbox"> Bloquer les rejets *arr</label><label class="check"><input v-model="form.vf_upgrade_protect_resolution" type="checkbox"> Conserver la résolution</label><label class="check"><input v-model="form.vf_upgrade_preserve_hdr" type="checkbox"> Conserver HDR / Dolby Vision</label><label class="check"><input v-model="form.vf_upgrade_protect_custom_format_score" type="checkbox"> Ne pas baisser le score CF</label></div>
      <div class="choice-grid"><label>Taille minimale (Go)<input v-model.number="form.vf_upgrade_min_size_gb" type="number" min="0" step="0.1" placeholder="Aucune"></label><label>Taille maximale (Go)<input v-model.number="form.vf_upgrade_max_size_gb" type="number" min="0" step="0.1" placeholder="Aucune"></label></div>
      <label class="check"><input v-model="form.vf_upgrade_allow_technical_downgrade" type="checkbox"> Autoriser une régression technique après confirmation manuelle</label>
    </SettingsCard>

    <SettingsCard title="Recherche et performances" subtitle="Cadence les indexeurs sans les saturer." :icon="Gauge">
      <div class="choice-grid"><label>Cooldown (heures)<input v-model.number="form.vf_upgrade_cooldown_hours" type="number" min="1" max="720"></label><label>Relance après échec (heures)<input v-model.number="form.vf_upgrade_retry_hours" type="number" min="1" max="168"></label></div>
      <div class="choice-grid"><label>Recherches par passage<input v-model.number="form.vf_upgrade_max_searches_per_run" type="number" min="1" max="500"></label><label>Concurrence<input v-model.number="form.vf_upgrade_search_concurrency" type="number" min="1" max="10"></label></div>
      <label>Priorité des cibles<select v-model="form.vf_upgrade_priority"><option value="mixed,vo,vf">Saisons mixtes, puis VO, puis VF</option><option value="mixed,vf,vo">Saisons mixtes, puis VF, puis VO</option><option value="vo,mixed,vf">VO, puis saisons mixtes, puis VF</option><option value="vo,vf,mixed">VO, puis VF, puis saisons mixtes</option><option value="vf,mixed,vo">VF, puis saisons mixtes, puis VO</option><option value="vf,vo,mixed">VF, puis VO, puis saisons mixtes</option></select><small>Cette priorité détermine quelles recherches entrent dans la limite de chaque passage.</small></label>
    </SettingsCard>

    <SettingsCard title="Validation, alertes et historique" subtitle="Confirme la VF après import et conserve une trace exploitable." :icon="ScanSearch">
      <label class="check"><input v-model="form.vf_upgrade_verify_after_import" type="checkbox"> Vérifier les pistes après import</label>
      <div class="choice-grid"><label>Délai de validation (minutes)<input v-model.number="form.vf_upgrade_verification_timeout_minutes" :disabled="!form.vf_upgrade_verify_after_import" type="number" min="15" max="1440"></label><label>Tentatives automatiques maximales<input v-model.number="form.vf_upgrade_max_retries" :disabled="!form.vf_upgrade_verify_after_import" type="number" min="0" max="10"><small>Une recherche manuelle reste toujours possible.</small></label></div>
      <label class="check"><input v-model="form.vf_upgrade_trigger_plex_scan" :disabled="!form.vf_upgrade_verify_after_import" type="checkbox"> Demander une nouvelle analyse Plex à la fin du téléchargement</label>
      <label class="check"><input v-model="form.vf_upgrade_blacklist_failed" type="checkbox"> Mettre en liste noire une release non validée</label>
      <strong class="subheading">Notifications</strong><div class="choice-grid"><label class="check"><input v-model="form.vf_upgrade_notify_found" type="checkbox"> Release trouvée</label><label class="check"><input v-model="form.vf_upgrade_notify_accepted" type="checkbox"> Acceptée par *arr</label><label class="check"><input v-model="form.vf_upgrade_notify_downloading" type="checkbox"> Téléchargement démarré</label><label class="check"><input v-model="form.vf_upgrade_notify_failed" type="checkbox"> Échec</label><label class="check"><input v-model="form.vf_upgrade_notify_verified" type="checkbox"> VF validée</label></div>
      <label>Conservation de l'historique (jours)<input v-model.number="form.vf_upgrade_history_retention_days" type="number" min="1" max="3650"></label>
    </SettingsCard>
  </div></div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { BadgeCheck, Gauge, Languages, ScanSearch, ShieldCheck } from '@lucide/vue';
import { form } from '@/settingsForm';
import SettingsCard from './SettingsCard.vue';

const selectedScopes = computed(() => [
  form.vf_upgrade_include_mixed && 'saisons mixtes',
  form.vf_upgrade_include_vo && 'médias VO',
  form.vf_upgrade_include_vf && !form.vf_upgrade_protect_existing_vf && 'médias VF',
].filter(Boolean));
const effectiveSummary = computed(() => {
  if (!form.vf_upgrade_enabled) return 'Aucune recherche automatique ne sera lancée.';
  const scopes = selectedScopes.value.length ? selectedScopes.value.join(', ') : 'aucun média';
  const protection = form.vf_upgrade_protect_existing_vf
    ? 'Les fichiers VF existants ne seront jamais remplacés automatiquement.'
    : 'Les packs complets peuvent remplacer des fichiers VF existants.';
  return `Recherche sur ${scopes}, toutes les ${form.vf_upgrade_retry_hours || 6} h. ${protection}`;
});
const mixedModeHelp = computed(() => form.vf_upgrade_protect_existing_vf
  ? 'La protection VF impose la recherche des seuls épisodes VO. Désactive-la pour autoriser un pack complet automatique.'
  : 'Une recherche manuelle au niveau saison cherche toujours un pack complet.');
</script>
<style scoped lang="scss">.effective-summary{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-4);padding:14px 16px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--border));border-radius:var(--radius-md);background:color-mix(in srgb,var(--accent) 8%,var(--surface))}.effective-summary.inactive{border-color:var(--border);background:var(--surface)}.effective-summary p{margin:4px 0 0;color:var(--muted);font-size:var(--fs-sm)}.effective-summary>span{padding:4px 8px;border-radius:999px;background:var(--surface);font-size:var(--fs-xs)}.choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3)}.subheading{font-size:var(--fs-sm)}input:disabled,select:disabled{opacity:.55;cursor:not-allowed}@media(max-width:640px){.choice-grid{grid-template-columns:1fr}.effective-summary{flex-direction:column}}</style>
