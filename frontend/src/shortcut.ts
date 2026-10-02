/**
 * Libellé du raccourci de la palette de commandes.
 *
 * Le rail, la barre de contexte et la feuille de navigation l'affichent tous : le
 * garder ici évite trois copies de la même détection de plateforme, dont deux
 * finiraient par diverger.
 */
export const shortcutLabel =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
