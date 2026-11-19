<template>
  <PanelCard
    title="File de téléchargement"
    :description="summary"
    :loading="loading"
    loading-message="Chargement…"
    :empty="!queue.length ? 'Aucun téléchargement en cours.' : ''"
  >
    <template #action><RouterLink to="/downloads" class="panel-link">Tout voir</RouterLink></template>

    <LiveStrip v-if="live.length" :items="live" title="Téléchargements en cours" live-label="En cours" :idle="{title: 'Aucun téléchargement'}" @select="item => item.to && ouvrirFiche(item.to)" />

    <component
      :is="queueDetailPath(item) ? 'RouterLink' : 'article'"
      v-for="item in visible"
      :key="rowKey(item)"
      :to="queueDetailPath(item)"
      class="queue-row"
      :class="{ 'is-alert': needsAttention(item) }"
      @click="ouvrirFicheAuClic($event, queueDetailPath(item))"
    >
      <img
        v-if="posterOf(item)"
        :src="posterOf(item)"
        class="queue-poster"
        :alt="`Affiche de ${item.title}`"
        loading="lazy"
        decoding="async"
      >
      <div v-else class="queue-poster queue-poster-fallback" aria-hidden="true"><Film /></div>

      <div class="queue-body">
        <div class="queue-heading">
          <strong>{{ item.title }}</strong>
          <span class="badge" :class="badgeClass(item)">{{ shortStatus(item) }}</span>
        </div>
        <p class="queue-meta">{{ metaLine(item) }}</p>
        <div v-if="showsProgress(item)" class="queue-track">
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
          <span class="queue-percent">{{ percent(item) }} %</span>
        </div>
      </div>
    </component>

    <p v-if="hidden > 0" class="queue-more">
      et {{ hidden }} autre{{ hidden > 1 ? 's' : '' }} en file
    </p>
  </PanelCard>
</template>

<script setup lang="ts">
import LiveStrip from '@/components/ui/LiveStrip.vue';
import { useOuvrirFiche } from '@/composables/useMediaOverlay';
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

const { auClic: ouvrirFicheAuClic, ouvrir: ouvrirFiche } = useOuvrirFiche();
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

const visible = computed(() => sorted.value.slice(0, props.limit).filter(row => row.work?.state !== 'running'));
const live = computed(() => sorted.value.slice(0, props.limit).filter(row => row.work?.state === 'running').map(row => ({key: rowKey(row), title: row.title || 'Téléchargement', work: row.work, media: row.media, poster: row.media ? undefined : row.poster_url, backdrop: row.media ? undefined : row.backdrop_url, who: row.instance || row.download_client, to: queueDetailPath(row)})));
const hidden = computed(() => Math.max(0, props.queue.length - visible.value.length - live.value.length));

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

function posterOf(item: QueueRow): string {
  return item.media?.poster_url || item.poster_url || '';
}

/** La barre suit le transfert (en cours, en pause, terminé). Un blocage
    (import impossible, erreur) n'a pas de progression à montrer. */
function showsProgress(item: QueueRow): boolean {
  if (needsAttention(item)) return false;
  const key = statusKey(item);
  return key === 'downloading' || key === 'paused' || key === 'completed';
}

function needsAttention(item: QueueRow): boolean {
  return requiresIntervention(item) || statusKey(item) === 'error';
}

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
:deep(.live-strip) {
  border: 0;
  background: transparent;
  padding: 0;
  box-shadow: none;
}

:deep(.live-poster) {
  box-shadow: 0 8px 22px -12px rgb(var(--scrim) / 70%);

  &::after {
    display: none;
  }
}

:deep(.live-inset) {
  box-shadow: 0 6px 18px rgb(var(--scrim) / 55%);
}

.queue-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: center;
  padding: 10px 0 10px var(--space-3);
  border-bottom: 1px solid var(--border);
  border-left: 3px solid transparent;
  color: inherit;
  text-decoration: none;
}
.queue-row:last-of-type { border-bottom: 0; }
.queue-row.is-alert { border-left-color: var(--red); }
a.queue-row:hover strong { color: var(--accent); }
a.queue-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.queue-poster {
  width: 44px;
  height: 66px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  box-shadow: var(--shadow-sm);
}
.queue-poster-fallback {
  display: grid;
  place-items: center;
  color: var(--muted);
}
.queue-poster-fallback svg { width: 18px; height: 18px; }

.queue-body { display: grid; gap: 3px; min-width: 0; }

.queue-heading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}
.queue-heading strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--fs-sm);
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-meta {
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-xs);
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.queue-row.is-alert .queue-meta { color: var(--text); }

.queue-track {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  margin-top: 2px;
}
.queue-progress {
  height: 5px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: rgb(var(--ink) / .08);
}
.queue-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width var(--motion-duration-base) var(--motion-ease-standard);
}
.queue-progress i.is-done { background: var(--green); }
.queue-progress i.is-error { background: var(--red); }
.queue-progress i.is-idle { background: var(--muted); }
.queue-percent {
  color: var(--muted);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
}

.queue-more {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: var(--fs-xs);
}
</style>
