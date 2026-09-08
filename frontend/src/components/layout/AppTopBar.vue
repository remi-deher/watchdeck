<template>
  <header class="app-topbar">
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
    <button
      v-else
      type="button"
      class="app-topbar__icon-btn"
      :aria-pressed="collapsed"
      :aria-label="collapsed ? 'Déployer la navigation' : 'Replier la navigation'"
      @click="$emit('toggle-rail')"
    >
      <PanelLeft aria-hidden="true" />
    </button>

    <!-- Le fil situe la page dans sa destination. Il double le rail, qui indique déjà
         où l'on est, mais reste le seul repère disponible en mode compact. Sur grand
         écran les sections tiennent le même rôle : le segment parent s'efface alors
         pour leur laisser la largeur. -->
    <nav class="app-topbar__crumbs" aria-label="Fil d’Ariane">
      <ol>
        <li v-if="!showSections && destinationLabel && destinationLabel !== resolvedTitle">
          <span>{{ destinationLabel }}</span>
        </li>
        <li aria-current="page">{{ resolvedTitle }}</li>
      </ol>
    </nav>

    <span v-if="showSections && sections.length > 1" class="app-topbar__divider" aria-hidden="true" />
    <AppSubnav
      v-if="showSections && sections.length > 1"
      class="app-topbar__sections"
      :items="sections"
      :active="activeKey"
      :aria-label="`Sections ${sectionsLabel || resolvedTitle}`"
    />

    <!-- La recherche de la page occupe la barre quand elle existe. Sur mobile, elle
         s'y deploie a la demande : le titre et un champ de 341px n'y tiennent pas
         ensemble (390px de large, moins deux boutons de 44px). -->
    <div v-if="pageSearch" class="app-topbar__field" :class="{ 'is-expanded': searchExpanded }">
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
    </div>

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
import { computed, nextTick, ref, watch } from 'vue';
import { ArrowLeft, Menu, PanelLeft, Search, SlidersHorizontal } from '@lucide/vue';
import AppSubnav from '@/components/ui/AppSubnav.vue';
import UiSearchField from '@/components/ui/UiSearchField.vue';
import { usePageSearch } from '@/composables/usePageSearch';
import { usePageSections } from '@/composables/usePageSections';
import { usePageTitle } from '@/composables/usePageTitle';
import { shortcutLabel } from '@/shortcut';
import type { ShellMode } from '@/styles/breakpoints';

const props = withDefaults(
  defineProps<{
    mode: ShellMode;
    pageTitle: string;
    destinationLabel?: string;
    collapsed?: boolean;
    sheetOpen?: boolean;
  }>(),
  { destinationLabel: '', collapsed: false, sheetOpen: false }
);

const emit = defineEmits<{
  (e: 'open-sheet'): void;
  (e: 'toggle-rail'): void;
  (e: 'open-palette', prefill?: string): void;
}>();

const pageSearch = usePageSearch();
const fieldRef = ref<any>(null);
const searchExpanded = ref(false);

/* En mode compact, la loupe deploie le champ de la page sur toute la barre ; sans
   champ de page, elle ouvre la recherche globale. Un seul bouton, deux roles selon
   ce que la page offre. */
function onCompactSearch(): void {
  if (!pageSearch.value) return emit('open-palette');
  searchExpanded.value = !searchExpanded.value;
  if (searchExpanded.value) {
    nextTick(() => fieldRef.value?.$el?.querySelector('input')?.focus());
  }
}

function collapseSearch(): void {
  searchExpanded.value = false;
}

// Le titre de la page prime sur celui de la route : les vues qui changent de
// sous-section le precisent, et c'est ce que l'utilisateur lit a l'ecran.
const providedTitle = usePageTitle();
const resolvedTitle = computed(() => providedTitle.value || props.pageTitle);

/* Les sections ne remontent ici qu'en mode deploye : plus bas, la barre n'a pas la
   largeur de les porter sans chasser le titre, seul repere visible depuis que le
   bandeau de titre a quitte la page. */
const { sections, activeKey, destinationLabel: sectionsLabel } = usePageSections();
const showSections = computed(() => props.mode === 'expanded');

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
  top: 0;
  right: 0;
  /* La barre commence après le rail : elle ne le recouvre jamais, et sa largeur suit
     donc automatiquement le repli, sans second calcul. */
  left: var(--app-rail-w);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: calc(var(--app-topbar-h) + var(--safe-top));
  padding: var(--safe-top) max(var(--space-3), var(--safe-right)) 0 var(--space-3);
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(18px) saturate(1.1);
  -webkit-backdrop-filter: blur(18px) saturate(1.1);
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

.app-topbar__search {
  display: none;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  width: min(280px, 30vw);
  height: 36px;
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
.app-topbar__field { position: relative; display: none; flex: 0 1 341px; min-width: 0; }

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
  /* Au-dela du compact, le bouton Filtres du champ est deja visible. */
  .app-topbar__filters-compact { display: none; }
  /* Au-dela du compact, le champ tient dans la barre sans se deployer, et la loupe
     n'a plus de role : la recherche globale reste sur Ctrl+K et dans le rail. */
  .app-topbar__search-compact { display: none; }
  /* `relative` conserve : c'est le bloc conteneur du bouton d'echappee, qui
     s'ancrait sinon au bord gauche de la barre. */
  .app-topbar__field { display: flex; position: relative; }
}
</style>
