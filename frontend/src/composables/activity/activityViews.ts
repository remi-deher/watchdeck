/* Activité : les vues de la page (titre, invite de recherche, besoin de statistiques) et
   l'identité d'une lecture dans les listes. Données et fonctions pures. */

export const allowedViews=['overview','live','history','quality','users'];
/* Les statistiques ne servent qu'aux trois vues d'analyse : le direct et l'historique ont les leurs. */
export const STATISTICS_VIEWS=['overview','quality','users'];

export const VIEW_TITLES: Record<string, string>={overview:'Vue d’ensemble',live:'Activité en direct',history:'Historique des lectures',quality:'Qualité des flux',users:'Utilisateurs'};
export const SEARCH_PLACEHOLDERS: Record<string, string>={
  overview:'Filtrer par utilisateur',
  live:'Filtrer les lectures en cours',
  history:'Filtrer par média, utilisateur ou appareil',
  quality:'Filtrer par média, utilisateur ou appareil',
  users:'Filtrer par utilisateur',
};

/* Plex reutilise la meme cle de session sur plusieurs lectures successives (cinq lignes
   d'affilee peuvent partager `session_id`) : seule la cle de la ligne en base identifie
   vraiment une lecture. S'en remettre a `session_id` donnait des cles de liste dupliquees
   et bloquait la navigation « suivante » du tiroir sur la premiere ligne homonyme. */
export function sessionKey(item: any): string {
  if (!item) return '';
  return item.id != null ? `row:${item.id}` : `${item.source}:${item.session_id}`;
}
export function displayTitle(item: any): string {return item.grandparent_title?`${item.grandparent_title} · ${item.title}`:item.title}
