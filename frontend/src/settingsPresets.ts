/**
 * Valeurs proposées pour les réglages d'intervalle, indexées par **champ de réglage**.
 *
 * L'indexation par champ, et non par tâche ou par page, est ce qui rend la chose sûre.
 * Un même intervalle apparaît à plusieurs endroits de l'interface : la fréquence de
 * ré-analyse VF se règle depuis « Plex & Bibliothèque » comme depuis « Planification »,
 * et trois tâches distinctes (statuts VF, suivi d'épisodes, disponibilité d'épisodes)
 * partagent `vff_recheck_interval_minutes`. Tant que chaque écran portait sa propre
 * liste, rien n'empêchait ces listes de diverger : deux contrôles auraient proposé des
 * valeurs différentes pour la même colonne, et celui dont la liste ne contenait pas la
 * valeur enregistrée serait passé en « Personnalisé » sans raison visible.
 *
 * Une seule table, une seule vérité : les écrans lisent la liste du champ qu'ils
 * modifient, et deux contrôles branchés sur le même champ proposent forcément la même
 * chose.
 */

export interface IntervalPreset {
  label: string;
  value: number;
}

const SECONDS_FAST: IntervalPreset[] = [
  { label: '30 secondes', value: 30 },
  { label: '45 secondes', value: 45 },
  { label: '1 minute', value: 60 },
  { label: '2 minutes', value: 120 },
  { label: '5 minutes', value: 300 },
];

const MINUTES_LONG: IntervalPreset[] = [
  { label: '10 minutes', value: 10 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 heure', value: 60 },
  { label: '3 heures', value: 180 },
  { label: '6 heures', value: 360 },
  { label: '12 heures', value: 720 },
  { label: '24 heures', value: 1440 },
];

export const INTERVAL_PRESETS: Record<string, IntervalPreset[]> = {
  // Watchlist Plex — réglable depuis « Plex & Bibliothèque » et depuis « Planification ».
  poll_interval_seconds: SECONDS_FAST,

  arr_poll_interval_seconds: [
    { label: '1 minute', value: 60 },
    { label: '5 minutes', value: 300 },
    { label: '10 minutes', value: 600 },
    { label: '15 minutes', value: 900 },
    { label: '30 minutes', value: 1800 },
    { label: '1 heure', value: 3600 },
  ],

  // Partagé par les statuts VF, le suivi d'épisodes et la disponibilité d'épisodes,
  // ainsi que par le réglage « Nouvelle analyse » de Plex & Bibliothèque.
  vff_recheck_interval_minutes: MINUTES_LONG,

  plex_sync_recent_interval_minutes: [
    { label: '5 minutes', value: 5 },
    { label: '10 minutes', value: 10 },
    { label: '15 minutes', value: 15 },
    { label: '20 minutes', value: 20 },
    { label: '30 minutes', value: 30 },
    { label: '1 heure', value: 60 },
  ],

  plex_sync_interval_hours: [
    { label: '1 heure', value: 1 },
    { label: '2 heures', value: 2 },
    { label: '3 heures', value: 3 },
    { label: '4 heures', value: 4 },
    { label: '6 heures', value: 6 },
    { label: '8 heures', value: 8 },
    { label: '12 heures', value: 12 },
    { label: '24 heures', value: 24 },
    { label: '48 heures', value: 48 },
    { label: '72 heures', value: 72 },
  ],

  // Cadences autrefois figées dans le code, désormais réglables.
  library_analytics_interval_minutes: [
    { label: '5 minutes', value: 5 },
    { label: '10 minutes', value: 10 },
    { label: '20 minutes', value: 20 },
    { label: '30 minutes', value: 30 },
    { label: '1 heure', value: 60 },
  ],
  arr_queue_interval_seconds: [
    { label: '30 secondes', value: 30 },
    { label: '1 minute', value: 60 },
    { label: '2 minutes', value: 120 },
    { label: '5 minutes', value: 300 },
  ],
  torrent_status_interval_seconds: [
    { label: '1 minute', value: 60 },
    { label: '2 minutes', value: 120 },
    { label: '5 minutes', value: 300 },
    { label: '10 minutes', value: 600 },
  ],
  new_vff_interval_seconds: [
    { label: '1 minute', value: 60 },
    { label: '5 minutes', value: 300 },
    { label: '15 minutes', value: 900 },
    { label: '1 heure', value: 3600 },
  ],
  seer_sync_interval_minutes: [
    { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 },
    { label: '1 heure', value: 60 },
    { label: '3 heures', value: 180 },
    { label: '12 heures', value: 720 },
  ],
};

/** Valeurs proposées pour un champ ; `null` quand il n'en a pas (heure murale, par exemple). */
export function presetsFor(field: string | null | undefined): IntervalPreset[] | null {
  if (!field) return null;
  return INTERVAL_PRESETS[field] || null;
}
