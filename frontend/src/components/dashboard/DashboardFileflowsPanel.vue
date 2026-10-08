<template>
  <!-- Encodage FileFlows sur l'accueil : le traitement en cours, la file et les derniers
       echecs. Absent tant que FileFlows n'est pas branche. -->
  <PanelCard
    v-if="status?.configured"
    title="Encodage"
    :description="status.paused ? 'FileFlows est en pause.' : 'Traitements FileFlows : réencodage et correction des pistes.'"
    panel-class="ff-dashboard-panel"
    :loading="query.isPending.value"
    :error="offline"
  >
    <template #action><RouterLink to="/encoding" class="panel-link">Tout voir</RouterLink></template>

    <template v-if="status.connected">
      <RouterLink v-for="runner in status.runners || []" :key="runner.path" to="/encoding?status=2" class="ff-runner">
        <span class="ff-runner-head">
          <LoaderCircle class="spin" aria-hidden="true" />
          <strong>{{ runner.media ? mediaTitle(runner.media) : fileBaseName(runner.name) }}</strong>
          <span v-if="status.time" class="ff-time">{{ status.time }}</span>
        </span>
        <span class="ff-step">{{ runner.step || 'Démarrage…' }}</span>
        <UiProgress v-if="runner.percent" :value="runner.percent" :label="`${runner.percent} %`" />
      </RouterLink>
      <p v-if="!status.runners?.length" class="ff-idle">
        <PauseCircle v-if="status.paused" aria-hidden="true" /><CheckCircle2 v-else aria-hidden="true" />
        {{ status.paused ? 'En pause' : status.queue ? 'En attente du prochain fichier' : 'Aucun traitement en cours' }}
      </p>

      <div v-if="failures.length" class="ff-failures">
        <span class="ff-label">Derniers échecs</span>
        <RouterLink v-for="file in failures" :key="file.uid" to="/encoding?status=4" class="ff-failure" :title="file.failure_reason || file.name">
          <XCircle aria-hidden="true" />
          <span>{{ file.media ? mediaTitle(file.media) : fileBaseName(file.name) }}</span>
        </RouterLink>
      </div>

      <dl class="ff-stats">
        <div><dt>en attente</dt><dd>{{ status.queue ?? 0 }}</dd></div>
        <div><dt>traités</dt><dd>{{ status.processed ?? 0 }}</dd></div>
        <div :class="{ 'ff-failed': status.failed }"><dt>en échec</dt><dd>{{ status.failed ?? 0 }}</dd></div>
      </dl>
    </template>
  </PanelCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CheckCircle2, LoaderCircle, PauseCircle, XCircle } from '@lucide/vue';
import PanelCard from '@/components/ui/PanelCard.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import { fileBaseName, useFileflowsStatus, type FileflowsMedia } from '@/composables/useFileflows';

const { query, status } = useFileflowsStatus();
const offline = computed(() => (status.value?.configured && status.value.connected === false ? `FileFlows ne répond pas : ${status.value.error || 'connexion impossible'}` : ''));
const failures = computed(() => (status.value?.recent_failed || []).slice(0, 3));

function mediaTitle(media: FileflowsMedia): string {
  return media.year ? `${media.title} (${media.year})` : media.title;
}
</script>

<style scoped lang="scss">
.ff-runner { display: grid; gap: 6px; padding: var(--space-3); border-radius: var(--inset-radius); background: var(--surface-2); color: var(--text); text-decoration: none; }
.ff-runner:hover { background: var(--surface-3); }
.ff-runner + .ff-runner { margin-top: var(--space-2); }
.ff-runner-head { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.ff-runner-head svg { flex: none; width: 16px; height: 16px; color: var(--blue-text); }
.ff-runner-head strong { overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
.ff-time { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.ff-step { overflow: hidden; color: var(--muted); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.ff-idle { display: flex; align-items: center; gap: var(--space-2); margin: 0; padding: var(--space-3); border-radius: var(--inset-radius); background: var(--surface-2); color: var(--muted); font-size: var(--fs-sm); }
.ff-idle svg { width: 16px; height: 16px; }
.ff-failures { display: grid; gap: 4px; margin-top: var(--space-3); }
.ff-label { color: var(--muted); font-size: var(--fs-xs); }
.ff-failure { display: flex; align-items: center; gap: var(--space-2); min-width: 0; color: var(--text); font-size: var(--fs-sm); text-decoration: none; }
.ff-failure:hover span { text-decoration: underline; }
.ff-failure svg { flex: none; width: 14px; height: 14px; color: var(--red-text); }
.ff-failure span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ff-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); margin: auto 0 0; padding-top: var(--space-3); }
.ff-stats div { display: flex; flex-direction: column-reverse; justify-content: flex-end; gap: 2px; min-width: 0; padding: var(--space-2) var(--space-3); border-radius: var(--inset-radius); background: var(--surface-2); }
.ff-stats dd { margin: 0; color: var(--text); font-size: var(--fs-lg); font-weight: 700; font-variant-numeric: tabular-nums; }
.ff-stats dt { overflow: hidden; color: var(--muted); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.ff-stats .ff-failed dd { color: var(--red-text); }
.spin { animation: spin 1.2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
