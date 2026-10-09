<template>
  <!-- Bibliotheques FileFlows : flow associe, activation, scan, alternance par disque et
       correspondance avec un dossier Plex (utilisee pour la pause pendant les lectures). -->
  <EncodingShell title="Bibliothèques">
    <UiFeedback v-if="librariesQuery.isError.value" type="error" :message="humanizeError(librariesQuery.error.value)" />
    <p v-else-if="librariesQuery.isPending.value" class="libs-muted">Chargement des bibliothèques…</p>
    <template v-else>
      <div class="libs-toolbar">
        <UiChipGroup label="Afficher" :options="viewOptions" :model-value="view" @update:model-value="(value) => (view = String(value))" />
        <UiButton size="sm" :loading="reorderMutation.isPending.value" @click="reorderMutation.mutate()"><ListRestart />Réordonner la file maintenant</UiButton>
      </div>

      <article v-for="lib in shown" :key="lib.uid" class="lib" :class="{ 'is-off': !lib.enabled }">
        <header class="lib-head">
          <div class="lib-name">
            <strong>{{ lib.name }}</strong>
            <small>{{ lib.path }} · disque {{ lib.disk }}</small>
          </div>
          <span class="lib-waiting">{{ lib.waiting }} en attente</span>
          <ToggleSwitch :model-value="lib.enabled" :label="lib.enabled ? 'Activée' : 'Désactivée'" @update:model-value="(value: boolean) => patch(lib, { enabled: value })" />
        </header>

        <div class="lib-grid">
          <label class="lib-field">
            <span>Flow</span>
            <UiSelect :model-value="lib.flow.uid" :options="flowOptions" aria-label="Flow de la bibliothèque" @update:model-value="(value: string) => changeFlow(lib, value)" />
          </label>
          <label class="lib-field">
            <span>Dossier Plex correspondant</span>
            <UiSelect :model-value="plexValue(lib)" :options="plexOptions(lib)" aria-label="Dossier Plex correspondant" @update:model-value="(value: string) => setPlex(lib, value)" />
            <small v-if="!lib.plex_location_confirmed && lib.plex_location">Proposé automatiquement</small>
            <small v-else-if="!lib.plex_location">Pas concernée par la pause pendant les lectures</small>
          </label>
        </div>

        <footer class="lib-foot">
          <UiCheckboxField :model-value="lib.reorder" label="Inclure dans l'alternance par disque" @update:model-value="(value: boolean) => patch(lib, { reorder: value })" />
          <span v-if="lib.shared_disk" class="lib-note"><Info aria-hidden="true" />Disque partagé avec une autre bibliothèque active : un seul traitement à la fois grâce au verrou.</span>
          <span class="lib-spacer" />
          <small v-if="lib.last_scanned" class="libs-muted">Scannée {{ formatRelativeDate(lib.last_scanned) }}</small>
          <UiButton size="sm" :loading="rescanMutation.isPending.value && rescanMutation.variables.value === lib.uid" @click="rescanMutation.mutate(lib.uid)"><RefreshCw />Scanner</UiButton>
        </footer>
      </article>
    </template>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Info, ListRestart, RefreshCw } from '@lucide/vue';
import { api } from '@/api';
import { useConfirm } from '@/composables/useConfirm';
import { useFileflowsStatus } from '@/composables/useFileflows';
import { useToast } from '@/composables/useToast';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import { formatRelativeDate } from '@/utils/format';
import ConfirmModal from '@/components/ConfirmModal.vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiChipGroup from '@/components/ui/UiChipGroup.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import EncodingShell from '@/components/encoding/EncodingShell.vue';

interface Library {
  uid: string; name: string; path: string; disk: string; enabled: boolean;
  flow: { uid: string | null; name: string | null }; waiting: number; last_scanned: string | null;
  reorder: boolean; plex_location: string | null; plex_location_confirmed: boolean;
  plex_location_suggested: string | null; shared_disk: boolean;
}
interface Flow { uid: string; name: string; used_by: string[] }
interface LibrariesPayload { libraries: Library[]; flows: Flow[]; plex_locations: Array<{ server: string; library: string; path: string }> }

const LIBS_KEY = [...queryKeys.fileflows.all, 'libraries'] as const;
const AUTO = '__auto__';
const NONE = '__none__';
const queryClient = useQueryClient();
const { addToast } = useToast();
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const { status } = useFileflowsStatus();

const librariesQuery = useQuery({
  queryKey: LIBS_KEY,
  queryFn: ({ signal }) => api<LibrariesPayload>('/api/fileflows/libraries', { signal }),
  enabled: computed(() => Boolean(status.value?.connected)),
  staleTime: 15_000,
});
const data = computed(() => librariesQuery.data.value || null);

const view = ref('active');
const viewOptions = computed(() => [
  { value: 'active', label: `Activées (${(data.value?.libraries || []).filter((l) => l.enabled).length})` },
  { value: 'all', label: `Toutes (${(data.value?.libraries || []).length})` },
]);
const shown = computed(() => (data.value?.libraries || []).filter((lib) => view.value === 'all' || lib.enabled));

const flowOptions = computed(() => (data.value?.flows || []).map((flow) => ({ value: flow.uid, label: flow.name })));
function plexValue(lib: Library): string {
  if (!lib.plex_location_confirmed) return AUTO;
  return lib.plex_location || NONE;
}
function plexOptions(lib: Library) {
  const suggested = lib.plex_location_suggested;
  return [
    { value: AUTO, label: suggested ? `Automatique (${suggested})` : 'Automatique (aucune proposition)' },
    { value: NONE, label: 'Aucun : pas de pause pour cette bibliothèque' },
    ...(data.value?.plex_locations || []).map((loc) => ({ value: loc.path, label: `${loc.library} · ${loc.path}`, group: loc.server })),
  ];
}

function refresh(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.all });
}

const patchMutation = useMutation({
  mutationFn: ({ uid, body }: { uid: string; body: Record<string, unknown> }) => api(`/api/fileflows/libraries/${uid}`, { method: 'PATCH', body: JSON.stringify(body) }),
  onSuccess: () => { addToast({ type: 'success', message: 'Bibliothèque mise à jour' }); refresh(); },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
function patch(lib: Library, body: Record<string, unknown>): void {
  patchMutation.mutate({ uid: lib.uid, body });
}
/* Changer de flow change le traitement de tous les fichiers a venir de la bibliotheque. */
async function changeFlow(lib: Library, flowUid: string): Promise<void> {
  if (flowUid === lib.flow.uid) return;
  const flow = data.value?.flows.find((f) => f.uid === flowUid);
  const ok = await askConfirm({
    title: 'Changer le flow ?',
    message: `Les prochains fichiers de « ${lib.name} » seront traités par « ${flow?.name || 'ce flow'} ». Les fichiers déjà traités ne sont pas repris.`,
    confirmLabel: 'Changer le flow',
  });
  if (ok) patch(lib, { flow_uid: flowUid });
}

const plexMutation = useMutation({
  mutationFn: ({ uid, path }: { uid: string; path: string | null }) => api(`/api/fileflows/libraries/${uid}/plex-location`, { method: 'PUT', body: JSON.stringify({ path }) }),
  onSuccess: () => { addToast({ type: 'success', message: 'Correspondance enregistrée' }); refresh(); },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
function setPlex(lib: Library, value: string): void {
  plexMutation.mutate({ uid: lib.uid, path: value === AUTO ? null : value === NONE ? '' : value });
}

const rescanMutation = useMutation({
  mutationFn: (uid: string) => api(`/api/fileflows/libraries/${uid}/rescan`, { method: 'POST' }),
  onSuccess: () => addToast({ type: 'success', message: 'Scan lancé' }),
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
const reorderMutation = useMutation({
  mutationFn: () => api<{ message?: string }>('/api/fileflows/reorder/run', { method: 'POST' }),
  onSuccess: (result) => { addToast({ type: 'success', message: result.message || 'File réordonnée' }); refresh(); },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.libs-muted { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.libs-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.lib { display: grid; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
.lib.is-off { background: var(--surface-2); }
.lib-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.lib-name { display: grid; flex: 1; min-width: 200px; gap: 2px; }
.lib-name small, .lib-waiting { color: var(--muted); font-size: var(--fs-xs); }
.lib-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.lib-field { display: grid; gap: 4px; font-size: var(--fs-sm); }
.lib-field > span { color: var(--muted); font-size: var(--fs-xs); }
.lib-field small { color: var(--muted); font-size: var(--fs-xs); }
.lib-foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
.lib-note { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: var(--fs-xs); }
.lib-note svg { width: 14px; height: 14px; }
.lib-spacer { flex: 1; }
@include bp.until(tablet) { .lib-grid { grid-template-columns: 1fr; } }
</style>
