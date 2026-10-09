<template>
  <!-- Bibliotheques FileFlows (gabarit Configurer) : chacune s'active, se scanne et se
       modifie (flow, dossier Plex correspondant, alternance) dans la fenetre commune. Les
       changements s'appliquent aussitot : rien a enregistrer pour la page. -->
  <EncodingShell title="Bibliothèques">
    <UiFeedback v-if="librariesQuery.isError.value" type="error" :message="humanizeError(librariesQuery.error.value)" />
    <ConfigureTemplate v-else :sections="SECTIONS">
      <template #section-libraries>
        <p v-if="librariesQuery.isPending.value" class="libs-muted">Chargement des bibliothèques…</p>
        <ResourceList v-else :resources="resources" empty-text="Aucune bibliothèque dans FileFlows." @toggle="(r, on) => patch(r.key, { enabled: on })" @action="onAction" @edit="openEdit" />
      </template>
      <template #section-order>
        <ConfigureField label="Réordonner la file maintenant" help="Sans attendre le prochain passage du pilotage (chaque minute).">
          <UiButton size="sm" :loading="reorderMutation.isPending.value" @click="reorderMutation.mutate()"><ListRestart />Réordonner</UiButton>
        </ConfigureField>
      </template>
    </ConfigureTemplate>
    <CreateTemplate v-if="editing" open mode="edit" :definition="editing.definition" :values="editing.values" @close="editing = null" @created="refresh" />
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ListRestart, RefreshCw } from '@lucide/vue';
import { api } from '@/api';
import { useFileflowsStatus } from '@/composables/useFileflows';
import { useToast } from '@/composables/useToast';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import { formatRelativeDate } from '@/utils/format';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import EncodingShell from '@/components/encoding/EncodingShell.vue';
import ConfigureTemplate, { type ConfigureResource, type ResourceTone } from '@/components/templates/ConfigureTemplate.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';
import ResourceList from '@/components/templates/configure/ResourceList.vue';
import CreateTemplate, { type CreateDefinition, type CreateValues } from '@/components/templates/CreateTemplate.vue';
import { PLEX_AUTO, PLEX_NONE, fileflowsLibraryEdit } from '@/creations/fileflowsLibrary';

interface Library {
  uid: string; name: string; path: string; disk: string; enabled: boolean;
  flow: { uid: string | null; name: string | null }; waiting: number; last_scanned: string | null;
  reorder: boolean; plex_location: string | null; plex_location_confirmed: boolean;
  plex_location_suggested: string | null; shared_disk: boolean;
}
interface Flow { uid: string; name: string; used_by: string[] }
interface LibrariesPayload { libraries: Library[]; flows: Flow[]; plex_locations: Array<{ server: string; library: string; path: string }> }

const LIBS_KEY = [...queryKeys.fileflows.all, 'libraries'] as const;
const queryClient = useQueryClient();
const { addToast } = useToast();
const { status } = useFileflowsStatus();

const librariesQuery = useQuery({
  queryKey: LIBS_KEY,
  queryFn: ({ signal }) => api<LibrariesPayload>('/api/fileflows/libraries', { signal }),
  enabled: computed(() => Boolean(status.value?.connected)),
  staleTime: 15_000,
});
const data = computed(() => librariesQuery.data.value || null);

const SECTIONS = [
  { key: 'libraries', title: 'Bibliothèques', description: 'Ce que FileFlows traite, avec quel flow, et la correspondance avec Plex.' },
  { key: 'order', title: 'Alternance', description: 'Les bibliothèques cochées passent à tour de rôle, disque par disque.' },
];

/* Etat de la correspondance Plex, en une ligne. */
function plexState(lib: Library): { tone: ResourceTone; text: string } {
  if (lib.plex_location_confirmed && lib.plex_location) return { tone: 'ok', text: 'Correspondance Plex' };
  if (lib.plex_location_confirmed) return { tone: 'off', text: 'Pas de pause lecture' };
  if (lib.plex_location_suggested) return { tone: 'warn', text: 'Correspondance proposée' };
  return { tone: 'warn', text: 'Pas de correspondance' };
}
const resources = computed<ConfigureResource[]>(() => [...(data.value?.libraries || [])]
  .sort((a, b) => Number(b.enabled) - Number(a.enabled))
  .map((lib) => ({
    key: lib.uid,
    label: lib.name,
    subtitle: [lib.flow.name || 'Aucun flow', `disque ${lib.disk}`, `${lib.waiting} en attente`, lib.reorder ? 'alternance' : null, lib.shared_disk ? 'disque partagé' : null, lib.last_scanned ? `scannée ${formatRelativeDate(lib.last_scanned)}` : null].filter(Boolean).join(' · '),
    enabled: lib.enabled,
    state: plexState(lib),
    actions: [{ key: 'rescan', label: 'Scanner', icon: RefreshCw, loading: rescanMutation.isPending.value && rescanMutation.variables.value === lib.uid }],
  })));

const editing = ref<{ definition: CreateDefinition; values: CreateValues } | null>(null);
function openEdit(resource: ConfigureResource): void {
  const lib = data.value?.libraries.find((entry) => entry.uid === resource.key);
  if (!lib || !data.value) return;
  editing.value = {
    definition: fileflowsLibraryEdit(lib.uid, lib.name, { flows: data.value.flows, plexLocations: data.value.plex_locations, suggested: lib.plex_location_suggested }),
    values: { flow_uid: lib.flow.uid || '', plex: !lib.plex_location_confirmed ? PLEX_AUTO : (lib.plex_location || PLEX_NONE), reorder: lib.reorder },
  };
}
function onAction(resource: ConfigureResource, key: string): void {
  if (key === 'rescan') rescanMutation.mutate(resource.key);
}

function refresh(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.all });
}

const patchMutation = useMutation({
  mutationFn: ({ uid, body }: { uid: string; body: Record<string, unknown> }) => api(`/api/fileflows/libraries/${uid}`, { method: 'PATCH', body: JSON.stringify(body) }),
  onSuccess: () => { addToast({ type: 'success', message: 'Bibliothèque mise à jour' }); refresh(); },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
function patch(uid: string, body: Record<string, unknown>): void {
  patchMutation.mutate({ uid, body });
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
.libs-muted { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
</style>
