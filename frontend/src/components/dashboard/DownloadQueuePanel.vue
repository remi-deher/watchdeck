<template>
  <PanelCard
    title="File de téléchargement"
    :description="summary"
    :loading="loading"
    loading-message="Chargement…"
    :empty="!queue.length ? 'Aucun téléchargement en cours.' : ''"
  >
    <template #action><RouterLink to="/downloads" class="panel-link">Tout voir</RouterLink></template>

    <component
      :is="queueDetailPath(item) ? 'RouterLink' : 'article'"
      v-for="item in visible"
      :key="rowKey(item)"
      :to="queueDetailPath(item)"
      class="queue-row"
    >
      <img
        v-if="item.poster_url"
        :src="item.poster_url"
        class="mini-poster"
        :alt="`Affiche de ${item.title}`"
        loading="lazy"
        decoding="async"
      >
      <div v-else class="mini-poster mini-poster-fallback"><Film /></div>

      <div class="queue-main">
        <div class="queue-heading">
          <strong>{{ item.title }}</strong>
          <span class="badge" :class="badgeClass(item)">{{ shortStatus(item) }}</span>
        </div>

        <div
          class="queue-progress"
          role="progressbar"
          :aria-valuenow="percent(item)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`Progression de ${item.title}`"
        >
          <i :class="progressClass(item)" :style="{ width: `${percent(item)}%` }" />
        </div>

        <span class="queue-meta">{{ metaLine(item) }}</span>
      </div>
    </component>

    <p v-if="hidden > 0" class="queue-more">
      et {{ hidden }} autre{{ hidden > 1 ? 's' : '' }} en file
    </p>
  </PanelCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PanelCard from '@/components/ui/PanelCard.vue';
import { Film } from '@lucide/vue';
import { formatFileSize } from '@/utils/format';
import {
  isImportPending,
  isUnmatched,
  queueCounts,
  queueDetailPath,
  requiresIntervention,
  rowKey,
  statusKey,
  statusLabel,
} from '@/downloads/queueRules';
import type { QueueRow } from '@/downloads/queueRules';

const props = withDefaults(
  defineProps<{
    queue?: QueueRow[];
    limit?: number;
    loading?: boolean;
  }>(),
  {
    queue: () => [],
    limit: 5,
    loading: false,
  }
);

const sorted = computed(() => {
  const rank = (item: any) => (requiresIntervention(item) ? 0 : 1);
  return [...props.queue].sort((a, b) => rank(a) - rank(b) || (b.progress || 0) - (a.progress || 0));
});

const visible = computed(() => sorted.value.slice(0, props.limit));
const hidden = computed(() => Math.max(0, props.queue.length - visible.value.length));

const summary = computed(() => {
  if (!props.queue.length) return '';
  const counts = queueCounts(props.queue);
  const parts: string[] = [];
  if (counts.downloading) parts.push(`${counts.downloading} en cours`);
  if (counts.queued) parts.push(`${counts.queued} en file`);
  if (counts.paused) parts.push(`${counts.paused} en pause`);
  if (counts.importPending) parts.push(`${counts.importPending} à importer`);
  if (counts.blocked) parts.push(`${counts.blocked} bloqué${counts.blocked > 1 ? 's' : ''}`);
  const remaining = props.queue.reduce((sum: number, item: any) => sum + (item.sizeleft || 0), 0);
  if (remaining > 0) parts.push(`${formatFileSize(remaining)} restants`);
  return parts.join(' · ');
});

function percent(item: any): number {
  if (item.progress != null) return Math.min(100, Math.max(0, Math.round(item.progress)));
  if (item.size > 0 && item.sizeleft != null) {
    return Math.min(100, Math.max(0, Math.round((1 - item.sizeleft / item.size) * 100)));
  }
  return 0;
}

function shortStatus(item: any): string {
  if (statusKey(item) === 'error') return 'Erreur';
  if (isImportPending(item)) return 'À importer';
  if (isUnmatched(item)) return 'Non rattaché';
  return statusLabel(item);
}

function badgeClass(item: any): string {
  if (statusKey(item) === 'error') return 'failed';
  if (isImportPending(item) || isUnmatched(item)) return 'pending_approval';
  const map: Record<string, string> = { completed: 'available', paused: 'pending', queued: 'pending' };
  return map[statusKey(item)] || '';
}

function progressClass(item: any): string {
  const key = statusKey(item);
  if (key === 'error') return 'is-error';
  if (key === 'completed') return 'is-done';
  if (key === 'paused' || key === 'queued') return 'is-idle';
  return '';
}

function formatTimeLeft(value?: string): string | null {
  const parts = String(value || '').split(':').map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  const [hours, minutes] = parts;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')}`;
  if (minutes > 0) return `${minutes} min`;
  return 'moins d’une minute';
}

function metaLine(item: any): string {
  if (item.error) return item.error;
  if (isImportPending(item)) return `${item.instance} — téléchargé, import impossible`;
  if (isUnmatched(item)) return `${item.instance} — aucune demande associée`;
  if (item.waiting_reason) return `${item.instance} — ${item.waiting_reason}`;

  const parts = [item.download_client || item.instance];
  if (item.sizeleft > 0) parts.push(`${formatFileSize(item.sizeleft)} restants`);
  const eta = formatTimeLeft(item.timeleft);
  if (eta && statusKey(item) === 'downloading') parts.push(eta);
  return parts.join(' · ');
}
</script>

<style scoped lang="scss">
.queue-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-3);
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
  color: inherit;
  text-decoration: none;
}
.queue-row:last-of-type { border-bottom: 0; }

.mini-poster-fallback {
  display: grid;
  place-items: center;
  background: var(--surface-2);
  color: var(--muted);
}
.mini-poster-fallback svg { width: 40%; }

.queue-main { display: grid; gap: var(--space-1); min-width: 0; }

.queue-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
}
.queue-heading strong {
  overflow: hidden;
  font-size: var(--fs-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-progress {
  height: 5px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, .08);
}
.queue-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width .3s ease;
}
.queue-progress i.is-done { background: #22c55e; }
.queue-progress i.is-error { background: #ef4444; }
.queue-progress i.is-idle { background: var(--muted); }

.queue-meta {
  overflow: hidden;
  color: var(--muted);
  font-size: var(--fs-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-more {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: var(--fs-xs);
}
</style>
