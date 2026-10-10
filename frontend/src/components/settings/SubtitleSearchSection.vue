<template>
  <!-- Sous-titres francais des medias en VO : recherche a la demande par Plex, ou par
       Bazarr quand il est configure (Connexions > Integrations). -->
  <SettingsSection
    title="Sous-titres français"
    subtitle="Cherche des sous-titres pour les médias en VO qui n'en ont pas, comme Bazarr : via Plex (intégré) ou via Bazarr."
    :status="form.subtitle_search_enabled ? 'active' : 'inactive'"
  >
    <template #actions>
      <UiButton :loading="running" @click="runNow"><Captions />Chercher maintenant</UiButton>
    </template>
    <!-- Le dernier passage avant le détail : une recherche qui échoue en silence se voit ici. -->
    <p v-if="lastPass" class="subtitle-last" :class="lastPass.failed ? 'is-error' : 'is-ok'" aria-live="polite">{{ lastPass.text }}</p>
    <p v-if="summary" class="subtitle-summary">
      {{ summary.missing }} média(s) sans sous-titres français, dont {{ summary.due }} à chercher.
      <template v-if="summary.bazarr">
        Bazarr ({{ summary.bazarr.name }}) :
        <template v-if="summary.bazarr.connected">{{ summary.bazarr.movies ?? '?' }} film(s) et {{ summary.bazarr.episodes ?? '?' }} épisode(s) en attente.</template>
        <template v-else>injoignable.</template>
      </template>
      <template v-else>Aucune instance Bazarr : la recherche passe par Plex.</template>
    </p>
    <SettingsRow label="Recherche automatique" description="Reprend régulièrement, par lots, les médias sans sous-titres français. Un média sans résultat n'est recherché à nouveau qu'au bout de 7 jours.">
      <ToggleSwitch v-model="form.subtitle_search_enabled" title="Recherche automatique des sous-titres" />
    </SettingsRow>
    <SettingsRow label="Fournisseur" description="Automatique : Bazarr pour les médias qu'il connaît (venus de Radarr/Sonarr), Plex pour les autres.">
      <UiSelect v-model="form.subtitle_search_provider" :options="providerOptions" />
    </SettingsRow>
    <SettingsRow label="Fréquence (heures)" :disabled="!form.subtitle_search_enabled">
      <UiNumberField v-model="form.subtitle_search_interval_hours" :min="1" :max="168" :disabled="!form.subtitle_search_enabled" aria-label="Fréquence de la recherche en heures" />
    </SettingsRow>
    <SettingsRow label="Médias par passage" description="Chaque recherche Plex interroge un fournisseur externe : un lot modeste évite d'être limité." :disabled="!form.subtitle_search_enabled">
      <UiNumberField v-model="form.subtitle_search_batch_size" :min="1" :max="200" :disabled="!form.subtitle_search_enabled" aria-label="Nombre de médias par passage" />
    </SettingsRow>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Captions } from '@lucide/vue';
import { api } from '@/api';
import { form, success, fail } from '@/settingsForm';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';
import { formatRelativeDate } from '@/utils/format';

/* Dernier passage de la recherche planifiée, lu dans les tâches (même requête que Planification). */
const tasksQuery = useQuery({ queryKey: ['settings', 'scheduled-tasks'], queryFn: () => api<any[]>('/api/scheduled-tasks') });
const lastPass = computed(() => {
  const task = (tasksQuery.data.value || []).find((task: any) => task.job === 'subtitle-search');
  const state = task?.state;
  if (task?.work && !['completed', 'blocked'].includes(task.work.state)) return { failed: false, text: `${task.work.label}${task.work.reason ? ` : ${task.work.reason}` : ''}` };
  if (!state?.finished_at) return null;
  const when = formatRelativeDate(state.finished_at).toLowerCase();
  return (task.work ? task.work.state === 'blocked' : state.status === 'failed')
    ? { failed: true, text: `Dernier passage en échec ${when}${(task.work?.reason || state.last_error) ? ` : ${task.work?.reason || state.last_error}` : ''}` }
    : { failed: false, text: `Dernier passage réussi ${when}.` };
});

const providerOptions = [
  { value: 'auto', label: 'Automatique' },
  { value: 'plex', label: 'Plex uniquement' },
  { value: 'bazarr', label: 'Bazarr uniquement' },
];

const queryClient = useQueryClient();
const summaryKey = ['settings', 'subtitles', 'summary'];
const summaryQuery = useQuery({
  queryKey: summaryKey,
  queryFn: ({ signal }) => api<any>('/api/subtitles/summary', { signal }),
  staleTime: 60_000,
});
const summary = computed(() => summaryQuery.data.value || null);

const runMutation = useMutation({
  mutationFn: () => api<any>('/api/subtitles/search-missing', { method: 'POST' }),
  onSuccess: (data) => {
    success(data.queued ? 'Recherche des sous-titres lancée en arrière-plan.' : `${data.processed} média(s) traité(s).`);
    void queryClient.invalidateQueries({ queryKey: summaryKey });
  },
  onError: (e) => fail(e),
});
const running = computed(() => runMutation.isPending.value);
const runNow = () => runMutation.mutate();
</script>

<style scoped>
.subtitle-summary { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.subtitle-last { margin: 0 0 var(--space-2); padding: var(--space-2) var(--space-3); border-radius: var(--inset-radius); font-size: var(--fs-sm); }
.subtitle-last.is-ok { background: color-mix(in srgb, var(--green) 9%, transparent); color: var(--green-text); }
.subtitle-last.is-error { background: color-mix(in srgb, var(--red) 9%, transparent); color: var(--red-text); }
</style>
