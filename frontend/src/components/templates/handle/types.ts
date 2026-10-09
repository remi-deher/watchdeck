import type { MediaRef } from '@/types';

/* Gabarit « Traiter » : les donnees qu'une page lui confie. Elle repond a la question
   « que dois-je faire maintenant ? » : ce qui n'avancera pas sans decision. */

export type HandleUrgency = 'high' | 'medium' | 'low';

export interface HandleAction {
  key: string;
  label: string;
  icon?: any;
  /** `primary` : la correction proposee ; `danger` : supprimer, refuser. */
  tone?: 'primary' | 'danger' | 'default';
  disabled?: boolean;
  title?: string;
}

/** Un type de probleme : indicateur qui sert de filtre, et son action groupee. */
export interface HandleIssue {
  key: string;
  label: string;
  /** Elements concernes. */
  count: number;
  /** Elements corrigeables sans decision ; absent, le probleme est « a decider ». */
  fixable?: number;
  /** Action sur tous les corrigeables de ce type (« Corriger les 12 »). */
  bulk?: HandleAction;
}

export interface HandleItem {
  key: string;
  /** Cle du type de probleme (`HandleIssue.key`). */
  issue: string;
  urgency: HandleUrgency;
  title: string;
  /** Le probleme, en clair. */
  problem: string;
  /** La correction proposee, s'il y en a une. */
  proposal?: string;
  /** Affiche selon le contexte : un media en a une, un service ou un reglage non. */
  poster?: string | null;
  media?: MediaRef;
  subtitle?: string;
  to?: string | Record<string, any> | null;
  /** La premiere est l'action principale ; « Ignorer » est une decision durable :
      l'element ne revient pas tant que son etat ne change pas (cote page / serveur). */
  actions?: HandleAction[];
}

export interface HandleLabels {
  items?: string;
  empty?: string;
  emptyDetail?: string;
}
