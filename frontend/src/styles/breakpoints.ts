/**
 * Seuils du shell, côté JavaScript.
 *
 * Le shell ne peut pas se contenter du CSS : il monte un composant différent selon la
 * largeur (dock bas, rail compact, rail déployé), ce qu'aucune media query ne sait
 * faire. Ces constantes sont donc la contrepartie exacte de `shell-medium` et
 * `shell-expanded` dans `foundations/_breakpoints.scss`, et `breakpoints.spec.ts`
 * vérifie que les deux fichiers ne divergent pas.
 */
export const SHELL_MEDIUM = 768;
export const SHELL_EXPANDED = 1200;

/** Media query « au moins un rail » : le dock bas s'arrête ici. */
export const SHELL_MEDIUM_QUERY = `(min-width: ${SHELL_MEDIUM}px)`;
/** Media query « rail déployé » : labels et groupes visibles. */
export const SHELL_EXPANDED_QUERY = `(min-width: ${SHELL_EXPANDED}px)`;

/** Les trois expressions du shell, du plus contraint au plus large. */
export type ShellMode = 'compact' | 'medium' | 'expanded';

/** Mode correspondant à une largeur de viewport. */
export function shellModeForWidth(width: number): ShellMode {
  if (width >= SHELL_EXPANDED) return 'expanded';
  if (width >= SHELL_MEDIUM) return 'medium';
  return 'compact';
}
