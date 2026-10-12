/* Recherche dans les réglages : la barre du haut retranche les sections de la page affichée
 * (ConfigureTemplate, par `query`) et l'index (`settingsSearchIndex`) dit où trouver ce qui
 * correspond ailleurs. Ces deux fonctions font la comparaison, sans accents ni casse. */

export function normalizeSearchText(value: string): string {
  // Sans repli des accents, « Bibliotheque » ne trouverait pas « Bibliothèque » — et
  // personne ne tape les accents dans un champ de recherche.
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function matchesQuery(haystack: string, query: string): boolean {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  const text = normalizeSearchText(haystack);
  // Tous les mots doivent apparaître, dans n'importe quel ordre : « plex token » trouve
  // aussi bien « Token Plex » que « Plex : jeton d'accès ».
  return needle.split(/\s+/).every((word) => text.includes(word));
}
