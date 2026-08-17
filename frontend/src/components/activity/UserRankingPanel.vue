<template>
  <section class="panel">
    <UiSectionHeader eyebrow="Audience" title="Utilisateurs actifs" />
    <div class="ranking">
      <div v-for="(user,index) in users" :key="user.name"><b>{{ index+1 }}</b><span><strong>{{ user.name }}</strong><small>{{ user.sessions }} sessions</small></span><em>{{ formatDuration(user.watch_ms) }}</em></div>
      <p v-if="!users.length" class="empty">Pas encore de données.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import UiSectionHeader from '@/components/ui/UiSectionHeader.vue';
export interface UserRankingItem {
  name: string;
  sessions?: number;
  watch_ms?: number;
}

withDefaults(
  defineProps<{
    users?: UserRankingItem[];
    formatDuration: (ms?: number) => string;
  }>(),
  {
    users: () => [],
  }
);
</script>

<style scoped lang="scss">
.ranking{display:grid;margin-top:12px}.ranking>div{display:grid;grid-template-columns:24px 1fr auto;gap: var(--space-2);align-items:center;padding:9px 0;border-bottom:1px solid var(--border)}.ranking b{color:var(--text)}.ranking span{display:grid}.ranking small,.ranking em{font-size:var(--fs-xs);color:var(--muted);font-style:normal}
</style>
