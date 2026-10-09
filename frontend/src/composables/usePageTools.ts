import { computed, onUnmounted, ref, watchEffect, type Slot } from 'vue';

/**
 * Outils de la page courante (etat d'un service, pause, periode, vue), rendus par la barre
 * du haut dans la capsule de recherche, a gauche du bouton « Filtres ».
 *
 * Meme principe que la recherche (usePageSearch) : la page possede ses outils -- leur
 * etat, leurs actions --, la barre ne fait que les afficher. Ils ne prennent ainsi plus
 * une rangee a part sous la barre, et la rangee d'onglets reste seule, centree sur la page.
 * Plusieurs fournisseurs coexistent (la page et son gabarit) : leurs outils se suivent
 * dans l'ordre de montage.
 */
/* La carte elle-meme n'est pas reactive (les fournisseurs l'ecrivent depuis leurs
   effets, qui ne doivent pas en dependre) : `version` signale ses changements. */
const entries = new Map<symbol, Slot>();
const version = ref(0);
const current = computed<Slot | null>(() => {
  void version.value;
  const slots = [...entries.values()];
  return slots.length ? () => slots.flatMap((slot) => slot()) : null;
});
/* La barre du haut est montee : sans elle (tests isoles, fenetres), la page garde ses
   outils dans sa propre rangee. */
const hostReady = ref(false);

function set(token: symbol, slot: Slot | null): void {
  if ((entries.get(token) ?? null) === slot) return;
  if (slot) entries.set(token, slot);
  else entries.delete(token);
  version.value++;
}

export function providePageTools(tools: () => Slot | null): void {
  const token = Symbol('page-tools');
  watchEffect(() => set(token, tools()));
  // Vue monte la page suivante avant de demonter la precedente : chaque fournisseur ne
  // retire que ses propres outils.
  onUnmounted(() => set(token, null));
}

export function usePageTools() {
  return { tools: current, hostReady };
}

/** Appele par la barre du haut a son montage et a son demontage. */
export function setPageToolsHost(ready: boolean): void {
  hostReady.value = ready;
}
