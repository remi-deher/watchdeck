<template>
  <ConfigureTemplate :sections="sections" v-bind="page.bind.value" @save="page.save" @cancel="page.cancel">
    <!-- La tâche en cours reste en haut : sous la liste, elle partait hors de l'écran. -->
    <template v-if="current" #section-run>
      <div class="run-panel" aria-live="polite">
        <StatusBadge :status="current.status" />
        <UiProgress :value="current.progress" label="Progression de la tâche" />
        <!-- Passes longues (préchargement des images) : le média en cours, avec sa pochette. -->
        <div v-if="current.current" class="run-media">
          <img v-if="current.current.cover_url" class="run-media__cover" :src="current.current.cover_url" alt="" width="48" height="72" decoding="async">
          <span v-else class="run-media__cover run-media__cover--empty" aria-hidden="true" />
          <div class="run-media__text">
            <strong>{{ current.current.title }}</strong>
            <small>{{ current.current.done }} sur {{ current.current.total }}</small>
          </div>
        </div>
        <details v-if="(current.logs || []).length" class="run-logs">
          <summary>Journal du passage</summary>
          <pre>{{ current.logs.join(String.fromCharCode(10)) }}</pre>
        </details>
      </div>
    </template>

    <template v-for="group in groups" :key="group.key" #[`section-${group.key}`]>
      <ResourceList :resources="resourcesOf(group.actions)" @action="(resource, key) => run(resource.key, actions[resource.key])" />
    </template>

    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />
  </ConfigureTemplate>
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>

<script setup lang="ts">
import ConfirmModal from '@/components/ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import UiProgress from '@/components/ui/UiProgress.vue';
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Play, Wrench } from "@lucide/vue";
import { api } from "@/api";
import { useRealtime } from "@/events";
import ConfigureTemplate from '@/components/templates/ConfigureTemplate.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import { useSettingsPage } from '@/composables/useSettingsPage';
import ResourceList from '@/components/templates/configure/ResourceList.vue';
import type { ConfigureResource } from '@/components/templates/configure/types';
import { formatRelativeDate } from '@/utils/format';
import { groupActions, isSensitive, lastRunLabel, type MaintenanceMeta } from './maintenanceGroups';

const page = useSettingsPage();
const runId = ref<string>();
const actionError = ref('');
const actionsQuery = useQuery({ queryKey: ['settings', 'maintenance', 'actions'], queryFn: () => api<Record<string, any>>('/api/maintenance/actions') });
const actions = computed<Record<string, MaintenanceMeta>>(() => actionsQuery.data.value || {});
const groups = computed(() => groupActions(actions.value));
const runQuery = useQuery({
  queryKey: computed(() => ['settings', 'maintenance', 'run', runId.value]),
  queryFn: () => api<any>(`/api/maintenance/run/${runId.value}`),
  enabled: computed(() => Boolean(runId.value)),
});
const current = computed(() => runQuery.data.value || null);
const running = computed(() => startMutation.isPending.value || Boolean(runId.value && !['done', 'error'].includes(current.value?.status)));
const error = computed(() => actionError.value || (actionsQuery.error.value as Error | null)?.message || (runQuery.error.value as Error | null)?.message || '');

/* La tache en cours, puis un groupe d'actions par section. */
const sections = computed(() => [
  ...(current.value ? [{ key: 'run', title: actions.value[current.value.action]?.label || String(current.value.action), description: 'Passage en cours.', icon: Wrench }] : []),
  ...groups.value.map((group) => ({ key: group.key, title: group.label, description: group.hint, icon: Wrench, keywords: group.actions.map((key) => `${actions.value[key]?.label || key} ${actions.value[key]?.description || ''}`) })),
]);

async function load(): Promise<void> {
  actionError.value = '';
  await actionsQuery.refetch();
}

const queryClient = useQueryClient();
// Un passage terminé change le « dernier passage » affiché : on relit la liste.
watch(() => current.value?.status, (status) => {
  if (status === 'done' || status === 'error') void queryClient.invalidateQueries({ queryKey: ['settings', 'maintenance', 'actions'] });
});
const runningAction = computed(() => (running.value && current.value ? String(current.value.action) : ''));
const statusOf = (key: string) => lastRunLabel(actions.value[key], runningAction.value === key, formatRelativeDate);

const startMutation = useMutation({ mutationFn: (action: string) => api<any>(`/api/maintenance/run/${action}`, { method: 'POST' }), retry: 0 });

/* Une action de maintenance : son dernier passage, et « Exécuter » (« Lancer… » si elle est sensible). */
const TONES: Record<string, 'ok' | 'error' | 'warn' | 'off'> = { active: 'ok', error: 'error', inactive: 'off' };
function resourcesOf(keys: string[]): ConfigureResource[] {
  return keys.map((key) => {
    const meta = actions.value[key];
    const status = statusOf(key);
    return {
      key,
      label: meta.label || key,
      subtitle: meta.enabled === false ? meta.disabled_reason || '' : meta.description,
      state: status.text ? { tone: TONES[status.status] || 'off', text: status.text } : undefined,
      editable: false,
      actions: [{ key: 'run', label: isSensitive(meta) ? 'Lancer…' : 'Exécuter', icon: Play, tone: isSensitive(meta) ? 'danger' as const : undefined, disabled: running.value || meta.enabled === false }],
    };
  });
}

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

async function run(action: string, meta?: MaintenanceMeta): Promise<void> {
  actionError.value = '';
  // Une action destructive porte son avertissement : rien ne part avant l'accord.
  if (meta?.confirm && !await askConfirm({
    title: meta.label,
    message: meta.confirm,
    confirmLabel: 'Exécuter',
    danger: meta.color === 'danger',
  })) return;
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
.run-panel { display: grid; gap: var(--space-3); }
.run-logs summary { color: var(--muted); cursor: pointer; font-size: var(--fs-sm); }
.run-media { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.run-media__cover { flex: none; width: 48px; height: 72px; border-radius: var(--radius-xs); object-fit: cover; background: var(--surface-2); }
.run-media__text { display: grid; gap: 2px; min-width: 0; }
.run-media__text strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-media__text small { color: var(--muted); }
</style>
