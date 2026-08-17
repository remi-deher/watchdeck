<template>
  <PanelCard title="Demandes les plus populaires" :empty="items.length ? '' : 'Aucune demande multiple.'">
    <PanelList :items="items">
      <template #default="{ item }">
      <div class="inline-row gap-10">
        <img v-if="item.poster_url" :src="item.poster_url" class="mini-poster" alt="" loading="lazy" decoding="async" />
        <div v-else class="mini-poster"><Film style="width: 14px; height: 20px; margin: 8px 5px;" /></div>
        <div>
          <strong>{{ item.title }}</strong>
          <span>{{ mediaTypeLabel(item.media_type) }}</span>
        </div>
      </div>
      <span class="badge available">{{ item.count }} demandeurs</span>
      </template>
    </PanelList>
  </PanelCard>
</template>

<script setup lang="ts">
import PanelCard from '@/components/ui/PanelCard.vue';
import PanelList from '@/components/ui/PanelList.vue';
import { mediaTypeLabel } from '@/utils/labels';
import { Film } from '@lucide/vue';

export interface TopRequestedItem {
  id: number | string;
  title: string;
  poster_url?: string;
  media_type?: string;
  count?: number;
}

withDefaults(
  defineProps<{
    items?: TopRequestedItem[];
  }>(),
  {
    items: () => [],
  }
);
</script>
