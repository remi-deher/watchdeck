import { ref, readonly } from 'vue';
import { loadRouteLocation, type RouteLocationRaw, type Router } from 'vue-router';

/**
 * Retour immediat quand on change de destination.
 *
 * Les vues sont chargees a la demande : au premier clic sur une entree du menu, le routeur
 * attend le fichier de la vue (et la session) avant de bouger, et l'ecran reste inchange --
 * on croit que le clic n'a rien fait. Trois reponses, communes a tout le menu :
 *  - une barre de progression en haut, qui n'apparait qu'apres un court delai (une
 *    navigation rapide ne clignote pas) ;
 *  - l'entree touchee reste enfoncee (`data-pending`) jusqu'a l'arrivee ;
 *  - le fichier de la vue est charge d'avance, des que le doigt ou le pointeur approche.
 */

const DELAI_AFFICHAGE_MS = 120;
/* Filet : une navigation qui ne se termine jamais ne doit pas laisser la barre allumee. */
const DELAI_MAX_MS = 20_000;

const enCours = ref(false);
export const navigationEnCours = readonly(enCours);

let minuteur: ReturnType<typeof setTimeout> | null = null;
let filet: ReturnType<typeof setTimeout> | null = null;
let lienTouche: HTMLElement | null = null;

function annulerMinuteurs(): void {
  if (minuteur) clearTimeout(minuteur);
  if (filet) clearTimeout(filet);
  minuteur = null;
  filet = null;
}

function demarrer(): void {
  annulerMinuteurs();
  minuteur = setTimeout(() => { enCours.value = true; }, DELAI_AFFICHAGE_MS);
  filet = setTimeout(arreter, DELAI_MAX_MS);
}

function arreter(): void {
  annulerMinuteurs();
  enCours.value = false;
  lienTouche?.removeAttribute('data-pending');
  lienTouche = null;
}

const dejaChargees = new Set<string>();

/** Charge d'avance la vue d'une destination ; sans effet si c'est deja fait ou impossible. */
export function prechargerRoute(router: Router, to: RouteLocationRaw): void {
  let cible;
  try {
    cible = router.resolve(to);
  } catch {
    return;
  }
  if (dejaChargees.has(cible.path)) return;
  dejaChargees.add(cible.path);
  loadRouteLocation(cible).catch(() => dejaChargees.delete(cible.path));
}

function adresseDuLien(cible: EventTarget | null): { lien: HTMLElement; href: string } | null {
  const lien = cible instanceof Element ? cible.closest<HTMLElement>('a.app-nav-link[href]') : null;
  const href = lien?.getAttribute('href');
  return lien && href && href.startsWith('/') ? { lien, href } : null;
}

export function installerRetourDeNavigation(router: Router): void {
  router.beforeEach((to, from) => {
    // Un filtre ou une section qui republie l'adresse n'est pas un changement d'ecran.
    if (to.path !== from.path) demarrer();
  });
  router.afterEach(arreter);
  router.onError(arreter);

  if (typeof document === 'undefined') return;
  const precharger = (event: Event) => {
    const trouve = adresseDuLien(event.target);
    if (trouve) prechargerRoute(router, trouve.href);
  };
  // `pointerover` et `focusin` remontent, pas `pointerenter` ; `pointerdown` couvre le tactile.
  document.addEventListener('pointerover', precharger, { passive: true });
  document.addEventListener('focusin', precharger, { passive: true });
  document.addEventListener('pointerdown', precharger, { passive: true });
  // L'entree touchee reste enfoncee jusqu'a l'arrivee. Un clic sur la page deja ouverte ne
  // lance aucune navigation : le marquage est retire aussitot.
  document.addEventListener('click', (event) => {
    const trouve = adresseDuLien(event.target);
    if (!trouve) return;
    lienTouche?.removeAttribute('data-pending');
    lienTouche = trouve.lien;
    trouve.lien.setAttribute('data-pending', 'true');
    setTimeout(() => { if (!minuteur) arreter(); }, 50);
  }, { passive: true });
}
