<template>
  <section class="overview-todo" aria-labelledby="overview-todo-title">
    <header class="overview-head">
      <h2 id="overview-todo-title">{{ title }}</h2>
      <span v-if="items.length" class="overview-head__meta">par gravité</span>
    </header>
    <ul v-if="items.length" class="overview-todo__list">
      <li v-for="item in items" :key="item.key" class="overview-todo__item" :class="`is-${item.severity}`">
        <span v-if="item.area && icons[item.area]" class="overview-todo__icon"><component :is="icons[item.area]" aria-hidden="true" /></span>
        <span class="sr-only">{{ SEVERITY_LABELS[item.severity] }} :</span>
        <div class="overview-todo__text">
          <strong>{{ item.title }}</strong>
          <span>{{ item.detail }}</span>
        </div>
        <RouterLink class="overview-todo__action" :class="{ 'is-primary': item.severity === 'error' }" :to="item.action.to">
          {{ item.action.label }}
        </RouterLink>
      </li>
    </ul>
    <UiEmptyState
      v-else-if="!loading"
      :icon="CheckCircle2"
      title="Rien à traiter"
      :message="emptyDetail"
    />
    <p v-else class="overview-head__loading">{{ loadingText }}</p>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { CheckCircle2 } from '@lucide/vue';
import UiEmptyState from '@/components/ui/UiEmptyState.vue';
import type { MonitorAttentionItem, MonitorSeverity as AttentionSeverity } from './types';

withDefaults(defineProps<{
  items: MonitorAttentionItem[];
  loading?: boolean;
  /** Icône de la partie concernée, par clé de partie. */
  icons?: Record<string, any>;
  title?: string;
  emptyDetail?: string;
  loadingText?: string;
}>(), {
  loading: false,
  icons: () => ({}),
  title: 'À traiter',
  emptyDetail: 'Les services répondent, les tâches passent et la configuration est complète.',
  loadingText: 'Vérification des services…',
});

const SEVERITY_LABELS: Record<AttentionSeverity, string> = { error: 'Erreur', warn: 'À surveiller', info: 'Information' };
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.overview-todo { display: grid; gap: var(--space-3); min-width: 0; align-content: start; }
.overview-head { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.overview-head h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-lg); }
.overview-head__meta { color: var(--muted); font-size: var(--fs-sm); }
.overview-head__loading { margin: 0; color: var(--muted); font-size: var(--fs-sm); }

.overview-todo__list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
  overflow: hidden;
}
.overview-todo__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4) var(--space-3) calc(var(--space-4) + 4px);
}
.overview-todo__item + .overview-todo__item { border-top: 1px solid var(--divider); }
/* La gravité se lit dans la marge : un trait de couleur, doublé d'un libellé pour les
   lecteurs d'écran. */
.overview-todo__item::before { content: ''; position: absolute; left: 8px; top: 12px; bottom: 12px; width: 3px; border-radius: 3px; background: var(--muted); }
.overview-todo__item.is-error::before { background: var(--red); }
.overview-todo__item.is-warn::before { background: var(--amber); }
.overview-todo__icon { display: grid; flex: none; place-items: center; width: 34px; height: 34px; border-radius: var(--radius-sm); background: var(--surface-2); color: var(--muted); }
.overview-todo__icon svg { width: 17px; height: 17px; }
.overview-todo__text { display: grid; flex: 1 1 auto; gap: 2px; min-width: 0; }
.overview-todo__text strong { font-size: var(--fs-md); }
.overview-todo__text span { color: var(--muted); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.overview-todo__action {
  flex: none;
  padding: 6px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--btn-radius);
  color: var(--text);
  font-size: var(--fs-sm);
  font-weight: 650;
  text-decoration: none;
  white-space: nowrap;
}
.overview-todo__action:hover { border-color: var(--accent); color: var(--accent); }
.overview-todo__action.is-primary { border-color: transparent; background: var(--accent); color: var(--on-accent); }
.overview-todo__action.is-primary:hover { background: var(--accent-hover); color: var(--on-accent); }

@include bp.until(shell-medium) {

  .overview-todo__icon { display: none; }
}
</style>
