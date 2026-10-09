<template>
  <!-- Reglages d'exploitation de FileFlows : runners, pause pendant les lectures Plex,
       alternance de la file. Applique par la tache « Pilotage FileFlows » (chaque minute). -->
  <EncodingShell title="Réglages">
    <UiFeedback v-if="controlQuery.isError.value" type="error" :message="humanizeError(controlQuery.error.value)" />
    <p v-else-if="controlQuery.isPending.value" class="set-muted">Chargement des réglages…</p>
    <form v-else class="settings" @submit.prevent="saveMutation.mutate()">
      <section class="set-block">
        <h2>Runners</h2>
        <UiRadioCards v-model="form.runners_mode" label="Nombre de runners" :options="runnersModes" />
        <label v-if="form.runners_mode === 'manual'" class="set-row">
          <span>Nombre de runners<small>Fichiers traités en même temps (offre gratuite : {{ control?.max_runners }} au plus).</small></span>
          <UiNumberField v-model="form.runners" :min="1" :max="control?.max_runners || 5" aria-label="Nombre de runners" />
        </label>
      </section>

      <section class="set-block">
        <h2>Pendant une lecture Plex</h2>
        <UiRadioCards v-model="form.plex_pause" label="Pause pendant une lecture Plex" :options="pauseModes" />
        <template v-if="form.plex_pause !== 'off'">
          <UiRadioCards v-model="form.plex_pause_relaunched" label="Fichiers relancés à la main" :options="relaunchedModes" />
          <label class="set-row">
            <span>Délai de reprise<small>Minutes sans lecture avant de reprendre : une pause du film ne relance pas tout.</small></span>
            <UiNumberField v-model="form.plex_resume_minutes" :min="0" :max="120" aria-label="Délai de reprise en minutes" />
          </label>
          <p class="set-muted">Le disque d'un fichier lu est retrouvé grâce aux correspondances de la section Bibliothèques.</p>
        </template>
      </section>

      <section class="set-block">
        <h2>File d'attente</h2>
        <ToggleSwitch v-model="form.reorder_enabled" label="Alterner la file entre les bibliothèques cochées" />
        <p class="set-muted">Les bibliothèques concernées se cochent dans la section Bibliothèques. Les fichiers relancés à la main restent en tête.</p>
      </section>

      <section class="set-block">
        <h2>Plages horaires</h2>
        <p class="set-muted">
          {{ control?.schedule_restricted ? 'FileFlows ne traite qu\'à certaines heures (planning du nœud).' : 'FileFlows traite à toute heure.' }}
          Le planning se règle dans FileFlows, réglages du nœud.
        </p>
      </section>

      <div class="set-actions">
        <UiButton type="submit" variant="primary" :loading="saveMutation.isPending.value" :disabled="!dirty"><Save />Enregistrer</UiButton>
        <UiButton :disabled="!dirty" @click="reset">Annuler</UiButton>
        <small v-if="lastRun" class="set-muted">Dernier passage du pilotage : {{ formatDateTime(lastRun) }}</small>
      </div>
    </form>
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Save } from '@lucide/vue';
import { api } from '@/api';
import { fileflowsControlQuery, useFileflowsStatus, type FileflowsControl } from '@/composables/useFileflows';
import { useToast } from '@/composables/useToast';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import { formatDateTime } from '@/utils/format';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';
import UiRadioCards from '@/components/ui/UiRadioCards.vue';
import EncodingShell from '@/components/encoding/EncodingShell.vue';

const runnersModes = [
  { value: 'manual' as const, label: 'Fixe', description: 'Le nombre choisi ci-dessous.' },
  { value: 'auto' as const, label: 'Automatique', description: 'Un runner par disque ayant des fichiers à traiter.' },
];
const pauseModes = [
  { value: 'off' as const, label: 'Désactivée', description: 'Les traitements continuent pendant les lectures.' },
  { value: 'all' as const, label: 'Tous les runners', description: 'Tout attend la fin des lectures.' },
  { value: 'disk' as const, label: 'Disque concerné', description: 'Seul le disque du fichier lu attend ; les runners passent aux autres disques.' },
];
const relaunchedModes = [
  { value: 'follow' as const, label: 'Suivent la pause', description: 'Un fichier relancé attend comme les autres.' },
  { value: 'ignore' as const, label: 'Passent quand même', description: 'Un fichier relancé à la main est traité malgré la lecture.' },
];

const queryClient = useQueryClient();
const { addToast } = useToast();
const { status } = useFileflowsStatus();
const controlQuery = useQuery({ ...fileflowsControlQuery(), enabled: computed(() => Boolean(status.value?.connected)) });
const control = computed(() => controlQuery.data.value || null);
const lastRun = computed(() => control.value?.guard?.at || null);

type Form = Pick<FileflowsControl, 'runners_mode' | 'runners' | 'plex_pause' | 'plex_pause_relaunched' | 'plex_resume_minutes' | 'reorder_enabled'>;
const form = reactive<Form>({ runners_mode: 'manual', runners: 1, plex_pause: 'off', plex_pause_relaunched: 'follow', plex_resume_minutes: 5, reorder_enabled: false });
function snapshot(): Form | null {
  const c = control.value;
  return c ? { runners_mode: c.runners_mode, runners: c.runners, plex_pause: c.plex_pause, plex_pause_relaunched: c.plex_pause_relaunched, plex_resume_minutes: c.plex_resume_minutes, reorder_enabled: c.reorder_enabled } : null;
}
function reset(): void {
  const s = snapshot();
  if (s) Object.assign(form, s);
}
watch(control, reset, { immediate: true });
const dirty = computed(() => JSON.stringify(snapshot()) !== JSON.stringify({ ...form }));

const saveMutation = useMutation({
  mutationFn: () => api('/api/fileflows/control', { method: 'PUT', body: JSON.stringify({ ...form, runners: Number(form.runners) || 1, plex_resume_minutes: Number(form.plex_resume_minutes) || 0 }) }),
  onSuccess: () => {
    addToast({ type: 'success', message: 'Réglages enregistrés, appliqués d\'ici une minute' });
    void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.all });
  },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
</script>

<style scoped lang="scss">
.settings { display: grid; gap: var(--space-4); }
.set-block { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
.set-block h2 { margin: 0; font-size: var(--fs-md); }
.set-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
.set-row > span { display: grid; gap: 2px; }
.set-row small, .set-muted { color: var(--muted); font-size: var(--fs-sm); }
.set-muted { margin: 0; }
.set-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
</style>
