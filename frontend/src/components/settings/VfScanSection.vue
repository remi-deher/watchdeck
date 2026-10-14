<template>
  <!-- Contenu de la section « Analyse VF » des réglages des améliorations : la section porte le titre. -->
  <div class="vf-scan">
    <div class="vf-scan__actions">
      <UiButton @click="vff('/api/vff/scan?force=true')"><ScanSearch />Scanner maintenant</UiButton>
      <UiButton @click="vff('/api/vff/sync-plex')"><RefreshCw />Synchroniser Plex</UiButton>
    </div>

      <ConfigureField
        label="Analyse active"
        help="Désactiver arrête l'analyse VO/VF : la bibliothèque et les notifications ne distingueront plus les langues disponibles."
      >
        <ToggleSwitch v-model="form.vff_enabled" title="Analyse active" />
      </ConfigureField>
      <ConfigureField
        label="Nouvelle analyse"
        help="Fréquence à laquelle un média déjà détecté en VO uniquement est ré-analysé, au cas où la VF aurait été ajoutée depuis."
      >
        <IntervalPresetInput v-model="form.vff_recheck_interval_minutes" :presets="presetsFor('vff_recheck_interval_minutes')!" />
      </ConfigureField>
      <ConfigureField
        label="Recherche automatique"
        help="Relance une recherche Sonarr/Radarr dès qu'un média est détecté en VO uniquement."
      >
        <ToggleSwitch v-model="form.vff_auto_search" title="Recherche automatique" />
      </ConfigureField>
      <ConfigureField
        label="Synchronisation Plex complète"
        help="La bibliothèque est resynchronisée en entier à cette fréquence ; un scan incrémental tourne en continu, voir l'onglet Planification."
      >
        <IntervalPresetInput v-model="form.plex_sync_interval_hours" :presets="presetsFor('plex_sync_interval_hours')!" />
      </ConfigureField>

      <ConfigureField label="Bibliothèques analysées" help="Sélectionnez les bibliothèques Plex à parcourir, et le type de contenu de chacune." stacked>
        <div v-if="plexSectionsLoading" class="notice">Chargement des bibliothèques Plex...</div>
        <div v-else-if="!plexSections.length" class="notice warning-text">
          Aucune bibliothèque Plex trouvée. Vérifiez la connexion Plex ci-dessus.
        </div>
        <div v-else class="vff-library-picker">
          <div v-for="section in plexSections" :key="section.name" class="vff-library-row">
            <label class="check vff-lib-check">
              <UiCheckbox
                :model-value="isLibrarySelected(section.name)"
                @update:model-value="toggleLibrary(section.name, section.type, $event)" />
              <span class="vff-lib-name">{{ section.name }}</span>
              <span class="badge">{{ mediaTypeLabel(section.type) }}</span>
            </label>
            <div v-if="isLibrarySelected(section.name)" class="vff-lib-kind">
              <UiSegmentedControl
                :model-value="getLibraryKind(section.name)"
                :options="LIBRARY_KIND_OPTIONS"
                :ariaLabel="`Type de la bibliothèque ${section.name}`"
                @update:model-value="setLibraryKind(section.name, String($event))"
              />
            </div>
          </div>
        </div>
      </ConfigureField>

      <ConfigureField label="État" help="Dernier résultat des tâches d'analyse et de synchronisation." stacked>
        <!-- Les statuts arrivaient bruts de la base (« running », « idle ») dans une
             interface francaise, et le nombre d'echecs ne menait nulle part alors que
             c'est la seule valeur sur laquelle on veut agir. -->
        <div class="status-stack">
          <span>Scan VF : <StatusBadge v-if="scanStatus.work" :work="scanStatus.work" /><strong v-else>{{ taskStateLabel(scanStatus.status || scanStatus.state) }}</strong></span>
          <span>Synchronisation Plex : <StatusBadge v-if="syncStatus.work" :work="syncStatus.work" /><strong v-else>{{ taskStateLabel(syncStatus.status || syncStatus.state) }}</strong></span>
          <span>Upgrades VF : {{ upgradeMetrics.found || 0 }} trouvé(s) · {{ upgradeMetrics.accepted || 0 }} accepté(s) · {{ upgradeMetrics.verified || 0 }} vérifié(s) ·
            <RouterLink v-if="upgradeMetrics.failed" class="status-failed-link" :to="{ path: '/vf-upgrades', query: { status: 'failed' } }">{{ upgradeMetrics.failed }} échec(s)</RouterLink>
            <template v-else>0 échec</template>
          </span>
        </div>
      </ConfigureField>
  </div>
</template>

<script setup lang="ts">
import StatusBadge from '@/components/ui/StatusBadge.vue';
import UiCheckbox from '@/components/ui/UiCheckbox.vue';
import UiSegmentedControl from '@/components/ui/UiSegmentedControl.vue';

const LIBRARY_KIND_OPTIONS = [
  { value: 'series', label: 'Série' },
  { value: 'movie', label: 'Film' },
  { value: 'music', label: 'Musique' },
];
import UiButton from '@/components/ui/UiButton.vue';
import { RouterLink } from 'vue-router';

/** Etat d'une tache de fond, dans la langue de l'interface. */
const TASK_STATE_LABELS: Record<string, string> = {
  running: 'en cours',
  idle: 'en veille',
  queued: 'en file d’attente',
  failed: 'en échec',
  error: 'en échec',
  success: 'terminé',
  done: 'terminé',
  never: 'jamais exécuté',
};
function taskStateLabel(state?: string | null): string {
  if (!state) return 'inconnu';
  return TASK_STATE_LABELS[String(state).toLowerCase()] || String(state);
}

import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { vfUpgradeMetricsQuery, vffScanStatusQuery, vffSyncStatusQuery } from '@/sharedQueries';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import { RefreshCw, ScanSearch } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { form } from '@/settingsForm';
import { presetsFor } from '@/settingsPresets';
import { mediaTypeLabel } from '@/utils/labels';
import IntervalPresetInput from './IntervalPresetInput.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';


const queryClient = useQueryClient();
const plexSectionsQuery = useQuery({ queryKey: ['settings', 'plex-sections'], queryFn: () => api<any[]>('/api/plex/sections') });
const plexSections = computed(() => plexSectionsQuery.data.value || []);
const plexSectionsLoading = computed(() => plexSectionsQuery.isFetching.value);

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

const scanQuery = useQuery(vffScanStatusQuery());
const syncQuery = useQuery(vffSyncStatusQuery());
const metricsQuery = useQuery(vfUpgradeMetricsQuery());
const scanStatus = computed<Record<string, any>>(() => scanQuery.data.value || {});
const syncStatus = computed<Record<string, any>>(() => syncQuery.data.value || {});
const upgradeMetrics = computed<Record<string, any>>(() => metricsQuery.data.value || {});
const vffMutation = useMutation({
  mutationFn: (path: string) => api(path, { method: 'POST' }),
  retry: 0,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'vff'] }),
});
async function vff(path: string): Promise<void> {
  await vffMutation.mutateAsync(path);
}

useRealtime(['vff.updated'], () => queryClient.invalidateQueries({ queryKey: ['settings', 'vff'] }));
</script>

<style scoped lang="scss">
/* --- VFF Library Picker --- */
.vff-library-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.vff-library-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: rgb(var(--ink) / 0.03);
  border: 1px solid rgb(var(--ink) / 0.06);
  flex-wrap: wrap;
  transition: background var(--motion-duration-instant);
}

.vff-library-row:hover {
  background: rgb(var(--ink) / 0.05);
}

.vff-lib-check {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.vff-lib-name {
  font-size: var(--fs-sm);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vff-lib-kind {
  margin-left: auto;
}

.vf-scan { display: grid; gap: var(--space-4); }
.vf-scan__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.status-failed-link {
  color: var(--red-text);
  font-weight: 700;
}
</style>
