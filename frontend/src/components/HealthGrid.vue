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
import { computed, onMounted, ref } from 'vue';
import { Compass, Mail, Rss, Search, Server, Tv, Video } from '@lucide/vue';
import { api, cachedResource } from '@/api';
import { useRealtime } from '@/events';
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';

const CACHE_KEY = 'watchdeck.vue.health';
const loading = ref(false);
const health = ref<any>(null);
const checkedAt = ref<Date | null>(null);

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

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const data = await api<any>('/api/health');
    health.value = data;
    checkedAt.value = data.checked_at ? new Date(data.checked_at) : new Date();
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  const { cached, refresh: refreshPromise } = cachedResource(CACHE_KEY, 120000, () => api<any>('/api/health'));
  if (cached) {
    health.value = cached;
    checkedAt.value = cached.checked_at ? new Date(cached.checked_at) : null;
  } else {
    loading.value = true;
  }
  refreshPromise
    .then((data: any) => {
      health.value = data;
      checkedAt.value = data.checked_at ? new Date(data.checked_at) : new Date();
    })
    .finally(() => {
      loading.value = false;
    });
});

useRealtime(['health.updated'], (_type, detail) => {
  if (detail && detail.status) {
    health.value = detail;
    checkedAt.value = detail.checked_at ? new Date(detail.checked_at) : new Date();
  } else {
    refresh();
  }
});
</script>
