/* Gabarit « Surveiller » : les donnees qu'une page lui confie. Elle repond a la question
   « est-ce que tout va bien ? » ; le gabarit decide de l'ordre et de la presentation. */

export type MonitorSeverity = 'error' | 'warn' | 'info';
export type MonitorTone = 'ok' | 'warn' | 'error' | 'info' | 'off';

/** Un chiffre de sante, qui mene a la page ou il se detaille. */
export interface MonitorKpi {
  key: string;
  label: string;
  value: string;
  unit?: string;
  status: string;
  tone: MonitorTone;
  to: string;
  /** Une valeur par jour, du plus ancien au plus recent : dessine la courbe. */
  spark?: number[];
}

/** Un point qui demande l'attention : sa cause, et ou aller le regler. */
export interface MonitorAttentionItem {
  key: string;
  severity: MonitorSeverity;
  /** Partie concernee : choisit l'icone (voir `icons` du gabarit). */
  area?: string;
  title: string;
  detail: string;
  action: { label: string; to: string };
}

/** Une partie de la section, avec son etat en une ligne. */
export interface MonitorZone {
  key: string;
  label: string;
  to: any;
  icon: any;
  line: string;
  severity: MonitorSeverity | null;
}

export interface MonitorZoneGroup {
  label: string;
  items: MonitorZone[];
}

/** Textes du gabarit propres a la page ; chaque cle a une valeur par defaut. */
export interface MonitorLabels {
  /** Titre pendant la verification (« Verification de l'instance… »). */
  checkingTitle?: string;
  checkingDetail?: string;
  /** Titre et texte quand rien ne demande d'attention. */
  okTitle?: string;
  okDetail?: string;
  /** Bouton de verification. */
  refresh?: string;
  /** Nom accessible des indicateurs et des zones. */
  kpisLabel?: string;
  zonesLabel?: string;
}
