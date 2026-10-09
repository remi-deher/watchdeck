<template>
  <!-- Reglages de l'encodage (gabarit Configurer) : sections par intention, un seul
       enregistrement pour la page. Appliques par la tache « Pilotage FileFlows » (chaque
       minute). -->
  <EncodingShell title="Réglages">
    <UiFeedback v-if="controlQuery.isError.value" type="error" :message="humanizeError(controlQuery.error.value)" />
    <ConfigureTemplate v-else :sections="sections" :dirty="dirty" :saving="saveMutation.isPending.value" @save="saveMutation.mutate()" @cancel="reset">
      <template #section-runners>
        <UiRadioCards v-model="form.runners_mode" label="Nombre de runners" :options="runnersModes" />
        <ConfigureField v-if="form.runners_mode === 'manual'" label="Nombre de runners" :help="`Fichiers traités en même temps (offre gratuite : ${control?.max_runners} au plus).`">
          <UiNumberField v-model="form.runners" :min="1" :max="control?.max_runners || 5" aria-label="Nombre de runners" />
        </ConfigureField>
      </template>
      <template #section-plex>
        <UiRadioCards v-model="form.plex_pause" label="Pause pendant une lecture Plex" :options="pauseModes" />
        <template v-if="form.plex_pause !== 'off'">
          <UiRadioCards v-model="form.plex_pause_relaunched" label="Fichiers relancés à la main" :options="relaunchedModes" />
          <ConfigureField label="Délai de reprise" help="Minutes sans lecture avant de reprendre : une pause du film ne relance pas tout.">
            <UiNumberField v-model="form.plex_resume_minutes" :min="0" :max="120" aria-label="Délai de reprise en minutes" />
          </ConfigureField>
        </template>
      </template>
      <template #section-queue>
        <ConfigureField label="Alterner la file entre les bibliothèques cochées" help="Les bibliothèques concernées se cochent dans l’onglet Bibliothèques. Les fichiers relancés à la main restent en tête.">
          <ToggleSwitch v-model="form.reorder_enabled" aria-label="Alterner la file" />
        </ConfigureField>
      </template>
      <template #section-alerts>
        <UiCheckboxField
          v-for="channel in CHANNELS"
          :key="channel.value"
          :model-value="form.alert_channels.includes(channel.value)"
          :label="channel.label"
          :hint="control?.channels_ready[channel.value] ? '' : 'Désactivé ou non configuré dans Notifications'"
          @update:model-value="(on: boolean) => toggleChannel(channel.value, on)"
        />
      </template>
      <template #section-schedule>
        <UiRadioCards v-model="form.schedule_preset" label="Plages de traitement" :options="scheduleOptions" />
      </template>
    </ConfigureTemplate>
  </EncodingShell>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/api';
import { fileflowsControlQuery, useFileflowsStatus, type AlertChannel, type FileflowsControl, type SchedulePreset } from '@/composables/useFileflows';
import { useToast } from '@/composables/useToast';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiCheckboxField from '@/components/ui/UiCheckboxField.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiNumberField from '@/components/ui/UiNumberField.vue';
import UiRadioCards from '@/components/ui/UiRadioCards.vue';
import EncodingShell from '@/components/encoding/EncodingShell.vue';
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import ConfigureField from '@/components/templates/configure/ConfigureField.vue';

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

const CHANNELS: Array<{ value: AlertChannel; label: string }> = [
  { value: 'email', label: 'Email administrateur' },
  { value: 'discord', label: 'Discord' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'ntfy', label: 'ntfy' },
  { value: 'gotify', label: 'Gotify' },
];

const SCHEDULE_PRESETS: Array<{ value: SchedulePreset; label: string; description: string }> = [
  { value: 'always', label: 'Toujours', description: 'À toute heure.' },
  { value: 'night', label: 'La nuit', description: 'De 0 h à 8 h.' },
  { value: 'not_evening', label: 'Hors soirée', description: 'Pas de 18 h à minuit.' },
  { value: 'daytime', label: 'En journée', description: 'De 8 h à 18 h.' },
];

const queryClient = useQueryClient();
const { addToast } = useToast();
const { status } = useFileflowsStatus();
const controlQuery = useQuery({ ...fileflowsControlQuery(), enabled: computed(() => Boolean(status.value?.connected)) });
const control = computed(() => controlQuery.data.value || null);
/* Un planning regle autrement dans FileFlows reste tel quel tant qu'on ne choisit rien d'autre. */
const scheduleOptions = computed(() => control.value?.schedule_preset === 'custom'
  ? [...SCHEDULE_PRESETS, { value: 'custom' as const, label: 'Personnalisé', description: 'Réglé dans FileFlows, conservé.' }]
  : SCHEDULE_PRESETS);

type Form = Pick<FileflowsControl, 'runners_mode' | 'runners' | 'plex_pause' | 'plex_pause_relaunched' | 'plex_resume_minutes' | 'reorder_enabled' | 'alert_channels' | 'schedule_preset'>;
const form = reactive<Form>({ runners_mode: 'manual', runners: 1, plex_pause: 'off', plex_pause_relaunched: 'follow', plex_resume_minutes: 5, reorder_enabled: false, alert_channels: [], schedule_preset: 'always' });
function snapshot(): Form | null {
  const c = control.value;
  return c ? {
    runners_mode: c.runners_mode, runners: c.runners, plex_pause: c.plex_pause, plex_pause_relaunched: c.plex_pause_relaunched,
    plex_resume_minutes: c.plex_resume_minutes, reorder_enabled: c.reorder_enabled,
    alert_channels: CHANNELS.map((ch) => ch.value).filter((v) => c.alert_channels.includes(v)),
    schedule_preset: c.schedule_preset,
  } : null;
}
function reset(): void {
  const s = snapshot();
  if (s) Object.assign(form, { ...s, alert_channels: [...s.alert_channels] });
}
function toggleChannel(channel: AlertChannel, on: boolean): void {
  const next = new Set(form.alert_channels);
  if (on) next.add(channel);
  else next.delete(channel);
  form.alert_channels = CHANNELS.map((ch) => ch.value).filter((v) => next.has(v));
}
watch(control, reset, { immediate: true });
const dirty = computed(() => JSON.stringify(snapshot()) !== JSON.stringify({ ...form }));
/* Une section est modifiee quand un de ses champs differe de ce qui est enregistre. */
function changed(keys: Array<keyof Form>): boolean {
  const saved = snapshot();
  return Boolean(saved) && keys.some((key) => JSON.stringify(saved![key]) !== JSON.stringify(form[key]));
}
const sections = computed(() => [
  { key: 'runners', title: 'Runners', description: 'Combien de fichiers FileFlows traite en même temps.', dirty: changed(['runners_mode', 'runners']) },
  { key: 'plex', title: 'Pendant une lecture Plex', description: 'Éviter de ralentir un film en cours de lecture.', dirty: changed(['plex_pause', 'plex_pause_relaunched', 'plex_resume_minutes']) },
  { key: 'queue', title: 'File d’attente', description: 'L’ordre dans lequel les fichiers passent.', dirty: changed(['reorder_enabled']) },
  { key: 'alerts', title: 'Alertes', description: 'Un traitement en échec prévient l’administrateur sur les canaux cochés.', dirty: changed(['alert_channels']) },
  { key: 'schedule', title: 'Plages horaires', description: 'Heure locale du serveur FileFlows, tous les jours. Un fichier en cours à la fin d’une plage se termine normalement.', dirty: changed(['schedule_preset']) },
]);

const saveMutation = useMutation({
  mutationFn: () => api('/api/fileflows/control', { method: 'PUT', body: JSON.stringify({ ...form, runners: Number(form.runners) || 1, plex_resume_minutes: Number(form.plex_resume_minutes) || 0 }) }),
  onSuccess: () => {
    addToast({ type: 'success', message: 'Réglages enregistrés, appliqués d\'ici une minute' });
    void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.all });
  },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
</script>
