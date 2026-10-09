/* Gabarit « Suivre » : les donnees qu'une page lui confie. Elle repond a la question
   « ou en est ce qui tourne ? » ; le gabarit decide de l'ordre et de la presentation. */

/** Etat d'un element suivi. L'ordre d'affichage est fixe : bloque, en cours, en pause,
    en attente -- ce qui demande d'agir d'abord, ce qui patiente ensuite. */
export type TrackState = 'blocked' | 'running' | 'paused' | 'waiting';

export interface TrackAction {
  key: string;
  label: string;
  icon?: any;
  /** `primary` : l'action qui debloque ; `danger` : retirer, annuler. */
  tone?: 'primary' | 'danger' | 'default';
  disabled?: boolean;
  /** Ce que fait l'action, en une phrase (infobulle). */
  title?: string;
}

/** Pourquoi un element est bloque : le diagnostic passe avant la progression. */
export interface TrackCause {
  headline: string;
  reasons?: string[];
  hint?: string;
}

export interface TrackItem {
  key: string;
  state: TrackState;
  title: string;
  /** Une ligne d'identification : instance, disque, client… */
  subtitle?: string;
  /** Affiche ; a defaut, l'icone. */
  poster?: string | null;
  /** Fond paysage, pour la carte en cours en grand format. */
  backdrop?: string | null;
  icon?: any;
  /** Etiquettes courtes : episode, qualite, taille… */
  tags?: string[];
  /** Progression en pourcentage ; absente, pas de barre. */
  progress?: number | null;
  /** Etape ou etat en cours (« Assemblage », « Telechargement »…). */
  step?: string;
  /** Temps restant, debit… */
  eta?: string;
  /** Raison d'attente ou remarque, en une phrase. */
  note?: string;
  cause?: TrackCause;
  /** Fiche de l'element. */
  to?: string | Record<string, any> | null;
  actions?: TrackAction[];
}

/** Un element termine recemment : ce qui vient de passer, avant l'historique complet. */
export interface TrackRecent {
  key: string;
  title: string;
  detail?: string;
  poster?: string | null;
  failed?: boolean;
  to?: string | Record<string, any> | null;
}

/** Textes du gabarit propres a la page ; chaque cle a une valeur par defaut. */
export interface TrackLabels {
  /** Ce qu'on suit, au pluriel (« telechargements », « traitements »…). */
  items?: string;
  empty?: string;
  emptyDetail?: string;
  recent?: string;
  history?: string;
}
