<template>
  <div class="scheduled-tab">
    <!-- Réglage global, pas une tâche : il garde toute la largeur, au-dessus de la grille. -->
    <SettingsCard title="Historique" subtitle="Durée de conservation de l'historique d'exécution des tâches planifiées ci-dessous." :icon="Archive" status="active" :collapsible="false">
      <label>Historique de polling (jours)<RetentionDaysInput v-model="form.poll_history_retention_days" :default-days="30"/></label>
    </SettingsCard>

    <!-- Les tâches se lisent en parallèle : une grille les rend comparables d'un coup
         d'œil, là où onze cartes pleine largeur obligeaient à faire défiler. -->
    <div class="settings-cards settings-cards--grid">
      <SettingsCard
        v-for="task in tasks"
        :key="task.job"
        :title="task.label"
        :subtitle="task.description"
        :icon="Clock"
        :status="cardStatus(task)"
        :status-text="cardStatusText(task)"
        :collapsible="false"
      >
        <template #actions>
          <button class="secondary" @click.stop="toggleHistory(task.job)">
            <History/>{{ openHistory === task.job ? 'Masquer' : 'Historique' }}
          </button>
        </template>

        <div class="scheduled-task-info">
          <div class="scheduled-task-row">
            <span>Intervalle actuel</span>
            <strong>{{ formatInterval(task.interval_seconds) }}</strong>
          </div>
          <div v-if="task.fixed_schedule" class="scheduled-task-row">
            <span>Planification</span>
            <strong>{{ task.fixed_schedule }}</strong>
          </div>
          <div v-if="task.state?.finished_at" class="scheduled-task-row">
            <span>Derniere execution</span>
            <strong>{{ formatDate(task.state.finished_at) }} ({{ formatDuration(task.state.duration_ms) }})</strong>
          </div>
          <div v-if="task.state?.status === 'failed' && task.state?.last_error" class="scheduled-task-error">
            {{ task.state.last_error }}
          </div>
        </div>

        <label v-if="task.settings_unit === 'heure (0-23)'">
          Heure de déclenchement
          <!-- Toutes les taches a heure murale n'ont pas de minute reglable : la purge des
               journaux se declenche a l'heure pile. Sans ce repli, `form[undefined]`
               laissait le champ horaire entierement vide. -->
          <TimeOfDayInput
            :hour="form[task.settings_field] ?? 0"
            :minute="task.settings_minute_field ? (form[task.settings_minute_field] ?? 0) : 0"
            @update:hour="form[task.settings_field] = $event"
            @update:minute="task.settings_minute_field && (form[task.settings_minute_field] = $event)"
          />
        </label>
        <label v-else-if="presetsFor(task.settings_field)">
          Frequence
          <IntervalPresetInput v-model="form[task.settings_field]" :presets="presetsFor(task.settings_field)!"/>
        </label>

        <div v-if="openHistory === task.job" class="scheduled-task-history">
          <p v-if="historyLoading" class="notice">Chargement...</p>
          <ul v-else-if="history.length">
            <li v-for="row in history" :key="row.id" :class="row.status">
              <span class="history-status">{{ row.status === 'complete' ? 'OK' : 'Echec' }}</span>
              <span>{{ formatDate(row.started_at) }}</span>
              <span>{{ formatDuration(row.duration_ms) }}</span>
              <span v-if="row.error" class="scheduled-task-error">{{ row.error }}</span>
            </li>
          </ul>
          <p v-else class="empty">Aucun historique.</p>
        </div>
      </SettingsCard>
    </div>
  </div>
</template>
<script setup lang="ts">
import { formatElapsed as formatDuration, formatDateTimeSeconds as formatDate } from '@/utils/format';
import { onMounted, ref } from 'vue';
import { Archive, Clock, History } from '@lucide/vue';
import { api } from '@/api';
import { form } from '@/settingsForm';
import { presetsFor } from '@/settingsPresets';
import SettingsCard from './SettingsCard.vue';
import IntervalPresetInput from './IntervalPresetInput.vue';
import TimeOfDayInput from './TimeOfDayInput.vue';
import RetentionDaysInput from './RetentionDaysInput.vue';

// Presets par tache : chaque job periodique a ses propres frequences pertinentes
// (un scan leger n'a pas les memes echelles de temps qu'une synchro complete).


const tasks = ref<any[]>([]);
const openHistory = ref<string | null>(null);
const history = ref<any[]>([]);
const historyLoading = ref(false);

function cardStatus(task: any): string {
  const status = task.state?.status;
  if (status === 'failed') return 'error';
  if (status === 'complete') return 'active';
  return 'neutral';
}

function cardStatusText(task: any): string {
  const status = task.state?.status;
  if (status === 'failed') return 'Echec';
  if (status === 'complete') return 'OK';
  if (status === 'running') return 'En cours';
  return 'Jamais execute';
}

function formatInterval(seconds: number): string {
  if (!seconds) return '-';
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} j`;
}


async function loadTasks(): Promise<void> {
  tasks.value = await api('/api/scheduled-tasks');
}

async function toggleHistory(job: string): Promise<void> {
  if (openHistory.value === job) {
    openHistory.value = null;
    return;
  }
  openHistory.value = job;
  historyLoading.value = true;
  try {
    history.value = await api(`/api/scheduled-tasks/${job}/history`);
  } finally {
    historyLoading.value = false;
  }
}

onMounted(loadTasks);
</script>
<style scoped lang="scss">
.scheduled-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
/* Deux colonnes libellé/valeur alignées d'une ligne à l'autre : en `flex` avec
   `space-between`, chaque valeur se calait où le libellé la laissait, et rien ne
   s'alignait verticalement d'une carte à l'autre. */
.scheduled-task-info {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
  font-size: var(--fs-sm);
}
/* Chiffres alignes a la virgule d'une ligne a l'autre : des durees et des dates en
   chasse proportionnelle donnent une colonne de droite en dents de scie. */
.scheduled-task-info strong {
  font-variant-numeric: tabular-nums;
}
.scheduled-task-row {
  display: contents;
}
.scheduled-task-row span {
  color: var(--muted);
  white-space: nowrap;
}
.scheduled-task-row strong {
  min-width: 0;
  color: var(--text);
  font-weight: 600;
  text-align: right;
}
.scheduled-task-error {
  grid-column: 1 / -1;
  font-size: var(--fs-sm);
  color: var(--red-text);
  word-break: break-word;
}
.scheduled-task-history {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 4px;
}
/* Toutes les cartes partageant desormais la meme hauteur, un historique deplie les
   ferait toutes grandir. On le borne et on le fait defiler sur lui-meme. */
.scheduled-task-history ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 190px;
  overflow-y: auto;
  overscroll-behavior: contain;
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
}
.scheduled-task-history li.failed {
  background: rgba(239, 68, 68, 0.08);
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
