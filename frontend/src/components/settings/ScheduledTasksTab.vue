<template>
  <div class="settings-rows scheduled-tab">
    <!-- Le verdict avant le tableau : une tâche en échec se voit sans le parcourir. -->
    <section v-if="failed.length" class="scheduled-verdict" :class="failed.length ? 'is-error' : 'is-good'" aria-live="polite">
      <div>
        <h2>{{ failed.length ? `${failed.length} tâche${failed.length > 1 ? 's' : ''} en échec` : 'Toutes les tâches passent' }}</h2>
        <p>{{ tasks.length }} tâches{{ upcoming ? ` · prochaine : ${upcoming.task.label} (${upcoming.label})` : '' }}</p>
      </div>
    </section>

    <SettingsSection title="Historique" subtitle="Conservation de l'historique d'exécution des tâches ci-dessous.">
      <SettingsRow label="Historique de polling" description="En jours.">
        <RetentionDaysInput v-model="form.poll_history_retention_days" :default-days="30"/>
      </SettingsRow>
    </SettingsSection>

    <!-- Les tâches se comparent : un tableau aligne fréquence, dernière exécution et état
         d'une tâche à l'autre, là où onze cartes faisaient défiler plus de trois écrans. -->
    <LiveStrip v-if="runningTasks.length" title="Tâches en cours" :items="runningTasks" :idle="{ title: 'Aucune tâche en cours' }" />
    <SettingsSection title="Tâches planifiées" subtitle="Fréquence de chaque tâche de fond et résultat de sa dernière exécution.">
      <UiDataTable label="Tâches planifiées" :rows="sortedTasks" :columns="TASK_COLUMNS" :row-key="(task: any) => task.job" class="scheduled-table">
        <template #empty><p class="empty">Aucune tâche planifiée.</p></template>
        <template #cell-task="{ row: task }">
          <strong>{{ task.label }}</strong>
          <small class="scheduled-desc">{{ task.description }}</small>
          <small v-if="(task.work ? task.work.state === 'blocked' : task.state?.status === 'failed') && (task.work?.reason || task.state?.last_error)" class="scheduled-task-error">{{ task.work?.reason || task.state.last_error }}</small>
        </template>
        <template #cell-frequency="{ row: task }">
          <UiTimeField
            v-if="task.settings_unit === 'heure (0-23)'"
            :hour="form[task.settings_field] ?? 0"
            :minute="task.settings_minute_field ? (form[task.settings_minute_field] ?? 0) : 0"
            :with-minutes="!!task.settings_minute_field"
            :aria-label="`Heure de déclenchement : ${task.label}`"
            @update:hour="form[task.settings_field] = $event"
            @update:minute="task.settings_minute_field && (form[task.settings_minute_field] = $event)"
          />
          <IntervalPresetInput v-else-if="presetsFor(task.settings_field)" v-model="form[task.settings_field]" :presets="presetsFor(task.settings_field)!"/>
          <span v-else class="scheduled-fixed">{{ task.fixed_schedule || formatInterval(task.interval_seconds) }}</span>
        </template>
        <template #cell-last="{ row: task }">
          <span v-if="task.state?.finished_at" class="scheduled-last">{{ formatDate(task.state.finished_at) }}<small>{{ formatDuration(task.state.duration_ms) }}</small></span>
          <span v-else class="scheduled-never">Jamais</span>
          <small v-if="nextRunLabel(task, now)" class="scheduled-next">Prochaine : {{ nextRunLabel(task, now) }}</small>
        </template>
        <template #cell-status="{ row: task }">
          <StatusBadge v-if="task.work" :work="task.work" /><span v-else class="scheduled-status" :class="taskStatus(task)">{{ taskStatusText(task) }}</span>
        </template>
        <template #cell-actions="{ row: task }">
          <div class="scheduled-actions">
            <UiButton size="sm" :loading="launching === task.job" :disabled="task.work ? task.work.state === 'running' : task.state?.status === 'running'" @click="launch(task)"><template #icon><Play/></template>Lancer</UiButton>
            <UiButton size="sm" @click="openHistory = task.job"><History/>Historique</UiButton>
          </div>
        </template>
      </UiDataTable>
    </SettingsSection>

    <ModalShell :open="Boolean(openHistory)" :title="`Historique : ${historyTask?.label || ''}`" @close="openHistory = null">
      <p v-if="historyLoading" class="notice">Chargement…</p>
      <ul v-else-if="history.length" class="scheduled-task-history">
        <li v-for="row in history" :key="row.id" :class="row.status">
          <span class="history-status">{{ row.status === 'complete' ? 'OK' : 'Échec' }}</span>
          <span>{{ formatDate(row.started_at) }}</span>
          <span>{{ formatDuration(row.duration_ms) }}</span>
          <span v-if="row.error" class="scheduled-task-error">{{ row.error }}</span>
        </li>
      </ul>
      <p v-else class="empty">Aucun historique.</p>
    </ModalShell>
  </div>
</template>
<script setup lang="ts">
import LiveStrip from '@/components/ui/LiveStrip.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { formatInterval, formatElapsed as formatDuration, formatDateTimeSeconds as formatDate } from '@/utils/format';
import { computed, ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useIntervalFn } from '@vueuse/core';
import { useRealtime } from '@/events';
import { useToast } from '@/composables/useToast';
import { humanizeError } from '@/utils/apiError';
import { nextRun, nextRunLabel, sortTasks } from './scheduledTasks';
import { History, Play } from '@lucide/vue';
import { api } from '@/api';
import { form } from '@/settingsForm';
import { presetsFor } from '@/settingsPresets';
import UiDataTable, { type UiColumn } from '@/components/ui/UiDataTable.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
import SettingsSection from './SettingsSection.vue';
import SettingsRow from './SettingsRow.vue';
import IntervalPresetInput from './IntervalPresetInput.vue';
import UiTimeField from '@/components/ui/UiTimeField.vue';
import RetentionDaysInput from './RetentionDaysInput.vue';

// Presets par tache : chaque job periodique a ses propres frequences pertinentes
// (un scan leger n'a pas les memes echelles de temps qu'une synchro complete).
const TASK_COLUMNS: UiColumn[] = [
  { key: 'task', label: 'Tâche', card: 'title', minWidth: 240 },
  { key: 'frequency', label: 'Fréquence' },
  { key: 'last', label: 'Dernière exécution' },
  { key: 'status', label: 'État' },
  { key: 'actions', label: '', card: 'actions', className: 'actions' },
];

const openHistory = ref<string | null>(null);
const tasksQuery = useQuery({ queryKey: ['settings', 'scheduled-tasks'], queryFn: () => api<any[]>('/api/scheduled-tasks') });
const tasks = computed(() => tasksQuery.data.value || []);
const runningTasks = computed(() => tasks.value.filter((task: any) => task.work?.state === 'running').map((task: any) => ({ key: task.work.key, title: task.label, work: task.work })));
const sortedTasks = computed(() => sortTasks(tasks.value));
const failed = computed(() => tasks.value.filter((task: any) => (task.work ? task.work.state === 'blocked' : task.state?.status === 'failed')));
const now = ref(new Date());
useIntervalFn(() => { now.value = new Date(); }, 30_000);
const upcoming = computed(() => {
  const next = tasks.value
    .map((task: any) => ({ task, at: nextRun(task, now.value) }))
    .filter((entry: any) => entry.at)
    .sort((a: any, b: any) => a.at.getTime() - b.at.getTime())[0];
  return next ? { task: next.task, label: nextRunLabel(next.task, now.value) } : null;
});

/* « Lancer » met la tâche dans la file tout de suite ; son état revient par les événements. */
const queryClient = useQueryClient();
const { addToast } = useToast();
const launching = ref<string | null>(null);
async function launch(task: any): Promise<void> {
  launching.value = task.job;
  try {
    await api(`/api/scheduled-tasks/${task.job}/run`, { method: 'POST' });
    addToast({ type: 'success', title: `${task.label} : lancée` });
  } catch (error) {
    addToast({ type: 'error', title: `${task.label} : non lancée`, message: humanizeError(error) });
  } finally {
    launching.value = null;
  }
}
useRealtime(['job.updated'], () => { void queryClient.invalidateQueries({ queryKey: ['settings', 'scheduled-tasks'] }); }, { refreshOnVisible: false });
const historyQuery = useQuery({
  queryKey: computed(() => ['settings', 'scheduled-tasks', openHistory.value, 'history']),
  queryFn: () => api<any[]>(`/api/scheduled-tasks/${openHistory.value}/history`),
  enabled: computed(() => Boolean(openHistory.value)),
});
const history = computed(() => historyQuery.data.value || []);
const historyLoading = computed(() => historyQuery.isFetching.value);

const historyTask = computed(() => tasks.value.find((task: any) => task.job === openHistory.value) || null);

function taskStatus(task: any): string {
  const status = task.state?.status;
  if (status === 'failed') return 'error';
  if (status === 'complete') return 'active';
  return 'neutral';
}

function taskStatusText(task: any): string {
  const status = task.state?.status;
  if (status === 'failed') return 'Échec';
  if (status === 'complete') return 'OK';
  if (status === 'running') return 'En cours';
  return 'Jamais exécutée';
}



</script>
<style scoped lang="scss">
.scheduled-table :deep(td) { vertical-align: middle; }
.scheduled-verdict { padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); }
.scheduled-verdict.is-good { border-color: color-mix(in srgb, var(--green) 45%, var(--border)); background: color-mix(in srgb, var(--green) 7%, var(--surface)); }
.scheduled-verdict.is-error { border-color: color-mix(in srgb, var(--red) 45%, var(--border)); background: color-mix(in srgb, var(--red) 7%, var(--surface)); }
.scheduled-verdict h2 { margin: 0 0 2px; font-size: var(--fs-md); }
.scheduled-verdict p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.scheduled-next { display: block; color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; }
.scheduled-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: flex-end; }
.scheduled-desc {
  display: block;
  max-width: 48ch;
  margin-top: 2px;
  color: var(--muted);
  font-size: var(--fs-xs);
  line-height: 1.4;
}
.scheduled-last {
  display: grid;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.scheduled-last small,
.scheduled-never {
  color: var(--muted);
  font-size: var(--fs-xs);
}
.scheduled-fixed { color: var(--muted); }
/* L'etat se lit a la couleur ET au mot, comme sur les lignes d'objets. */
.scheduled-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 650;
  white-space: nowrap;
}
.scheduled-status::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.scheduled-status.active { color: var(--green-text); }
.scheduled-status.error { color: var(--red-text); }
.scheduled-task-error {
  display: block;
  margin-top: 4px;
  font-size: var(--fs-xs);
  color: var(--red-text);
  word-break: break-word;
}
.scheduled-task-history {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.scheduled-task-history li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  font-size: var(--fs-sm);
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-variant-numeric: tabular-nums;
}
.scheduled-task-history li.failed {
  background: color-mix(in srgb, var(--red) 8%, transparent);
}
.history-status {
  font-weight: 600;
  min-width: 42px;
}
.scheduled-task-history li.failed .history-status {
  color: var(--red-text);
}
.scheduled-task-history li:not(.failed) .history-status {
  color: var(--green-text);
}
</style>
