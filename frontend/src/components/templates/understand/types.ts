/* Gabarit « Comprendre » : les donnees qu'une page lui confie. Elle repond a la question
   « que s'est-il passe ? » : une page de lecture, ou le temps structure tout. */

export type UnderstandOutcome = 'success' | 'failed' | 'warning' | 'info';

export interface UnderstandEvent {
  key: string;
  /** Date de l'evenement (ISO) : groupe par jour, ordonne. */
  at: string;
  outcome: UnderstandOutcome;
  title: string;
  /** Ce qui s'est passe, en une ligne (« Reencodage · -4,1 Go », la cause d'un echec…). */
  detail?: string;
  /** Ce qui a change, en etiquettes courtes (« Vidéo », « Audio DTS »…). */
  tags?: string[];
  /** Contexte court : disque, instance, utilisateur… */
  context?: string;
}

/** Un chiffre du bilan de la periode (« 142 traites », « 3 echecs »). Facultatif. */
export interface UnderstandSummary {
  key: string;
  label: string;
  value: string;
  tone?: 'success' | 'danger' | 'neutral';
}

/** Le detail d'un evenement, ouvert dans une feuille. */
export interface UnderstandDetail {
  title: string;
  subtitle?: string;
  outcome: UnderstandOutcome;
  /** La cause, en clair (un echec, un avertissement). */
  cause?: string;
  /** Ce qui a change, en etiquettes courtes. */
  tags?: string[];
  /** Comparaison avant / apres, ligne par ligne. */
  comparison?: Array<{ label: string; before: string; after: string }>;
  steps?: Array<{ label: string; outcome: UnderstandOutcome; duration?: string }>;
  /** Liens : log, fiche concernee… */
  links?: Array<{ label: string; to: string | Record<string, any> }>;
  /** Au plus une action, qui renvoie vers Traiter ou Suivre (« Relancer »). */
  action?: { key: string; label: string };
}

export interface UnderstandOption {
  value: string;
  label: string;
}
