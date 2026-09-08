const STORAGE_PREFIX = 'watchdeck:page-search:';
const MAX_RECENT = 5;

function keyFor(scope: string): string {
  return `${STORAGE_PREFIX}${scope.trim().toLocaleLowerCase('fr') || 'page'}`;
}

/** Lit un historique local borné. Une valeur corrompue ne doit jamais casser le shell. */
export function readPageSearchHistory(scope: string, storage: Pick<Storage, 'getItem'> = localStorage): string[] {
  try {
    const value = JSON.parse(storage.getItem(keyFor(scope)) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Mémorise seulement une recherche réellement validée, séparément pour chaque page. */
export function rememberPageSearch(
  scope: string,
  query: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage
): string[] {
  const normalized = query.trim();
  if (normalized.length < 2) return readPageSearchHistory(scope, storage);
  const next = [normalized, ...readPageSearchHistory(scope, storage).filter((item) => item.toLocaleLowerCase('fr') !== normalized.toLocaleLowerCase('fr'))].slice(0, MAX_RECENT);
  try { storage.setItem(keyFor(scope), JSON.stringify(next)); } catch { /* stockage privé ou plein */ }
  return next;
}
