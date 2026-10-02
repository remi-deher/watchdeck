/* Classement des destinations de la palette de commandes.
 *
 * Volontairement simple : la palette compte quelques dizaines d'entrées, pas des
 * milliers, et l'utilisateur tape le début d'un nom qu'il connaît. Une entrée est
 * retenue si la saisie apparaît dans son libellé ou son groupe ; plus elle apparaît
 * tôt, plus l'entrée remonte. À position égale, l'ordre d'origine est conservé (tri
 * stable), ce qui garde les pages avant leurs sections et leurs réglages.
 */

export interface Rankable {
  label: string;
  group: string;
}

/** Insensible a la casse et aux accents : « parametres » doit trouver « Paramètres ». */
export function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr');
}

/** Position de la saisie dans « libellé groupe », ou -1 si elle n'y figure pas. */
export function commandScore(item: Rankable, query: string): number {
  const needle = fold(query.trim());
  if (!needle) return 0;
  return fold(`${item.label} ${item.group}`).indexOf(needle);
}

/** Entrées correspondant à la saisie, les correspondances les plus précoces d'abord. */
export function rankCommands<T extends Rankable>(items: readonly T[], query: string): T[] {
  if (!query.trim()) return [...items];
  return items
    .map((item) => ({ item, at: commandScore(item, query) }))
    .filter((entry) => entry.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.item);
}
