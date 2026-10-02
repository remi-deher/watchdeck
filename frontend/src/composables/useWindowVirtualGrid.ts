import { computed, nextTick, ref, shallowRef, watch, type Ref } from 'vue';
import { useEventListener, useResizeObserver } from '@vueuse/core';

/**
 * Virtualisation d'une grille CSS qui defile avec la fenetre.
 *
 * Dans Watchdeck c'est la page qui defile, pas un conteneur : `useVirtualList` de VueUse
 * et le `VirtualScroller` de PrimeVue supposent l'inverse. On virtualise donc des LIGNES
 * de la grille existante, sans toucher a sa mise en page : le nombre de colonnes est lu
 * sur la grille rendue (`grid-template-columns`), le pas vertical sur la premiere carte,
 * et deux intercalaires occupent la hauteur des lignes non rendues.
 *
 * Mesure (1 000 / 2 000 affiches, Chromium, defilement continu) : sans virtualisation,
 * 41 / 72 ms par image, plancher de la mise en page de 17 000 / 33 000 noeuds.
 *
 * Sous `threshold` elements, rien n'est virtualise : les petites listes gardent leur
 * rendu exact (et les tests qui les couvrent). Les cartes deja rendues une fois ne
 * rejouent pas leur apparition lorsqu'elles reviennent (`hasBeenShown`).
 */
export interface WindowVirtualGridOptions {
  /** En dessous, toute la liste est rendue. */
  threshold?: number;
  /** Lignes rendues au-dela de l'ecran, de chaque cote. */
  overscanRows?: number;
}

export function useWindowVirtualGrid<T>(
  grid: Ref<HTMLElement | null>,
  items: Ref<readonly T[]>,
  keyOf: (item: T) => string,
  { threshold = 300, overscanRows = 4 }: WindowVirtualGridOptions = {},
) {
  const columns = ref(1);
  const pitch = ref(0);
  const gap = ref(0);
  /* Distance entre le haut de la grille et le haut de l'ecran, lue sur le DOM a chaque
     image plutot que deduite d'un `scrollY` et d'une position de grille memorises : au
     retour d'une fiche, le routeur restaure le defilement pendant que la page se
     remonte, et ces deux valeurs memorisees etaient perimees -- la grille rendait alors
     ses premieres lignes sous un ecran positionne bien plus bas. */
  const scrolledIntoGrid = ref(0);
  const viewport = ref(typeof window === 'undefined' ? 0 : window.innerHeight);
  function syncScroll(): void {
    const el = grid.value;
    if (el) scrolledIntoGrid.value = -el.getBoundingClientRect().top;
  }

  const active = computed(() => items.value.length > threshold && pitch.value > 0);

  function measure(): void {
    const el = grid.value;
    if (!el || typeof window === 'undefined') return;
    const style = getComputedStyle(el);
    columns.value = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
    gap.value = parseFloat(style.rowGap) || 0;
    // `hasAttribute` et non `dataset.virtualSpacer` : l'attribut est vide, donc « faux »,
    // et l'intercalaire passait pour une carte -- sa hauteur devenait le pas de ligne.
    const cards = [...el.children].filter((child) => !child.hasAttribute('data-virtual-spacer')) as HTMLElement[];
    // Pas mesure au sous-pixel : une affiche 2/3 fait souvent 331,5 px, et un
    // `offsetHeight` arrondi accumulait l'erreur ligne apres ligne dans l'intercalaire
    // -- le contenu glissait de plusieurs dizaines de pixels au recyclage. Deux lignes
    // posees donnent le pas reel, gap compris ; sinon, hauteur de carte + gap.
    const first = cards[0];
    const nextRow = cards[columns.value];
    if (first && nextRow) pitch.value = nextRow.getBoundingClientRect().top - first.getBoundingClientRect().top;
    else if (first) pitch.value = first.getBoundingClientRect().height + gap.value;
    viewport.value = window.innerHeight;
    syncScroll();
  }

  const range = computed(() => {
    const total = items.value.length;
    // Liste deja longue mais cartes pas encore mesurees : n'en poser que `threshold`,
    // de quoi mesurer, plutot que des milliers le temps d'une image.
    if (total > threshold && !pitch.value) return { start: 0, end: threshold };
    if (!active.value) return { start: 0, end: total };
    const rows = Math.ceil(total / columns.value);
    const relative = scrolledIntoGrid.value;
    const firstRow = Math.max(0, Math.floor(relative / pitch.value) - overscanRows);
    const lastRow = Math.min(rows, Math.ceil((relative + viewport.value) / pitch.value) + overscanRows);
    return { start: firstRow * columns.value, end: Math.min(total, Math.max(firstRow + 1, lastRow) * columns.value) };
  });

  const visibleItems = computed(() => items.value.slice(range.value.start, range.value.end));

  /* Hauteur des lignes non rendues. La grille ajoute un `gap` apres chaque intercalaire :
     on le retranche pour que les cartes retombent exactement a leur place. */
  function spacerHeight(rows: number): number {
    return rows > 0 ? rows * pitch.value - gap.value : 0;
  }
  const padTop = computed(() => (active.value ? spacerHeight(range.value.start / columns.value) : 0));
  const padBottom = computed(() => {
    if (!active.value) return 0;
    const remaining = Math.ceil((items.value.length - range.value.end) / columns.value);
    return spacerHeight(remaining);
  });

  /* Une carte recyclee ne doit pas rejouer son apparition : on retient les cles deja
     rendues. `shallowRef` + remplacement du Set suffit, la valeur n'est lue qu'au
     montage de la carte (voir `onRevealEnd` de MediaCardShell). */
  const shown = shallowRef(new Set<string>());
  function hasBeenShown(item: T): boolean {
    return shown.value.has(keyOf(item));
  }
  watch(visibleItems, (list) => {
    void nextTick(() => {
      const next = new Set(shown.value);
      for (const item of list) next.add(keyOf(item));
      shown.value = next;
    });
  }, { immediate: true });

  let frame = 0;
  function onScroll(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      syncScroll();
    });
  }
  if (typeof window !== 'undefined') {
    useEventListener(window, 'scroll', onScroll, { passive: true });
    useEventListener(window, 'resize', measure, { passive: true });
  }
  // Largeur de la grille : nombre de colonnes et hauteur des cartes en dependent.
  useResizeObserver(grid, () => measure());
  // Premier rendu, et tout changement de liste (filtre, page suivante) : re-mesurer une
  // fois les cartes posees, la grille a pu se deplacer (bandeau, compteur).
  watch([grid, () => items.value.length], () => { void nextTick(measure); }, { immediate: true, flush: 'post' });

  return { active, visibleItems, padTop, padBottom, hasBeenShown, measure };
}
