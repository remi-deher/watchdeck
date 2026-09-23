<template>
  <section class="panel">
    <UiSectionHeader title="Sante des services" :description="updatedLabel" />
    <div class="health-grid">
      <article v-for="item in cards" :key="item.key" class="health-card" :class="item.state">
        <component :is="item.icon" />
        <div>
          <strong>{{ item.label }}</strong>
          <span>{{ item.message }}</span>
        </div>
        <small v-if="item.response_ms != null">{{ item.response_ms }} ms</small>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { Compass, Mail, Rss, Search, Server, Tv, Video } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';

const CACHE_KEY = 'watchdeck.vue.health';
const queryClient = useQueryClient();
function displayCache(): any | undefined {
  // Cache d'affichage uniquement : TanStack Query reste la source de vérité et le TTL.
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')?.data || undefined; }
  catch { return undefined; }
}
const healthQuery = useQuery({
  queryKey: ['health'],
  queryFn: () => api<any>('/api/health'),
  staleTime: 30_000,
  placeholderData: displayCache(),
});
const health = computed(() => healthQuery.data.value || null);
const checkedAt = computed(() => health.value?.checked_at ? new Date(health.value.checked_at) : null);

const meta: Record<string, [string, any]> = {
  sonarr: ['Sonarr', Tv],
  radarr: ['Radarr', Video],
  prowlarr: ['Prowlarr', Search],
  plex: ['Plex API', Server],
  seer: ['Seer', Compass],
  smtp: ['Email', Mail],
  rss: ['Watchlist Plex', Rss],
};

const cards = computed(() =>
  Object.entries(meta).map(([key, [label, icon]]) => {
    const info = health.value?.services?.[key] || {};
    return {
      key,
      label,
      icon,
      state: info.state || 'loading',
      message: info.message || 'Chargement conserve en arriere-plan',
      response_ms: info.response_ms,
    };
  })
);

const updatedLabel = computed(() => {
  if (!checkedAt.value) return 'Anciennes donnees conservees pendant le chargement';
  const seconds = Math.max(0, Math.floor((Date.now() - checkedAt.value.getTime()) / 1000));
  if (seconds < 60) return 'Verifie a l\'instant';
  if (seconds < 3600) return `Verifie il y a ${Math.floor(seconds / 60)} min`;
  return `Verifie il y a ${Math.floor(seconds / 3600)} h`;
});

watch(() => healthQuery.data.value, (data) => {
  if (data) localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
});

useRealtime(['health.updated'], (_type, detail) => {
  if (detail && detail.services) {
    queryClient.setQueryData(['health'], detail);
  } else {
    void queryClient.invalidateQueries({ queryKey: ['health'] });
  }
});
</script>
