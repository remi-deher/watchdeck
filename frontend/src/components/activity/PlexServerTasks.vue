<template>
  <!-- Ce que le serveur Plex fait en arriere-plan : une generation de miniatures ou une
       analyse peut expliquer un serveur lent ou un transcodage qui peine. -->
  <section class="plex-tasks" aria-labelledby="plex-tasks-title">
    <header>
      <h3 id="plex-tasks-title"><Cpu aria-hidden="true"/>Tâches du serveur Plex</h3>
      <small v-if="!error">{{ tasks.length ? `${tasks.length} en cours` : 'Aucune tâche en cours' }}</small>
    </header>
    <p v-if="error" class="plex-tasks-error" role="status">{{ error }}</p>
    <ul v-else-if="tasks.length">
      <li v-for="task in tasks" :key="task.uuid">
        <div class="task-text">
          <strong>{{ task.title || task.type }}</strong>
          <small v-if="task.subtitle">{{ task.subtitle }}</small>
        </div>
        <span class="task-progress" :aria-label="task.progress != null ? `${Math.round(task.progress)} %` : 'Progression inconnue'">
          <span class="bar" :class="{ indeterminate: task.progress == null }"><i :style="task.progress != null ? { width: `${task.progress}%` } : undefined"></i></span>
          <small>{{ task.progress != null ? `${Math.round(task.progress)} %` : '…' }}</small>
        </span>
        <UiButton
          v-if="task.cancellable"
          variant="ghost"
          size="sm"
          icon-only
          :title="`Annuler « ${task.title || task.type} »`"
          :aria-label="`Annuler ${task.title || task.type}`"
          :loading="cancelling === task.uuid"
          @click="cancel(task)"
        ><X/></UiButton>
      </li>
    </ul>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { Cpu, X } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import UiButton from '@/components/ui/UiButton.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import { humanizeError } from '@/utils/apiError';

interface PlexTask { uuid: string; type?: string; title?: string; subtitle?: string; progress: number | null; cancellable: boolean }

const queryClient = useQueryClient();
const tasksQuery = useQuery({
  queryKey: ['playback', 'server-activities'],
  queryFn: ({ signal }) => api<{ activities: PlexTask[] }>('/api/playback/server-activities', { signal }),
  retry: 0,
});
const tasks = computed(() => tasksQuery.data.value?.activities || []);
const actionError = ref('');
const error = computed(() => actionError.value
  || (tasksQuery.error.value ? humanizeError(tasksQuery.error.value) || 'Tâches du serveur Plex indisponibles.' : ''));
const cancelling = ref('');
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

function load(): Promise<void> {
  actionError.value = '';
  return queryClient.invalidateQueries({ queryKey: ['playback', 'server-activities'] });
}

/* Annuler une tache n'est pas anodin (une analyse devra etre relancee) : on demande. */
async function cancel(task: PlexTask): Promise<void> {
  const ok = await askConfirm({
    title: 'Annuler la tâche Plex',
    message: `« ${task.title || task.type} » s’arrêtera sur le serveur Plex ; il faudra la relancer depuis Plex.`,
    confirmLabel: 'Annuler la tâche',
    danger: true,
  });
  if (!ok) return;
  cancelling.value = task.uuid;
  try {
    await api(`/api/playback/server-activities/${encodeURIComponent(task.uuid)}`, { method: 'DELETE' });
    await load();
  } catch (err: any) {
    actionError.value = err?.message || 'Annulation impossible.';
  } finally {
    cancelling.value = '';
  }
}

/* La collecte des lectures tourne en continu : on suit son rythme plutot que d'ajouter
   un minuteur a nous. */
useRealtime(['activity.updated'], () => void load(), { debounceMs: 2000 });

defineExpose({ load });
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.plex-tasks { container: plex-tasks / inline-size; display: grid; gap: 10px; margin-top: 16px; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface-2); }
.plex-tasks header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px 12px; }
.plex-tasks h3 { display: inline-flex; align-items: center; gap: 8px; margin: 0; font-size: var(--fs-md); }
.plex-tasks h3 svg { width: 17px; height: 17px; color: var(--accent); }
.plex-tasks header small, .task-text small, .task-progress small { color: var(--text-muted); font-size: var(--fs-xs); }
.plex-tasks ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.plex-tasks li { display: grid; grid-template-columns: minmax(0, 1fr) minmax(90px, 160px) auto; align-items: center; gap: 12px; padding-top: 8px; border-top: 1px solid var(--border-subtle); }
.plex-tasks li:first-child { padding-top: 0; border-top: 0; }
.task-text { display: grid; min-width: 0; }
.task-text strong, .task-text small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-progress { display: grid; grid-template-columns: minmax(0, 1fr) 38px; align-items: center; gap: 8px; }
.bar { position: relative; height: 6px; overflow: hidden; border-radius: var(--radius-pill); background: rgb(var(--ink) / .1); }
.bar i { display: block; height: 100%; border-radius: inherit; background: var(--accent); }
.bar.indeterminate i { width: 35%; animation: task-indeterminate 1.4s ease-in-out infinite; }
@keyframes task-indeterminate { from { transform: translateX(-100%); } to { transform: translateX(300%); } }
@media (prefers-reduced-motion: reduce) { .bar.indeterminate i { animation: none; width: 100%; opacity: .4; } }
.plex-tasks-error { margin: 0; color: var(--amber-text); font-size: var(--fs-sm); }
/* Etroit : la barre de progression passe sous le titre plutot que de l'ecraser. */
@container plex-tasks (max-width: 480px) { .plex-tasks li { grid-template-columns: minmax(0, 1fr) auto; } .task-progress { grid-column: 1 / -1; grid-row: 2; } }
</style>
