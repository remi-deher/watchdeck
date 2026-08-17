<template>
  <PanelCard
    title="Exécutions récentes"
    eyebrow="Planificateur"
    panel-class="recent-jobs-panel"
    :empty="filteredPolls.length ? '' : 'Aucune exécution enregistrée.'"
  >
    <template #action>
      <div class="head-controls">
        <select v-model="pollFilter" class="compact-select" aria-label="Filtrer les exécutions">
          <option value="all">Tous</option>
          <option value="errors">Erreurs uniquement</option>
          <option v-for="job in availableJobs" :key="job" :value="job">
            {{ friendlyJobName(job) }}
          </option>
        </select>
        <span v-if="nextPoll.next_run_seconds != null" class="countdown-badge">
          <Clock class="inline-icon" />
          <span>{{ countdown }}</span>
        </span>
      </div>
    </template>

    <div v-if="filteredPolls.length" class="jobs-list">
      <div v-for="run in filteredPolls" :key="run.id" class="job-item">
        <div
          class="job-main"
          :class="{ clickable: Boolean(run.errors), has_error: Boolean(run.errors) }"
          :tabindex="run.errors ? 0 : undefined"
          :role="run.errors ? 'button' : undefined"
          :aria-expanded="run.errors ? Boolean(expandedErrors[run.id]) : undefined"
          @click="run.errors ? toggleError(run.id) : null"
          @keydown.enter="run.errors ? toggleError(run.id) : null"
          @keydown.space.prevent="run.errors ? toggleError(run.id) : null"
        >
          <div class="job-identity">
            <div class="job-icon-wrap" :class="{ error: Boolean(run.errors) }">
              <component :is="jobIcon(run.job)" class="job-icon" />
            </div>
            <div class="job-titles">
              <strong>{{ friendlyJobName(run.job) }}</strong>
              <span class="job-time">{{ formatDate(run.started_at) }}</span>
            </div>
          </div>
          <span class="badge" :class="run.errors ? 'failed' : 'available'">
            {{ run.errors ? `${run.errors} erreur(s)` : `${run.items_processed || 0} traités` }}
          </span>
        </div>

        <div v-if="expandedErrors[run.id]" class="error-detail-box">
          <div class="error-box-header">
            <span class="error-box-title">Détail de l'erreur</span>
            <button
              class="btn-copy"
              type="button"
              :title="copiedId === run.id ? 'Copié !' : 'Copier l\'erreur'"
              @click.stop="copyError(run.id, run.error_detail)"
            >
              <Check v-if="copiedId === run.id" class="btn-copy-icon text-success" />
              <Copy v-else class="btn-copy-icon" />
              <span>{{ copiedId === run.id ? 'Copié' : 'Copier' }}</span>
            </button>
          </div>
          <code>{{ run.error_detail }}</code>
        </div>
      </div>
    </div>

  </PanelCard>
</template>

<script setup lang="ts">
import { formatDateTimeShort as formatDate } from '@/utils/format';
import { Check, Clock, Copy, Download, Languages, RefreshCw, Tv } from '@lucide/vue';
import { computed, reactive, ref } from 'vue';
import PanelCard from '@/components/ui/PanelCard.vue';

export interface PollRun {
  id: string | number;
  job: string;
  started_at?: string;
  errors?: number;
  items_processed?: number;
  error_detail?: string;
}

export interface NextPollInfo {
  next_run_seconds?: number | null;
}

const props = withDefaults(
  defineProps<{
    polls?: PollRun[];
    nextPoll?: NextPollInfo;
    countdown?: string;
  }>(),
  {
    polls: () => [],
    nextPoll: () => ({}),
    countdown: '-',
  }
);

const pollFilter = ref('all');
const copiedId = ref<string | number | null>(null);

const availableJobs = computed(() => {
  const jobs = new Set(props.polls.map((p) => p.job));
  return Array.from(jobs).filter(Boolean);
});

const filteredPolls = computed(() => {
  if (pollFilter.value === 'all') return props.polls;
  if (pollFilter.value === 'errors') return props.polls.filter((p) => p.errors);
  return props.polls.filter((p) => p.job === pollFilter.value);
});

const expandedErrors = reactive<Record<string | number, boolean>>({});

function toggleError(id: string | number): void {
  expandedErrors[id] = !expandedErrors[id];
}

async function copyError(id: string | number, detail?: string): Promise<void> {
  if (!detail) return;
  try {
    await navigator.clipboard.writeText(detail);
    copiedId.value = id;
    setTimeout(() => {
      if (copiedId.value === id) copiedId.value = null;
    }, 2000);
  } catch {
    // Clipboard non disponible
  }
}

function friendlyJobName(job: string): string {
  const mapping: Record<string, string> = {
    watchlist_poll: 'Watchlist Plex',
    arr_sync: 'Sync Sonarr/Radarr',
    vff_check: 'Analyse VF',
  };
  return mapping[job] || job;
}

function jobIcon(job: string) {
  switch (job) {
    case 'watchlist_poll':
      return Tv;
    case 'arr_sync':
      return Download;
    case 'vff_check':
      return Languages;
    default:
      return RefreshCw;
  }
}
</script>

<style scoped lang="scss">
.recent-jobs-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.head-controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.countdown-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: var(--fs-xs);
  color: var(--muted);
  white-space: nowrap;
}

.inline-icon {
  width: 12px;
  height: 12px;
}

.jobs-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.job-item {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border);
  overflow: hidden;
}

.job-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  gap: var(--space-3);
}

.job-main.clickable {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.job-main.clickable:hover {
  background: var(--surface);
}

.job-identity {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.job-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-xs);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
  flex-shrink: 0;
}

.job-icon-wrap.error {
  color: var(--danger, #ef4444);
  border-color: rgba(239, 68, 68, 0.3);
}

.job-icon {
  width: 16px;
  height: 16px;
}

.job-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.job-titles strong {
  font-size: var(--fs-sm);
  color: var(--text);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.job-time {
  font-size: var(--fs-xs);
  color: var(--muted);
}

.error-detail-box {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--surface);
  border-top: 1px solid var(--border);
}

.error-box-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.error-box-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--danger, #ef4444);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.btn-copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.btn-copy:hover {
  color: var(--text);
  border-color: var(--text);
}

.btn-copy-icon {
  width: 12px;
  height: 12px;
}

.text-success {
  color: var(--success);
}

.error-detail-box code {
  display: block;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.4;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
}
</style>
