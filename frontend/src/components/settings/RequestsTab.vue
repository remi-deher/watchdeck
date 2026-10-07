<template>
  <div class="settings-rows">
    <SettingsSection
      title="Watchlist"
      subtitle="Surveille les watchlists Plex et crée automatiquement les demandes correspondantes."
      status="active"
    >
      <SettingsRow label="Fréquence de synchronisation" description="À quelle fréquence Watchdeck relit la watchlist pour détecter de nouveaux ajouts.">
        <IntervalPresetInput v-model="form.poll_interval_seconds" :presets="presetsFor('poll_interval_seconds')!" />
      </SettingsRow>
      <SettingsRow
        label="Priorité de la source"
        description="Universal Watchlist nécessite un abonnement Plex Pass et agrège les watchlists de tous vos amis Plex sans qu'ils aient besoin de se connecter."
      >
        <UiSelect v-model="form.watchlist_source_priority" :options="[{ value: 'api', label: 'API Plex' }, { value: 'rss', label: 'Universal Watchlist (RSS)' }]" />
      </SettingsRow>
      <SettingsRow
        label="Source de repli"
        description="Si la source prioritaire échoue, Watchdeck bascule automatiquement sur l'autre plutôt que d'ignorer le cycle."
      >
        <ToggleSwitch v-model="form.watchlist_fallback_enabled" title="Source de repli" />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      title="Approbation et quotas"
      subtitle="Ce qu'un utilisateur peut demander, et ce qui attend un administrateur."
      :status="form.require_approval || form.quota_movie_limit || form.quota_show_limit ? 'active' : 'inactive'"
    >
      <SettingsRow
        label="Approbation admin requise"
        description="Chaque nouvelle demande reste en attente de validation avant transmission à Sonarr/Radarr."
      >
        <ToggleSwitch v-model="form.require_approval" title="Approbation admin requise" />
      </SettingsRow>
      <SettingsRow
        label="Quota de films"
        description="Nombre de films qu'un utilisateur peut demander sur la période. Vide ou 0 : illimité. Les administrateurs et modérateurs ne sont jamais limités."
      >
        <UiNumberField v-model="form.quota_movie_limit" :min="0" :max="1000" placeholder="Illimité" aria-label="Quota de films" />
      </SettingsRow>
      <SettingsRow
        label="Quota de séries"
        description="Nombre de séries qu'un utilisateur peut demander sur la période. Vide ou 0 : illimité."
      >
        <UiNumberField v-model="form.quota_show_limit" :min="0" :max="1000" placeholder="Illimité" aria-label="Quota de séries" />
      </SettingsRow>
      <SettingsRow
        label="Période des quotas"
        description="Fenêtre glissante, en jours. Une demande issue de la watchlist au-delà du quota attend la validation d'un administrateur ; dans Découvrir, elle est refusée avec la date de la prochaine place libre."
      >
        <UiNumberField v-model="form.quota_period_days" :min="1" :max="365" aria-label="Période des quotas en jours" />
      </SettingsRow>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import UiNumberField from '@/components/ui/UiNumberField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import { form } from '@/settingsForm';
import { presetsFor } from '@/settingsPresets';
import IntervalPresetInput from './IntervalPresetInput.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';
</script>

<style scoped lang="scss">
.settings-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
