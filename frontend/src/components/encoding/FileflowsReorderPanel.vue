<template>
  <!-- Alternance de la file FileFlows par disque : avec plusieurs runners, chacun travaille
       sur un disque different. Desactivee par defaut. -->
  <UiDisclosure
    title="Alternance de la file par disque"
    :description="enabled ? 'Active : la file est réordonnée toutes les 5 minutes.' : 'Désactivée.'"
    storage-key="encoding.reorderOpen"
  >
    <UiFeedback v-if="stateQuery.isError.value" type="error" :message="humanizeError(stateQuery.error.value)" />
    <p v-else-if="stateQuery.isPending.value" class="reorder-muted">Chargement des bibliothèques…</p>
    <form v-else class="reorder" @submit.prevent="saveMutation.mutate()">
      <p class="reorder-muted">
        FileFlows traite sa file dans l'ordre, et ses scans ajoutent les fichiers groupés par bibliothèque.
        En alternant les bibliothèques cochées (une bibliothèque = un disque), plusieurs runners travaillent
        sur des disques différents ; le verrou du flow règle les cas restants. Les fichiers relancés à la main
        restent en tête de file.
      </p>
      <ToggleSwitch v-model="enabled" label="Alterner la file automatiquement" />
      <fieldset class="reorder-libraries">
        <legend>Bibliothèques activées dans FileFlows</legend>
        <label v-for="lib in libraries" :key="lib.uid" class="reorder-lib">
          <UiCheckbox :model-value="chosen.has(lib.uid)" @update:model-value="toggle(lib.uid)" />
          <span class="reorder-lib-name"><strong>{{ lib.name }}</strong><small>{{ lib.path }}</small></span>
          <small>{{ lib.waiting }} en attente</small>
        </label>
        <p v-if="!libraries.length" class="reorder-muted">Aucune bibliothèque activée dans FileFlows.</p>
      </fieldset>
      <p v-if="enabled && chosen.size < 2" class="reorder-warn">Cochez au moins deux bibliothèques pour qu'il y ait quelque chose à alterner.</p>
      <div class="reorder-actions">
        <UiButton type="submit" variant="primary" :loading="saveMutation.isPending.value" :disabled="!dirty"><Save />Enregistrer</UiButton>
        <UiButton :loading="runMutation.isPending.value" :disabled="dirty || chosen.size < 2" @click="runMutation.mutate()"><ListRestart />Réordonner maintenant</UiButton>
      </div>
      <p v-if="lastRun" class="reorder-muted">
        Dernier passage {{ formatDateTime(lastRun.at) }} : {{ lastRun.message || lastRun.error }}
      </p>
    </form>
  </UiDisclosure>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ListRestart, Save } from '@lucide/vue';
import { api } from '@/api';
import { useToast } from '@/composables/useToast';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import { formatDateTime } from '@/utils/format';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiCheckbox from '@/components/ui/UiCheckbox.vue';
import UiDisclosure from '@/components/ui/UiDisclosure.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';

interface ReorderLibrary { uid: string; name: string; path: string; waiting: number; included: boolean }
interface ReorderRun { at: string; message?: string; error?: string; changed?: boolean }
interface ReorderState { enabled: boolean; libraries: ReorderLibrary[]; last_run: ReorderRun | null }

const STATE_KEY = [...queryKeys.fileflows.all, 'reorder'] as const;
const queryClient = useQueryClient();
const { addToast } = useToast();

const stateQuery = useQuery({
  queryKey: STATE_KEY,
  queryFn: ({ signal }) => api<ReorderState>('/api/fileflows/reorder', { signal }),
  staleTime: 30_000,
});
const libraries = computed<ReorderLibrary[]>(() => stateQuery.data.value?.libraries || []);
const lastRun = computed(() => stateQuery.data.value?.last_run || null);

/* Brouillon local : les cases et l'interrupteur ne s'appliquent qu'a l'enregistrement. */
const enabled = ref(false);
const chosen = reactive(new Set<string>());
function reset(): void {
  const state = stateQuery.data.value;
  enabled.value = Boolean(state?.enabled);
  chosen.clear();
  for (const lib of state?.libraries || []) if (lib.included) chosen.add(lib.uid);
}
watch(() => stateQuery.data.value, reset, { immediate: true });
function toggle(uid: string): void {
  if (chosen.has(uid)) chosen.delete(uid);
  else chosen.add(uid);
}
const dirty = computed(() => {
  const state = stateQuery.data.value;
  if (!state) return false;
  const saved = state.libraries.filter((lib) => lib.included).map((lib) => lib.uid).sort().join(',');
  return enabled.value !== state.enabled || [...chosen].sort().join(',') !== saved;
});

const saveMutation = useMutation({
  mutationFn: () => api('/api/fileflows/reorder', { method: 'PUT', body: JSON.stringify({ enabled: enabled.value, libraries: [...chosen] }) }),
  onSuccess: () => {
    addToast({ type: 'success', message: enabled.value ? 'Alternance de la file activée' : 'Réglage enregistré' });
    void queryClient.invalidateQueries({ queryKey: STATE_KEY });
  },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});

const runMutation = useMutation({
  mutationFn: () => api<ReorderRun>('/api/fileflows/reorder/run', { method: 'POST' }),
  onSuccess: (result) => {
    addToast({ type: 'success', message: result.message || 'File réordonnée' });
    void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.all });
  },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
</script>

<style scoped lang="scss">
.reorder { display: grid; gap: var(--space-3); }
.reorder-muted { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.reorder-warn { margin: 0; color: var(--amber-text); font-size: var(--fs-sm); }
.reorder-libraries { display: grid; gap: 2px; margin: 0; padding: 0; border: 0; }
.reorder-libraries legend { margin-bottom: var(--space-2); font-weight: 650; }
.reorder-lib { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--border); cursor: pointer; }
.reorder-lib:last-of-type { border-bottom: 0; }
.reorder-lib-name { display: grid; flex: 1; min-width: 0; }
.reorder-lib-name small, .reorder-lib > small { color: var(--muted); font-size: var(--fs-xs); }
.reorder-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
</style>
