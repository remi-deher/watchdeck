/* Filtrage des torrents de la section Clients : la barre de recherche accepte des
   operateurs (`cat:`, `tag:`, `is:`, `tracker:`) en plus du texte libre, et les filtres du
   tiroir acceptent l'exclusion (`!valeur`). */

export interface ClientSearchFilters { cat: string | null; tag: string | null; is: string | null; tracker: string | null }

export function parseSearchQuery(qStr: string): { terms: string; filters: ClientSearchFilters } {
  const terms: string[] = [];
  const filters: ClientSearchFilters = { cat: null, tag: null, is: null, tracker: null };

  for (const part of qStr.trim().split(/\s+/)) {
    if (part.includes(':')) {
      const [key, val] = part.split(':');
      const k = key.toLowerCase();
      const v = val.toLowerCase();
      if (k === 'cat' || k === 'category') filters.cat = v;
      else if (k === 'tag' || k === 'tags') filters.tag = v;
      else if (k === 'is' || k === 'status') filters.is = v;
      else if (k === 'tracker' || k === 'host') filters.tracker = v;
      else terms.push(part.toLowerCase());
    } else if (part) {
      terms.push(part.toLowerCase());
    }
  }
  return { terms: terms.join(' '), filters };
}

/** Une valeur, une liste ou un ensemble ; les entrees prefixees de `!` excluent. */
export function matchFilterValue(filter: unknown, val: unknown, isSubstring = false): boolean {
  if (!filter) return true;
  let set: Set<unknown> = new Set();
  if (filter instanceof Set) set = filter;
  else if (Array.isArray(filter)) set = new Set(filter.filter(Boolean));
  else if (typeof filter === 'string' && filter.trim()) set = new Set([filter.trim()]);
  if (!set.size) return true;

  const valStr = String(val || '').toLowerCase();
  const included = [...set].filter(item => !String(item).startsWith('!'));
  const excluded = [...set].filter(item => String(item).startsWith('!')).map(item => String(item).slice(1));
  const matches = (item: unknown) => {
    const itemStr = String(item).toLowerCase();
    return isSubstring ? valStr.includes(itemStr) : valStr === itemStr;
  };
  if (excluded.some(matches)) return false;
  return !included.length || included.some(matches);
}

/** Etat simplifie d'un torrent, tel que le proposent les filtres. */
export function clientStatus(row: any): string {
  const value = String(row.status || '').toLowerCase();
  if (row.client_error || value.includes('error') || value.includes('missing')) return 'error';
  if (Number(row.progress) >= 100 || ['uploading', 'stalledup', 'pausedup', 'completed'].some(key => value.includes(key))) return 'seeding';
  if (['queued', 'paused', 'stopped', 'checking'].some(key => value.includes(key))) return 'paused';
  return 'downloading';
}

export interface ClientFilterState {
  query: string;
  clientId: string;
  category: string | string[];
  status: string | string[];
  tracker: string | string[];
  ownership: string;
}

export function filterClients(rows: any[], state: ClientFilterState): any[] {
  const { terms, filters } = parseSearchQuery(state.query);
  return rows.filter((row: any) => {
    if (row.client_error) return false;
    if (state.clientId && String(row.client_id) !== state.clientId) return false;
    if (terms && !`${row.title || ''} ${row.tags || ''}`.toLowerCase().includes(terms)) return false;
    if (!matchFilterValue(filters.cat || state.category, row.category || 'Non classé')) return false;
    if (filters.tag && !(row.tags || '').toLowerCase().includes(filters.tag)) return false;
    if (!matchFilterValue(filters.is || state.status, clientStatus(row))) return false;
    if (!matchFilterValue(filters.tracker || state.tracker, row.trackers || row.tracker || '', true)) return false;
    if (state.ownership && row.managed_by !== state.ownership) return false;
    return true;
  });
}
