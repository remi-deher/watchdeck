<template>
  <a href="#main-content" class="skip-link">Aller au contenu principal</a>

  <div class="app-shell" :data-mode="mode" :data-rail="railState">
    <!-- Une seule navigation primaire est montée à la fois. En rendre deux et en
         masquer une dupliquerait l'état, les repères ARIA et l'ordre de tabulation. -->
    <AppRail
      v-if="mode !== 'compact'"
      :density="railDensity"
      :active-key="activeDestinationKey"
      :page-title="pageTitle"
      :is-admin="isAdmin"
      :can-moderate="canModerate"
      :collapsible="mode === 'expanded'"
      :collapsed="collapsed"
      @open-palette="openPalette"
      @toggle-rail="collapsed = !collapsed"
    />

    <!-- La barre du haut ne porte plus la navigation : en compact, « Plus » du dock
         ouvre la meme feuille, et la barre est entierement rendue a la recherche. -->
    <AppTopBar
      :mode="mode"
      :page-title="pageTitle"
      :destination-label="destinationLabel"
      @open-palette="openPalette($event)"
    />

    <main id="main-content" class="app-shell__main" tabindex="-1">
      <OfflineBanner />
      <slot />
    </main>

    <AppDock
      v-if="mode === 'compact'"
      :active-key="activeDestinationKey"
      :sheet-open="sheetOpen"
      :sections="sections"
      :active-section-key="activeSectionKey"
      :sections-open="sectionsOpen"
      :is-admin="isAdmin"
      :can-moderate="canModerate"
      @open-sheet="openSheet"
      @open-sections="sectionsOpen = !sectionsOpen"
    />

    <AppSectionSheet
      v-if="sectionsOpen"
      :sections="sections"
      :active-key="activeSectionKey"
      :destination-label="destinationLabel"
      @close="sectionsOpen = false"
    />

    <AppNavSheet
      v-if="sheetOpen"
      :active-key="activeDestinationKey"
      :sections="sectionsInSheet"
      :active-section-key="activeSectionKey"
      :destination-label="destinationLabel"
      :is-admin="isAdmin"
      :can-moderate="canModerate"
      @close="sheetOpen = false"
      @open-palette="openPaletteFromSheet"
    />

    <CommandPalette ref="palette" :is-admin="isAdmin" :can-moderate="canModerate" />

    <div id="route-announcer" class="sr-only" role="status" aria-live="polite">{{ routeAnnouncement }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { START_LOCATION, useRoute } from 'vue-router';
import AppDock from './AppDock.vue';
import AppNavSheet from './AppNavSheet.vue';
import AppSectionSheet from './AppSectionSheet.vue';
import AppRail from './AppRail.vue';
import AppTopBar from './AppTopBar.vue';
import CommandPalette from './CommandPalette.vue';
import { useRailCollapsed } from '@/composables/useRailCollapsed';
import { isTypingTarget } from '@/utils/focus';
import { usePageSections } from '@/composables/usePageSections';
import { usePageTitle } from '@/composables/usePageTitle';
import OfflineBanner from './OfflineBanner.vue';
import { useShellMode } from '@/composables/useShellMode';
import { destinationForPath, dockDestinationsFor } from '@/navigation';

const props = withDefaults(defineProps<{ isAdmin?: boolean; canModerate?: boolean }>(), {
  isAdmin: false,
  canModerate: false,
});

const route = useRoute();
const mode = useShellMode();
const collapsed = useRailCollapsed();
const sheetOpen = ref(false);
const sectionsOpen = ref(false);
const palette = ref<{ open: (prefill?: string) => void } | null>(null);

/* Le repli n'a de sens qu'en mode déployé : plus bas, le rail est déjà à sa largeur
   minimale et l'attribut ne doit pas y modifier `--app-rail-w`. */
const railState = computed(() => (mode.value === 'expanded' && collapsed.value ? 'collapsed' : 'expanded'));

/* La largeur et le contenu du rail doivent décider ensemble : replier la colonne sans
   repasser en icônes ferait déborder les libellés hors des 72px. */
const railDensity = computed<'medium' | 'expanded'>(() =>
  mode.value === 'expanded' && railState.value === 'expanded' ? 'expanded' : 'medium'
);

const destination = computed(() => destinationForPath(route.path, props.isAdmin, props.canModerate));
const activeDestinationKey = computed(() => destination.value?.key || '');
const destinationLabel = computed(() => destination.value?.label || '');
/* Meme derivation que la page : en compact la rangee de sections disparait et c'est le
   dock qui les porte, mais la source reste `navigation.ts` et non une copie locale. */
const { sections, activeKey: activeSectionKey } = usePageSections();

/* Le dock ne porte que quatre destinations : pour toutes les autres -- Activite,
   Acquisition, les pages d'administration -- il n'existe aucune entree active a
   retoucher, et leurs sections n'auraient plus aucune porte depuis que la rangee a
   disparu. Elles rejoignent alors la feuille, qui est justement le chemin par lequel on
   atteint ces destinations. */
const sectionsInSheet = computed(() =>
  dockDestinationsFor(props.isAdmin, props.canModerate).some((item) => item.key === activeDestinationKey.value)
    ? []
    : sections.value
);
const providedTitle = usePageTitle();
const pageTitle = computed(() =>
  providedTitle.value || (typeof route.meta?.title === 'string' && route.meta.title ? route.meta.title : destinationLabel.value || 'Watchdeck')
);

let initialNavigationSeen = false;

function openSheet(): void {
  sectionsOpen.value = false;
  sheetOpen.value = true;
}

/* C'est la route qui referme les deux feuilles, et non le clic sur l'une de leurs
   entrees : la feuille reste en place jusqu'a l'arrivee de la page demandee. On suit `fullPath` parce que plusieurs sections ne different que par leur query
   (`?view=`). */
watch(() => route.fullPath, (_next, previous) => {
  /* Sauf la toute premiere resolution : le shell et son dock s'affichent pendant que la
     page d'arrivee se charge encore, la route etant alors au point de depart du routeur.
     Une feuille ouverte a ce moment-la se refermait des que cette navigation initiale
     aboutissait, sans que l'utilisateur ait navigue -- sur une connexion ou une machine
     lente, le menu « Plus » se refermait tout seul. */
  if (previous === START_LOCATION.fullPath && route.matched.length && !initialNavigationSeen) {
    initialNavigationSeen = true;
    return;
  }
  initialNavigationSeen = true;
  sectionsOpen.value = false;
  sheetOpen.value = false;
});

function openPalette(prefill?: string): void {
  palette.value?.open(prefill);
}

/* Ouvrir la palette depuis la feuille exige de fermer celle-ci d'abord : les deux sont
   des dialogues modaux, et deux pièges à focus superposés se disputeraient le focus. */
function openPaletteFromSheet(): void {
  sheetOpen.value = false;
  nextTick(() => openPalette());
}

const routeAnnouncement = ref('');
let isFirstNavigation = true;

/* On suit `path`, pas `fullPath` : un changement de query n'est pas un changement de
   page. Beaucoup de sous-sections passent par `?view=` ou `?tab=`, et deplacer le focus
   vers <main> a chaque fois arrachait le focus a la rangee d'onglets que l'utilisateur
   etait en train de parcourir aux fleches. */
watch(
  () => route.path,
  async () => {
    // La premiere "navigation" est le chargement initial de la page : le focus y est
    // deja au bon endroit et il n'y a rien a annoncer.
    if (isFirstNavigation) {
      isFirstNavigation = false;
      return;
    }
    await nextTick();
    /* Sauf si l'utilisateur est en train d'ecrire. Une page peut changer d'URL sans
       qu'il ait navigue : la premiere lettre tapee dans Decouvrir fait passer
       /discover a /discover/explore, et deplacer le focus lui arrachait le champ des
       la premiere frappe. L'annonce, elle, reste due. */
    if (!isTypingTarget(document.activeElement)) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }
    const title = typeof route.meta.title === 'string' ? route.meta.title : '';
    routeAnnouncement.value = title ? `Page ${title} chargée` : 'Page chargée';
  }
);
</script>
