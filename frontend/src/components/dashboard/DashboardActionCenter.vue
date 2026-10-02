<template>
  <!-- Deux cartes cote a cote : ce qu'un administrateur doit decider (les demandes a
       valider, avec leurs boutons sur la ligne) et ce qui s'est mal passe (alertes). Une
       carte vide le dit en une ligne au lieu de disparaitre : la grille ne saute pas
       d'une disposition a l'autre au fil des evenements. -->
  <div class="dashboard-todo">
    <section class="panel todo-card">
      <header class="todo-head">
        <div class="todo-title"><h2>Demandes à valider</h2><span v-if="pending.length" class="todo-count">{{ pending.length }}</span></div>
        <RouterLink v-if="pending.length" to="/library?status=pending_approval" class="panel-link">Tout voir</RouterLink>
      </header>
      <template v-if="pending.length">
        <article v-for="row in pending.slice(0, 3)" :key="row.id" class="todo-request">
          <img v-if="row.poster_url" :src="row.poster_url" class="todo-poster" alt="" loading="lazy" decoding="async">
          <div v-else class="todo-poster todo-poster-fallback"><Film aria-hidden="true" /></div>
          <div class="todo-main">
            <strong>{{ row.title }}</strong>
            <span>{{ requestMeta(row) }}</span>
          </div>
          <div class="todo-actions">
            <UiButton @click="$emit('action', row, 'reject')"><template #icon><X :size="16" /></template>Refuser</UiButton>
            <UiButton variant="primary" @click="$emit('action', row, 'approve')"><template #icon><Check :size="16" /></template>Approuver</UiButton>
          </div>
        </article>
      </template>
      <p v-else class="todo-empty"><CheckCircle2 aria-hidden="true" />Aucune demande en attente.</p>
    </section>

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
import { requesterName } from '@/utils/userLabels';
import UiButton from '@/components/ui/UiButton.vue';
import { computed } from 'vue';
import { AlertTriangle, Check, CheckCircle2, ChevronRight, Film, X, XCircle } from '@lucide/vue';
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
    pending?: ActionRow[];
    queue?: ActionRow[];
    failedCount?: number;
  }>(),
  {
    pending: () => [],
    queue: () => [],
    failedCount: 0,
  }
);
defineEmits<{
  (e: 'action', row: ActionRow, actionType: 'approve' | 'reject'): void;
}>();

const blocked = computed(() => blockedQueueRows(props.queue));
const alertCount = computed(() => blocked.value.length + Number(props.failedCount || 0));
const alertSummary = computed(() => {
  const parts: string[] = [];
  if (blocked.value.length) parts.push(`${blocked.value.length} bloqué${blocked.value.length > 1 ? 's' : ''}`);
  if (props.failedCount) parts.push(`${props.failedCount} échec${props.failedCount > 1 ? 's' : ''}`);
  return parts.join(' · ');
});

const TYPE_LABELS: Record<string, string> = { movie: 'Film', tv: 'Série', show: 'Série' };
function requestMeta(row: ActionRow): string {
  const who = requesterName(row);
  return [TYPE_LABELS[String(row.media_type || '')], row.year, who && `demandé par ${who}`].filter(Boolean).join(' · ');
}

function reason(row: ActionRow): string {
  return (
    row.error ||
    row.waiting_reason ||
    ((row.tracked_state || '').toLowerCase() === 'importpending' ? 'Téléchargé, pas encore importé' : 'Téléchargement en erreur')
  );
}
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.dashboard-todo { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: var(--space-4); align-items: stretch; }
.todo-card { display: grid; gap: var(--space-3); align-content: start; min-width: 0; }
.todo-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.todo-title { display: flex; align-items: center; gap: var(--space-2); }
.todo-title h2 { margin: 0; font-size: var(--fs-lg); }
.todo-count { min-width: 24px; padding: 2px 8px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); font-size: var(--fs-xs); font-weight: 700; text-align: center; }
.todo-summary { color: var(--muted); font-size: var(--fs-sm); }

.todo-request { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border-radius: var(--inset-radius); background: var(--surface-2); }
.todo-poster { flex: none; width: 44px; height: 64px; border-radius: var(--radius-xs); object-fit: cover; background: var(--media-placeholder); }
.todo-poster-fallback { display: grid; place-items: center; color: var(--muted); }
.todo-poster-fallback svg { width: 18px; height: 18px; }
.todo-main { display: grid; gap: var(--space-1); flex: 1; min-width: 0; }
.todo-main strong { overflow: hidden; font-size: var(--fs-md); text-overflow: ellipsis; white-space: nowrap; }
.todo-main span { color: var(--muted); font-size: var(--fs-sm); }
.todo-actions { display: flex; flex: none; gap: var(--space-2); }

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

@container page (max-width: 957px) {
  .dashboard-todo { grid-template-columns: 1fr; }
}

@include bp.until(tablet) {
  .todo-request { flex-wrap: wrap; }
  .todo-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
  .todo-actions > * { min-height: var(--touch-target); }
}
</style>
