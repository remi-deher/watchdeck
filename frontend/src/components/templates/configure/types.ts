/* Gabarit « Configurer » : les donnees qu'une page lui confie. Elle repond a la question
   « comment je veux que ca marche ? ». */

/** Une section, nommee par intention (« Pendant une lecture Plex ») et non par technique. */
export interface ConfigureSection {
  key: string;
  title: string;
  /** Ce que la section regle, en une phrase. */
  description?: string;
  /** Modifiee et pas encore enregistree : signalee dans la section et le sommaire. */
  dirty?: boolean;
}

/** Resultat d'un test de connexion. */
export interface ConfigureTestResult {
  ok: boolean;
  /** « Connecte · FileFlows 25.10 · 4 runners », ou la raison de l'echec. */
  message: string;
}

export type ResourceTone = 'ok' | 'warn' | 'error' | 'off';

/** Une ressource branchee : instance, bibliotheque, client, emplacement… */
export interface ConfigureResource {
  key: string;
  label: string;
  subtitle?: string;
  enabled: boolean;
  /** Etat en une ligne (« Correspondance Plex OK », « Injoignable »…). */
  state?: { tone: ResourceTone; text: string };
  /** Propose « Tester » pour cette ressource. */
  testable?: boolean;
}
