import { ref } from 'vue';
import type { Router } from 'vue-router';

/**
 * Vrai pendant une navigation que le navigateur a deja animee lui-meme.
 *
 * Sur iPhone, le geste de bord (glisser depuis la gauche) fait glisser l'ecran vers la page
 * precedente AVANT que l'application ne recoive le retour. La fiche jouait ensuite sa
 * propre sortie vers le bas, puis la page de fond son fondu : deux mouvements de plus,
 * vus comme une fiche qui reapparait avant de repartir. Safari le signale par
 * `hasUAVisualTransition` sur l'evenement `popstate` ; tant que ce drapeau est leve, les
 * animations de sortie de l'application sont sautees.
 */
export const retourNatif = ref(false);

export function installerRetourNatif(router: Router): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('popstate', (event) => {
    retourNatif.value = Boolean((event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition);
  }, { capture: true }); // avant le routeur : voir `installerRetourDesSurfaces`
  // Relache apres la navigation, une fois les sorties decidees (deux images plus tard).
  router.afterEach(() => {
    if (!retourNatif.value) return;
    const relacher = () => { retourNatif.value = false; };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(relacher));
    else setTimeout(relacher, 32);
  });
}
