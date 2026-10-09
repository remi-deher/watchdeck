/* Gabarit « Analyser » : les donnees qu'une page lui confie. Elle repond a « que contient
   ma bibliotheque, et comment ca evolue ? ». */

export type AnalyzePeriod = '7d' | '30d' | '1y' | '5y' | '10y' | 'all';

export interface AnalyzeKpi {
  key: string;
  label: string;
  value: string;
  detail?: string;
  /** Evolution en pourcentage par rapport a la periode precedente ; absente sur « Tout ». */
  change?: number | null;
  /** Sens d'une bonne nouvelle (`down` : moins de films sans VF). Par defaut `up`. */
  better?: 'up' | 'down';
}

/** Un constat calcule par le serveur, deja trie par impact. */
export interface AnalyzeLead {
  key: string;
  /** Le constat en clair, chiffre : « 312 films sans VF occupent 2,1 To ». */
  text: string;
  /** `handle` : il y a quelque chose a corriger (Traiter). */
  action?: 'explore' | 'handle';
}

/** Ce que la page demande d'ouvrir : une piste ou un element d'un bloc. */
export interface AnalyzeDrillRequest {
  key: string;
  title: string;
  kind: 'lead' | 'block';
  action?: 'explore' | 'handle';
}

/** La liste ouverte, chargee par la page. */
export interface AnalyzeDrill {
  key: string;
  title: string;
  /** La meme selection dans Explorer, deja reglee par l'adresse. */
  exploreTo?: string | Record<string, any> | null;
  /** La page Traiter, filtree sur ce probleme. */
  handleTo?: string | Record<string, any> | null;
}
