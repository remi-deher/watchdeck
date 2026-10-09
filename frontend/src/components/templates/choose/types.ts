/* Gabarit « Choisir » : les candidats qu'une page lui confie. Elle repond a « lequel
   prendre ? » ; on en retient un parmi plusieurs. */

export interface ChooseBadge {
  label: string;
  /** `success` (VF), `accent` (4K), `warning`… ; neutre sinon. */
  tone?: 'success' | 'accent' | 'warning';
}

export interface ChooseCandidate {
  key: string;
  title: string;
  /** Criteres, toujours dans le meme ordre d'un candidat a l'autre. */
  badges: ChooseBadge[];
  /** Chiffres lisibles (« 18,4 Go », « 142 seeds », « score 1850 »). */
  facts: string[];
  /** Mesures pour le tri et la recommandation (`score`, `size`, `seeds`…). */
  metrics?: Record<string, number>;
  /** Raison du rejet par la source ; le candidat reste dans le tri, estompe. */
  rejected?: string;
  [key: string]: any;
}

export interface ChooseSort {
  /** Cle de la mesure (`metrics`). */
  key: string;
  label: string;
  /** Plus grand d'abord par defaut. */
  direction?: 'asc' | 'desc';
}

export interface ChooseResult {
  message: string;
  /** Ou suivre la suite (gabarit Suivre). */
  to?: string | Record<string, any>;
  linkLabel?: string;
}
