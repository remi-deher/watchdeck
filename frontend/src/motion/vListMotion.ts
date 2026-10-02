import autoAnimate, { type AnimationController } from '@formkit/auto-animate';
import type { Directive } from 'vue';
import { courbe } from './tokens';

/**
 * `v-list-motion` : les elements d'une liste glissent vers leur nouvelle place.
 *
 * Filtrer ou trier remplacait la liste d'un coup : l'oeil perdait ce qui etait reste,
 * ce qui etait parti, ce qui venait d'arriver. Chaque element garde ici sa continuite --
 * ceux qui restent glissent, les nouveaux apparaissent, les partants s'effacent. Seules
 * la position et l'opacite sont animees, que le navigateur compose sans refaire la mise
 * en page.
 *
 * Reserve aux listes courtes : au-dela de `MAX_ENFANTS`, animer chaque element couterait
 * plus qu'il n'apporte sur un telephone, et la liste change simplement d'un coup. Le
 * reglage « reduire les animations » du systeme est respecte par la bibliotheque.
 */

const MAX_ENFANTS = 60;
const controleurs = new WeakMap<HTMLElement, AnimationController>();

function ajuster(el: HTMLElement): void {
  const c = controleurs.get(el);
  if (!c) return;
  if (el.childElementCount > MAX_ENFANTS) c.disable();
  else c.enable();
}

export const vListMotion: Directive<HTMLElement, boolean | undefined> = {
  mounted(el, binding) {
    if (binding.value === false) return;
    controleurs.set(el, autoAnimate(el, { duration: 280, easing: `cubic-bezier(${courbe.entree.join(',')})` }));
    ajuster(el);
  },
  // Le compte est verifie AVANT que Vue ne touche au DOM : c'est ce changement-la que
  // la bibliotheque animera, ou non.
  beforeUpdate(el) { ajuster(el); },
  updated(el) { ajuster(el); },
  unmounted(el) {
    controleurs.get(el)?.destroy?.();
    controleurs.delete(el);
  },
};
