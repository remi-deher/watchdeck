<template>
  <div class="maintenance-tab">
    <UiFeedback v-if="error" type="error" :message="error" retry @retry="load" />
    <SettingsItemList title="Maintenance" subtitle="Opérations ponctuelles, avec leur progression en direct.">
      <SettingsItem
        v-for="(meta, key) in actions"
        :key="key"
        :title="meta.label || String(key)"
        :subtitle="meta.enabled === false ? meta.disabled_reason : meta.description"
        :status="meta.enabled === false ? 'error' : 'neutral'"
        :status-text="meta.enabled === false ? 'Indisponible' : ''"
        :keywords="meta.description"
      >
        <template #actions>
          <UiButton size="sm" :disabled="running || meta.enabled === false" @click="run(String(key), meta)"><Play/>Exécuter</UiButton>
        </template>
      </SettingsItem>
    </SettingsItemList>
    <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
    <section v-if="current" class="panel run-panel">
      <UiSectionHeader :title="actions[current.action]?.label || current.action">
        <template #meta><StatusBadge :status="current.status" /></template>
      </UiSectionHeader>
      <UiProgress :value="current.progress" label="Progression de la tâche" />
      <!-- Passes longues (préchargement des images) : le média en cours, avec sa pochette. -->
      <div v-if="current.current" class="run-media" aria-live="polite">
        <img v-if="current.current.cover_url" class="run-media__cover" :src="current.current.cover_url" alt="" width="48" height="72" decoding="async">
        <span v-else class="run-media__cover run-media__cover--empty" aria-hidden="true" />
        <div class="run-media__text">
          <strong>{{ current.current.title }}</strong>
          <small>{{ current.current.done }} sur {{ current.current.total }}</small>
        </div>
      </div>
      <pre>{{ (current.logs || []).join('\n') }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import ConfirmModal from '@/components/ConfirmModal.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { useConfirm } from '@/composables/useConfirm';
import UiProgress from '@/components/ui/UiProgress.vue';
import { computed, ref } from "vue";
import { useMutation, useQuery } from '@tanstack/vue-query';
import { Play } from "@lucide/vue";
import { api } from "@/api";
import { useRealtime } from "@/events";
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';
import SettingsItem from './SettingsItem.vue';
import SettingsItemList from './SettingsItemList.vue';

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

const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();

async function run(action: string, meta?: Record<string, any>): Promise<void> {
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
.run-media { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-3); min-width: 0; }
.run-media__cover { flex: none; width: 48px; height: 72px; border-radius: var(--radius-xs); object-fit: cover; background: var(--surface-2); }
.run-media__text { display: grid; gap: 2px; min-width: 0; }
.run-media__text strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-media__text small { color: var(--muted); }
</style>
