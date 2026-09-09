<template>
  <div class="app-page" :class="pageClass">
    <!-- Le titre reste dans le document mais pas a l'ecran : la barre de contexte
         affiche deja le meme intitule, en permanence et sans jamais defiler. Le h1
         garde donc son role de point d'entree pour la navigation par en-tetes, sans
         couter les 38 a 115px qu'un bandeau de titre prenait sur chaque page. -->
    <h1 class="sr-only">{{ title }}</h1>

    <!-- Le temoin doit rester HORS du conteneur collant : a l'interieur, il colle avec
         lui, ne quitte jamais le champ visible, et l'etat "decolle" n'arrive jamais. -->
    <span ref="stickySentinel" class="app-page__sentinel" aria-hidden="true" />
    <div
      v-if="showStickyRow"
      class="app-page__sticky"
      :class="{ 'is-stuck': isStuck }"
    >
      <AppSubnav
        v-if="showSections && resolvedSections.length > 1"
        :items="resolvedSections"
        :active="resolvedActiveSection"
        :variant="sectionsVariant"
        :aria-label="`Sections ${destinationLabel || title}`"
        @update:active="$emit('update:activeSection', $event)"
      />

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
import { computed, nextTick, onMounted, onUnmounted, ref, useSlots, watch } from 'vue';
import AppSubnav, { type SubnavItem } from './AppSubnav.vue';
import { providePageSearch, type PageSearch } from '@/composables/usePageSearch';
import { usePageSections } from '@/composables/usePageSections';
import { providePageTitle } from '@/composables/usePageTitle';
import { useShellMode } from '@/composables/useShellMode';
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
/* La cible du teleport appartient a la barre du haut, montee avant la page : elle est
   donc la des le premier rendu. On la verifie quand meme, pour qu'un AppPage monte hors
   du shell (tests isoles, tiroirs) retombe simplement sur sa rangee collante. */
const toolsAnchor = ref(false);
const syncToolsAnchor = () => { toolsAnchor.value = Boolean(document.getElementById('app-page-tools')); };
const toolsInBar = computed(() => mode.value === 'expanded' && toolsAnchor.value);
const { sections: derivedSections, activeKey, destinationLabel } = usePageSections();
const showSections = computed(() => mode.value !== 'expanded');
const showStickyRow = computed(
  () => (showSections.value && resolvedSections.value.length > 1) || (hasTools.value && !toolsInBar.value)
);
const resolvedSections = computed<SubnavItem[]>(() =>
  props.sections.length ? props.sections : derivedSections.value
);
const resolvedActiveSection = computed(() =>
  props.sections.length ? props.activeSection : activeKey.value
);

const stickySentinel = ref<HTMLElement | null>(null);
const isStuck = ref(false);
let stickyObserver: IntersectionObserver | null = null;

watch(mode, () => nextTick(syncToolsAnchor));
onMounted(() => {
  syncToolsAnchor();
  if (typeof IntersectionObserver === 'undefined' || !stickySentinel.value) return;
  stickyObserver = new IntersectionObserver(([entry]) => {
    isStuck.value = !entry.isIntersecting;
  });
  stickyObserver.observe(stickySentinel.value);
});
onUnmounted(() => stickyObserver?.disconnect());
</script>

<style scoped lang="scss">
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
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-2) 0;
  background: var(--bg);
}
/* La rangee de sections prend la place disponible, les outils juste la leur : a
   parts egales, les onglets se faisaient tronquer par un bouton qui n'en demandait
   pas tant. En dessous de 320px de reste, chacun reprend sa propre ligne. */
.app-page__sticky > .app-subnav { flex: 1 1 320px; min-width: 0; }
.app-page__sticky > .app-page__tools { flex: 0 1 auto; min-width: 0; }
.app-page__sentinel { display: block; width: 1px; height: 1px; margin-bottom: -1px; pointer-events: none; }
/* L'ombre n'apparait qu'une fois decolle : au repos, elle soulignerait une barre qui
   ne flotte pas encore au-dessus de quoi que ce soit. */
.app-page__sticky.is-stuck { box-shadow: 0 10px 24px -18px rgba(0, 0, 0, .9); }

.app-page__tools {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  min-width: 0;
}

.app-page__tool-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
  flex-wrap: wrap;
}
/* Sans recherche, les actions occupent toute la rangee et se rangent a gauche. */
.app-page__tools:not(:has(.ui-search-field)) .app-page__tool-actions { margin-left: 0; }
</style>
