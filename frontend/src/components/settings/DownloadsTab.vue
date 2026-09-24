<template>
  <div class="settings-grid">
    <div class="settings-cards span-two">
      <SettingsCard title="Regles torrent" subtitle="Quand marquer un media disponible, et comment filtrer/nettoyer les torrents recherches automatiquement." :icon="Magnet" status="active" :collapsible="false">
        <label>Confirmation de disponibilite
          <UiSelect v-model="form.availability_confirmation_mode" :options="[{ value: 'arr', label: 'Import Sonarr/Radarr' }, { value: 'plex', label: 'Presence Plex obligatoire' }, { value: 'hybrid', label: 'Hybride : Plex puis repli *arr' }]" />
          <small>Determine quand une demande passe "disponible" : des l'import Sonarr/Radarr (rapide mais peut devancer le scan Plex), uniquement quand Plex confirme reellement le media (fiable mais parfois en retard), ou hybride — attend Plex, puis fait confiance a *arr apres le delai ci-dessous.</small>
        </label>
        <label v-if="form.availability_confirmation_mode === 'hybrid'">Delai du repli *arr (minutes)
          <UiNumberField v-model="form.availability_confirmation_timeout_minutes" :min="1" />
          <small>Temps d'attente d'une confirmation Plex avant de considerer le media disponible sur la seule foi de l'import Sonarr/Radarr.</small>
        </label>
        <label>Mots requis<input v-model="form.torrent_required_keywords"><small>Liste separee par des virgules : une release doit contenir au moins un de ces mots pour etre retenue automatiquement (ex. "multi, vf, french").</small></label>
        <label>Mots interdits<input v-model="form.torrent_forbidden_keywords"><small>Liste separee par des virgules : toute release contenant un de ces mots est ecartee automatiquement (ex. "cam, ts, vostfr").</small></label>
        <label>Taille minimale (Go)<UiNumberField v-model="form.torrent_min_size_gb" /><small>Releases plus petites ecartees — utile pour eviter les fichiers incomplets ou de tres basse qualite.</small></label>
        <label>Taille maximale (Go)<UiNumberField v-model="form.torrent_max_size_gb" /><small>Releases plus grosses ecartees — utile pour eviter les remux trop volumineux.</small></label>
        <label>Ratio limite<UiNumberField v-model="form.torrent_ratio_limit" :step="0.1" /><small>Une fois ce ratio de partage atteint, le torrent est retire du client de telechargement.</small></label>
        <label>Duree de seed (h)<UiNumberField v-model="form.torrent_seed_time_limit_hours" /><small>Une fois cette duree de seed atteinte, le torrent est retire meme si le ratio n'est pas atteint.</small></label>
        <UiCheckboxField v-model="form.auto_import_reconciliation" label="Rapprocher automatiquement les imports bloques" />
        <small class="check-hint">Quand Sonarr ou Radarr termine un telechargement sans reussir a le rattacher a son media, l'application tente l'import a votre place — uniquement si le fichier est bien livre, que *arr attend un import, et qu'un seul fichier et une seule cible sont possibles. Dans tous les autres cas (torrent sans source, plusieurs fichiers, episode ambigu), l'element reste en attente et l'alerte part comme avant. Reglable media par media depuis sa fiche.</small>
        <UiCheckboxField v-model="form.torrent_auto_delete_files" label="Supprimer les fichiers apres seed, uniquement apres verification Plex" />
        <small class="check-hint">Supprime aussi les fichiers telecharges (pas seulement l'entree dans le client) une fois le ratio/la duree de seed atteint — mais seulement apres confirmation que le media est bien present dans Plex, pour ne jamais supprimer un fichier pas encore importe.</small>
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
