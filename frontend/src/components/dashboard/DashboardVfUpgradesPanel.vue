<template>
  <PanelCard
    title="Améliorations VF"
    description="Titres encore en VO pour lesquels une release VF ou MULTI a été trouvée."
    panel-class="vf-dashboard-panel"
    :loading="loading"
    loading-message="Chargement…"
    :empty="!loading && !rows.length ? 'Aucune release VF en attente de décision.' : ''"
  >
    <template #action><RouterLink to="/vf-upgrades" class="panel-link">Tout voir</RouterLink></template>

    <RouterLink v-for="item in rows" :key="item.id" to="/vf-upgrades" class="vf-row">
      <img v-if="item.media?.poster_url" :src="item.media.poster_url" class="vf-poster" alt="" loading="lazy" decoding="async">
      <span v-else class="vf-poster vf-poster-fallback"><Languages aria-hidden="true" /></span>
      <span class="vf-main">
        <strong>{{ itemTitle(item) }}</strong>
        <span class="vf-meta">
          <span class="vf-chip vo">VO</span>
          <ArrowRight class="vf-arrow" aria-hidden="true" />
          <span class="vf-chip vf">VF</span>
          <span>{{ releaseLabel(item) }}</span>
        </span>
      </span>
      <ChevronRight class="vf-chevron" aria-hidden="true" />
    </RouterLink>

    <div v-if="hasMetrics" class="vf-stats">
      <span><strong>{{ pendingCount }}</strong> à traiter</span>
      <span><strong>{{ inProgressCount }}</strong> en cours</span>
      <span><strong>{{ verifiedCount }}</strong> passés en VF</span>
      <span v-if="failedCount" class="vf-failed"><strong>{{ failedCount }}</strong> en échec</span>
    </div>
  </PanelCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowRight, ChevronRight, Languages } from '@lucide/vue';
import PanelCard from '@/components/ui/PanelCard.vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import { queryKeys } from '@/queryKeys';
import { vfUpgradeMetricsQuery } from '@/sharedQueries';
import type { VfUpgradeItem } from '@/types/vfUpgrades';

const VISIBLE = 3;
/* Sous la cle de la page Ameliorations VF : une invalidation de celle-ci (grab, rejet,
   evenement temps reel) rafraichit aussi l'accueil. `waiting_limit=0` ecarte la longue
   liste des medias VO sans suggestion, dont l'accueil n'a pas l'usage. */
const PENDING_KEY = ['vf-upgrades', 'dashboard', 'pending'] as const;

const queryClient = useQueryClient();
const pendingQuery = useQuery({
  queryKey: PENDING_KEY,
  queryFn: ({ signal }) => api<{ items?: VfUpgradeItem[] }>('/api/vf-upgrades/dashboard?status=pending&waiting_limit=0', { signal }),
  select: (data) => (data?.items || []).filter((item) => !item.is_ignored),
});
const metricsQuery = useQuery(vfUpgradeMetricsQuery());

const items = computed<VfUpgradeItem[]>(() => pendingQuery.data.value || []);
const rows = computed(() => items.value.slice(0, VISIBLE));
const loading = computed(() => pendingQuery.isPending.value);

const metrics = computed<Record<string, any>>(() => metricsQuery.data.value || {});
const hasMetrics = computed(() => Object.keys(metrics.value).length > 0);
const pendingCount = computed(() => Number(metrics.value.states?.pending ?? items.value.length));
const verifiedCount = computed(() => Number(metrics.value.verified || 0));
const inProgressCount = computed(() => Math.max(0, Number(metrics.value.accepted || 0) - verifiedCount.value));
const failedCount = computed(() => Number(metrics.value.failed || 0));

function itemTitle(item: VfUpgradeItem): string {
  const title = item.media?.title || 'Média';
  if (item.scope === 'season' && item.season_number != null) return `${title} · Saison ${item.season_number}`;
  if (item.scope === 'episode' && item.season_number != null && item.episode_number != null) {
    return `${title} · S${item.season_number} É${item.episode_number}`;
  }
  return item.media?.year ? `${title} (${item.media.year})` : title;
}

function releaseLabel(item: VfUpgradeItem): string {
  const count = Number(item.release_count || 0);
  return `${count} release${count > 1 ? 's' : ''} trouvée${count > 1 ? 's' : ''}`;
}

useRealtime(['vf_upgrade.updated'], () => {
  void queryClient.invalidateQueries({ queryKey: PENDING_KEY });
  void queryClient.invalidateQueries({ queryKey: queryKeys.vff.metrics });
});
</script>

<style scoped lang="scss">
.vf-row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border-radius: var(--inset-radius); background: var(--surface-2); color: var(--text); text-decoration: none; transition: background-color var(--motion-duration-instant) var(--motion-ease-standard); }
.vf-row + .vf-row { margin-top: var(--space-2); }
.vf-row:hover { background: var(--surface-3); }
.vf-poster { flex: none; width: 40px; height: 58px; border-radius: var(--radius-xs); object-fit: cover; background: var(--media-placeholder); }
.vf-poster-fallback { display: grid; place-items: center; color: var(--muted); }
.vf-poster-fallback svg { width: 18px; height: 18px; }
.vf-main { display: grid; gap: 6px; flex: 1; min-width: 0; }
.vf-main strong { overflow: hidden; font-size: var(--fs-md); text-overflow: ellipsis; white-space: nowrap; }
.vf-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--muted); font-size: var(--fs-xs); }
.vf-chip { padding: 2px 8px; border-radius: var(--radius-pill); font-weight: 700; }
.vf-chip.vo { background: color-mix(in srgb, var(--amber) 14%, transparent); color: var(--amber-text); }
.vf-chip.vf { background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green-text); }
.vf-arrow { width: 14px; height: 14px; }
.vf-chevron { flex: none; width: 16px; height: 16px; color: var(--muted); }
.vf-stats { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); margin-top: var(--space-3); color: var(--muted); font-size: var(--fs-sm); }
.vf-stats strong { color: var(--text); font-variant-numeric: tabular-nums; }
.vf-stats .vf-failed strong { color: var(--red-text); }
</style>
