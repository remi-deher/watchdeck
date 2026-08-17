<template>
  <section class="panel">
    <UiSectionHeader eyebrow="Engagement" title="Taux de complétion"><template #meta><small>règle Tautulli · 85 % ou générique</small></template></UiSectionHeader>
    <div class="completion-list">
      <article v-for="item in items" :key="item.media_type">
        <div class="completion-ring" :style="{'--rate':`${item.completion_rate*3.6}deg`}"><strong>{{ item.completion_rate }}%</strong></div>
        <div><strong>{{ typeLabel(item.media_type) }}</strong><span>{{ item.completed }} sur {{ item.sessions }} terminées</span><small>Progression moyenne : {{ item.average_progress }} %</small></div>
      </article>
      <p v-if="!items.length" class="empty">Durées insuffisantes pour calculer la complétion.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';
export interface CompletionItem {
  media_type: string;
  completion_rate: number;
  completed: number;
  sessions: number;
  average_progress: number;
}

withDefaults(
  defineProps<{
    items?: CompletionItem[];
  }>(),
  {
    items: () => [],
  }
);

function typeLabel(value: string): string {
  const map: Record<string, string> = { movie: 'Films', episode: 'Épisodes', track: 'Musique' };
  return map[value] || 'Autres';
}
</script>

<style scoped lang="scss">
.panel-head small{color:var(--muted);font-size:var(--fs-xs)}.completion-list{display:grid;gap: var(--space-3);margin-top:14px}.completion-list article{display:flex;align-items:center;gap: var(--space-3)}.completion-ring{display:grid;place-items:center;width:54px;height:54px;border-radius:50%;background:conic-gradient(var(--accent) var(--rate),rgba(255,255,255,.07) 0);position:relative}.completion-ring::after{content:'';position:absolute;inset:6px;border-radius:50%;background:var(--surface)}.completion-ring strong{z-index:1;font-size:var(--fs-xs)}.completion-list article>div:last-child{display:grid}.completion-list span,.completion-list small{color:var(--muted);font-size:var(--fs-xs)}
</style>
