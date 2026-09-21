<template>
  <nav class="app-dock" aria-label="Navigation principale">
    <ul>
      <li v-for="destination in dockDestinations" :key="destination.key">
        <!-- La destination deja active n'a plus de navigation a offrir : la retoucher
             ouvre donc ses sections, qui n'ont plus de rangee a elles en compact. Un
             lien vers la page ou l'on est deja n'aurait rien fait de ce geste. -->
        <button
          v-if="destination.key === activeKey && hasSections"
          type="button"
          class="app-nav-link app-dock__link"
          aria-current="page"
          :aria-expanded="sectionsOpen"
          aria-haspopup="dialog"
          @click="$emit('open-sections')"
        >
          <!-- Sans ce repere, rien ne distingue une destination qui cache des sections
               d'une autre : le geste resterait a deviner. Le chevron se retourne une
               fois la feuille ouverte, la meme entree servant a la refermer. -->
          <i class="app-dock__caret" :class="{ 'is-open': sectionsOpen }" aria-hidden="true" />
          <component :is="destination.icon" aria-hidden="true" />
          <span>{{ labelFor(destination) }}</span>
        </button>
        <RouterLink
          v-else
          class="app-nav-link app-dock__link"
          :to="destination.to"
          :aria-current="destination.key === activeKey ? 'page' : undefined"
        >
          <component :is="destination.icon" aria-hidden="true" />
          <span>{{ labelFor(destination) }}</span>
        </RouterLink>
      </li>
      <li>
        <button
          type="button"
          class="app-nav-link app-dock__link"
          :class="{ 'is-elsewhere': activeIsOutsideDock }"
          :aria-expanded="sheetOpen"
          aria-haspopup="dialog"
          @click="$emit('open-sheet')"
        >
          <Menu aria-hidden="true" />
          <span>Plus</span>
          <!-- Sans ce repère, une destination ouverte depuis la feuille n'apparaît
               nulle part dans le dock : l'utilisateur perd l'indication d'où il est. -->
          <i v-if="activeIsOutsideDock" class="app-dock__dot" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Menu } from '@lucide/vue';
import { dockDestinationsFor, type NavDestination } from '@/navigation';
import type { SubnavItem } from '@/components/ui/AppSubnav.vue';

const props = withDefaults(
  defineProps<{
    activeKey?: string;
    sheetOpen?: boolean;
    isAdmin?: boolean;
    canModerate?: boolean;
    /** Sections de la destination active ; le dock les porte depuis qu'elles n'ont plus de rangee. */
    sections?: SubnavItem[];
    activeSectionKey?: string;
    sectionsOpen?: boolean;
  }>(),
  {
    activeKey: '', sheetOpen: false, isAdmin: false, canModerate: false,
    sections: () => [], activeSectionKey: '', sectionsOpen: false,
  }
);

defineEmits<{ (e: 'open-sheet'): void; (e: 'open-sections'): void }>();

/** Une section unique n'est pas un choix : la destination se comporte alors en simple lien. */
const hasSections = computed(() => props.sections.length > 1);

/**
 * Libelle de l'entree active : la section courante plutot que la destination.
 *
 * Sauf sur la premiere section, qui est la page d'arrivee de la destination : y
 * afficher son nom donnait deux entrees « Accueil » cote a cote dans le dock, l'une
 * pour le Tableau de bord, l'autre pour l'accueil d'Explorer.
 */
function labelFor(destination: NavDestination): string {
  if (destination.key !== props.activeKey || !hasSections.value) return destination.label;
  const index = props.sections.findIndex((section) => section.key === props.activeSectionKey);
  return index > 0 ? props.sections[index].label : destination.label;
}

const dockDestinations = computed<NavDestination[]>(
  () => dockDestinationsFor(props.isAdmin, props.canModerate)
);

const activeIsOutsideDock = computed(
  () => Boolean(props.activeKey) && !dockDestinations.value.some((item) => item.key === props.activeKey)
);
</script>

<style scoped lang="scss">
.app-dock {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  height: calc(var(--app-dock-h) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  padding-left: var(--safe-left);
  padding-right: var(--safe-right);
  border-top: 1px solid var(--border);
  /* Opaque plutot que floute, comme la barre du haut : a 96% le flou n'ajoutait rien
     de visible, mais Safari iOS composait la barre dans sa propre couche et son halo
     debordait sur le contenu juste au-dessus. */
  background: var(--surface-sunken);
  overscroll-behavior: none;
  touch-action: manipulation;
}

.app-dock ul {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  height: var(--app-dock-h);
  margin: 0;
  padding: 0;
  list-style: none;
}

.app-dock__link {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
  height: 100%;
  min-height: var(--touch-target);
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-xs);
  text-decoration: none;
  cursor: pointer;
}
.app-dock__link svg { width: 21px; height: 21px; }
.app-dock__link span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-dock__link[aria-current='page'],
.app-dock__link.is-elsewhere { color: var(--accent); }

.app-dock__dot {
  position: absolute;
  top: 8px;
  right: calc(50% - 15px);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.app-dock__caret {
  position: absolute;
  transition: transform var(--motion-duration-fast, .15s) ease;
  top: 5px;
  right: calc(50% - 16px);
  width: 0;
  height: 0;
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
  border-top: 4px solid currentcolor;
}
.app-dock__caret.is-open { transform: rotate(180deg); }

/* Le dock s'efface pendant la saisie.
   On ne navigue pas en tapant, et il n'a rien a gagner a monter avec le clavier : seule
   la barre de recherche a une raison d'y rester collee. Le laisser la faisait flotter au
   milieu de l'ecran, entre la barre et le clavier, au-dessus d'un contenu qui continuait
   sous lui -- une rangee de navigation posee en plein texte.

   Le signal est le FOCUS du champ, pas la geometrie du viewport. `--keyboard-inset` ne
   vaut quelque chose qu'en onglet Safari, ou le clavier recouvre une page dont la
   hauteur ne bouge pas. Dans une PWA installee, iOS retrecit aussi le layout viewport :
   `window.innerHeight` diminue en meme temps que `visualViewport.height`, la difference
   retombe a zero, et aucune detection fondee sur cet ecart ne peut aboutir. Le focus,
   lui, dit la meme chose dans les deux cas.

   La cible est la zone de saisie, pas la barre entiere : celle-ci porte aussi le bouton
   « Filtres », qui prend le focus a l'appui sans jamais lever de clavier. */
:root:has(.app-topbar .ui-search-field__input:focus) .app-dock {
  opacity: 0;
  transform: translateY(100%);
  pointer-events: none;
}
.app-dock { transition: opacity .18s ease, transform .18s ease; }

/* Paysage sur téléphone : la hauteur manque, les libellés passent à côté de l'icône. */
@media (max-height: 500px) and (orientation: landscape) {
  .app-dock__link { flex-direction: row; gap: var(--space-2); }
}
</style>
