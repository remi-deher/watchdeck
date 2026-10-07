<template>
  <!-- Ce qui s'est mal passe : acquisitions bloquees et demandes en echec. Les demandes a
       valider vivent dans Demandes et dans l'apercu de l'administration. Une carte vide le
       dit en une ligne au lieu de disparaitre. -->
  <div class="dashboard-todo">
    <section class="panel todo-card">
      <header class="todo-head">
        <div class="todo-title"><h2>Alertes</h2></div>
        <span v-if="alertCount" class="todo-summary">{{ alertSummary }}</span>
      </header>
      <template v-if="alertCount">
        <RouterLink v-for="row in blocked.slice(0, 3)" :key="row.id || row.queue_id || row.title" to="/downloads" class="todo-alert is-warning">
          <AlertTriangle aria-hidden="true" />
          <div class="todo-main">
            <strong>{{ row.title }}</strong>
            <span>{{ row.instance || 'Sonarr / Radarr' }} · {{ reason(row) }}</span>
          </div>
          <ChevronRight class="todo-chevron" aria-hidden="true" />
        </RouterLink>
        <RouterLink v-if="failedCount" :to="{ path: '/library', query: { status: 'failed' } }" class="todo-alert is-danger">
          <XCircle aria-hidden="true" />
          <div class="todo-main">
            <strong>{{ failedCount }} demande{{ failedCount > 1 ? 's' : '' }} en échec</strong>
            <span>Consulter et relancer les demandes concernées</span>
          </div>
          <ChevronRight class="todo-chevron" aria-hidden="true" />
        </RouterLink>
      </template>
      <p v-else class="todo-empty"><CheckCircle2 aria-hidden="true" />Rien à signaler, tout tourne normalement.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { AlertTriangle, CheckCircle2, ChevronRight, XCircle } from '@lucide/vue';
import { blockedQueueRows } from './dashboardAttention';

export interface ActionRow {
  id?: number | string;
  queue_id?: number | string;
  title?: string;
  year?: number | string;
  media_type?: string;
  poster_url?: string | null;
  requested_by?: string;
  plex_user?: string;
  plex_user_id?: string;
  instance?: string;
  status?: string;
  tracked_state?: string;
  error?: string;
  waiting_reason?: string;
  [key: string]: any;
}

const props = withDefaults(
  defineProps<{
    queue?: ActionRow[];
    failedCount?: number;
  }>(),
  {
    queue: () => [],
    failedCount: 0,
  }
);

const blocked = computed(() => blockedQueueRows(props.queue));
const alertCount = computed(() => blocked.value.length + Number(props.failedCount || 0));
const alertSummary = computed(() => {
  const parts: string[] = [];
  if (blocked.value.length) parts.push(`${blocked.value.length} bloqué${blocked.value.length > 1 ? 's' : ''}`);
  if (props.failedCount) parts.push(`${props.failedCount} échec${props.failedCount > 1 ? 's' : ''}`);
  return parts.join(' · ');
});

function reason(row: ActionRow): string {
  return (
    row.error ||
    row.waiting_reason ||
    ((row.tracked_state || '').toLowerCase() === 'importpending' ? 'Téléchargé, pas encore importé' : 'Téléchargement en erreur')
  );
}
</script>

<style scoped lang="scss">
.dashboard-todo { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); }
.todo-card { display: grid; gap: var(--space-3); align-content: start; min-width: 0; }
.todo-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.todo-summary { color: var(--muted); font-size: var(--fs-sm); }

.todo-main { display: grid; gap: var(--space-1); flex: 1; min-width: 0; }
.todo-main strong { overflow: hidden; font-size: var(--fs-md); text-overflow: ellipsis; white-space: nowrap; }
.todo-main span { color: var(--muted); font-size: var(--fs-sm); }

.todo-alert { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 14px; border-radius: var(--inset-radius); color: var(--text); text-decoration: none; transition: background-color var(--motion-duration-instant) var(--motion-ease-standard); }
.todo-alert > svg:first-child { flex: none; width: 20px; height: 20px; }
.todo-alert.is-warning { background: color-mix(in srgb, var(--amber) 9%, transparent); }
.todo-alert.is-warning > svg:first-child { color: var(--amber-text); }
.todo-alert.is-danger { background: color-mix(in srgb, var(--red) 9%, transparent); }
.todo-alert.is-danger > svg:first-child { color: var(--red-text); }
.todo-alert:hover { background: color-mix(in srgb, var(--text) 6%, var(--surface-2)); }
.todo-chevron { flex: none; width: 16px; height: 16px; color: var(--muted); }

.todo-empty { display: flex; align-items: center; gap: var(--space-2); margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.todo-empty svg { width: 18px; height: 18px; color: var(--green); }

</style>
