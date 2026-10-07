<template>
  <section class="overview-tasks" aria-labelledby="overview-tasks-title">
    <header class="overview-head">
      <h2 id="overview-tasks-title">Tâches</h2>
      <span class="overview-head__spacer"></span>
      <RouterLink class="overview-head__more" to="/settings/automation/scheduled-tasks">Planification</RouterLink>
    </header>
    <ul class="overview-tasks__list">
      <li v-for="row in rows" :key="row.job" class="overview-tasks__row">
        <span class="overview-tasks__name">{{ row.label }}</span>
        <small>{{ row.when }}</small>
        <span class="overview-pill" :class="`is-${row.tone}`">{{ row.status }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { ScheduledTaskState } from '@/adminAttention';
import { formatRelativeDate, parseApiDate } from '@/utils/format';

const props = withDefaults(defineProps<{ tasks: ScheduledTaskState[]; limit?: number }>(), { limit: 5 });

/** Ce qui a échoué d'abord, puis les passages les plus récents : la liste sert à voir où ça cloche. */
const rows = computed(() => {
  const stamp = (task: ScheduledTaskState) => (task.state?.finished_at ? parseApiDate(task.state.finished_at).getTime() : 0);
  return [...props.tasks]
    .sort((a, b) => Number(b.state?.status === 'failed') - Number(a.state?.status === 'failed') || stamp(b) - stamp(a))
    .slice(0, props.limit)
    .map((task) => {
      const failed = task.state?.status === 'failed';
      const finished = task.state?.finished_at;
      return {
        job: task.job,
        label: task.label,
        when: finished ? formatRelativeDate(finished) : 'Jamais exécutée',
        status: failed ? 'Échec' : finished ? 'OK' : 'En attente',
        tone: failed ? 'error' : finished ? 'ok' : 'off',
      };
    });
});
</script>

<style scoped lang="scss">
.overview-tasks { display: grid; gap: var(--space-3); min-width: 0; align-content: start; }
.overview-head { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.overview-head h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-lg); }
.overview-head__spacer { flex: 1; }
.overview-head__more { color: var(--muted); font-size: var(--fs-sm); text-decoration: none; }
.overview-head__more:hover { color: var(--accent); }

.overview-tasks__list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
  overflow: hidden;
}
.overview-tasks__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
}
.overview-tasks__row + .overview-tasks__row { border-top: 1px solid var(--divider); }
.overview-tasks__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.overview-tasks__row small { color: var(--muted); white-space: nowrap; }

.overview-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 650;
  white-space: nowrap;
}
.overview-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.overview-pill.is-ok { color: var(--green-text); background: color-mix(in srgb, var(--green) 12%, transparent); }
.overview-pill.is-error { color: var(--red-text); background: color-mix(in srgb, var(--red) 14%, transparent); }
</style>
