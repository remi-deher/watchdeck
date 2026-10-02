import type { Ref } from 'vue';
import type { LocationQuery, Router } from 'vue-router';

/**
 * Les filtres d'une page survivent a un passage par une autre page.
 *
 * Seule la Bibliotheque retenait les siens : ailleurs, revenir par le menu remettait tout a
 * zero. La memoire dure le temps de la session (sessionStorage) : un nouvel onglet ou une
 * nouvelle visite repart des valeurs par defaut. Une adresse qui porte deja des filtres --
 * lien partage, favori -- a toujours le dernier mot.
 */

const PREFIXE = 'watchdeck:filtres:';

function lire<T>(cle: string): T | null {
  try {
    const brut = sessionStorage.getItem(PREFIXE + cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}

function ecrire(cle: string, valeur: unknown): void {
  try {
    sessionStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
  } catch {
    /* Stockage indisponible (navigation privee) : les filtres restent ceux de la page. */
  }
}

/* Pages dont les filtres et la section vivent dans l'adresse elle-meme. */
const PAGES_A_ADRESSE = new Set(['/downloads', '/activity', '/notifications', '/discover/requests']);

/**
 * Pour les pages de `PAGES_A_ADRESSE` : l'adresse (sa requete) est retenue a chaque
 * passage, et rendue quand on y revient sans requete depuis une autre page -- le menu, le
 * dock. Un retour arriere rend deja sa propre adresse, et une reinitialisation reste sur
 * la meme page : ni l'un ni l'autre ne sont touches.
 */
export function installerMemoireDesAdresses(router: Router): void {
  // Retour arriere signale par l'historique du routeur, avant ses gardes (voir
  // `installerRetourDesSurfaces`).
  let arriere = false;
  router.options.history.listen((_to, _from, info) => { arriere = info.type === 'pop'; });
  router.beforeEach((to, from) => {
    const retour = arriere;
    arriere = false;
    if (retour || !PAGES_A_ADRESSE.has(to.path) || to.path === from.path) return true;
    if (Object.keys(to.query).length) return true;
    const retenue = lire<LocationQuery>(`adresse:${to.path}`);
    if (!retenue || !Object.keys(retenue).length) return true;
    return { path: to.path, query: retenue, hash: to.hash, replace: true };
  });
  router.afterEach((to, _from, failure) => {
    if (failure || !PAGES_A_ADRESSE.has(to.path)) return;
    ecrire(`adresse:${to.path}`, to.query);
  });
}

/* Seules les valeurs de meme forme que la valeur par defaut sont rendues : une memoire
   ecrite par une version precedente de la page ne doit pas y injecter n'importe quoi. */
function memeForme(valeur: unknown, defaut: unknown): boolean {
  if (Array.isArray(defaut)) return Array.isArray(valeur);
  if (defaut === null || defaut === undefined) return valeur === null || ['string', 'number', 'boolean'].includes(typeof valeur);
  return typeof valeur === typeof defaut;
}

/**
 * Pour les filtres tenus en memoire par la page (`useFiltersDrawer`) : restaure les
 * valeurs retenues -- sauf celles que l'adresse fixe deja -- puis retient chaque
 * changement. La cle inclut le chemin : /discover/movies et /discover/shows ont chacun les
 * leurs.
 */
export function memoriserFiltres(
  cle: string,
  filtres: Record<string, Ref<unknown>>,
  defauts: Record<string, unknown>,
  surveiller: (source: () => unknown, rappel: () => void) => void,
  /** Nom du parametre d'adresse d'un champ quand il differe (Decouvrir : sortBy -> sort). */
  parametres: Record<string, string> = {},
): void {
  if (typeof window === 'undefined') return;
  const cleComplete = `valeurs:${cle}:${window.location.pathname}`;
  const fixesParLAdresse = new URLSearchParams(window.location.search);
  const retenues = lire<Record<string, unknown>>(cleComplete);
  if (retenues) {
    for (const [nom, valeur] of Object.entries(retenues)) {
      if (fixesParLAdresse.has(parametres[nom] || nom)) continue;
      if (nom in filtres && memeForme(valeur, defauts[nom])) filtres[nom].value = valeur;
    }
  }
  surveiller(
    () => Object.fromEntries(Object.entries(filtres).map(([nom, ref]) => [nom, ref.value])),
    () => ecrire(cleComplete, Object.fromEntries(Object.entries(filtres).map(([nom, ref]) => [nom, ref.value]))),
  );
}
