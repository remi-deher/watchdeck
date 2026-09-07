<template>
  <div class="psh-root">
    <span ref="stickySentinel" class="psh-sticky-sentinel" aria-hidden="true" />
    <!-- Seuls la recherche, les filtres et leurs actions suivent le défilement. -->
    <div v-if="!hideSearch" class="psh-tools-sticky" :class="{ 'is-stuck': isStuck }">
      <div v-if="$slots.status" class="psh-status"><slot name="status" /></div>
      <div class="psh-search-wrap">
        <Search aria-hidden="true" class="psh-search-icon" />
        <input
          :value="query"
          type="search"
          :placeholder="placeholder"
          :aria-label="`${placeholder} — ${title}`"
          class="psh-input"
          v-bind="$attrs"
          @input="$emit('update:query', ($event.target as HTMLInputElement).value); $emit('search', $event)"
        >
        <template v-if="hasFilters">
          <span class="psh-search-sep" aria-hidden="true" />
          <button
            class="psh-filter-btn"
            :class="{ active: filtersOpen || activeCount > 0 }"
            type="button"
            :aria-expanded="filtersOpen"
            :aria-label="filtersOpen ? 'Masquer les filtres' : 'Afficher les filtres'"
            @click="$emit('toggle-filters')"
          >
            <SlidersHorizontal /><span>Filtres</span><strong v-if="activeCount" class="psh-filter-count">{{ activeCount }}</strong>
          </button>
        </template>
      </div>
      <div v-if="$slots['after-search'] || $slots.actions || $slots['icon-actions']" class="psh-actions">
        <slot name="after-search" />
        <slot name="actions" />
        <slot name="icon-actions" />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Search, SlidersHorizontal } from '@lucide/vue';

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    query?: string;
    placeholder?: string;
    activeCount?: number;
    hideSearch?: boolean;
    hasFilters?: boolean;
    filtersOpen?: boolean;
  }>(),
  {
    description: '',
    query: '',
    placeholder: 'Rechercher…',
    activeCount: 0,
    hideSearch: false,
    hasFilters: false,
    filtersOpen: false,
  }
);

defineEmits<{
  (e: 'update:query', value: string): void;
  (e: 'search', event: Event): void;
  (e: 'toggle-filters'): void;
}>();

const stickySentinel = ref<HTMLElement | null>(null);
const isStuck = ref(false);
let stickyObserver: IntersectionObserver | null = null;

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined' || !stickySentinel.value) return;
  stickyObserver = new IntersectionObserver(([entry]) => { isStuck.value = !entry.isIntersecting; });
  stickyObserver.observe(stickySentinel.value);
});
onUnmounted(() => stickyObserver?.disconnect());
</script>

<style scoped lang="scss">
/* Le root ne dessine plus de panneau et ne suit plus le défilement. */
.psh-root {
  display: contents;
  position: static;
  background: transparent;
}
.psh-sticky-sentinel { display: block; width: 1px; height: 1px; margin-bottom: -1px; pointer-events: none; }

/* ── Col 1 : Titre (aligné à gauche) ── */
.psh-tools-sticky {
  position: sticky;
  top: calc(max(10px, var(--safe-top)) + 66px);
  z-index: 20;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-4);
  min-height: 40px;
  margin-top: 0;
  pointer-events: none;
}
.psh-tools-sticky > * { pointer-events: auto; }
.psh-status { grid-column: 1; min-width: 0; }

/* ── Col 2 : Barre de recherche (centrée par rapport à .psh-root) ── */
.psh-search-wrap {
  grid-column: 2;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  width: min(480px, 100%);
  height: 40px;
  padding: 0 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.psh-search-icon { flex: none; width: 16px; color: var(--muted); }
.psh-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: var(--fs-sm);
  outline: 0;
}

/* ── Séparateur vertical dans la barre de recherche ── */
.psh-search-sep {
  flex: none;
  display: block;
  width: 1px;
  height: 18px;
  background: var(--border);
}

/* ── Bouton filtre (intégré dans la barre) ── */
.psh-filter-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px 0 8px;
  height: 100%;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--muted);
  font-size: var(--fs-sm);
  white-space: nowrap;
  cursor: pointer;
  transition: color 120ms;
}
.psh-filter-btn:hover { color: var(--text); }
.psh-filter-btn svg { width: 15px; height: 15px; }
.psh-filter-btn.active { color: var(--accent); }
.psh-filter-count {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #1a1400;
  font-size: 10px;
  font-weight: 700;
}

/* ── Col 3 : Actions (alignées à droite) ── */
.psh-actions {
  grid-column: 3;
  display: flex;
  align-items: center;
  justify-self: end;
  gap: var(--space-2);
  flex-wrap: nowrap;
  min-height: 40px;
  padding: 3px 5px;
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  transition: background-color .18s ease, border-color .18s ease, box-shadow .18s ease;
}
.psh-tools-sticky.is-stuck .psh-actions {
  border-color: color-mix(in srgb, var(--border) 88%, white 4%);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  box-shadow: 0 10px 28px rgba(0, 0, 0, .3);
  backdrop-filter: blur(18px) saturate(1.1);
  -webkit-backdrop-filter: blur(18px) saturate(1.1);
}

/* ── Mobile : le shell n'ajoute plus de seconde barre contextuelle. Le titre de page
   redevient donc le repère visible, au-dessus de la recherche et des filtres. ── */
@media (max-width: 768px) {
  .psh-root {
    display: contents;
  }

  .psh-tools-sticky {
    top: max(8px, var(--safe-top));
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .psh-status, .psh-search-wrap, .psh-actions { grid-column: 1; }
  .psh-search-wrap { width: 100%; justify-self: stretch; }
  .psh-actions { flex-wrap: wrap; }
}
</style>
