<template>
  <div class="settings-rows">
    <section class="effective-summary" :class="{ inactive: !form.vf_upgrade_enabled }">
      <div><strong>Comportement effectif</strong><p>{{ effectiveSummary }}</p></div>
      <span>{{ form.vf_upgrade_enabled ? 'Actif' : 'Désactivé' }}</span>
    </section>

    <SettingsSection
      title="Activation et périmètre"
      subtitle="Choisit quels médias peuvent recevoir une meilleure release française."
      :status="form.vf_upgrade_enabled ? 'active' : 'inactive'"
    >
      <SettingsRow label="Activer les améliorations VF">
        <input v-model="form.vf_upgrade_enabled" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Médias VO" description="Médias dont aucune piste française n'a été détectée." :disabled="!form.vf_upgrade_enabled">
        <input v-model="form.vf_upgrade_include_vo" :disabled="!form.vf_upgrade_enabled" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Saisons mixtes" description="Séries dont une partie seulement des épisodes est en VF." :disabled="!form.vf_upgrade_enabled">
        <input v-model="form.vf_upgrade_include_mixed" :disabled="!form.vf_upgrade_enabled" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Médias déjà en VF" :disabled="!form.vf_upgrade_enabled || form.vf_upgrade_protect_existing_vf">
        <input v-model="form.vf_upgrade_include_vf" :disabled="!form.vf_upgrade_enabled || form.vf_upgrade_protect_existing_vf" type="checkbox">
      </SettingsRow>
      <SettingsRow
        label="Stratégie des saisons mixtes"
        :description="mixedModeHelp"
        :disabled="!form.vf_upgrade_enabled || !form.vf_upgrade_include_mixed || form.vf_upgrade_protect_existing_vf"
      >
        <select v-model="form.vf_upgrade_mixed_mode" :disabled="!form.vf_upgrade_enabled || !form.vf_upgrade_include_mixed || form.vf_upgrade_protect_existing_vf">
          <option value="episodes">Épisodes VO uniquement</option>
          <option value="season">Pack saison complet</option>
        </select>
      </SettingsRow>
      <SettingsRow label="Protéger les fichiers déjà en VF" description="Aucun fichier français existant ne sera remplacé automatiquement.">
        <input v-model="form.vf_upgrade_protect_existing_vf" type="checkbox">
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Langues et confiance" subtitle="Filtre et ordonne les releases candidates.">
      <SettingsRow label="Marqueurs acceptés" description="Séparés par des virgules.">
        <input v-model="form.vf_upgrade_markers" placeholder="truefrench,vff,multi,vfi,vfq">
      </SettingsRow>
      <SettingsRow label="Ordre de préférence">
        <input v-model="form.vf_upgrade_preference" placeholder="truefrench,vff,multi,vfi,vfq">
      </SettingsRow>
      <SettingsRow label="Confiance minimale" :description="`${form.vf_upgrade_min_confidence} %`">
        <input v-model.number="form.vf_upgrade_min_confidence" type="range" min="0" max="100" step="5">
      </SettingsRow>
      <SettingsRow label="Accepter une piste française secondaire">
        <input v-model="form.vf_upgrade_accept_secondary" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Exiger que la piste française soit par défaut après import">
        <input v-model="form.vf_upgrade_require_default" type="checkbox">
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Qualité et sécurité" subtitle="Empêche un gain de langue au prix d'une régression technique.">
      <SettingsRow label="Bloquer les rejets *arr">
        <input v-model="form.vf_upgrade_block_arr_rejected" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Conserver la résolution">
        <input v-model="form.vf_upgrade_protect_resolution" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Conserver HDR / Dolby Vision">
        <input v-model="form.vf_upgrade_preserve_hdr" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Ne pas baisser le score CF">
        <input v-model="form.vf_upgrade_protect_custom_format_score" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Taille minimale" description="En Go. Vide = aucune limite.">
        <input v-model.number="form.vf_upgrade_min_size_gb" type="number" min="0" step="0.1" placeholder="Aucune">
      </SettingsRow>
      <SettingsRow label="Taille maximale" description="En Go. Vide = aucune limite.">
        <input v-model.number="form.vf_upgrade_max_size_gb" type="number" min="0" step="0.1" placeholder="Aucune">
      </SettingsRow>
      <SettingsRow label="Autoriser une régression technique" description="Uniquement après confirmation manuelle.">
        <input v-model="form.vf_upgrade_allow_technical_downgrade" type="checkbox">
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Recherche et performances" subtitle="Cadence les indexeurs sans les saturer.">
      <SettingsRow label="Cooldown" description="En heures, entre deux recherches sur un même média.">
        <input v-model.number="form.vf_upgrade_cooldown_hours" type="number" min="1" max="720">
      </SettingsRow>
      <SettingsRow label="Relance après échec" description="En heures.">
        <input v-model.number="form.vf_upgrade_retry_hours" type="number" min="1" max="168">
      </SettingsRow>
      <SettingsRow label="Recherches par passage">
        <input v-model.number="form.vf_upgrade_max_searches_per_run" type="number" min="1" max="500">
      </SettingsRow>
      <SettingsRow label="Concurrence" description="Recherches menées en parallèle.">
        <input v-model.number="form.vf_upgrade_search_concurrency" type="number" min="1" max="10">
      </SettingsRow>
      <SettingsRow label="Priorité des cibles" description="Détermine quelles recherches entrent dans la limite de chaque passage.">
        <select v-model="form.vf_upgrade_priority">
          <option value="mixed,vo,vf">Saisons mixtes, puis VO, puis VF</option>
          <option value="mixed,vf,vo">Saisons mixtes, puis VF, puis VO</option>
          <option value="vo,mixed,vf">VO, puis saisons mixtes, puis VF</option>
          <option value="vo,vf,mixed">VO, puis VF, puis saisons mixtes</option>
          <option value="vf,mixed,vo">VF, puis saisons mixtes, puis VO</option>
          <option value="vf,vo,mixed">VF, puis VO, puis saisons mixtes</option>
        </select>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Validation et historique" subtitle="Confirme la VF après import et conserve une trace exploitable.">
      <SettingsRow label="Vérifier les pistes après import">
        <input v-model="form.vf_upgrade_verify_after_import" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Délai de validation" description="En minutes." :disabled="!form.vf_upgrade_verify_after_import">
        <input v-model.number="form.vf_upgrade_verification_timeout_minutes" :disabled="!form.vf_upgrade_verify_after_import" type="number" min="15" max="1440">
      </SettingsRow>
      <SettingsRow label="Tentatives automatiques maximales" description="Une recherche manuelle reste toujours possible." :disabled="!form.vf_upgrade_verify_after_import">
        <input v-model.number="form.vf_upgrade_max_retries" :disabled="!form.vf_upgrade_verify_after_import" type="number" min="0" max="10">
      </SettingsRow>
      <SettingsRow label="Demander une nouvelle analyse Plex" description="À la fin du téléchargement." :disabled="!form.vf_upgrade_verify_after_import">
        <input v-model="form.vf_upgrade_trigger_plex_scan" :disabled="!form.vf_upgrade_verify_after_import" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Mettre en liste noire une release non validée">
        <input v-model="form.vf_upgrade_blacklist_failed" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Conservation de l'historique" description="En jours.">
        <input v-model.number="form.vf_upgrade_history_retention_days" type="number" min="1" max="3650">
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Notifications" subtitle="Étapes du cycle d'amélioration qui déclenchent un envoi.">
      <SettingsRow label="Release trouvée">
        <input v-model="form.vf_upgrade_notify_found" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Acceptée par *arr">
        <input v-model="form.vf_upgrade_notify_accepted" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Téléchargement démarré">
        <input v-model="form.vf_upgrade_notify_downloading" type="checkbox">
      </SettingsRow>
      <SettingsRow label="Échec">
        <input v-model="form.vf_upgrade_notify_failed" type="checkbox">
      </SettingsRow>
      <SettingsRow label="VF validée">
        <input v-model="form.vf_upgrade_notify_verified" type="checkbox">
      </SettingsRow>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { form } from '@/settingsForm';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';

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

<style scoped lang="scss">
.settings-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.effective-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.effective-summary.inactive {
  border-color: var(--border);
  background: var(--surface);
}

.effective-summary p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}

.effective-summary > span {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--surface);
  font-size: var(--fs-xs);
}

input:disabled,
select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .effective-summary {
    flex-direction: column;
  }
}
</style>
