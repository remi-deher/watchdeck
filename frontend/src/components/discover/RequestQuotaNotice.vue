<template>
  <!-- Rappel discret du quota de demandes de l'utilisateur ; absent quand rien n'est
       limite (moderation, quotas desactives). Passe en alerte une fois un quota atteint. -->
  <p v-if="lines.length" class="quota-notice" :class="{ 'is-full': anyExceeded }" role="status">
    <Gauge :size="15" aria-hidden="true" />
    <span>Vos demandes sur {{ quota.period_days }} jours : {{ lines.join(' · ') }}</span>
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { Gauge } from '@lucide/vue';
import { api } from '@/api';
import { queryKeys } from '@/queryKeys';

interface QuotaEntry { limit: number | null; used: number; remaining: number | null; exceeded: boolean; next_slot_at: string | null }

const quotaQuery = useQuery({
  queryKey: queryKeys.me.quota,
  queryFn: ({ signal }) => api<any>('/api/me/quota', { signal }),
  staleTime: 30_000,
  retry: false,
});
const quota = computed(() => quotaQuery.data.value || {});

function line(entry: QuotaEntry | undefined, label: string): string | null {
  if (!entry || entry.limit == null) return null;
  if (!entry.exceeded) return `${entry.used}/${entry.limit} ${label}`;
  const next = entry.next_slot_at ? new Date(`${entry.next_slot_at}Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : null;
  return `${label} : quota atteint${next ? `, prochaine place le ${next}` : ''}`;
}

const lines = computed(() => {
  if (quota.value.exempt) return [];
  return [line(quota.value.movie, 'films'), line(quota.value.show, 'séries')].filter(Boolean) as string[];
});
const anyExceeded = computed(() => Boolean(quota.value.movie?.exceeded || quota.value.show?.exceeded));
</script>

<style scoped lang="scss">
.quota-notice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  color: var(--muted);
  font-size: var(--fs-sm);
}
.quota-notice.is-full { color: var(--warning); }
</style>
