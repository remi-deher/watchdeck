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
          <UiButton size="sm" :disabled="running || meta.enabled === false" @click="run(String(key))"><Play/>Exécuter</UiButton>
        </template>
      </SettingsItem>
    </SettingsItemList>
    <section v-if="current" class="panel run-panel">
      <UiSectionHeader :title="current.action">
        <template #meta><StatusBadge :status="current.status" /></template>
      </UiSectionHeader>
      <UiProgress :value="current.progress" label="Progression de la tâche" />
      <pre>{{ (current.logs || []).join('\n') }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue';
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
</style>
