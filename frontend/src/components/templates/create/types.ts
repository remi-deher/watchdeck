/* Gabarit « Creer » : la definition de ce qu'on cree. Le gabarit fait le parcours (etapes,
   validation, test, recapitulatif, resultat) ; une definition ne decrit que des donnees.
   Les definitions vivent dans `src/creations/`, une par chose creable. */

export type CreateValues = Record<string, any>;

export type CreateFieldType = 'text' | 'url' | 'email' | 'secret' | 'number' | 'select' | 'cards' | 'toggle';

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
}

export interface CreateTestResult {
  ok: boolean;
  message: string;
}

export interface CreateResult {
  message: string;
  detail?: string;
  /** Suites proposees ; « Creer un autre » est toujours offert. */
  links?: Array<{ label: string; to: string | Record<string, any> }>;
}

export interface CreateDefinition {
  /** Modification : « Modifier » + `noun` sans article (« la bibliothèque »), « Enregistrer ». */
  editTitle?: string;
  /** « une instance », « un utilisateur » : titre de la fenetre et du bouton. */
  noun: string;
  /** « une autre instance » : le bouton qui recommence apres creation. */
  another: string;
  initial: () => CreateValues;
  steps: CreateStep[];
  /** Test obligatoire avant de quitter l'etape `test.step` ; tout champ de `test.fields`
      modifie le rend caduc. */
  test?: { step: string; fields: string[]; run: (values: CreateValues) => Promise<CreateTestResult> };
  /** La creation ; une erreur levee s'affiche dans la fenetre. */
  submit: (values: CreateValues) => Promise<CreateResult>;
}
