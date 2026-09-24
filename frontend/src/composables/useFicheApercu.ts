/**
 * Ce que la carte touchee savait du media, pour dessiner la fiche avant sa reponse.
 *
 * La fiche charge ses donnees apres coup. Sans apercu, elle s'ouvrait sur un simple
 * « Chargement » et changeait de taille a l'arrivee du contenu ; avec, le titre et
 * l'affiche sont la des la premiere image, a leur place definitive.
 */

export interface ApercuFiche {
  title?: string;
  year?: number | string;
  media_type?: string;
  poster_url?: string | null;
  backdrop_url?: string | null;
  overview?: string;
}

/** Au-dela, l'apercu appartient a une ouverture abandonnee et decrirait un autre media. */
const PEREMPTION_MS = 2500;

let apercu: { valeur: ApercuFiche; at: number } | null = null;

export function memoriserApercu(item: Record<string, any> | null | undefined): void {
  apercu = item
    ? {
        valeur: {
          title: item.title || item.name, year: item.year, media_type: item.media_type,
          poster_url: item.poster_url, backdrop_url: item.backdrop_url, overview: item.overview,
        },
        at: Date.now(),
      }
    : null;
}

/** Lu, pas consomme : la fiche peut se monter deux fois (surface puis pleine page). */
export function apercuRecent(): ApercuFiche | null {
  if (!apercu || Date.now() - apercu.at > PEREMPTION_MS) return null;
  return apercu.valeur;
}
