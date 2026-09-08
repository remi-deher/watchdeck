import { ref, watch } from 'vue';

const STORAGE_KEY = 'watchdeck.rail.collapsed';

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Navigation privée ou stockage refusé : le rail s'ouvre, ce qui reste utilisable.
    return false;
  }
}

const collapsed = ref(typeof window === 'undefined' ? false : readStored());

watch(collapsed, (value) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* Le repli reste alors valable pour la session en cours seulement. */
  }
});

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
