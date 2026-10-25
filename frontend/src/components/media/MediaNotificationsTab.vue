<template>
  <section class="media-notifications-tab">
    <UiTimeline
      v-if="timelineItems.length"
      :items="timelineItems"
      orientation="vertical"
      variant="default"
      aria-label="Historique des notifications"
    >
      <template #time="{ item }">
        <time :title="item.fullDate">{{ item.time }}</time>
      </template>
    </UiTimeline>

    <UiEmptyState
      v-else
      title="Aucune notification"
      message="Aucune notification n’a encore été envoyée pour ce média."
      compact
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { AlertCircle, CheckCircle2 } from '@lucide/vue';
import UiTimeline, { type UiTimelineItem } from '@/components/ui/UiTimeline.vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import { formatDateTime, formatRelativeDate } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    notifications?: any[];
  }>(),
  {
    notifications: () => [],
  }
);

function eventLabel(log: any): string {
  const labels: Record<string, string> = {
    request: 'Demande enregistrée',
    available: 'Média disponible',
    vf_available: 'VF disponible',
    failed: 'Échec de notification',
    issue_created: 'Anomalie signalée',
  };
  let label = labels[log.event] || String(log.event || 'Notification').replaceAll('_', ' ');
  if (log.season_number != null && log.episode_number != null) {
    label += ` · S${String(log.season_number).padStart(2, '0')}E${String(log.episode_number).padStart(2, '0')}`;
  } else if (log.season_number != null) {
    label += ` · Saison ${log.season_number}`;
  }
  return label;
}

function channelLabel(channel?: string): string {
  if (!channel) return '';
  const channels: Record<string, string> = {
    email: 'E-mail',
    discord: 'Discord',
    telegram: 'Telegram',
    pushbullet: 'Pushbullet',
    pushover: 'Pushover',
    webhook: 'Webhook',
  };
  return channels[channel] || channel;
}

const timelineItems = computed<UiTimelineItem[]>(() => {
  return (props.notifications || []).map((log, index) => {
    const channel = channelLabel(log.channel);
    const recipient = log.recipient || '';
    const subtitle = [recipient, channel].filter(Boolean).join(' · ');

    return {
      key: log.id || index,
      id: log.id,
      time: log.sent_at ? formatRelativeDate(log.sent_at) : '',
      fullDate: log.sent_at ? formatDateTime(log.sent_at) : '',
      title: eventLabel(log),
      subtitle,
      description: log.error_msg || undefined,
      badge: log.success ? 'Envoyée' : 'Échec',
      tone: log.success ? 'success' : 'danger',
      icon: log.success ? CheckCircle2 : AlertCircle,
    };
  });
});
</script>

<style scoped lang="scss">
.media-notifications-tab {
  padding-block: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
