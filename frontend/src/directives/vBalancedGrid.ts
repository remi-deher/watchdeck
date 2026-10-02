import type { Directive, DirectiveBinding } from 'vue';

/**
 * `v-balanced-grid` : une grille dont les rangees tombent juste.
 *
 * `repeat(auto-fill, minmax(...))` remplit chaque rangee au maximum et laisse la derniere
 * se debrouiller : cinq cartes sur quatre colonnes donnaient 4 + 1, une carte seule au
 * quart de la largeur, le reste vide. Ici on part du nombre de colonnes que la largeur
 * permet, puis on le reduit au plus petit qui garde le meme nombre de rangees : cinq
 * cartes donnent 3 + 2, six donnent 3 + 3, et un bloc seul prend toute la ligne.
 *
 * Valeur : `{ min, max }` -- largeur minimale d'une colonne (px, 220 par defaut) et
 * nombre maximal de colonnes. Les enfants masques ne comptent pas.
 */

export interface BalancedGridOptions {
  min?: number;
  max?: number;
}

/** Colonnes equilibrees pour `count` blocs, quand la largeur en permet `fit` au plus. */
export function balancedColumns(count: number, fit: number): number {
  if (count <= 0) return 1;
  const cols = Math.max(1, Math.min(fit, count));
  const rows = Math.ceil(count / cols);
  return Math.ceil(count / rows);
}

interface State { resize: ResizeObserver | null; mutation: MutationObserver | null; options: BalancedGridOptions }
const states = new WeakMap<HTMLElement, State>();

function visibleChildren(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && getComputedStyle(child).display !== 'none'
  );
}

function update(el: HTMLElement): void {
  const state = states.get(el);
  if (!state) return;
  const { min = 220, max = Infinity } = state.options;
  const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
  const width = el.clientWidth;
  // Sans largeur mesurable (element masque, jsdom), on ne touche a rien.
  if (!width) return;
  const fit = Math.min(max, Math.max(1, Math.floor((width + gap) / (min + gap))));
  const children = visibleChildren(el);
  const cols = balancedColumns(children.length, fit);
  el.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  // Quand aucune repartition n'evite un bloc seul (deux colonnes, nombre impair), il
  // prend toute la derniere rangee plutot que d'en laisser la moitie vide.
  const orphan = cols > 1 && children.length % cols === 1 ? children[children.length - 1] : null;
  for (const child of children) child.style.gridColumn = child === orphan ? '1 / -1' : '';
}

function options(binding: DirectiveBinding<BalancedGridOptions | undefined>): BalancedGridOptions {
  return binding.value || {};
}

export const vBalancedGrid: Directive<HTMLElement, BalancedGridOptions | undefined> = {
  mounted(el, binding) {
    const state: State = { resize: null, mutation: null, options: options(binding) };
    states.set(el, state);
    if (typeof ResizeObserver !== 'undefined') {
      state.resize = new ResizeObserver(() => update(el));
      state.resize.observe(el);
    }
    // Des blocs apparaissent et disparaissent (v-if) : la repartition suit.
    if (typeof MutationObserver !== 'undefined') {
      state.mutation = new MutationObserver(() => update(el));
      state.mutation.observe(el, { childList: true });
    }
    update(el);
  },
  updated(el, binding) {
    const state = states.get(el);
    if (state) state.options = options(binding);
    update(el);
  },
  unmounted(el) {
    const state = states.get(el);
    for (const child of visibleChildren(el)) child.style.gridColumn = '';
    state?.resize?.disconnect();
    state?.mutation?.disconnect();
    states.delete(el);
  },
};
