<template>
  <!-- Empilement simple, surtout pas `.settings-grid` : celle-ci est en
       `repeat(auto-fit, minmax(280px, 1fr))` et découpait la page en deux colonnes de
       434px, l'en-tête dans l'une et TOUTE la grille d'actions dans l'autre. Coincée
       dans 435px, cette grille ne pouvait plus afficher qu'une seule carte de large,
       et la moitié de la largeur disponible restait vide. -->
  <div class="maintenance-tab">
    <div class="maintenance-head">
      <p>Opérations contrôlées et progression en direct.</p>
    </div>
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />
    <section class="action-grid">
      <article v-for="(meta, key) in actions" :key="key" class="panel action-card">
        <div>
          <h2>{{ meta.label || key }}</h2>
          <p>{{ meta.description }}</p>
          <p v-if="!meta.enabled" class="text-sm error-text mt-2" style="font-size: var(--fs-sm); color: var(--error);">
            <i class="bi bi-exclamation-triangle"></i> {{ meta.disabled_reason }}
          </p>
        </div>
        <button class="primary" :disabled="running || meta.enabled === false" @click="run(key)">
          <Play/>Executer
        </button>
      </article>
    </section>
    <section v-if="current" class="panel run-panel">
      <UiSectionHeader :title="current.action">
        <template #meta><StatusBadge :status="current.status" /></template>
      </UiSectionHeader>
      <progress :value="current.progress" max="100"></progress>
      <pre>{{ (current.logs || []).join('\n') }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useMutation, useQuery } from '@tanstack/vue-query';
import { Play } from "@lucide/vue";
import { api } from "@/api";
import { useRealtime } from "@/events";
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';

const runId = ref<string>();
const actionError = ref('');
const actionsQuery = useQuery({ queryKey: ['settings', 'maintenance', 'actions'], queryFn: () => api<Record<string, any>>('/api/maintenance/actions') });
const actions = computed(() => actionsQuery.data.value || {});
const runQuery = useQuery({
  queryKey: computed(() => ['settings', 'maintenance', 'run', runId.value]),
  queryFn: () => api<any>(`/api/maintenance/run/${runId.value}`),
  enabled: computed(() => Boolean(runId.value)),
});
const current = computed(() => runQuery.data.value || null);
const running = computed(() => startMutation.isPending.value || Boolean(runId.value && !['done', 'error'].includes(current.value?.status)));
const error = computed(() => actionError.value || (actionsQuery.error.value as Error | null)?.message || (runQuery.error.value as Error | null)?.message || '');

async function load(): Promise<void> {
  actionError.value = '';
  await actionsQuery.refetch();
}

const startMutation = useMutation({ mutationFn: (action: string) => api<any>(`/api/maintenance/run/${action}`, { method: 'POST' }), retry: 0 });

async function run(action: string): Promise<void> {
  actionError.value = '';
  try {
    const data = await startMutation.mutateAsync(action);
    runId.value = data.run_id;
  } catch (e: any) {
    actionError.value = e.message;
  }
}

async function poll(id: string): Promise<void> {
  if (id === runId.value) await runQuery.refetch();
}

useRealtime(['job.updated'], (type?: string, event?: any) => {
  if (runId.value && (!type || event?.run_id === runId.value)) poll(runId.value);
});
</script>

<style scoped lang="scss">
.maintenance-tab { display: flex; flex-direction: column; gap: var(--space-3); }
.maintenance-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.maintenance-head p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
/* Les cartes d'action sont comparables : on les aligne en haut plutôt que de les
   étirer à la hauteur de la plus bavarde de la rangée. */
.maintenance-tab .action-grid { align-items: start; }
.maintenance-tab .action-card { height: 100%; }
</style>
