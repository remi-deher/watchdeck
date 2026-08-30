<template>
  <div class="psh-root">
    <!-- Col 1 : titre -->
    <div class="psh-title">
      <h1>{{ title }}</h1>
    </div>

    <!-- Col 2 : barre de recherche (centrée) -->
    <div v-if="!hideSearch" class="psh-search-wrap">
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
      <!-- Bouton filtre intégré dans la barre de recherche -->
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

    <!-- Col 3 : actions (badge + boutons) -->
    <div v-if="!hideSearch" class="psh-actions">
      <slot name="after-search" />
      <slot name="actions" />
      <slot name="icon-actions" />
    </div>

    <!-- Ligne 2 : description (pleine largeur, sous title/search/actions) -->
    <p v-if="description" class="psh-desc">{{ description }}</p>
  </div>
</template>

<script setup lang="ts">
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
</script>

<style scoped lang="scss">
/* ── Root : grid 3 colonnes — titre | barre | actions ── */
.psh-root {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-4);
  position: sticky;
  top: var(--safe-top);
  z-index: 20;
  padding: 10px 0;
  background: var(--page-bg, #09090b);
}

/* ── Col 1 : Titre (aligné à gauche) ── */
.psh-title { display: grid; gap: 2px; min-width: 0; justify-self: start; }
.psh-title h1 { margin: 0; font-size: var(--fs-2xl); font-weight: 700; white-space: nowrap; }

/* ── Ligne 2 : description (pleine largeur, ne pousse plus la search bar) ── */
.psh-desc { grid-column: 1 / -1; margin: 0; font-size: var(--fs-sm); color: var(--muted); }

/* ── Col 2 : Barre de recherche (centrée par rapport à .psh-root) ── */
.psh-search-wrap {
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
  display: flex;
  align-items: center;
  justify-self: end;
  gap: var(--space-2);
  flex-wrap: nowrap;
}

/* ── Mobile : le titre est porte par la barre de navigation contextuelle, qui nomme
   deja la section courante. Le repeter ici coutait une ligne pour rien. On le retire
   donc du flux sans le retirer du document : il reste le h1 de la page pour les
   lecteurs d'ecran et pour le plan du document. ── */
@media (max-width: 768px) {
  .psh-root {
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }

  .psh-title {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .psh-desc { display: none; }
  .psh-search-wrap { width: 100%; }
  .psh-actions { flex-wrap: wrap; }
}
</style>
