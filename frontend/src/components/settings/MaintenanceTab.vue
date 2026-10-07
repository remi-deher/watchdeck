<template>
  <div class="maintenance-tab">
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />
    <!-- La tâche en cours reste en haut : sous la liste, elle partait hors de l'écran. -->
    <section v-if="current" class="panel run-panel" aria-live="polite">
      <UiSectionHeader :title="actions[current.action]?.label || current.action">
        <template #meta><StatusBadge :status="current.status" /></template>
      </UiSectionHeader>
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
    </section>
    <SettingsItemList v-for="group in groups" :key="group.key" :title="group.label" :subtitle="group.hint">
      <SettingsItem
        v-for="key in group.actions"
        :key="key"
        :title="actions[key].label || key"
        :subtitle="actions[key].enabled === false ? actions[key].disabled_reason || '' : actions[key].description"
        :status="statusOf(key).status"
        :status-text="statusOf(key).text"
        :keywords="actions[key].description"
      >
        <template #actions>
          <UiButton
            size="sm"
            :variant="isSensitive(actions[key]) ? 'danger' : 'secondary'"
            :disabled="running || actions[key].enabled === false"
            @click="run(key, actions[key])"
          ><Play/>{{ isSensitive(actions[key]) ? 'Lancer…' : 'Exécuter' }}</UiButton>
        </template>
      </SettingsItem>
    </SettingsItemList>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
  </div>
</template>

<script setup lang="ts">
import ConfirmModal from '@/components/ConfirmModal.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { useConfirm } from '@/composables/useConfirm';
import UiProgress from '@/components/ui/UiProgress.vue';
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Play } from "@lucide/vue";
import { api } from "@/api";
import { useRealtime } from "@/events";
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';
import SettingsItem from './SettingsItem.vue';
import SettingsItemList from './SettingsItemList.vue';
import { formatRelativeDate } from '@/utils/format';
import { groupActions, isSensitive, lastRunLabel, type MaintenanceMeta } from './maintenanceGroups';

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
.maintenance-tab { display: flex; flex-direction: column; gap: var(--space-3); }
.run-logs { margin-top: var(--space-3); }
.run-logs summary { color: var(--muted); cursor: pointer; font-size: var(--fs-sm); }
.run-media { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-3); min-width: 0; }
.run-media__cover { flex: none; width: 48px; height: 72px; border-radius: var(--radius-xs); object-fit: cover; background: var(--surface-2); }
.run-media__text { display: grid; gap: 2px; min-width: 0; }
.run-media__text strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-media__text small { color: var(--muted); }
</style>
