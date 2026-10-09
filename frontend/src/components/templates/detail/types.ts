/* Gabarit « Fiche » : les donnees qu'une page lui confie. Elle repond a « tout sur cet
   element » : ou il en est d'un coup d'oeil, et ce qu'on peut faire dessus. */

export type DetailTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface DetailBadge {
  key: string;
  label: string;
  tone: DetailTone;
}

export interface DetailAction {
  key: string;
  label: string;
  icon?: any;
  /** Lien plutot qu'action (« Lire dans Plex »). */
  to?: string | Record<string, any>;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
}

/** La seule alerte d'etat montree : la plus importante, avec ou la traiter. */
export interface DetailAlert {
  tone: 'warning' | 'danger' | 'info';
  message: string;
  link?: { label: string; to?: string | Record<string, any>; tab?: string };
}

export interface DetailFact {
  label: string;
  value: string;
}

export interface DetailTab {
  key: string;
  label: string;
  count?: number;
}
