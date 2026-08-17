<template>
  <article class="media-card interactive missing-series-card" role="link" tabindex="0" :aria-label="`Ouvrir la fiche de ${series.title}`" @click="openDetail" @keydown.enter.prevent="openDetail" @keydown.space.prevent="openDetail">
    <MediaPoster :poster-url="series.poster_url" :alt="`Affiche de ${series.title}`">
      <template #badges><span class="badge pending missing-count">{{ series.episodes.length }} épisode{{ series.episodes.length > 1 ? 's' : '' }}</span></template>
    </MediaPoster>
    <div class="card-body">
      <strong>{{ series.title }}</strong>
      <span>{{ series.instance_name }} · Série suivie</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import MediaPoster from '@/components/media/MediaPoster.vue';

interface MissingSeries {
  title: string;
  poster_url?: string;
  instance_id: string | number;
  instance_name?: string;
  arr_id: string | number;
  episodes: any[];
}

const props = defineProps<{ series: MissingSeries }>();
const emit = defineEmits<{
  (e: 'error', msg: string): void;
}>();
const router = useRouter();
const opening = ref(false);

async function openDetail(): Promise<void> {
  if (opening.value) return;
  opening.value = true;
  try {
    const data = await api(`/api/requests/orphans/sonarr/${props.series.instance_id}/${props.series.arr_id}/open`, { method: 'POST' });
    router.push({ path: `/media/library/${data.library_item_id}`, query: { tab: 'missing' } });
  } catch (e: any) {
    emit('error', e.message || "Impossible d'ouvrir la fiche détaillée");
  } finally {
    opening.value = false;
  }
}
</script>

<style scoped lang="scss">
.missing-series-card{position:relative}.missing-count{position:absolute;top:8px;left:8px;z-index:2;max-width:calc(100% - 16px)}
</style>
