<template>
  <div class="ui-search-field" :class="`is-${kind}`">
    <!-- L'icone dit la nature du geste avant meme la premiere frappe : une loupe
         interroge un corpus, un entonnoir retranche d'une liste deja affichee. -->
    <component :is="kind === 'filter' ? Funnel : Search" aria-hidden="true" class="ui-search-field__icon" />
    <input
      :value="query"
      type="search"
      :placeholder="placeholder"
      :aria-label="ariaLabel || placeholder"
      v-bind="$attrs"
      @input="onInput"
    >
    <!-- Un filtre sans compteur laisse croire que la liste est complete : c'est le
         seul moyen de savoir qu'on regarde un sous-ensemble. -->
    <span v-if="countLabel" class="ui-search-field__matches" aria-live="polite">{{ countLabel }}</span>
    <button
      v-if="query"
      type="button"
      class="ui-search-field__clear"
      aria-label="Effacer la recherche"
      @click="clear"
    >
      <X aria-hidden="true" />
    </button>
    <template v-if="hasFilters">
      <span class="ui-search-field__sep" aria-hidden="true" />
      <button
        type="button"
        class="ui-search-field__filter"
        :class="{ active: filtersOpen || activeCount > 0 }"
        :aria-expanded="filtersOpen"
        :aria-label="filtersOpen ? 'Masquer les filtres' : 'Afficher les filtres'"
        @click="$emit('toggle-filters')"
      >
        <SlidersHorizontal aria-hidden="true" /><span>Filtres</span>
        <strong v-if="activeCount" class="ui-search-field__count">{{ activeCount }}</strong>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Funnel, Search, SlidersHorizontal, X } from '@lucide/vue';
import type { PageSearchKind } from '@/composables/usePageSearch';

// Le champ de recherche de l'application, partage par le patron de page et par les
// barres d'outils qui en ont besoin sans etre un en-tete de page.
// Sans ce composant, la meme quinzaine de lignes de markup et de style vivait en deux
// exemplaires, et l'un des deux finissait toujours par diverger.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    query?: string;
    placeholder?: string;
    ariaLabel?: string;
    hasFilters?: boolean;
    filtersOpen?: boolean;
    activeCount?: number;
    /** `search` interroge un corpus, `filter` reduit la liste affichee. */
    kind?: PageSearchKind;
    matchCount?: number | null;
    totalCount?: number | null;
  }>(),
  {
    query: '',
    placeholder: 'Rechercher…',
    ariaLabel: '',
    hasFilters: false,
    filtersOpen: false,
    activeCount: 0,
    kind: 'search',
    matchCount: null,
    totalCount: null,
  }
);

/* Le compte ne s'affiche que s'il apprend quelque chose.
 *
 * « N sur M » suppose de connaitre le total non filtre. Les vues qui filtrent en base ne
 * le connaissent pas : le serveur renvoie le total *de la requete courante*, egal au
 * nombre de resultats. Annoncer « 12 sur 12 » y serait faux -- on dit alors seulement
 * combien de lignes repondent. */
const countLabel = computed(() => {
  if (props.kind !== 'filter' || props.matchCount == null) return '';
  const filtre = Boolean(props.query.trim());
  if (props.totalCount != null && props.totalCount !== props.matchCount) {
    return `${props.matchCount} sur ${props.totalCount}`;
  }
  if (!filtre) return '';
  return `${props.matchCount} résultat${props.matchCount > 1 ? 's' : ''}`;
});

const emit = defineEmits<{
  (e: 'update:query', value: string): void;
  (e: 'search', event: Event): void;
  (e: 'toggle-filters'): void;
}>();

function clear(): void {
  emit('update:query', '');
  emit('search', new Event('input'));
}

function onInput(event: Event): void {
  emit('update:query', (event.target as HTMLInputElement).value);
  emit('search', event);
}
</script>

<style scoped lang="scss">
.ui-search-field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  max-width: 480px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.ui-search-field__icon { flex: none; width: 16px; height: 16px; color: var(--muted); }
.ui-search-field input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: var(--fs-sm);
  outline: 0;
}
.ui-search-field__sep { flex: none; width: 1px; height: 18px; background: var(--border); }

/* Un filtre se distingue de la recherche : bord teinte et fond legerement pose,
   pour qu'on sache d'un coup d'oeil qu'on retranche au lieu d'interroger. */
.ui-search-field.is-filter {
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
  background: color-mix(in srgb, var(--accent) 4%, var(--surface));
}
.ui-search-field.is-filter .ui-search-field__icon { color: var(--accent); }
.ui-search-field__matches {
  flex: none;
  color: var(--muted);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ui-search-field__clear {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.ui-search-field__clear:hover { background: var(--surface-2); color: var(--text); }
.ui-search-field__clear svg { width: 14px; height: 14px; }
/* La croix native ferait doublon avec la notre, sans en partager l'apparence. */
.ui-search-field input::-webkit-search-cancel-button { display: none; }

/* Sur telephone, le champ se confondait avec le fond de la barre : meme gris pour le
   contour, la barre et la page. Le contour prend donc la couleur de l'application, et
   la loupe avec lui -- c'est le seul repere qui dit ou taper. */
@media (max-width: 767.98px) {
  .ui-search-field {
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
    background: color-mix(in srgb, var(--accent) 7%, var(--surface));
  }
  .ui-search-field:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .ui-search-field__icon { color: var(--accent); }
  .ui-search-field input::placeholder { color: color-mix(in srgb, var(--text) 62%, transparent); }
}

.ui-search-field__filter {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 4px 0 8px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-sm);
  white-space: nowrap;
  cursor: pointer;
}
.ui-search-field__filter:hover { color: var(--text); }
.ui-search-field__filter.active { color: var(--accent); }
.ui-search-field__filter svg { width: 15px; height: 15px; }
.ui-search-field__count {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #1a1400;
  font-size: var(--fs-xs);
  font-weight: 700;
}
</style>
