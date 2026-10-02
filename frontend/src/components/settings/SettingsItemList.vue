<template>
  <section ref="root" v-show="visible" class="settings-item-list">
    <header v-if="title || $slots.actions" class="settings-item-list-head">
      <div>
        <h3 v-if="title">
          {{ title }}
          <span v-if="count !== null" class="settings-item-list-count">{{ count }}</span>
        </h3>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="settings-item-list-actions"><slot name="actions" /></div>
    </header>
    <div class="settings-item-list-body" role="list" :aria-label="title || undefined">
      <slot />
      <div v-if="empty" class="settings-item-list-empty" role="listitem"><slot name="empty">Aucun élément.</slot></div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Une liste d'objets de reglage (SettingsItem) : un titre en texte, puis les lignes dans
 * un seul cadre discret. C'est le seul cadre de la page -- il dit « ces lignes sont des
 * choses de meme nature », la ou les cartes encadraient chaque chose separement.
 */
import { computed, provide, ref } from 'vue';
import { matchesQuery, SETTINGS_GROUP_KEY, useSearchableBlock } from '@/composables/useSettingsSearch';

const props = withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    /** Nombre d'elements, affiche a cote du titre ; `null` pour ne rien afficher. */
    count?: number | null;
    /** Affiche le message vide (slot `empty`). */
    empty?: boolean;
  }>(),
  { title: '', subtitle: '', count: null, empty: false }
);

const root = ref<HTMLElement | null>(null);
// La liste ne compte pas dans le total : ce sont ses objets qu'on compte.
const { visible, query } = useSearchableBlock(() => root.value, () => `${props.title} ${props.subtitle}`, { count: false });
const titleMatches = computed(() => Boolean(query.value.trim()) && matchesQuery(`${props.title} ${props.subtitle}`, query.value));
provide(SETTINGS_GROUP_KEY, { titleMatches });
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.settings-item-list + .settings-item-list,
:global(.settings-section) + .settings-item-list,
.settings-item-list + :global(.settings-section) {
  margin-top: var(--space-5, 28px);
}

.settings-item-list-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-2);
}

.settings-item-list-head h3 {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 700;
}

.settings-item-list-count {
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.settings-item-list-head p {
  margin: 4px 0 0;
  max-width: 80ch;
  color: var(--muted);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.settings-item-list-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
}

.settings-item-list-body {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.settings-item-list-empty {
  padding: var(--space-4);
  color: var(--muted);
  font-size: var(--fs-sm);
}

@include bp.until(phablet) {
  .settings-item-list-head {
    flex-wrap: wrap;
    align-items: flex-start;
  }
}
</style>
