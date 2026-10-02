<template>
  <!-- Journal de la demande : évènements datés, du plus récent au plus ancien. -->
  <section class="journal-card" :aria-labelledby="headingId">
    <h3 :id="headingId">Journal</h3>
    <ol v-if="events.length" class="journal-list">
      <li v-for="event in events" :key="event.key" :class="['journal-event', event.tone && `is-${event.tone}`]">
        <time class="journal-date" :datetime="event.at">{{ shortDateTime(event.at) }}</time>
        <span class="journal-label">{{ event.label }}</span>
      </li>
    </ol>
    <p v-else class="journal-empty">Aucun évènement daté pour cette demande.</p>
    <p v-if="row.vf_tracking_disabled" class="journal-note">Suivi VF arrêté</p>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { journalEvents, shortDateTime } from './requestRules';

const props = defineProps<{
  row: any;
}>();

const headingId = `journal-${useId()}`;
const events = computed(() => journalEvents(props.row));
</script>

<style scoped lang="scss">
.journal-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 22px;
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
}
.journal-card h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  font-weight: 600;
}
.journal-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0 0 0 16px;
  border-left: 2px solid var(--surface-3);
  list-style: none;
}
.journal-event {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.journal-date {
  color: var(--muted);
  font-size: var(--fs-xs);
}
.journal-label {
  color: var(--text);
  font-size: var(--fs-md);
}
.journal-event.is-error .journal-label {
  color: var(--red-text);
}
.journal-empty,
.journal-note {
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
</style>
