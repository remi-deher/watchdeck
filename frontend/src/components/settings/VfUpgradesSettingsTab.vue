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
        <ToggleSwitch v-model="form.vf_upgrade_enabled" title="Activer les améliorations VF" />
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
        <ToggleSwitch v-model="form.vf_upgrade_protect_existing_vf" title="Protéger les fichiers déjà en VF" />
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
        <ToggleSwitch v-model="form.vf_upgrade_accept_secondary" title="Accepter une piste française secondaire" />
      </SettingsRow>
      <SettingsRow label="Exiger que la piste française soit par défaut après import">
        <ToggleSwitch v-model="form.vf_upgrade_require_default" title="Exiger que la piste française soit par défaut après import" />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Qualité et sécurité" subtitle="Empêche un gain de langue au prix d'une régression technique.">
      <SettingsRow label="Bloquer les rejets *arr">
        <ToggleSwitch v-model="form.vf_upgrade_block_arr_rejected" title="Bloquer les rejets *arr" />
      </SettingsRow>
      <SettingsRow label="Conserver la résolution">
        <ToggleSwitch v-model="form.vf_upgrade_protect_resolution" title="Conserver la résolution" />
      </SettingsRow>
      <SettingsRow label="Conserver HDR / Dolby Vision">
        <ToggleSwitch v-model="form.vf_upgrade_preserve_hdr" title="Conserver HDR / Dolby Vision" />
      </SettingsRow>
      <SettingsRow label="Ne pas baisser le score CF">
        <ToggleSwitch v-model="form.vf_upgrade_protect_custom_format_score" title="Ne pas baisser le score CF" />
      </SettingsRow>
      <SettingsRow label="Taille minimale" description="En Go. Vide = aucune limite.">
        <input v-model.number="form.vf_upgrade_min_size_gb" type="number" min="0" step="0.1" placeholder="Aucune">
      </SettingsRow>
      <SettingsRow label="Taille maximale" description="En Go. Vide = aucune limite.">
        <input v-model.number="form.vf_upgrade_max_size_gb" type="number" min="0" step="0.1" placeholder="Aucune">
      </SettingsRow>
      <SettingsRow label="Autoriser une régression technique" description="Uniquement après confirmation manuelle.">
        <ToggleSwitch v-model="form.vf_upgrade_allow_technical_downgrade" title="Autoriser une régression technique" />
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
        <input v-model.number="form.vf_upgrade_search_concurrency" type="number" min="1" max="25">
      </SettingsRow>
      <SettingsRow label="Cadence de lancement" description="Délai (ms) entre le lancement de deux recherches, indépendant de la concurrence. Permet d'empiler plus de recherches en vol sans rafale brutale vers les indexeurs. 0 = désactivé.">
        <input v-model.number="form.vf_upgrade_search_stagger_ms" type="number" min="0" max="60000" step="100">
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
      <SettingsRow label="Prioriser les séries en cours de diffusion" description="Par défaut, l'efficacité prime (season pack d'une série terminée en tête, une seule recherche couvre toute la saison). Activé, les épisodes récents d'une série en cours passent devant.">
        <ToggleSwitch v-model="form.vf_upgrade_prioritize_continuing" title="Prioriser les séries en cours de diffusion" />
      </SettingsRow>
      <SettingsRow label="Fallback épisodique" description="Complète le pack saison par des recherches par épisode pour capter les MULTI sans pack indexé. Pour une série terminée, sert de filet de sécurité ; pour une série en cours, cible les épisodes récemment diffusés.">
        <ToggleSwitch v-model="form.vf_upgrade_episodic_fallback" title="Fallback épisodique" />
      </SettingsRow>
      <SettingsRow label="Épisodes max par saison" description="Plafonne les recherches par épisode générées en fallback, pour qu'une série ne monopolise pas le budget de recherches." :disabled="!form.vf_upgrade_episodic_fallback">
        <input v-model.number="form.vf_upgrade_episodic_fallback_limit" :disabled="!form.vf_upgrade_episodic_fallback" type="number" min="0" max="50">
      </SettingsRow>
      <SettingsRow label="Fenêtre de récence" description="En jours. Pour une série en cours de diffusion, seuls les épisodes diffusés dans cette fenêtre entrent dans le fallback." :disabled="!form.vf_upgrade_episodic_fallback">
        <input v-model.number="form.vf_upgrade_episodic_fallback_days" :disabled="!form.vf_upgrade_episodic_fallback" type="number" min="1" max="365">
      </SettingsRow>
      <SettingsRow label="Cooldown après échec" description="En heures. Double à chaque recherche restée bredouille sur une même cible, pour ne pas la retenter en boucle.">
        <input v-model.number="form.vf_upgrade_no_result_backoff_base_hours" type="number" min="1" max="168">
      </SettingsRow>
      <SettingsRow label="Cooldown maximal après échecs répétés" description="En heures. Plafond du cooldown progressif ci-dessus.">
        <input v-model.number="form.vf_upgrade_no_result_backoff_max_hours" type="number" min="1" max="720">
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Validation et historique" subtitle="Confirme la VF après import et conserve une trace exploitable.">
      <SettingsRow label="Vérifier les pistes après import">
        <ToggleSwitch v-model="form.vf_upgrade_verify_after_import" title="Vérifier les pistes après import" />
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
        <ToggleSwitch v-model="form.vf_upgrade_blacklist_failed" title="Mettre en liste noire une release non validée" />
      </SettingsRow>
      <SettingsRow label="Conservation de l'historique" description="En jours.">
        <input v-model.number="form.vf_upgrade_history_retention_days" type="number" min="1" max="3650">
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Notifications" subtitle="Étapes du cycle d'amélioration qui déclenchent un envoi.">
      <SettingsRow label="Release trouvée">
        <ToggleSwitch v-model="form.vf_upgrade_notify_found" title="Release trouvée" />
      </SettingsRow>
      <SettingsRow label="Acceptée par *arr">
        <ToggleSwitch v-model="form.vf_upgrade_notify_accepted" title="Acceptée par *arr" />
      </SettingsRow>
      <SettingsRow label="Téléchargement démarré">
        <ToggleSwitch v-model="form.vf_upgrade_notify_downloading" title="Téléchargement démarré" />
      </SettingsRow>
      <SettingsRow label="Échec">
        <ToggleSwitch v-model="form.vf_upgrade_notify_failed" title="Échec" />
      </SettingsRow>
      <SettingsRow label="VF validée">
        <ToggleSwitch v-model="form.vf_upgrade_notify_verified" title="VF validée" />
      </SettingsRow>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
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
