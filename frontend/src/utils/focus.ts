/** Cibles de saisie : ce qui doit garder le focus quand l'application le déplace. */

const TYPING_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

/**
 * Vrai si l'élément est en train de recevoir une saisie.
 *
 * Le shell déplace le focus vers le contenu à chaque changement d'URL, pour que les
 * lecteurs d'écran annoncent la page atteinte. Mais une page peut changer d'URL sans
 * qu'on ait navigué : la première lettre tapée dans Découvrir fait passer `/discover` à
 * `/discover/explore`, et le déplacement arrachait alors le champ sous le doigt.
 */
export function isTypingTarget(element: Element | null | undefined): boolean {
  return Boolean(element && 'matches' in element && element.matches(TYPING_SELECTOR));
}
