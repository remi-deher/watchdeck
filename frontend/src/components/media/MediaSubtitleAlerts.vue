<template>
  <template v-for="alert in shown" :key="alert.key">
    <UiTooltip :focusable="focusable" :text="alert.text[context].tooltip">
      <span class="badge" :class="alert.badgeClass" :style="alert.style">{{ labelOf(alert) }}</span>
    </UiTooltip>
  </template>
</template>

<script setup lang="ts">
/* Pastilles des alertes de sous-titres d'un film, d'un episode ou d'une saison (alors
   avec le nombre d'episodes concernes), chacune expliquee au survol. */
import { computed } from 'vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { SUBTITLE_ALERTS, type SubtitleAlertContext, type SubtitleAlertValues } from '@/utils/mediaStreams';

const props = withDefaults(
  defineProps<{
    alerts: SubtitleAlertValues;
    context: SubtitleAlertContext;
    focusable?: boolean;
  }>(),
  { focusable: true }
);

const shown = computed(() => SUBTITLE_ALERTS.filter((alert) => props.alerts[alert.key]));

function labelOf(alert: (typeof SUBTITLE_ALERTS)[number]): string {
  const value = props.alerts[alert.key];
  const label = alert.text[props.context].label;
  return typeof value === 'number' ? `${label} ${value}` : label;
}
</script>
