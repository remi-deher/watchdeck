/**
 * Langage de mouvement de Watchdeck, cote script.
 *
 * Memes valeurs que les variables `--motion-*` de `_motion.scss`, ou vit l'essentiel du
 * mouvement : l'interface anime en CSS, sur `transform` et `opacity`, que le navigateur
 * confie au GPU. Les ressorts pilotes en script ont ete retires -- ils saccadaient sur
 * iPhone des que le fil principal travaillait.
 */

/** Courbes de Bezier. */
export const courbe = {
  /** Deceleration franche : ce qui arrive. */
  entree: [0.16, 1, 0.3, 1],
  /** Acceleration : ce qui part. */
  sortie: [0.4, 0, 1, 1],
  /** Aller-retour d'un etat a l'autre. */
  standard: [0.2, 0.8, 0.2, 1],
} as const;
