<template>
  <div class="scan-block">
    <div class="scan-block-header">
      <div class="scan-identity">
        <div class="scan-icon-wrap"><slot name="icon" /></div>
        <div class="scan-titles">
          <div class="scan-title-row">
            <strong>{{ title }}</strong>
            <span class="badge" :class="statusClass">{{ statusLabel }}</span>
          </div>
          <span class="scan-subtitle">{{ subtitle }}</span>
        </div>
      </div>
      <button class="secondary btn-scan-action" :disabled="running" type="button" @click="$emit('action')">
        <RefreshCw :class="{ spinning: running }" />
        <span>{{ actionLabel }}</span>
      </button>
    </div>
    <div v-if="running && progress != null" class="progress-bar-wrap">
      <div class="progress-bar animated" :style="{ width: `${progress}%` }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RefreshCw } from '@lucide/vue';

const props = withDefaults(defineProps<{
  title: string;
  subtitle: string;
  status?: string;
  actionLabel: string;
  progress?: number | null;
}>(), { status: 'idle', progress: null });

defineEmits<{ (e: 'action'): void }>();

const running = computed(() => props.status === 'running');
const statusClass = computed(() => running.value ? 'pending' : props.status === 'failed' ? 'failed' : 'available');
const statusLabel = computed(() => running.value ? 'En cours' : props.status === 'failed' ? 'Erreur' : 'Inactif');
</script>

<style scoped lang="scss">
.scan-block { display: flex; flex-direction: column; gap: var(--space-2); padding: 8px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.scan-block-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.scan-identity { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.scan-icon-wrap { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-xs); background: var(--surface); border: 1px solid var(--border); color: var(--muted); flex-shrink: 0; }
.scan-icon-wrap :deep(svg) { width: 15px; height: 15px; }
.scan-titles { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.scan-title-row { display: flex; align-items: center; gap: var(--space-2); }
.scan-title-row strong { font-size: var(--fs-xs); color: var(--text); font-weight: 600; white-space: nowrap; }
.scan-subtitle { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.btn-scan-action { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 11px; flex-shrink: 0; }
.btn-scan-action svg { width: 12px; height: 12px; }
.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.progress-bar-wrap { width: 100%; height: 3px; background: var(--surface); border-radius: var(--radius-xs); overflow: hidden; }
.progress-bar { height: 100%; border-radius: var(--radius-xs); transition: width .3s ease; }
.progress-bar.animated { background: linear-gradient(90deg, var(--accent) 0%, #38bdf8 100%); }
</style>
