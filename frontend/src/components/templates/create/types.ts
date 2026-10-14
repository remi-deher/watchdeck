/* Gabarit « Creer » : la definition de ce qu'on cree. Le gabarit fait le parcours (etapes,
   validation, test, recapitulatif, resultat) ; une definition ne decrit que des donnees.
   Les definitions vivent dans `src/creations/`, une par chose creable. */

import type { LookupItem } from '@/components/ui/UiLookupField.vue';

export type { LookupItem };
export type CreateValues = Record<string, any>;

/* `suggest` : texte libre avec propositions ; `file` : un fichier, par glisser-deposer ou parcours. */
/* `lookup` : cherche puis retient un element (UiLookupField) ; `note` : un texte pour lire, sans saisie. */
export type CreateFieldType = 'text' | 'textarea' | 'url' | 'email' | 'secret' | 'number' | 'select' | 'cards' | 'toggle' | 'file' | 'suggest' | 'lookup' | 'note';

export interface CreateOption {
  value: string;
  label: string;
  description?: string;
}

export interface CreateField {
  key: string;
  type: CreateFieldType;
  label: string;
  /** Effet ou aide du champ, en une phrase. */
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** Choix (select, cards) ; une fonction quand ils dependent des autres reponses. */
  options?: CreateOption[] | ((values: CreateValues) => CreateOption[]);
  /** Propositions d'un champ `suggest` ; une fonction quand elles dependent des autres reponses. */
  suggestions?: string[] | ((values: CreateValues) => string[]);
  /** Types acceptes par un champ `file` (« .torrent »). */
  accept?: string;
  /** Recherche d'un champ `lookup`. */
  search?: (query: string) => Promise<LookupItem[]>;
  /** Texte d'une `note` ; une fonction quand il depend des reponses. */
  text?: string | ((values: CreateValues) => string);
  /** Ton d'une `note` : `warning` pour ce qui change l'issue. */
  tone?: 'info' | 'warning';
  /** Appele quand la reponse change : peut corriger d'autres reponses (champ lie). */
  onChange?: (value: any, values: CreateValues) => void;
  /** Lignes d'un champ `textarea`. */
  rows?: number;
  /** Regle propre : renvoie le message d'erreur, ou rien. */
  validate?: (value: any, values: CreateValues) => string | null | undefined;
  /** Champ present seulement si… */
  when?: (values: CreateValues) => boolean;
  /** Masque au recapitulatif (secret : quatre derniers caracteres). */
  summary?: 'hide' | 'mask';
}

export interface CreateStep {
  key: string;
  /** Libelle court dans la barre d'etapes (« Connexion »). */
  label: string;
  /** Le titre dit l'intention : « Ou se trouve votre Radarr ? ». */
  title: string | ((values: CreateValues) => string);
  description?: string;
  fields: CreateField[];
  /** Etape presente seulement si… (ex. pas de reglages pour Prowlarr). */
  when?: (values: CreateValues) => boolean;
  /** Appele en arrivant sur l'etape, avant d'en montrer les champs (lire ce que la reponse precedente rend possible). */
  onEnter?: (values: CreateValues) => Promise<void>;
}

export interface CreateTestResult {
  ok: boolean;
  message: string;
}

export interface CreateResult {
  message: string;
  detail?: string;
  /** Suites proposees ; « Creer un autre » est toujours offert. */
  links?: Array<{ label: string; to?: string | Record<string, any>; href?: string }>;
}

export interface CreateDefinition {
  /** Modification : « Modifier » + `noun` sans article (« la bibliothèque »), « Enregistrer ». */
  editTitle?: string;
  /** « une instance », « un utilisateur » : titre de la fenetre et du bouton. */
  noun: string;
  /** « une autre instance » : le bouton qui recommence apres creation. */
  another: string;
  /** Libelle du bouton de la derniere etape, a defaut « Creer » (ou « Enregistrer »). */
  submitLabel?: string | ((values: CreateValues) => string);
  /** Sous le titre de la fenetre : sur quoi on agit (« Bravo.S01E02 »). */
  subtitle?: string;
  /** Pas d'ecran de resultat : la fenetre se ferme des que c'est fait (petites modifications). */
  quick?: boolean;
  initial: () => CreateValues;
  steps: CreateStep[];
  /** Test obligatoire avant de quitter l'etape `test.step` ; tout champ de `test.fields`
      modifie le rend caduc. */
  test?: { step: string; fields: string[]; run: (values: CreateValues) => Promise<CreateTestResult> };
  /** La creation ; une erreur levee s'affiche dans la fenetre. */
  submit: (values: CreateValues) => Promise<CreateResult>;
}
