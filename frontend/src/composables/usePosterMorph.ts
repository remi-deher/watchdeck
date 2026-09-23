import { animate } from 'motion-v';
import { ressort } from '@/motion/tokens';

/**
 * Transport de l'affiche, de la vignette touchee jusqu'a l'en-tete de la fiche.
 *
 * Les transitions de vue du navigateur ne pouvaient pas s'en charger : elles
 * photographient l'ancien et le nouvel etat de part et d'autre d'une navigation, or la
 * fiche charge ses donnees apres coup. Au moment de la seconde photo, l'affiche
 * d'arrivee n'existe pas encore -- il n'y avait donc rien a relier, et le transport se
 * reduisait a un fondu. Mesurer nous-memes affranchit l'animation du calendrier de la
 * navigation : la vignette est relevee au depart, et l'affiche rejoue le trajet a son
 * apparition, quelle qu'ait ete l'attente.
 *
 * Accessoirement, plus rien ne depend du support de `startViewTransition` : le meme
 * mouvement se joue sur tous les navigateurs.
 */

interface Origine {
  rect: DOMRect;
  /** Pose a l'ouverture : une origine trop vieille appartient a un geste abandonne. */
  at: number;
}

let origine: Origine | null = null;

/** Ce que la carte touchee savait du media : de quoi dessiner la fiche avant sa reponse. */
export interface ApercuFiche {
  title?: string;
  name?: string;
  year?: number | string;
  media_type?: string;
  poster_url?: string | null;
  backdrop_url?: string | null;
  overview?: string;
}

let apercu: { valeur: ApercuFiche; at: number } | null = null;

/** Au-dela, on considere que l'ouverture a echoue et l'on n'anime rien. */
const PEREMPTION_MS = 2500;

export function memoriserOrigine(element: HTMLElement | null | undefined, item?: Record<string, any> | null): void {
  apercu = item
    ? {
        valeur: {
          title: item.title || item.name, year: item.year, media_type: item.media_type,
          poster_url: item.poster_url, backdrop_url: item.backdrop_url, overview: item.overview,
        },
        at: Date.now(),
      }
    : null;
  if (!element) {
    origine = null;
    return;
  }
  origine = { rect: element.getBoundingClientRect(), at: Date.now() };
}

/**
 * L'apercu laisse par la derniere carte touchee, s'il est encore frais.
 *
 * Lu, pas consomme : la fiche peut se monter deux fois (surface puis pleine page). Au-dela
 * du delai, il appartient a une ouverture abandonnee et decrirait un autre media.
 */
export function apercuRecent(): ApercuFiche | null {
  if (!apercu || Date.now() - apercu.at > PEREMPTION_MS) return null;
  return apercu.valeur;
}

function consommerOrigine(): DOMRect | null {
  if (!origine) return null;
  const { rect, at } = origine;
  origine = null;
  if (Date.now() - at > PEREMPTION_MS) return null;
  if (!rect.width || !rect.height) return null;
  return rect;
}

function mouvementReduit(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Rejoue le trajet sur `cible`, depuis la vignette relevee au depart.
 *
 * On deplace et l'on met a l'echelle plutot que de changer la taille : seules ces deux
 * proprietes s'animent sans refaire la mise en page, et une affiche qui redimensionne
 * la page a chaque image du mouvement saccade sur telephone.
 */
export function rejouerTransport(cible: HTMLElement | null | undefined): void {
  if (!cible || mouvementReduit()) {
    origine = null;
    return;
  }
  const depart = consommerOrigine();
  if (!depart) return;

  const arrivee = cible.getBoundingClientRect();
  if (!arrivee.width || !arrivee.height) return;

  const dx = depart.left + depart.width / 2 - (arrivee.left + arrivee.width / 2);
  const dy = depart.top + depart.height / 2 - (arrivee.top + arrivee.height / 2);
  const echelle = depart.width / arrivee.width;

  // Un trajet quasi nul ne vaut pas une animation : elle ne se verrait pas et couterait
  // une image de plus a l'ouverture.
  if (Math.abs(dx) < 4 && Math.abs(dy) < 4 && Math.abs(echelle - 1) < 0.05) return;

  void animate(
    cible,
    { x: [dx, 0], y: [dy, 0], scale: [echelle, 1] },
    {
      type: 'spring',
      ...ressort.transport,
      // Le leger depassement a l'arrivee est ce qui distingue un objet qu'on pose d'une
      // image qui se met en place.
    }
  );
}
