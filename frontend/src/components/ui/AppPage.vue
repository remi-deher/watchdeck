<template>
  <!-- `page-motion` etale l'arrivee des blocs de la page, avec un plafond pour qu'une
       longue page ne se deroule pas indefiniment. La regle vit dans `_motion.scss`,
       ecrite elle aussi de longue date et jusqu'ici sans emploi. -->
  <div class="app-page page-motion" :class="pageClass">
    <!-- Le titre reste dans le document mais pas a l'ecran : la barre de contexte
         affiche deja le meme intitule, en permanence et sans jamais defiler. Le h1
         garde donc son role de point d'entree pour la navigation par en-tetes, sans
         couter les 38 a 115px qu'un bandeau de titre prenait sur chaque page. -->
    <h1 class="sr-only">{{ title }}</h1>

    <!-- Le temoin doit rester HORS du conteneur collant : a l'interieur, il colle avec
         lui, ne quitte jamais le champ visible, et l'etat "decolle" n'arrive jamais. -->
    <span ref="stickySentinel" class="app-page__sentinel" aria-hidden="true" />
    <!-- `is-hidden` suit exactement la barre du haut : les deux surfaces flottent l'une
         sous l'autre, et voir la rangee de sections rester seule en haut de l'ecran
         apres la disparition de la barre donnait une bande orpheline qui mangeait 54px
         de lecture sur telephone. -->
    <div
      v-if="showStickyRow"
      class="app-page__sticky"
      :class="{ 'is-stuck': isStuck, 'is-hidden': chromeHidden }"
    >
      <AppSubnav
        v-if="showSections && resolvedSections.length > 1"
        :items="resolvedSections"
        :active="resolvedActiveSection"
        :variant="sectionsVariant"
        :aria-label="`Sections ${destinationLabel || title}`"
        @update:active="$emit('update:activeSection', $event)"
      />

      <!-- Onglets propres a la page (types de Bibliotheque, vues d'Explorer) : ils
           partagent le collage, l'ombre et l'effacement de la rangee au lieu d'en
           reimplementer une copie dans la feuille globale. -->
      <slot name="tabs" />

      <div v-if="hasTools && !toolsInBar" class="app-page__tools">
        <div class="app-page__tool-actions">
          <slot name="tools" />
          <slot name="actions" />
        </div>
      </div>
    </div>

    <!-- En mode deploye les sections vivent dans le rail : garder ici une rangee collante
         pour les seuls outils coutait une ligne entiere a un ou deux controles. Ils
         rejoignent donc la barre du haut, contre la recherche. -->
    <Teleport v-if="hasTools && toolsInBar" to="#app-page-tools">
      <div class="app-page__tool-actions">
        <slot name="tools" />
        <slot name="actions" />
      </div>
    </Teleport>

    <UiFeedback
      v-if="error"
      type="error"
      :title="errorTitle"
      :message="error"
      :retry="retry"
      @retry="$emit('retry')"
    />
    <UiFeedback v-if="success" type="success" :message="success" dismissible @dismiss="$emit('dismiss-success')" />
    <UiFeedback v-if="loading" type="loading" :message="loadingMessage" />
    <slot name="feedback" />

    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useSlots, watch } from 'vue';
import { useIntersectionObserver } from '@vueuse/core';
import AppSubnav, { type SubnavItem } from './AppSubnav.vue';
import { providePageSearch, type PageSearch, type PageSearchKind } from '@/composables/usePageSearch';
import { usePageSections } from '@/composables/usePageSections';
import { providePageTitle } from '@/composables/usePageTitle';
import { useShellMode } from '@/composables/useShellMode';
import { useChromeAutoHide } from '@/composables/useChromeAutoHide';
import UiFeedback from './UiFeedback.vue';

const props = withDefaults(
  defineProps<{
    title: string;
    pageClass?: string;
    /**
     * Sections de second niveau. Omises, elles sont deduites de la destination
     * courante ; une seule section (ou aucune) ne donne aucune rangee.
     */
    sections?: SubnavItem[];
    activeSection?: string;
    sectionsVariant?: 'links' | 'tabs';
    /** Opt-out de la recherche, comme sur l'ancien PageSearchHeader. */
    hideSearch?: boolean;
    query?: string;
    placeholder?: string;
    /** Libellé court affiché devant la recherche pour rendre son périmètre explicite. */
    searchScope?: string;
    /**
     * `search` interroge un corpus, `filter` réduit la liste affichée. Deux gestes
     * opposés portaient la même barre : on ne pouvait pas savoir, en tapant, si l'on
     * élargissait ou si l'on retranchait.
     */
    searchKind?: PageSearchKind;
    /** Pour un filtre : lignes retenues et lignes totales, affichées « 43 sur 348 ». */
    matchCount?: number | null;
    totalCount?: number | null;
    hasFilters?: boolean;
    filtersOpen?: boolean;
    activeCount?: number;
    error?: string;
    errorTitle?: string;
    retry?: boolean;
    loading?: boolean;
    loadingMessage?: string;
    success?: string;
  }>(),
  {
    pageClass: '',
    sections: () => [],
    activeSection: '',
    sectionsVariant: 'links',
    hideSearch: false,
    query: '',
    placeholder: 'Rechercher…',
    searchScope: '',
    searchKind: 'search',
    matchCount: null,
    totalCount: null,
    hasFilters: false,
    filtersOpen: false,
    activeCount: 0,
    error: '',
    errorTitle: '',
    retry: false,
    loading: false,
    loadingMessage: 'Chargement…',
    success: '',
  }
);

const emit = defineEmits<{
  (e: 'update:query', value: string): void;
  (e: 'update:activeSection', value: string): void;
  (e: 'search', event: Event): void;
  (e: 'toggle-filters'): void;
  (e: 'retry'): void;
  (e: 'dismiss-success'): void;
}>();

// AppPage est aussi monte hors routeur (tests unitaires isoles, tiroirs) : sans
// route, la deduction se tait au lieu de faire echouer le rendu de la page.
// La barre de contexte affiche ce titre : c'est elle, desormais, qui le rend visible.
providePageTitle(computed(() => props.title));

/* Idem pour la recherche : la page en garde la propriete (requete, filtres, effet),
   la barre n'en fait que le rendu. Une page qui declare `hide-search` n'en fournit
   aucune, et la barre retombe alors sur le declencheur de la palette. */
providePageSearch(
  computed<PageSearch | null>(() =>
    props.hideSearch && !props.hasFilters
      ? null
      : {
          showSearch: !props.hideSearch,
          kind: props.searchKind,
          matchCount: props.matchCount,
          totalCount: props.totalCount,
          query: props.query,
          placeholder: props.placeholder,
          scopeLabel: props.searchScope || props.title,
          hasFilters: props.hasFilters,
          filtersOpen: props.filtersOpen,
          activeCount: props.activeCount,
          onQuery: (value: string) => emit('update:query', value),
          onSearch: (event: Event) => emit('search', event),
          onToggleFilters: () => emit('toggle-filters'),
        }
  )
);

/* Au-dela du seuil `expanded`, les sections remontent dans la barre de contexte : la
   page ne les rend alors plus, sous peine de les afficher deux fois. En dessous, la
   barre n'a pas la largeur de les accueillir et elles restent ici. */
const mode = useShellMode();
const slots = useSlots();
const hasTools = computed(() => Boolean(slots.tools || slots.actions));
const hasTabs = computed(() => Boolean(slots.tabs));
/* La cible du teleport appartient a la barre du haut, montee avant la page : elle est
   donc la des le premier rendu. On la verifie quand meme, pour qu'un AppPage monte hors
   du shell (tests isoles, tiroirs) retombe simplement sur sa rangee collante. */
const toolsAnchor = ref(false);
const syncToolsAnchor = () => { toolsAnchor.value = Boolean(document.getElementById('app-page-tools')); };
/* Les commandes de la page restent dans sa rangee, a toutes les largeurs.
   Elles ont ete remontees un temps dans la barre du haut, pour eviter une rangee qui
   n'aurait porte qu'un controle isole. Mais elles y partageaient la place avec la
   recherche, qui changeait alors de largeur et de centre d'une page a l'autre selon les
   commandes de chacune -- et le selecteur de periode, large de 398px, finissait par la
   recouvrir. Une rangee un peu vide se remarque moins qu'une barre qui bouge. */
const toolsInBar = computed(() => false);
const { sections: derivedSections, activeKey, destinationLabel } = usePageSections();
/* Meme source que la barre du haut : une seule lecture du defilement pour les deux. */
const { hidden: chromeHidden } = useChromeAutoHide();
/* Trois modes, trois porteurs, jamais deux a la fois : le rail en deploye, cette rangee
   en intermediaire, et le dock en compact -- ou une rangee de plus, qui defilait
   horizontalement des quatre sections, s'ajoutait a la barre du haut et au dock sur un
   ecran qui n'a la hauteur d'aucune des trois. */
const showSections = computed(() => mode.value === 'medium');
const showStickyRow = computed(
  () => (showSections.value && resolvedSections.value.length > 1) || hasTabs.value || (hasTools.value && !toolsInBar.value)
);
const resolvedSections = computed<SubnavItem[]>(() =>
  props.sections.length ? props.sections : derivedSections.value
);
const resolvedActiveSection = computed(() =>
  props.sections.length ? props.activeSection : activeKey.value
);

const stickySentinel = ref<HTMLElement | null>(null);
const isStuck = ref(false);

watch(mode, () => nextTick(syncToolsAnchor));
onMounted(syncToolsAnchor);
useIntersectionObserver(stickySentinel, ([entry]) => {
  if (entry) isStuck.value = !entry.isIntersecting;
});
</script>

<style scoped lang="scss">
/* La cascade d'arrivee ne concerne que le contenu.
 *
 * `page-motion` anime chaque enfant direct : le temoin de collage et la rangee collante
 * en faisaient donc partie. Or cette rangee porte les outils de la page, et son animation
 * redemarre a chaque rendu -- la moindre frappe dans la recherche la remettait en
 * mouvement. Le bouton « Filtres » qu'elle contient n'atteignait plus jamais une position
 * stable : un clic s'y perdait, et l'integration continue l'a constate avant nous. Ces
 * deux-la sont donc de la charpente, pas du contenu, et ne bougent pas.
 */
.app-page.page-motion > .app-page__sentinel,
.app-page.page-motion > .app-page__sticky,
.app-page.page-motion > .sr-only {
  animation: none;
}

.app-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
  max-width: min(100%, var(--content-max-width));
  min-width: 0;
  margin-inline: auto;
}

.app-page__sticky {
  position: sticky;
  /* L'unique source de l'offset haut. Aucune page ne redéclare cette valeur : c'est
     la divergence qu'on avait fini par payer sur trois fichiers. */
  top: var(--app-shell-offset-top);
  z-index: 20;
  /* Sections et outils partagent une ligne quand la largeur le permet, et se
     repartissent sur deux lignes sinon. Une action seule sur sa propre ligne
     reprenait une partie de la place qu'on vient justement de liberer. */
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  /* Tout sur l'axe de la recherche : sections et outils centres, cote a cote quand
     les deux sont la (Activite en tablette), sur deux lignes si la place manque. */
  justify-content: center;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-2) 0;
  /* Plus de bande pleine largeur : seules les capsules flottent, comme la recherche.
     La bande laisse passer les clics vers le contenu visible entre elles. */
  background: transparent;
  pointer-events: none;
}
.app-page__sticky > * { pointer-events: auto; }
.app-page__sticky > :deep(.app-subnav) { flex: 0 1 auto; min-width: 0; max-width: 100%; }
.app-page__sticky > .app-page__tools { flex: 0 1 auto; min-width: 0; max-width: 100%; }
.app-page__sentinel { display: block; width: 1px; height: 1px; margin-bottom: -1px; pointer-events: none; }
/* L'ombre n'apparait qu'une fois decolle, et sur la capsule seule : au repos, elle
   soulignerait une barre qui ne flotte pas encore au-dessus de quoi que ce soit. */
.app-page__sticky.is-stuck > :deep(.app-subnav) .app-subnav__scroller,
.app-page__sticky.is-stuck > .app-page__tools {
  box-shadow: 0 10px 28px rgb(var(--shadow-color) / calc(.3 * var(--shadow-scale)));
}

/* Meme geste que la barre du haut, meme duree : les deux surfaces doivent partir et
   revenir d'un seul mouvement, pas l'une apres l'autre. `:focus-within` protege le
   parcours au clavier -- une rangee d'onglets ne doit jamais s'effacer sous le focus. */
.app-page__sticky {
  transition: opacity var(--motion-duration-fast) var(--motion-ease-standard), transform var(--motion-duration-fast) var(--motion-ease-standard), box-shadow var(--motion-duration-fast) var(--motion-ease-standard);
}
.app-page__sticky.is-hidden:not(:focus-within) {
  opacity: 0;
  transform: translateY(calc(-100% - var(--app-shell-offset-top, 54px)));
  pointer-events: none;
}

.app-page__tools {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  min-width: 0;
}
/* Dans la rangee collante, les outils forment une capsule de la meme famille que la
   recherche et les sections : posee sur le contenu qui defile, elle garde lisibles les
   boutons sans fond (Reglages, fleches du calendrier). */
.app-page__sticky > .app-page__tools {
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  transition: box-shadow var(--motion-duration-fast) var(--motion-ease-standard);
}
/* Un controle segmente (periode d'Activite) s'aplatit dans la capsule, et sa pastille
   active parle le meme langage que l'onglet actif des sections. */
.app-page__sticky > .app-page__tools :deep(.ui-segmented-list) { padding: 0; border: 0; background: transparent; }
.app-page__sticky > .app-page__tools :deep(.ui-segmented-item[data-state='on']) {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  box-shadow: none;
  font-weight: 700;
}
/* Un slot rendu vide (outils conditionnels) ne doit pas laisser une capsule vide. */
.app-page__sticky > .app-page__tools:not(:has(.app-page__tool-actions > *)) { display: none; }

.app-page__tool-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
</style>
