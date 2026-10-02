import { usePreference } from './usePreference';

const STORAGE_KEY = 'watchdeck.rail.collapsed';

const collapsed = usePreference('rail.collapsed', false, { legacyKeys: [STORAGE_KEY] });

/**
 * Repli du rail, partagé et persistant.
 *
 * Un singleton plutôt qu'un état local : le rail est monté une seule fois, mais la
 * barre de contexte porte aussi le bouton de repli, et les deux doivent lire la même
 * valeur sans la faire transiter par des props sur toute la hauteur du shell.
 */
export function useRailCollapsed() {
  return collapsed;
}
