<template>
  <section class="scan-history">
    <div v-if="liveScan?.status === 'running'" class="scan-live-banner">
      <span class="scan-live-dot" aria-hidden="true" />
      <div class="scan-live-text">
        <strong>Recherche en cours…</strong>
        <span>{{ liveScan.items_scanned || 0 }} / {{ liveScan.total_items || 0 }} recherche(s) effectuée(s)</span>
      </div>
      <div class="scan-live-bar">
        <div class="scan-live-bar-fill" :style="{ width: `${progress}%` }" />
      </div>
    </div>

    <div v-if="loading && !runs.length" class="history-skeletons" aria-hidden="true">
      <div v-for="i in 3" :key="i" class="history-skeleton" />
    </div>

    <table v-else-if="runs.length" class="scan-runs-table">
      <thead><tr><th>Démarré le</th><th>Durée</th><th>Déclenchement</th><th>Recherches</th><th>Suggestions trouvées</th><th>Erreurs</th><th>Statut</th></tr></thead>
      <tbody>
        <template v-for="run in runs" :key="run.id">
          <tr class="run-row" :class="`run-status-${run.status}`" tabindex="0" role="button" :aria-expanded="expandedRunId === run.id" @click="$emit('toggle', run)" @keydown.enter="$emit('toggle', run)">
            <td><ChevronDown v-if="expandedRunId === run.id" :size="14" class="run-chevron" /><ChevronUp v-else :size="14" class="run-chevron is-collapsed" />{{ formatDate(run.started_at) }}</td>
            <td>{{ formatDuration(run.started_at, run.finished_at) }}</td>
            <td>{{ triggerLabel(run.trigger) }}</td>
            <td>{{ run.tasks_scanned }} / {{ run.tasks_total }}</td>
            <td>{{ run.suggestions_found }}</td>
            <td :class="{ 'run-errors': run.tasks_errored > 0 }">{{ run.tasks_errored || 0 }}</td>
            <td><StatusBadge :status="run.status" :label="statusLabel(run.status)" /><span v-if="run.error" class="run-error" :title="run.error">⚠</span></td>
          </tr>
          <tr v-if="expandedRunId === run.id" class="run-detail-row">
            <td colspan="7">
              <div v-if="itemsLoading && !items.length" class="history-skeletons" aria-hidden="true"><div v-for="i in 3" :key="i" class="history-skeleton" /></div>
              <p v-else-if="!items.length" class="empty">Aucun détail disponible pour ce cycle.</p>
              <ul v-else class="run-items-list">
                <li v-for="item in items" :key="item.id" :class="`run-item-status-${item.status}`">
                  <span class="run-item-status-dot" aria-hidden="true" /><span class="run-item-title">{{ item.title }}</span><span class="run-item-badge">{{ itemLabel(item) }}</span>
                </li>
              </ul>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <p v-else class="empty">Aucun cycle de scan enregistré pour le moment.</p>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { ChevronDown, ChevronUp } from '@lucide/vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';

const props = defineProps({
  liveScan: { type: Object, default: null }, runs: { type: Array, default: () => [] }, loading: Boolean,
  expandedRunId: { type: [String, Number], default: null }, items: { type: Array, default: () => [] }, itemsLoading: Boolean,
  formatDate: { type: Function, required: true }, formatDuration: { type: Function, required: true }, statusLabel: { type: Function, required: true },
});
defineEmits(['toggle']);
const progress = computed(() => props.liveScan?.total_items ? Math.min(100, (props.liveScan.items_scanned / props.liveScan.total_items) * 100) : 0);
const triggerLabel = trigger => trigger === 'selection' ? 'Sélection manuelle' : trigger === 'manual' ? 'Manuel' : 'Automatique';
const itemLabel = item => item.status === 'running' ? 'En cours…' : item.status === 'found' ? `${item.release_count} release${item.release_count > 1 ? 's' : ''}` : item.status === 'error' ? 'Erreur' : 'Sans résultat';
</script>

<style scoped>
.scan-history{display:grid;gap:var(--space-3)}.scan-live-banner{display:grid;grid-template-columns:auto minmax(180px,auto) 1fr;align-items:center;gap:12px;padding:12px 16px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--border));border-radius:var(--radius-md);background:color-mix(in srgb,var(--accent) 8%,var(--surface))}.scan-live-dot{width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 20%,transparent)}.scan-live-text{display:grid;gap:2px}.scan-live-text span{color:var(--muted);font-size:var(--fs-xs)}.scan-live-bar{height:6px;overflow:hidden;border-radius:999px;background:var(--surface-2)}.scan-live-bar-fill{height:100%;border-radius:inherit;background:var(--accent);transition:width var(--motion-duration-fast) var(--motion-ease-standard)}.history-skeletons{display:grid;gap:var(--space-3)}.history-skeleton{height:20px;width:45%;border-radius:var(--radius-xs);background:var(--surface-2)}.scan-runs-table{width:100%;border-collapse:collapse}.scan-runs-table th,.scan-runs-table td{padding:10px;border-bottom:1px solid var(--border);text-align:left;font-size:var(--fs-xs)}.scan-runs-table th{color:var(--muted)}.run-row{cursor:pointer}.run-row:hover td,.run-row:focus-visible td{background:var(--surface-2)}.run-status-failed td,.run-errors,.run-error{color: var(--red-text)}.run-chevron{margin-right:6px;vertical-align:middle}.run-chevron.is-collapsed{transform:rotate(90deg)}.run-detail-row td{padding:12px;background:var(--surface-2)}.run-items-list{display:grid;gap:6px;margin:0;padding:0;list-style:none}.run-items-list li{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;padding:7px;border-radius:var(--radius-xs);background:var(--surface)}.run-item-status-dot{width:7px;height:7px;border-radius:50%;background:var(--muted)}.run-item-status-running .run-item-status-dot{background:var(--accent)}.run-item-status-found .run-item-status-dot{background:var(--success)}.run-item-status-error .run-item-status-dot{background:var(--danger)}.run-item-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.run-item-badge{color:var(--muted);font-size:var(--fs-xs)}.run-item-status-running .run-item-badge{color:var(--accent)}.empty{color:var(--muted)}@media(max-width:760px){.scan-live-banner{grid-template-columns:auto 1fr}.scan-live-bar{grid-column:1/-1}.scan-history{overflow-x:auto}}
</style>
