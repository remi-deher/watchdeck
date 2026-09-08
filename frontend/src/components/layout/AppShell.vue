<template>
  <a href="#main-content" class="skip-link">Aller au contenu principal</a>

  <div class="app-shell" :data-mode="mode" :data-rail="railState">
    <!-- Une seule navigation primaire est montée à la fois. En rendre deux et en
         masquer une dupliquerait l'état, les repères ARIA et l'ordre de tabulation. -->
    <AppRail
      v-if="mode !== 'compact'"
      :density="railDensity"
      :active-key="activeDestinationKey"
      :is-admin="isAdmin"
      :can-moderate="canModerate"
      @open-palette="openPalette"
    />

    <AppTopBar
      :mode="mode"
      :page-title="pageTitle"
      :destination-label="destinationLabel"
      :collapsed="collapsed"
      :sheet-open="sheetOpen"
      @open-sheet="openSheet"
      @toggle-rail="collapsed = !collapsed"
      @open-palette="openPalette($event)"
    />

    <main id="main-content" class="app-shell__main" tabindex="-1">
      <slot />
    </main>

    <AppDock
      v-if="mode === 'compact'"
      :active-key="activeDestinationKey"
      :sheet-open="sheetOpen"
      :is-admin="isAdmin"
      :can-moderate="canModerate"
      @open-sheet="openSheet"
    />

    <AppNavSheet
      v-if="sheetOpen"
      :active-key="activeDestinationKey"
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
import { useRoute } from 'vue-router';
import AppDock from './AppDock.vue';
import AppNavSheet from './AppNavSheet.vue';
import AppRail from './AppRail.vue';
import AppTopBar from './AppTopBar.vue';
import CommandPalette from './CommandPalette.vue';
import { useRailCollapsed } from '@/composables/useRailCollapsed';
import { useShellMode } from '@/composables/useShellMode';
import { destinationForPath } from '@/navigation';

const props = withDefaults(defineProps<{ isAdmin?: boolean; canModerate?: boolean }>(), {
  isAdmin: false,
  canModerate: false,
});

const route = useRoute();
const mode = useShellMode();
const collapsed = useRailCollapsed();
const sheetOpen = ref(false);
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
const pageTitle = computed(() =>
  typeof route.meta?.title === 'string' && route.meta.title ? route.meta.title : destinationLabel.value || 'Watchdeck'
);

/* La feuille se ferme elle-meme au clic sur une destination ; elle n'est donc pas
   fermee ici sur changement de route. Le faire la refermait pendant que le routeur
   finissait de resoudre la page (`/` puis `/dashboard`, composant asynchrone), une
   demi-seconde apres que l'utilisateur l'ait ouverte -- et elle est de toute facon
   modale : aucune navigation ne peut partir de l'arriere-plan pendant ce temps. */
function openSheet(): void {
  sheetOpen.value = true;
}

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
    document.getElementById('main-content')?.focus({ preventScroll: true });
    const title = typeof route.meta.title === 'string' ? route.meta.title : '';
    routeAnnouncement.value = title ? `Page ${title} chargée` : 'Page chargée';
  }
);
</script>
