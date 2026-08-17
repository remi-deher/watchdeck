<template>
  <div class="settings-grid">
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
import { onMounted, ref } from "vue";
import { Play } from "@lucide/vue";
import { api } from "@/api";
import { useRealtime } from "@/events";
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';

const actions = ref<Record<string, any>>({});
const current = ref<any>(null);
const loading = ref(false);
const running = ref(false);
const error = ref('');
let runId: string | undefined;

async function load(): Promise<void> {
  loading.value = true;
  try {
    actions.value = await api('/api/maintenance/actions');
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function run(action: string): Promise<void> {
  running.value = true;
  error.value = '';
  try {
    const data = await api(`/api/maintenance/run/${action}`, { method: 'POST' });
    runId = data.run_id;
    if (runId) poll(runId);
  } catch (e: any) {
    error.value = e.message;
    running.value = false;
  }
}

async function poll(id: string): Promise<void> {
  try {
    current.value = await api(`/api/maintenance/run/${id}`);
    if (['done', 'error'].includes(current.value.status)) {
      running.value = false;
      return;
    }
  } catch (e: any) {
    error.value = e.message;
    running.value = false;
  }
}

useRealtime(['job.updated'], (type?: string, event?: any) => {
  if (runId && (!type || event?.run_id === runId)) poll(runId);
});

onMounted(load);
</script>

<style scoped lang="scss">
.maintenance-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.maintenance-head p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
</style>
