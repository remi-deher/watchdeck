<template>
  <header class="app-topbar" :class="{ 'is-hidden': toolbarHidden }">
    <button
      v-if="mode === 'compact'"
      type="button"
      class="app-topbar__icon-btn"
      aria-haspopup="dialog"
      :aria-expanded="sheetOpen"
      aria-label="Ouvrir la navigation"
      @click="$emit('open-sheet')"
    >
      <Menu aria-hidden="true" />
    </button>

    <span v-if="mode !== 'expanded'" class="app-topbar__context" aria-current="page">{{ resolvedTitle }}</span>

    <!-- La recherche de la page occupe la barre quand elle existe. Sur mobile, elle
         s'y deploie a la demande : le titre et un champ de 341px n'y tiennent pas
         ensemble (390px de large, moins deux boutons de 44px). -->
    <div
      v-if="pageSearch?.showSearch"
      ref="searchContainer"
      class="app-topbar__field"
      :class="{ 'is-expanded': searchExpanded }"
      @focusin="searchFocused = true"
      @focusout="onSearchFocusOut"
    >
      <!-- Deploye, le champ recouvre la barre entiere, boutons compris : sans ce
           retour, il n'y a plus aucun moyen d'en sortir au doigt (Echap suppose un
           clavier, et la croix native du champ ne fait qu'effacer la saisie). -->
      <button
        v-if="searchExpanded"
        type="button"
        class="app-topbar__icon-btn"
        aria-label="Fermer la recherche"
        @click="collapseSearch"
      >
        <ArrowLeft aria-hidden="true" />
      </button>
      <UiSearchField
        ref="fieldRef"
        :query="pageSearch.query"
        :placeholder="pageSearch.placeholder"
        :aria-label="`${pageSearch.placeholder} — ${resolvedTitle}`"
        :has-filters="pageSearch.hasFilters"
        :filters-open="pageSearch.filtersOpen"
        :active-count="pageSearch.activeCount"
        @update:query="pageSearch.onQuery($event)"
        @search="pageSearch.onSearch($event)"
        @toggle-filters="pageSearch.onToggleFilters()"
        @keydown.escape="collapseSearch"
        @keydown.enter="rememberCurrentSearch"
      />
      <!-- Echappee vers la recherche globale : la requete en cours ne trouve peut-etre
           rien ici parce qu'elle concerne une autre partie de l'application. -->
      <button
        v-if="pageSearch.query.trim().length > 1"
        type="button"
        class="app-topbar__escape"
        @click="$emit('open-palette', pageSearch.query)"
      >
        Rechercher « {{ pageSearch.query.trim() }} » partout
      </button>
      <div v-if="showRecentSearches" class="app-topbar__recent" aria-label="Recherches récentes">
        <small>Dans {{ pageSearch.scopeLabel }}</small>
        <button v-for="item in recentSearches" :key="item" type="button" @click="applyRecentSearch(item)">
          <History aria-hidden="true" /><span>{{ item }}</span>
        </button>
      </div>
    </div>

    <button
      v-else-if="pageSearch?.hasFilters"
      type="button"
      class="app-topbar__filter-only"
      :class="{ active: pageSearch.filtersOpen || pageSearch.activeCount > 0 }"
      :aria-expanded="pageSearch.filtersOpen"
      :aria-label="pageSearch.filtersOpen ? 'Masquer les filtres' : 'Afficher les filtres'"
      @click="pageSearch.onToggleFilters()"
    >
      <SlidersHorizontal aria-hidden="true" />
      <span>Filtres</span>
      <strong v-if="pageSearch.activeCount">{{ pageSearch.activeCount }}</strong>
    </button>

    <button
      v-else
      type="button"
      class="app-topbar__search"
      @click="$emit('open-palette')"
    >
      <Search aria-hidden="true" />
      <span>Rechercher…</span>
      <kbd>{{ shortcutLabel }}</kbd>
    </button>

    <!-- Ancre des outils de la page (periode, export, colonnes...). En mode deploye les
         sections sont deja remontees dans le rail : la rangee collante de la page n'aurait
         plus porte qu'un controle isole sur toute une ligne. Il vient donc ici, contre la
         recherche, ou il ne coute aucune hauteur. AppPage y telporte son slot `tools`. -->
    <div v-if="mode === 'expanded'" id="app-page-tools" class="app-topbar__page-tools" />

    <!-- En compact, les filtres sont dans le champ, donc derriere la loupe : deux tapes
         pour un controle qu'on ouvre souvent. On les ressort a cote, a portee directe. -->
    <button
      v-if="pageSearch?.hasFilters && !searchExpanded"
      type="button"
      class="app-topbar__icon-btn app-topbar__filters-compact"
      :class="{ active: pageSearch.filtersOpen || pageSearch.activeCount > 0 }"
      :aria-expanded="pageSearch.filtersOpen"
      :aria-label="pageSearch.filtersOpen ? 'Masquer les filtres' : 'Afficher les filtres'"
      @click="pageSearch.onToggleFilters()"
    >
      <SlidersHorizontal aria-hidden="true" />
      <strong v-if="pageSearch.activeCount">{{ pageSearch.activeCount }}</strong>
    </button>

    <button
      type="button"
      class="app-topbar__icon-btn app-topbar__search-compact"
      :aria-expanded="pageSearch ? searchExpanded : undefined"
      :aria-label="pageSearch ? 'Rechercher dans la page' : 'Rechercher'"
      @click="onCompactSearch"
    >
      <Search aria-hidden="true" />
    </button>

  </header>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ArrowLeft, History, Menu, Search, SlidersHorizontal } from '@lucide/vue';
import UiSearchField from '@/components/ui/UiSearchField.vue';
import { usePageSearch } from '@/composables/usePageSearch';
import { usePageTitle } from '@/composables/usePageTitle';
import { shortcutLabel } from '@/shortcut';
import type { ShellMode } from '@/styles/breakpoints';
import { readPageSearchHistory, rememberPageSearch } from '@/composables/pageSearchHistory';

const props = withDefaults(
  defineProps<{
    mode: ShellMode;
    pageTitle: string;
    destinationLabel?: string;
    sheetOpen?: boolean;
  }>(),
  { destinationLabel: '', sheetOpen: false }
);

const emit = defineEmits<{
  (e: 'open-sheet'): void;
  (e: 'open-palette', prefill?: string): void;
}>();

const pageSearch = usePageSearch();
const fieldRef = ref<any>(null);
const searchContainer = ref<HTMLElement | null>(null);
const searchExpanded = ref(false);
const searchFocused = ref(false);
const historyRevision = ref(0);
const toolbarHidden = ref(false);
let lastScrollY = 0;

function handleScroll(): void {
  const current = Math.max(0, window.scrollY);
  const delta = current - lastScrollY;
  if (current < 24 || delta < -5 || searchFocused.value || pageSearch.value?.filtersOpen) toolbarHidden.value = false;
  else if (delta > 7 && current > 96 && !searchExpanded.value) toolbarHidden.value = true;
  lastScrollY = current;
}

onMounted(() => {
  lastScrollY = window.scrollY;
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('keydown', focusContextSearch);
});
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('keydown', focusContextSearch);
});

/* En mode compact, la loupe deploie le champ de la page sur toute la barre ; sans
   champ de page, elle ouvre la recherche globale. Un seul bouton, deux roles selon
   ce que la page offre. */
function onCompactSearch(): void {
  if (!pageSearch.value?.showSearch) return emit('open-palette');
  toolbarHidden.value = false;
  searchExpanded.value = !searchExpanded.value;
  if (searchExpanded.value) {
    nextTick(() => fieldRef.value?.$el?.querySelector('input')?.focus());
  }
}

function collapseSearch(): void {
  searchExpanded.value = false;
}

function focusContextSearch(event: KeyboardEvent): void {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || !pageSearch.value?.showSearch) return;
  const target = event.target as HTMLElement | null;
  if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
  toolbarHidden.value = false;
  searchExpanded.value = true;
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

function onSearchFocusOut(): void {
  window.setTimeout(() => {
    searchFocused.value = Boolean(searchContainer.value?.contains(document.activeElement));
  }, 0);
}

// Le titre de la page prime sur celui de la route : les vues qui changent de
// sous-section le precisent, et c'est ce que l'utilisateur lit a l'ecran.
const providedTitle = usePageTitle();
const resolvedTitle = computed(() => providedTitle.value || props.pageTitle);

/* Les sections ne remontent ici qu'en mode deploye : plus bas, la barre n'a pas la
   largeur de les porter sans chasser le titre, seul repere visible depuis que le
   bandeau de titre a quitte la page. */

/* On suit le titre, pas l'objet de recherche : celui-ci est recree a chaque frappe
   (la requete en fait partie), et le surveiller refermait le champ des la premiere
   lettre. Le titre, lui, ne change qu'en changeant de page — ce qu'on veut vraiment
   detecter, pour ne pas laisser la recherche d'une page par-dessus le titre d'une autre. */
watch(resolvedTitle, () => { searchExpanded.value = false; });
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.app-topbar {
  position: fixed;
  top: max(8px, var(--safe-top));
  /* Centrage par insets plutot que par `left: 50% + translate`.
     `100vw` inclut la barre de defilement : la moitie de sa largeur decalait la barre
     d'environ 8px vers la droite par rapport au contenu, dans les deux etats du rail.
     Borner la boite entre le rail et le bord droit, puis laisser `margin-inline: auto`
     la centrer, donne un centrage exact quel que soit l'etat du rail -- et la position
     s'anime au repliement au lieu de sauter. */
  /* Les gouttieres vivent dans les insets, pas dans la largeur : pour un element
     `fixed`, un `width: calc(100% - 24px)` se resout sur la FENETRE et non sur la bande
     entre le rail et le bord droit. La barre debordait alors sa bande, la marge droite
     passait en negatif et le centrage automatique ne pouvait plus s'appliquer. */
  left: calc(var(--app-rail-w) + 12px);
  right: 12px;
  margin-inline: auto;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--app-topbar-h);
  width: auto;
  max-width: 980px;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--surface-sunken) 90%, transparent);
  box-shadow: 0 10px 32px rgba(0, 0, 0, .22);
  backdrop-filter: blur(18px) saturate(1.1);
  -webkit-backdrop-filter: blur(18px) saturate(1.1);
  /* Pas de transition sur `left` : la valeur vient d'une variable qui change au
     repliement du rail, et l'animer figeait la position a l'ancienne valeur. Le rail
     lui-meme n'anime pas sa largeur, la barre n'a donc rien a rattraper. */
  transition: opacity .2s ease, transform .2s ease, box-shadow .2s ease;
}
.app-topbar.is-hidden:not(:focus-within) { opacity: 0; transform: translateY(calc(-100% - 14px)); pointer-events: none; }
.app-topbar__context {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: var(--fs-sm);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-topbar__icon-btn {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--touch-target);
  height: var(--touch-target);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.app-topbar__icon-btn:hover { color: var(--text); background: var(--surface); }
.app-topbar__icon-btn svg { width: 19px; height: 19px; }

.app-topbar__page-tools {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.app-topbar__page-tools:empty { display: none; }

.app-topbar__crumbs { min-width: 0; flex: 1; }
.app-topbar__crumbs ol {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.app-topbar__crumbs li {
  overflow: hidden;
  color: var(--muted);
  font-size: var(--fs-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-topbar__crumbs li + li::before { content: '/'; margin-right: var(--space-2); opacity: .5; }
/* La barre est desormais le seul endroit ou le titre de la page est visible : il doit
   se lire comme un titre, pas comme le dernier maillon d'un fil d'Ariane. */
.app-topbar__crumbs li[aria-current='page'] {
  color: var(--text);
  font-size: var(--fs-lg);
  font-weight: 750;
  letter-spacing: -.01em;
}

/* Repli quand la page ne fournit aucune recherche (Accueil, Problemes).
   Il occupe la meme place que le champ de page : `flex: none` a 280px le collait au
   bord gauche d'une barre de 980, a 346px du centre, alors que partout ailleurs la
   recherche s'etend sur toute la largeur. La barre changeait d'allure d'une page a
   l'autre sans que rien ne le justifie. */
.app-topbar__search {
  display: none;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  height: 46px;
  padding: 0 var(--space-2) 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--muted);
  font-size: var(--fs-sm);
  cursor: pointer;
}
.app-topbar__search:hover { color: var(--text); border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
.app-topbar__search svg { flex: none; width: 15px; height: 15px; }
.app-topbar__search span { flex: 1; text-align: left; }
.app-topbar__search kbd {
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 10px;
}

/* La rangee de sections prend la place restante entre le titre et la recherche, et
   defile dans son propre cadre plutot que de pousser la recherche hors de la barre. */
/* Sans cette coupure, le titre se lit comme un onglet de plus dans la rangee. */
.app-topbar__divider {
  flex: none;
  width: 1px;
  height: 22px;
  background: var(--border);
}
/* Ce sont les sections qui cedent la place, pas le titre : elles defilent dans leur
   propre cadre, alors qu'un titre tronque ne se recupere nulle part ailleurs. */
.app-topbar__sections { flex: 1 1 0; min-width: 0; }
.app-topbar__sections :deep(.app-subnav__scroller) { border: 0; background: transparent; padding: 0; }
.app-topbar__crumbs:has(~ .app-topbar__sections) { flex: 0 0 auto; max-width: 260px; }

/* ── Recherche de page ──────────────────────────────────────────────────────── */
.app-topbar__field { position: relative; display: none; flex: 1 1 auto; min-width: 0; }
.app-topbar__field :deep(.ui-search-field) { width: 100%; max-width: none; height: 46px; }
.app-topbar__field :deep(.ui-search-field__filter) {
  height: 34px;
  margin-right: -5px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 13%, var(--surface-2));
  color: var(--text);
  font-weight: 700;
}
.app-topbar__filter-only {
  display: none;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-width: 150px;
  height: 46px;
  margin: 0 auto;
  padding: 0 var(--space-4);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--accent) 13%, var(--surface));
  color: var(--text);
  font-weight: 750;
  cursor: pointer;
}
.app-topbar__filter-only:hover,
.app-topbar__filter-only.active { background: color-mix(in srgb, var(--accent) 25%, var(--surface)); color: var(--accent); }
.app-topbar__filter-only svg { width: 17px; height: 17px; }
.app-topbar__filter-only strong { display: grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: var(--radius-pill); background: var(--accent); color: #1a1400; font-size: 10px; }
.app-topbar__field :deep(.ui-search-field__filter:hover),
.app-topbar__field :deep(.ui-search-field__filter.active) {
  background: color-mix(in srgb, var(--accent) 25%, var(--surface-2));
  color: var(--accent);
}

/* Deploiement en mode compact : le champ recouvre la barre entiere, titre compris. */
.app-topbar__field.is-expanded {
  display: flex;
  position: absolute;
  top: var(--safe-top);
  right: max(var(--space-3), var(--safe-right));
  bottom: 0;
  left: var(--space-3);
  z-index: 1;
  align-items: center;
  gap: var(--space-2);
  background: var(--bg);
}
.app-topbar__field.is-expanded .ui-search-field { flex: 1 1 auto; max-width: none; }

.app-topbar__escape {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 2;
  max-width: 100%;
  overflow: hidden;
  padding: 7px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: var(--fs-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(0, 0, 0, .35);
}
.app-topbar__escape:hover { color: var(--text); border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }

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
  background: color-mix(in srgb, var(--surface-sunken) 96%, transparent);
  box-shadow: 0 14px 36px rgba(0, 0, 0, .38);
  backdrop-filter: blur(18px);
}
.app-topbar__recent small { padding: 5px 8px; color: var(--muted); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.app-topbar__recent button { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 36px; padding: 0 8px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text); text-align: left; cursor: pointer; }
.app-topbar__recent button:hover { background: var(--surface); }
.app-topbar__recent svg { flex: none; width: 14px; color: var(--muted); }
.app-topbar__recent span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.app-topbar__filters-compact { position: relative; }
.app-topbar__filters-compact.active { color: var(--accent); }
.app-topbar__filters-compact strong {
  position: absolute;
  top: 5px;
  right: 4px;
  display: grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #1a1400;
  font-size: 10px;
}

@include bp.from(shell-medium) {
  .app-topbar__search { display: flex; }
  .app-topbar__filter-only { display: flex; }
  /* Au-dela du compact, le bouton Filtres du champ est deja visible. */
  .app-topbar__filters-compact { display: none; }
  /* Au-dela du compact, le champ tient dans la barre sans se deployer, et la loupe
     n'a plus de role : la recherche globale reste sur Ctrl+K et dans le rail. */
  .app-topbar__search-compact { display: none; }
  /* `relative` conserve : c'est le bloc conteneur du bouton d'echappee, qui
     s'ancrait sinon au bord gauche de la barre. */
  .app-topbar__field { display: flex; position: relative; }
}

/* Sur tablette, le titre reste un repère visible mais sort du flux : il ne décale
   donc jamais le centre optique de la recherche par rapport au contenu. */
@include bp.between(shell-medium, shell-expanded) {
  .app-topbar__context {
    position: absolute;
    left: 14px;
    max-width: 90px;
  }
  .app-topbar__field {
    flex: 0 1 520px;
    width: calc(100% - 196px);
    margin: 0 auto;
  }
}

@include bp.until(tablet) {
  .app-topbar { left: max(10px, var(--safe-left)); right: max(10px, var(--safe-right)); width: auto; transform: none; }
  .app-topbar.is-hidden:not(:focus-within) { transform: translateY(calc(-100% - 14px)); }
  .app-topbar__field.is-expanded {
    top: 0;
    right: 4px;
    bottom: 0;
    left: 4px;
    border-radius: inherit;
  }
}
</style>
