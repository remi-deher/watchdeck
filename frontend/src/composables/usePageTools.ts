import { onUnmounted, ref, shallowRef, watchEffect, type Slot } from 'vue';

/**
 * Outils de la page courante (etat d'un service, pause, actions), rendus par la barre du
 * haut dans la capsule de recherche, a gauche du bouton « Filtres ».
 *
 * Meme principe que la recherche (usePageSearch) : la page possede ses outils -- leur
 * etat, leurs actions --, la barre ne fait que les afficher. Ils ne prennent ainsi plus
 * une rangee a part sous la barre, et la rangee d'onglets reste seule, centree sur la page.
 */
const current = shallowRef<Slot | null>(null);
/* La barre du haut est montee : sans elle (tests isoles, fenetres), la page garde ses
   outils dans sa propre rangee. */
const hostReady = ref(false);
let owner: symbol | null = null;

export function providePageTools(tools: () => Slot | null): void {
  const token = Symbol('page-tools');
  watchEffect(() => {
    owner = token;
    current.value = tools();
  });
  // Vue monte la page suivante avant de demonter la precedente : seule la page qui
  // possede encore les outils les retire.
  onUnmounted(() => {
    if (owner !== token) return;
    owner = null;
    current.value = null;
  });
}

export function usePageTools() {
  return { tools: current, hostReady };
}

/** Appele par la barre du haut a son montage et a son demontage. */
export function setPageToolsHost(ready: boolean): void {
  hostReady.value = ready;
}
