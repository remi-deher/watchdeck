<template>
  <div class="settings-rows">
    <SettingsSection
      title="Watchlist"
      subtitle="Surveille les watchlists Plex et crée automatiquement les demandes correspondantes."
      status="active"
    >
      <SettingsRow label="Fréquence de synchronisation" description="À quelle fréquence Watchdeck relit la watchlist pour détecter de nouveaux ajouts.">
        <IntervalPresetInput v-model="form.poll_interval_seconds" :presets="WATCHLIST_PRESETS" />
      </SettingsRow>
      <SettingsRow
        label="Priorité de la source"
        description="Universal Watchlist nécessite un abonnement Plex Pass et agrège les watchlists de tous tes amis Plex sans qu'ils aient besoin de se connecter."
      >
        <select v-model="form.watchlist_source_priority">
          <option value="api">API Plex</option>
          <option value="rss">Universal Watchlist (RSS)</option>
        </select>
      </SettingsRow>
      <SettingsRow
        label="Source de repli"
        description="Si la source prioritaire échoue, Watchdeck bascule automatiquement sur l'autre plutôt que d'ignorer le cycle."
      >
        <input v-model="form.watchlist_fallback_enabled" type="checkbox">
      </SettingsRow>
      <SettingsRow
        label="Approbation admin requise"
        description="Chaque nouvelle demande reste en attente de validation avant transmission à Sonarr/Radarr."
      >
        <input v-model="form.require_approval" type="checkbox">
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      title="Analyse VF"
      subtitle="Détecte automatiquement la présence d'une piste VF dans les fichiers Plex, et synchronise la bibliothèque musique sans analyse VF."
      :status="form.vff_enabled ? 'active' : 'inactive'"
    >
      <template #actions>
        <button class="secondary" @click="vff('/api/vff/scan?force=true')"><ScanSearch />Scanner maintenant</button>
        <button class="secondary" @click="vff('/api/vff/sync-plex')"><RefreshCw />Synchroniser Plex</button>
      </template>

      <SettingsRow
        label="Analyse active"
        description="Désactiver arrête l'analyse VO/VF : la bibliothèque et les notifications ne distingueront plus les langues disponibles."
      >
        <input v-model="form.vff_enabled" type="checkbox">
      </SettingsRow>
      <SettingsRow
        label="Nouvelle analyse"
        description="Fréquence à laquelle un média déjà détecté en VO uniquement est ré-analysé, au cas où la VF aurait été ajoutée depuis."
      >
        <IntervalPresetInput v-model="form.vff_recheck_interval_minutes" :presets="MINUTES_PRESETS" />
      </SettingsRow>
      <SettingsRow
        label="Recherche automatique"
        description="Relance une recherche Sonarr/Radarr dès qu'un média est détecté en VO uniquement."
      >
        <input v-model="form.vff_auto_search" type="checkbox">
      </SettingsRow>
      <SettingsRow
        label="Synchronisation Plex complète"
        description="La bibliothèque est resynchronisée en entier à cette fréquence ; un scan incrémental tourne en continu, voir l'onglet Planification."
      >
        <IntervalPresetInput v-model="form.plex_sync_interval_hours" :presets="PLEX_SYNC_PRESETS" />
      </SettingsRow>

      <SettingsRow label="Bibliothèques analysées" description="Sélectionne les bibliothèques Plex à parcourir, et le type de contenu de chacune." block>
        <div v-if="plexSectionsLoading" class="notice">Chargement des bibliothèques Plex...</div>
        <div v-else-if="!plexSections.length" class="notice warning-text">
          Aucune bibliothèque Plex trouvée. Vérifiez la connexion Plex ci-dessus.
        </div>
        <div v-else class="vff-library-picker">
          <div v-for="section in plexSections" :key="section.name" class="vff-library-row">
            <label class="check vff-lib-check">
              <input
                type="checkbox"
                :checked="isLibrarySelected(section.name)"
                @change="toggleLibrary(section.name, section.type, ($event.target as HTMLInputElement).checked)"
              >
              <span class="vff-lib-name">{{ section.name }}</span>
              <span class="badge">{{ mediaTypeLabel(section.type) }}</span>
            </label>
            <div v-if="isLibrarySelected(section.name)" class="vff-lib-kind">
              <div class="segmented small">
                <button :class="{ active: getLibraryKind(section.name) === 'series' }" @click="setLibraryKind(section.name, 'series')">Série</button>
                <button :class="{ active: getLibraryKind(section.name) === 'movie' }" @click="setLibraryKind(section.name, 'movie')">Film</button>
                <button :class="{ active: getLibraryKind(section.name) === 'music' }" @click="setLibraryKind(section.name, 'music')">Musique</button>
              </div>
            </div>
          </div>
        </div>
      </SettingsRow>

      <SettingsRow label="État" description="Dernier résultat des tâches d'analyse et de synchronisation." block>
        <div class="status-stack">
          <span>Scan VF : {{ scanStatus.status || scanStatus.state || 'inconnu' }}</span>
          <span>Synchronisation Plex : {{ syncStatus.status || syncStatus.state || 'inconnue' }}</span>
          <span>Upgrades VF : {{ upgradeMetrics.found || 0 }} trouvé(s) · {{ upgradeMetrics.accepted || 0 }} accepté(s) · {{ upgradeMetrics.verified || 0 }} vérifié(s) · {{ upgradeMetrics.failed || 0 }} échec(s)</span>
        </div>
      </SettingsRow>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RefreshCw, ScanSearch } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { form } from '@/settingsForm';
import { mediaTypeLabel } from '@/utils/labels';
import IntervalPresetInput from './IntervalPresetInput.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';

const WATCHLIST_PRESETS = [
  { label: '30 secondes', value: 30 },
  { label: '45 secondes', value: 45 },
  { label: '1 minute', value: 60 },
  { label: '2 minutes', value: 120 },
  { label: '5 minutes', value: 300 },
];
const MINUTES_PRESETS = [
  { label: '10 minutes', value: 10 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 heure', value: 60 },
  { label: '3 heures', value: 180 },
  { label: '6 heures', value: 360 },
  { label: '12 heures', value: 720 },
  { label: '24 heures', value: 1440 },
];
const PLEX_SYNC_PRESETS = [
  { label: '1 heure', value: 1 },
  { label: '2 heures', value: 2 },
  { label: '3 heures', value: 3 },
  { label: '4 heures', value: 4 },
  { label: '6 heures', value: 6 },
  { label: '8 heures', value: 8 },
  { label: '12 heures', value: 12 },
  { label: '24 heures', value: 24 },
  { label: '48 heures', value: 48 },
  { label: '72 heures', value: 72 },
];

const plexSections = ref<any[]>([]);
const plexSectionsLoading = ref(false);
async function loadPlexSections(): Promise<void> {
  plexSectionsLoading.value = true;
  try { plexSections.value = await api('/api/plex/sections'); }
  catch (e) { plexSections.value = []; }
  finally { plexSectionsLoading.value = false; }
}

const vffLibraryList = computed({
  get(): any[] { try { const raw = form.vff_libraries; if (!raw) return []; const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; } },
  set(arr: any[]) { form.vff_libraries = JSON.stringify(arr); },
});
function isLibrarySelected(name: string): boolean { return vffLibraryList.value.some((x: any) => x.name === name); }
function getLibraryKind(name: string): string { return vffLibraryList.value.find((x: any) => x.name === name)?.kind || 'series'; }
function toggleLibrary(name: string, plexType: string, checked: boolean): void {
  const list = [...vffLibraryList.value];
  if (checked) { const defaultKind = ({ show: 'series', artist: 'music' } as Record<string, string>)[plexType] || 'movie'; list.push({ name, kind: defaultKind }); }
  else { const idx = list.findIndex((x: any) => x.name === name); if (idx >= 0) list.splice(idx, 1); }
  vffLibraryList.value = list;
}
function setLibraryKind(name: string, kind: string): void { const list = [...vffLibraryList.value]; const entry = list.find((x: any) => x.name === name); if (entry) entry.kind = kind; vffLibraryList.value = list; }

const scanStatus = ref<Record<string, any>>({});
const syncStatus = ref<Record<string, any>>({});
const upgradeMetrics = ref<Record<string, any>>({});
async function loadVffStatus(): Promise<void> {
  [scanStatus.value, syncStatus.value, upgradeMetrics.value] = await Promise.all([
    api('/api/vff/scan-status').catch(() => ({})),
    api('/api/vff/sync-status').catch(() => ({})),
    api('/api/vf-upgrades/metrics').catch(() => ({})),
  ]);
}
async function vff(path: string): Promise<void> {
  await api(path, { method: 'POST' });
}

onMounted(() => { loadPlexSections(); loadVffStatus(); });
useRealtime(['vff.updated'], () => loadVffStatus());
</script>

<style scoped lang="scss">
.settings-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
