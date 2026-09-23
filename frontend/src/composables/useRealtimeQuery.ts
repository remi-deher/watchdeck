import { useQueryClient, type QueryKey } from '@tanstack/vue-query';
import { toValue, type MaybeRefOrGetter } from 'vue';
import { useRealtime, type RealtimeEventType } from '@/events';

/* Mises a jour temps reel d'une liste detenue par le cache de TanStack Query.
 *
 * `useRealtimeList` / `useInPlaceList` modifient la liste en place (`Object.assign`
 * sur l'element, `unshift`). C'est interdit sur des donnees du cache : l'objet est
 * partage avec les autres observateurs de la meme cle, et une mutation ne declenche ni
 * notification ni rendu fiable. Ici, un evenement produit une NOUVELLE liste, remise
 * au cache par `setQueryData` ; faute d'element correspondant, la cle est invalidee et
 * relue.
 */

export interface PatchOptions {
  keyFields?: string[];
  /** Inserer en tete un element inconnu (sinon seul `action: 'created'` insere). */
  autoInsert?: boolean;
}

const DEFAULT_KEYS = ['id', 'request_id', 'tmdb_id'];

export function matchesAnyKey(item: Record<string, unknown>, detail: Record<string, unknown>, keyFields = DEFAULT_KEYS): boolean {
  return keyFields.some((key) => detail[key] != null && item[key] != null && String(item[key]) === String(detail[key]));
}

/** Champs de l'evenement a reporter sur l'element : definis, et hors `action`. */
function changes(detail: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(detail).filter(([key, value]) => value !== undefined && key !== 'action'));
}

/**
 * Nouvelle liste ou le PREMIER element correspondant recoit les champs de l'evenement.
 * La liste d'origine et ses elements ne sont jamais modifies.
 */
export function patchedList<T extends Record<string, unknown>>(
  list: readonly T[],
  detail: Record<string, unknown>,
  { keyFields = DEFAULT_KEYS, autoInsert = false }: PatchOptions = {},
): { list: T[]; patched: boolean } {
  const index = list.findIndex((item) => matchesAnyKey(item, detail, keyFields));
  if (index !== -1) {
    const next = list.slice();
    next[index] = { ...list[index], ...changes(detail) } as T;
    return { list: next, patched: true };
  }
  if (autoInsert || detail.action === 'created') return { list: [{ ...detail } as T, ...list], patched: true };
  return { list: list.slice(), patched: false };
}

/** Comme `patchedList`, mais pour TOUS les elements correspondants (un media present
 *  dans plusieurs sections, par exemple). */
export function patchedAll<T extends Record<string, unknown>>(
  list: readonly T[],
  detail: Record<string, unknown>,
  keyFields = DEFAULT_KEYS,
): { list: T[]; patched: boolean } {
  let patched = false;
  const next = list.map((item) => {
    if (!matchesAnyKey(item, detail, keyFields)) return item;
    patched = true;
    return { ...item, ...changes(detail) } as T;
  });
  return { list: next, patched };
}

export interface RealtimeQueryOptions<TData> {
  keyFields?: string[];
  debounceMs?: number;
  refreshOnVisible?: boolean;
  /** Ou se trouve la liste dans les donnees de la query, et comment l'y remettre. */
  getList?: (data: TData) => Record<string, unknown>[];
  setList?: (data: TData, list: Record<string, unknown>[]) => TData;
}

/**
 * Applique les evenements `eventTypes` a la liste de la query `queryKey`.
 *
 * Evenement sans charge utile (retour d'onglet, flux SSE perdu) ou sans element
 * correspondant : invalidation, donc relecture.
 */
export function useRealtimeQuery<TData>(
  queryKey: MaybeRefOrGetter<QueryKey>,
  eventTypes: RealtimeEventType[] | string[],
  {
    keyFields = DEFAULT_KEYS,
    debounceMs = 120,
    refreshOnVisible = true,
    getList = (data) => data as unknown as Record<string, unknown>[],
    setList = (_data, list) => list as unknown as TData,
  }: RealtimeQueryOptions<TData> = {},
) {
  const queryClient = useQueryClient();

  function apply(detail: Record<string, unknown>): boolean {
    const key = toValue(queryKey);
    const current = queryClient.getQueryData<TData>(key);
    if (current === undefined) return false;
    const { list, patched } = patchedList(getList(current) || [], detail, { keyFields });
    if (patched) queryClient.setQueryData<TData>(key, setList(current, list));
    return patched;
  }

  function invalidate(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: toValue(queryKey) });
  }

  useRealtime(eventTypes, (_type, detail) => {
    const payload = (detail?.payload || detail) as Record<string, unknown> | undefined;
    if (!payload || !apply(payload)) void invalidate();
  }, { debounceMs, refreshOnVisible });

  return { apply, invalidate };
}
