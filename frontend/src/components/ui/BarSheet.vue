<template>
  <ModalShell :open="open" :title="title" panel-class="filter-sheet" :modal="false" @close="$emit('close')">
    <slot />
  </ModalShell>
</template>

<script lang="ts">
const activeSheets = new Set<symbol>();
</script>
<script setup lang="ts">
import { onUnmounted, watch } from 'vue';
import ModalShell from './ModalShell.vue';
import { useChromeAutoHide } from '@/composables/useChromeAutoHide';
const props = defineProps<{ open: boolean; title: string }>();
defineEmits<{ close: [] }>();
/* L'habillage de la barre (coins droits, capsule pleine hauteur) suit cet attribut et
   non la presence de la feuille dans le document : celle-ci peut y trainer le temps
   d'une transition qui ne se termine pas, et la barre restait alors habillee pour un
   panneau qui n'etait plus la. */
const SHEET_FLAG = 'data-filter-sheet';
const token = Symbol('bar-sheet');
function flagSheet(on: boolean): void {
  if (typeof document === 'undefined') return;
  document.body.toggleAttribute(SHEET_FLAG, on);
  // Progression laissee par un geste au doigt (voir `useSheetGesture`) : remise a zero en
  // meme temps que l'habillage, sinon la barre s'ouvrirait deja a moitie arrondie.
  document.body.style.removeProperty('--filter-sheet-progress');
}

/* Le panneau se cale sur le champ de la barre : meme bord gauche, meme largeur, pose
   juste sous son bord bas. Le champ change de place selon la page et l'etat du rail, et
   le panneau vit dans un portail hors de la barre : on mesure donc sa boite et on la
   publie en variables CSS, reprises par la geometrie du panneau (_components.scss). */
const ANCHOR_VARS = ['--filter-anchor-left', '--filter-anchor-width', '--filter-anchor-top', '--filter-anchor-bottom'];
let observer: ResizeObserver | undefined;

function measureAnchor(): void {
  const field = document.querySelector<HTMLElement>('.app-topbar .ui-search-field, .app-topbar__filter-only');
  if (!field) return;
  const box = field.getBoundingClientRect();
  const root = document.documentElement.style;
  root.setProperty('--filter-anchor-left', `${Math.round(box.left)}px`);
  root.setProperty('--filter-anchor-width', `${Math.round(box.width)}px`);
  root.setProperty('--filter-anchor-top', `${Math.round(box.bottom)}px`);
  root.setProperty('--filter-anchor-bottom', `${Math.round(window.innerHeight - box.top)}px`);
}

function trackAnchor(on: boolean): void {
  if (typeof window === 'undefined') return;
  observer?.disconnect();
  observer = undefined;
  window.removeEventListener('resize', measureAnchor);
  window.visualViewport?.removeEventListener('resize', measureAnchor);
  // A la fermeture, les variables restent : l'animation de sortie en a encore besoin.
  // Les retirer ici faisait retomber le panneau sur sa geometrie par defaut, et il
  // partait sur le cote au lieu de rentrer dans la barre. Elles sont remesurees a
  // chaque ouverture, et retirees au demontage.
  if (!on) return;
  measureAnchor();
  window.addEventListener('resize', measureAnchor);
  window.visualViewport?.addEventListener('resize', measureAnchor);
  const bar = document.querySelector('.app-topbar');
  if (bar && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measureAnchor);
    observer.observe(bar);
  }
}

/* La feuille n'est pas modale : la page defile derriere elle. Sans verrou, ce defilement
   masquait la barre -- et avec elle le panneau qui en sort -- pendant qu'on filtrait. */
const { setHold } = useChromeAutoHide();
/* L'habillage de la barre (coins droits au raccord) suit le panneau dans les deux sens :
   pose des l'ouverture, retire des le debut de la fermeture. Ce ne sont pas des bascules :
   les coins, le contour et l'ombre passent d'une forme a l'autre en transition, a la duree
   du panneau (220ms en sortie de barre, 160ms au retour, voir `surface-sortie-barre-*`) --
   la capsule se redresse pendant que le panneau sort, et se rarrondit pendant qu'il rentre,
   au lieu de changer de forme d'un coup avant ou apres lui. */
watch(
  () => props.open,
  (posee) => {
    if (posee) activeSheets.add(token);
    else activeSheets.delete(token);
    flagSheet(activeSheets.size > 0);
    setHold('filter-sheet', activeSheets.size > 0);
    trackAnchor(posee);
  },
  { immediate: true }
);

onUnmounted(() => {
  activeSheets.delete(token);
  flagSheet(activeSheets.size > 0);
  setHold('filter-sheet', activeSheets.size > 0);
  trackAnchor(false);
  if (!activeSheets.size) ANCHOR_VARS.forEach((name) => document.documentElement.style.removeProperty(name));
});
</script>
