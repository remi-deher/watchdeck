<template>
  <section class="drawer-section timeline">
    <article v-for="event in events || []" :key="`${event.date}:${event.title}:${event.subtitle}`" class="timeline-row">
      <CalendarDays />
      <div><strong>{{ event.title }}</strong><span>{{ event.subtitle }} · {{ formatDate(event.date) }}</span></div>
    </article>
    <UiEmptyState v-if="!events?.length" title="Aucun événement planifié" compact />
  </section>
</template>

<script setup lang="ts">
import { formatDate } from '@/utils/format';
import { CalendarDays } from '@lucide/vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';

export interface CalendarEvent {
  date: string;
  title: string;
  subtitle: string;
  [key: string]: any;
}

withDefaults(
  defineProps<{
    events?: CalendarEvent[];
  }>(),
  {
    events: () => [],
  }
);
</script>
