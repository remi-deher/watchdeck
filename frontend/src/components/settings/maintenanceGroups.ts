/* Les actions de maintenance rangées par intention : on cherche « réparer » ou « images »
 * avant de chercher un nom d'action. Une action inconnue de cette table atterrit dans
 * « Autres » plutôt que de disparaître, et une action marquée dangereuse par le serveur
 * va toujours en zone sensible, quel que soit son groupe d'origine. */

export interface MaintenanceMeta {
  label?: string;
  description?: string;
  color?: string;
  confirm?: string;
  enabled?: boolean;
  disabled_reason?: string | null;
  last_run?: { status?: string; finished_at?: string | null } | null;
}

export interface MaintenanceGroup {
  key: string;
  label: string;
  hint: string;
  actions: string[];
}

const GROUPS: Array<Omit<MaintenanceGroup, 'actions'> & { members: string[] }> = [
  {
    key: 'sync',
    label: 'Synchroniser',
    hint: 'Remettre l’application d’accord avec Plex, Sonarr, Radarr et Seer.',
    members: ['check-arr-statuses', 'resync-availability', 'health-check', 'seer-sync-users', 'seer-sync-requests', 'discover-users'],
  },
  {
    key: 'repair',
    label: 'Réparer',
    hint: 'Corriger des demandes ou des données mal rangées.',
    members: ['retry-failed', 'repair-posters', 'recalculate-dates', 'merge-duplicates', 'enrich-and-merge'],
  },
  { key: 'images', label: 'Images', hint: 'Le cache des affiches et des fonds d’écran.', members: ['warm-images'] },
];

export function isSensitive(meta?: MaintenanceMeta): boolean {
  return meta?.color === 'danger';
}

/** Les groupes non vides, dans l'ordre d'affichage : zone sensible en dernier. */
export function groupActions(actions: Record<string, MaintenanceMeta>): MaintenanceGroup[] {
  const keys = Object.keys(actions);
  const sensitive = keys.filter((key) => isSensitive(actions[key]));
  const placed = new Set<string>(sensitive);
  const groups: MaintenanceGroup[] = GROUPS.map(({ members, ...group }) => {
    const found = members.filter((key) => keys.includes(key) && !placed.has(key));
    found.forEach((key) => placed.add(key));
    return { ...group, actions: found };
  });
  const others = keys.filter((key) => !placed.has(key));
  groups.push({ key: 'other', label: 'Autres', hint: '', actions: others });
  groups.push({ key: 'sensitive', label: 'Zone sensible', hint: 'Ces actions demandent une confirmation et ne se défont pas.', actions: sensitive });
  return groups.filter((group) => group.actions.length);
}

export interface LastRunLabel {
  status: 'active' | 'error' | 'neutral';
  text: string;
}

/** « OK · il y a 2 h », « Échec · hier », « Jamais lancée » ou « En cours ». */
export function lastRunLabel(meta: MaintenanceMeta | undefined, running: boolean, relative: (value: string) => string): LastRunLabel {
  if (running) return { status: 'neutral', text: 'En cours' };
  const last = meta?.last_run;
  if (!last?.status) return { status: 'neutral', text: 'Jamais lancée' };
  const when = last.finished_at ? ` · ${relative(last.finished_at).toLowerCase()}` : '';
  return last.status === 'error'
    ? { status: 'error', text: `Échec${when}` }
    : { status: 'active', text: `OK${when}` };
}
