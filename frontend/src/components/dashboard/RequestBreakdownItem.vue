<template>
  <div class="breakdown-card" :class="`${kind}-card`">
    <div class="breakdown-icon"><slot name="icon" /></div>
    <div class="breakdown-info"><strong>{{ counts.total ?? 0 }}</strong><span>{{ label }}</span></div>
    <div class="breakdown-sub">
      <span class="bsub-item"><span class="dot green" />{{ counts.available ?? 0 }} dispos</span>
      <span class="bsub-item"><span class="dot yellow" />{{ counts.sent_to_arr ?? 0 }} en cours</span>
      <span class="bsub-item"><span class="dot red" />{{ counts.failed ?? 0 }} échoués</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RequestTypeCount } from './RequestsBreakdownPanel.vue';
withDefaults(defineProps<{ kind: 'movie' | 'show'; label: string; counts?: RequestTypeCount }>(), { counts: () => ({}) });
</script>
