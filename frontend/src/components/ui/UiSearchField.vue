<template>
  <div class="ui-search-field" :class="`is-${kind}`">
    <div class="ui-search-field__search">
      <!-- Meme capsule partout : recherche et filtre ne se distinguent pas a l'oeil. Le
           compteur « 12 sur 48 » dit seul qu'on regarde un sous-ensemble. -->
      <Search aria-hidden="true" class="ui-search-field__icon" />
      <!-- `enterkeyhint` : le clavier logiciel annonce « Rechercher » plutot qu'un retour
           a la ligne. Il n'y a pas de ligne suivante ici, la touche valide la recherche.
           Pose avant `$attrs` pour qu'un appelant puisse encore l'infirmer. -->
      <input
        class="ui-search-field__input"
        :value="query"
        type="search"
        enterkeyhint="search"
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
      <button v-if="moreResults" type="button" class="ui-search-field__more" @pointerdown.prevent @click="$emit('more')">Afficher plus</button>
    </div>
    <!-- Le contexte fournit les outils et l'action dans une même zone facultative. -->
    <div v-if="$slots.tools || $slots.action" class="ui-search-field__action"><slot name="tools" /><slot name="action" /></div>
    <template v-if="hasFilters">
      <button
        type="button"
        class="ui-search-field__filter"
        :class="{ active: filtersOpen || activeCount > 0 }"
        :aria-expanded="filtersOpen"
        :aria-label="filtersOpen ? 'Masquer les filtres' : 'Afficher les filtres'"
        @pointerdown.prevent
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
import { Search, SlidersHorizontal, X } from '@lucide/vue';
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
    moreResults?: boolean;
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
    moreResults: false,
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
  (e: 'more'): void;
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
@use '@/styles/foundations/breakpoints' as bp;
.ui-search-field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 0;
  min-width: 0;
  max-width: 480px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
/* Avec un bouton « Filtres », la capsule cede son coussin de droite : le bouton en
   occupe toute la hauteur et vient au ras du bord, comme un segment de la capsule et
   non comme une pastille posee dedans. Sans cela il restait un liseré de fond entre le
   bouton et le contour -- huit pixels a droite, un en haut et en bas. */
.ui-search-field:has(.ui-search-field__filter),
.ui-search-field:has(.ui-search-field__action:not(:empty)) { padding-right: 0; }
.ui-search-field__search { display: flex; flex: 1 1 auto; align-items: center; gap: var(--space-2); min-width: 0; padding: 0 12px; }
.ui-search-field__more { flex: none; border: 0; padding: 8px 4px; background: transparent; color: var(--accent); font-size: var(--fs-xs); white-space: nowrap; cursor: pointer; }
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
@include bp.until(tablet) {
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
  padding: 0 12px;
  /* La couture : un seul trait franc, qui remplace le separateur flottant d'avant --
     celui-ci laissait huit pixels de vide de chaque cote et se lisait comme un espace
     plutot que comme une limite. */
  border: 0;
  border-left: 1px solid var(--border);
  /* Le rayon suit celui de la capsule, moins l'epaisseur du contour : a rayon egal, le
     coin du bouton depassait de la courbe et laissait apparaitre un croissant de fond. */
  border-radius: 0 calc(var(--radius-lg) - 1px) calc(var(--radius-lg) - 1px) 0;
  background: color-mix(in srgb, var(--accent) 13%, var(--surface-2));
  color: var(--muted);
  font-size: var(--fs-sm);
  white-space: nowrap;
  cursor: pointer;
}
.ui-search-field__filter:hover { color: var(--text); }
/* Segment d'action : meme couture et meme coin que « Filtres » ; le bouton fourni par la
   page y perd son cadre pour faire corps avec la capsule. */
.ui-search-field__action { display: flex; gap: var(--space-2); flex: 0 1 auto; min-width: 0; max-width: 50%; overflow-x: auto; align-items: center; padding: 0 10px; height: 100%; border-left: 1px solid var(--border); border-radius: 0 calc(var(--radius-lg) - 1px) calc(var(--radius-lg) - 1px) 0; white-space: nowrap; scrollbar-width: none; }
.ui-search-field__action :deep(.ui-button),
.ui-search-field__action :deep(> button) { height: auto; min-height: 0; padding: 0 12px; border: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: var(--fs-sm); }
.ui-search-field__action :deep(> button) { height: 100%; }
.ui-search-field__action :deep(.ui-button:hover),
.ui-search-field__action :deep(> button:hover) { background: rgb(var(--ink) / .05); }
/* Le segment est a plat : un bouton principal y perd son fond, et son texte clair (fait
   pour ce fond) disparaissait sur celui de la capsule. L'action principale prend donc la
   couleur d'accent, en gras, comme « Filtres » quand il est actif. */
.ui-search-field__action :deep(.ui-button--primary) { color: var(--accent); font-weight: 700; }
.ui-search-field__action :deep(.ui-button--primary:hover:not(:disabled)) { background: color-mix(in srgb, var(--accent) 12%, transparent); }
/* Rien a porter (action conditionnelle absente, outils vides) : ni segment, ni separateur.
   `:empty` ignore les commentaires que Vue laisse a la place d'un `v-if` faux. */
.ui-search-field__action:empty { display: none; }
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
  color: var(--on-accent);
  font-size: var(--fs-xs);
  font-weight: 700;
}
.ui-search-field:has(.ui-search-field__filter) .ui-search-field__action { border-radius: 0; }
.ui-search-field__action :deep(.ui-segmented-list) { padding: 0; border: 0; background: transparent; }
.ui-search-field__action :deep(.ui-segmented-item) { min-height: 28px; padding: 0 10px; }
.ui-search-field__filter.active { background: color-mix(in srgb, var(--accent) 25%, var(--surface-2)); }
@include bp.until(tablet) {
  .ui-search-field:has(.ui-search-field__action:not(:empty)) { flex-wrap: wrap; height: auto; }
  .ui-search-field:has(.ui-search-field__action:not(:empty)) .ui-search-field__search { flex-basis: 100%; min-height: 44px; border-bottom: 1px solid var(--border); }
  .ui-search-field__action { flex: 1 1 auto; max-width: none; min-height: 44px; border-left: 0; border-radius: 0; }
  .ui-search-field:has(.ui-search-field__action:not(:empty)) .ui-search-field__filter { min-height: 44px; border-radius: 0 0 calc(var(--radius-lg) - 1px) 0; }
  .ui-search-field__matches { display: none; }
}
</style>
