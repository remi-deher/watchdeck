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
/* Deux zones dans la capsule : `tools` (retours d'etat et boutons, a gauche) et `action`
   (le segment de droite, la ou serait « Filtres » : une action propre au contexte). */
export type PageToolsZone = 'tools' | 'action';
const entries = new Map<symbol, { zone: PageToolsZone; slot: Slot }>();
const version = ref(0);
function zoneSlot(zone: PageToolsZone) {
  return computed<Slot | null>(() => {
    void version.value;
    const slots = [...entries.values()].filter((entry) => entry.zone === zone).map((entry) => entry.slot);
    return slots.length ? () => slots.flatMap((slot) => slot()) : null;
  });
}
const current = zoneSlot('tools');
const action = zoneSlot('action');
/* La barre du haut est montee : sans elle (tests isoles, fenetres), la page garde ses
   outils dans sa propre rangee. */
const hostReady = ref(false);

function set(token: symbol, slot: Slot | null, zone: PageToolsZone = 'tools'): void {
  if ((entries.get(token)?.slot ?? null) === slot) return;
  if (slot) entries.set(token, { zone, slot });
  else entries.delete(token);
  version.value++;
}

export function providePageTools(tools: () => Slot | null, zone: PageToolsZone = 'tools'): void {
  const token = Symbol('page-tools');
  watchEffect(() => set(token, tools(), zone));
  // Vue monte la page suivante avant de demonter la precedente : chaque fournisseur ne
  // retire que ses propres outils.
  onUnmounted(() => set(token, null));
}

export function usePageTools() {
  return { tools: current, action, hostReady };
}

/** Appele par la barre du haut a son montage et a son demontage. */
export function setPageToolsHost(ready: boolean): void {
  hostReady.value = ready;
}
