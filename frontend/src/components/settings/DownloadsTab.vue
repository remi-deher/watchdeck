<template>
  <div class="settings-rows">
    <SettingsSection title="Disponibilité" subtitle="Quand une demande passe « disponible »." status="active">
      <SettingsRow
        label="Confirmation de disponibilité"
        description="Import Sonarr/Radarr (rapide, mais peut devancer le scan Plex), présence Plex (fiable, parfois en retard), ou hybride : attend Plex, puis fait confiance à *arr après le délai ci-dessous."
      >
        <UiSelect v-model="form.availability_confirmation_mode" :options="[{ value: 'arr', label: 'Import Sonarr/Radarr' }, { value: 'plex', label: 'Présence Plex obligatoire' }, { value: 'hybrid', label: 'Hybride : Plex puis repli *arr' }]" />
      </SettingsRow>
      <SettingsRow
        v-if="form.availability_confirmation_mode === 'hybrid'"
        label="Délai du repli *arr"
        description="En minutes : attente d'une confirmation Plex avant de se fier au seul import Sonarr/Radarr."
      >
        <UiNumberField v-model="form.availability_confirmation_timeout_minutes" :min="1" aria-label="Délai du repli *arr en minutes" />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Filtres de release" subtitle="Ce que la recherche automatique retient ou écarte.">
      <SettingsRow label="Mots requis" description="Séparés par des virgules : une release doit contenir au moins un de ces mots (ex. multi, vf, french)." label-for="torrent-required-keywords">
        <input id="torrent-required-keywords" v-model="form.torrent_required_keywords" placeholder="multi, vf, french">
      </SettingsRow>
      <SettingsRow label="Mots interdits" description="Séparés par des virgules : toute release qui en contient un est écartée (ex. cam, ts, vostfr)." label-for="torrent-forbidden-keywords">
        <input id="torrent-forbidden-keywords" v-model="form.torrent_forbidden_keywords" placeholder="cam, ts, vostfr">
      </SettingsRow>
      <SettingsRow label="Taille minimale" description="En Go. Évite les fichiers incomplets ou de très basse qualité.">
        <UiNumberField v-model="form.torrent_min_size_gb" aria-label="Taille minimale en Go" />
      </SettingsRow>
      <SettingsRow label="Taille maximale" description="En Go. Évite les remux trop volumineux.">
        <UiNumberField v-model="form.torrent_max_size_gb" aria-label="Taille maximale en Go" />
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Seed et nettoyage" subtitle="Le torrent est retiré du client de téléchargement au premier seuil atteint.">
      <SettingsRow label="Ratio limite" description="Ratio de partage à partir duquel le torrent est retiré.">
        <UiNumberField v-model="form.torrent_ratio_limit" :step="0.1" aria-label="Ratio limite" />
      </SettingsRow>
      <SettingsRow label="Durée de seed" description="En heures : le torrent est retiré même si le ratio n'est pas atteint.">
        <UiNumberField v-model="form.torrent_seed_time_limit_hours" aria-label="Durée de seed en heures" />
      </SettingsRow>
      <SettingsRow
        label="Rapprocher les imports bloqués"
        description="Quand Sonarr ou Radarr termine un téléchargement sans le rattacher à son média, Watchdeck tente l'import, uniquement si un seul fichier et une seule cible sont possibles. Sinon l'élément reste en attente et l'alerte part. Réglable média par média depuis sa fiche."
      >
        <ToggleSwitch v-model="form.auto_import_reconciliation" title="Rapprocher les imports bloqués" />
      </SettingsRow>
      <SettingsRow
        label="Supprimer les fichiers après seed"
        description="Supprime aussi les fichiers téléchargés une fois le seed terminé, seulement après confirmation que le média est présent dans Plex."
      >
        <ToggleSwitch v-model="form.torrent_auto_delete_files" title="Supprimer les fichiers après seed" />
      </SettingsRow>
    </SettingsSection>
  </div>
</template>
<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import { form } from '@/settingsForm';
import SettingsSection from './SettingsSection.vue';
import SettingsRow from './SettingsRow.vue';
</script>
