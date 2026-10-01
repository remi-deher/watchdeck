<template>
  <div class="settings-grid">
    <div class="settings-cards span-two">
      <SettingsCard title="Règles torrent" subtitle="Quand marquer un média disponible, et comment filtrer/nettoyer les torrents recherchés automatiquement." :icon="Magnet" status="active" :collapsible="false">
        <label>Confirmation de disponibilite
          <UiSelect v-model="form.availability_confirmation_mode" :options="[{ value: 'arr', label: 'Import Sonarr/Radarr' }, { value: 'plex', label: 'Presence Plex obligatoire' }, { value: 'hybrid', label: 'Hybride : Plex puis repli *arr' }]" />
          <small>Détermine quand une demande passe "disponible" : dès l'import Sonarr/Radarr (rapide mais peut devancer le scan Plex), uniquement quand Plex confirme réellement le média (fiable mais parfois en retard), ou hybride — attend Plex, puis fait confiance a *arr après le delai ci-dessous.</small>
        </label>
        <label v-if="form.availability_confirmation_mode === 'hybrid'">Delai du repli *arr (minutes)
          <UiNumberField v-model="form.availability_confirmation_timeout_minutes" :min="1" />
          <small>Temps d'attente d'une confirmation Plex avant de considérer le média disponible sur la seule foi de l'import Sonarr/Radarr.</small>
        </label>
        <label>Mots requis<input v-model="form.torrent_required_keywords"><small>Liste séparée par des virgules : une release doit contenir au moins un de ces mots pour être retenue automatiquement (ex. "multi, vf, french").</small></label>
        <label>Mots interdits<input v-model="form.torrent_forbidden_keywords"><small>Liste séparée par des virgules : toute release contenant un de ces mots est écartée automatiquement (ex. "cam, ts, vostfr").</small></label>
        <label>Taille minimale (Go)<UiNumberField v-model="form.torrent_min_size_gb" /><small>Releases plus petites écartées — utile pour éviter les fichiers incomplets ou de très basse qualité.</small></label>
        <label>Taille maximale (Go)<UiNumberField v-model="form.torrent_max_size_gb" /><small>Releases plus grosses écartées — utile pour éviter les remux trop volumineux.</small></label>
        <label>Ratio limite<UiNumberField v-model="form.torrent_ratio_limit" :step="0.1" /><small>Une fois ce ratio de partage atteint, le torrent est retiré du client de téléchargement.</small></label>
        <label>Durée de seed (h)<UiNumberField v-model="form.torrent_seed_time_limit_hours" /><small>Une fois cette durée de seed atteinte, le torrent est retiré même si le ratio n'est pas atteint.</small></label>
        <UiCheckboxField v-model="form.auto_import_reconciliation" label="Rapprocher automatiquement les imports bloques" />
        <small class="check-hint">Quand Sonarr ou Radarr termine un téléchargement sans réussir à le rattacher à son média, l'application tente l'import à votre place — uniquement si le fichier est bien livré, que *arr attend un import, et qu'un seul fichier et une seule cible sont possibles. Dans tous les autres cas (torrent sans source, plusieurs fichiers, épisode ambigu), l'element reste en attente et l'alerte part comme avant. Reglable média par média depuis sa fiche.</small>
        <UiCheckboxField v-model="form.torrent_auto_delete_files" label="Supprimer les fichiers apres seed, uniquement apres verification Plex" />
        <small class="check-hint">Supprime aussi les fichiers téléchargés (pas seulement l'entrée dans le client) une fois le ratio/la durée de seed atteint — mais seulement après confirmation que le média est bien présent dans Plex, pour ne jamais supprimer un fichier pas encore importe.</small>
      </SettingsCard>
    </div>
  </div>
</template>
<script setup lang="ts">
import UiSelect from '@/components/ui/UiSelect.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';
import { Magnet } from '@lucide/vue';
import { form } from '@/settingsForm';
import SettingsCard from './SettingsCard.vue';
</script>
