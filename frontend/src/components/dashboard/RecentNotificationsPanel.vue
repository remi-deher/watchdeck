<template>
  <PanelCard title="Notifications récentes" :empty="notifications.length ? '' : 'Aucune notification envoyée.'">
    <template #action><RouterLink to="/notifications" class="panel-link">Tout voir</RouterLink></template>
    <PanelList :items="notifications">
      <template #default="{ item: notif }">
      <div>
        <strong>{{ notif.media_title || '—' }}</strong>
        <span>{{ notif.event_label }} · {{ notif.recipient }}</span>
      </div>
      <span class="badge" :class="notif.success ? 'available' : 'failed'">
        {{ notif.success ? 'Envoyé' : 'Erreur' }}
      </span>
      </template>
    </PanelList>
  </PanelCard>
</template>

<script setup lang="ts">
import PanelCard from '@/components/ui/PanelCard.vue';
import PanelList from '@/components/ui/PanelList.vue';

export interface NotificationItem {
  id: number | string;
  media_title?: string;
  event_label?: string;
  recipient?: string;
  success?: boolean;
}

withDefaults(
  defineProps<{
    notifications?: NotificationItem[];
  }>(),
  {
    notifications: () => [],
  }
);
</script>
