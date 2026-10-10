<template>
  <header class="app-topbar" :class="{ 'is-hidden': toolbarHidden }">
    <div ref="searchContainer" class="app-topbar__field" @focusin="onSearchFocusIn" @focusout="onSearchFocusOut">
      <UiSearchField
        ref="fieldRef"
        :query="currentQuery"
        :placeholder="pageSearch?.showSearch ? pageSearch.placeholder : 'Rechercher…'"
        :aria-label="`Rechercher — ${resolvedTitle}`"
        :has-filters="pageSearch?.hasFilters"
        :filters-open="pageSearch?.filtersOpen"
        :active-count="pageSearch?.activeCount"
        :kind="pageSearch?.showSearch ? pageSearch.kind : 'search'"
        :match-count="pageSearch?.showSearch ? pageSearch.matchCount : null"
        :total-count="pageSearch?.showSearch ? pageSearch.totalCount : null"
        :more-results="currentQuery.trim().length > 1"
        @update:query="updateQuery"
        @search="pageSearch?.showSearch && pageSearch.onSearch($event)"
        @toggle-filters="toggleFilters"
        @more="showResults"
        @keydown.enter="onSearchEnter"
      >
        <template v-if="pageTools || pageAction" #action>
          <RenderSlot v-if="pageTools" :slot-fn="pageTools" />
          <RenderSlot v-if="pageAction" :slot-fn="pageAction" />
        </template>
      </UiSearchField>
      <div v-if="showRecentSearches && !resultsOpen && !pageSearch?.filtersOpen" class="app-topbar__recent" aria-label="Recherches récentes">
        <small>Dans {{ pageSearch?.scopeLabel }}</small>
        <button v-for="item in recentSearches" :key="item" type="button" @click="applyRecentSearch(item)">
          <History aria-hidden="true" /><span>{{ item }}</span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { History } from '@lucide/vue';
import UiSearchField from '@/components/ui/UiSearchField.vue';
import RenderSlot from '@/components/ui/RenderSlot.vue';
import { setPageToolsHost, usePageTools } from '@/composables/usePageTools';
import { usePageSearch } from '@/composables/usePageSearch';
import { usePageTitle } from '@/composables/usePageTitle';
import { useChromeAutoHide } from '@/composables/useChromeAutoHide';
import { useSearchResults } from '@/composables/useSearchResults';
import type { ShellMode } from '@/styles/breakpoints';
import { readPageSearchHistory, rememberPageSearch } from '@/composables/pageSearchHistory';

const props = withDefaults(
  defineProps<{
    mode: ShellMode;
    pageTitle: string;
    destinationLabel?: string;
  }>(),
  { destinationLabel: '' }
);

const emit = defineEmits<{
  (e: 'open-palette', prefill?: string): void;
}>();

const pageSearch = usePageSearch();
const { query: resultsQuery, open: resultsOpen } = useSearchResults();
const fallbackQuery = ref('');
const currentQuery = computed(() => pageSearch.value?.showSearch ? pageSearch.value.query : fallbackQuery.value);
function updateQuery(value: string): void {
  if (pageSearch.value?.showSearch) pageSearch.value.onQuery(value);
  else fallbackQuery.value = value;
  resultsQuery.value = value;
  if (!value.trim()) resultsOpen.value = false;
  else if (!pageSearch.value?.showSearch) showResults();
}
function showResults(): void {
  if (pageSearch.value?.filtersOpen) pageSearch.value.onToggleFilters();
  resultsQuery.value = currentQuery.value;
  emit('open-palette', currentQuery.value);
}
function toggleFilters(): void {
  resultsOpen.value = false;
  fieldRef.value?.$el?.querySelector('input')?.blur();
  pageSearch.value?.onToggleFilters();
}
function onSearchEnter(): void {
  rememberCurrentSearch();
  showResults();
}
watch(currentQuery, value => { resultsQuery.value = value; });
watch(() => pageSearch.value?.showSearch, (local, previous) => {
  // Une page chargée à la demande peut déclarer son contexte après la première frappe.
  if (local && !previous && fallbackQuery.value && document.activeElement?.matches('.ui-search-field__input')) {
    pageSearch.value?.onQuery(fallbackQuery.value);
    pageSearch.value?.onSearch(new Event('input'));
    fallbackQuery.value = '';
  }
});
const fieldRef = ref<any>(null);
const searchContainer = ref<HTMLElement | null>(null);
const searchFocused = ref(false);
const historyRevision = ref(0);
/* L'etat de masquage est partage avec la rangee de sections : les deux surfaces
   flottent l'une sous l'autre et doivent donc s'effacer et revenir ensemble. Voir
   `useChromeAutoHide`. */
const { hidden: toolbarHidden, setHold, reveal } = useChromeAutoHide();

/* Tant que la recherche a le focus, la barre reste a l'ecran : elle disparaitrait sous
   les doigts de l'utilisateur en train de s'en servir.
   `filtersOpen` ne fait plus partie de la condition. Il visait la feuille modale des
   filtres, mais sur grand ecran c'est une colonne ouverte par defaut : la barre du haut
   ne se masquait alors jamais sur /downloads, sans que rien ne l'explique. La feuille de
   filtres du telephone, non modale, tient elle-meme la barre visible : voir FilterSidebar. */
watch(searchFocused, (active) => setHold('topbar', active), { immediate: true });

const { tools: pageTools, action: pageAction } = usePageTools();
onMounted(() => {
  setPageToolsHost(true);
  window.addEventListener('keydown', focusContextSearch);
});
onUnmounted(() => {
  setPageToolsHost(false);
  setHold('topbar', false);
  resultsOpen.value = false;
  window.removeEventListener('keydown', focusContextSearch);
});

function focusContextSearch(event: KeyboardEvent): void {
  const shortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
  if (!shortcut && (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey)) return;
  const target = event.target as HTMLElement | null;
  if (!shortcut && target?.matches('input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
  reveal();
  if (shortcut) {
    if (pageSearch.value?.filtersOpen) pageSearch.value.onToggleFilters();
    resultsOpen.value = false;
  }
  nextTick(() => fieldRef.value?.$el?.querySelector('input')?.focus());
}

const recentSearches = computed(() => {
  historyRevision.value;
  return pageSearch.value ? readPageSearchHistory(pageSearch.value.scopeLabel) : [];
});
const showRecentSearches = computed(() => searchFocused.value && !pageSearch.value?.query && recentSearches.value.length > 0);

function rememberCurrentSearch(): void {
  if (!pageSearch.value) return;
  rememberPageSearch(pageSearch.value.scopeLabel, pageSearch.value.query);
  historyRevision.value += 1;
}

function applyRecentSearch(query: string): void {
  if (!pageSearch.value) return;
  pageSearch.value.onQuery(query);
  pageSearch.value.onSearch(new Event('input'));
  rememberPageSearch(pageSearch.value.scopeLabel, query);
  historyRevision.value += 1;
}

/**
 * Entrer dans le champ referme le tiroir de filtres.
 *
 * Les deux vivent dans la meme barre et se disputent le bas de l'ecran : la saisie y
 * fait descendre la barre au ras du clavier, et le panneau serait reste suspendu
 * au-dessus du vide qu'elle laisse. Le champ reste atteignable pendant que le panneau
 * est ouvert -- le voile s'arrete sur la barre -- et y toucher bascule simplement d'un
 * outil a l'autre.
 *
 * La cible est bien la zone de saisie : le bouton « Filtres » vit dans la meme boite et
 * prend le focus a l'appui, refermer sur son propre focus l'aurait rendu inoperant.
 */
function onSearchFocusIn(event: FocusEvent): void {
  searchFocused.value = true;
  const target = event.target as HTMLElement | null;
  if (!target?.classList?.contains('ui-search-field__input')) return;
  if (pageSearch.value?.filtersOpen) pageSearch.value.onToggleFilters();
}

function onSearchFocusOut(): void {
  window.setTimeout(() => {
    searchFocused.value = Boolean(searchContainer.value?.contains(document.activeElement));
  }, 0);
}

// Le titre de la page prime sur celui de la route : les vues qui changent de
// sous-section le precisent, et c'est ce que l'utilisateur lit a l'ecran.
const providedTitle = usePageTitle();
const resolvedTitle = computed(() => providedTitle.value || props.pageTitle);

</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.app-topbar {
  position: fixed;
  top: max(8px, var(--safe-top));
  left: calc(var(--app-rail-w) + 12px);
  right: 12px;
  margin-inline: auto;
  z-index: 40;
  width: auto;
  max-width: 980px;
  transition: opacity var(--motion-duration-fast) var(--motion-ease-standard), transform var(--motion-duration-fast) var(--motion-ease-standard);
}
.app-topbar.is-hidden:not(:focus-within) { opacity: 0; transform: translateY(calc(-100% - 14px)); pointer-events: none; }
.app-topbar__field { position: relative; width: 100%; }
.app-topbar__field :deep(.ui-search-field) { width: 100%; max-width: none; height: 54px; box-shadow: 0 10px 32px rgb(var(--shadow-color) / calc(.28 * var(--shadow-scale))); }
.app-topbar__recent {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 3;
  display: grid;
  width: min(100%, 420px);
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  /* Meme raison que la barre elle-meme : opaque plutot que floute. */
  background: var(--surface-sunken);
  box-shadow: 0 14px 36px rgb(var(--shadow-color) / calc(.38 * var(--shadow-scale)));
}
.app-topbar__recent small { padding: 5px 8px; color: var(--muted); font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; }
.app-topbar__recent button { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 36px; padding: 0 8px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text); text-align: left; cursor: pointer; }
.app-topbar__recent button:hover { background: var(--surface); }
.app-topbar__recent svg { flex: none; width: 14px; color: var(--muted); }
.app-topbar__recent span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }


@include bp.until(shell-medium) {
  .app-topbar { top: auto; bottom: calc(var(--app-shell-offset-bottom) + 8px); }
  .app-topbar.is-hidden:not(:focus-within) { transform: translateY(calc(100% + 14px)); }
  .app-topbar:has(.ui-search-field__input:focus) { bottom: calc(var(--keyboard-inset) + max(8px, var(--safe-bottom))); }
  .app-topbar__recent { top: auto; bottom: calc(100% + 6px); }
  .app-topbar__field :deep(.ui-search-field) { height: auto; min-height: 46px; }
}
@include bp.until(tablet) {
  .app-topbar { left: max(10px, var(--safe-left)); right: max(10px, var(--safe-right)); }
}
</style>
