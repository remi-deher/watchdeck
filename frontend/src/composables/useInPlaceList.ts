import type { Ref } from 'vue';

export interface PatchItemOptions {
  keyFields?: string[];
  autoInsert?: boolean;
}

export function useInPlaceList() {
  function matchItem(item: any, detail: any, keyFields: string[] = ['id', 'request_id', 'tmdb_id']): boolean {
    for (const key of keyFields) {
      if (detail[key] != null && item[key] != null && String(item[key]) === String(detail[key])) {
        return true;
      }
    }
    return false;
  }

  function patchItem<T = any>(
    listRef: Ref<T[]> | T[],
    detail: any,
    { keyFields = ['id', 'request_id', 'tmdb_id'], autoInsert = false }: PatchItemOptions = {}
  ): boolean {
    const arr: T[] = (listRef as Ref<T[]>).value || (listRef as T[]);
    if (!arr || !Array.isArray(arr)) return false;
    const index = arr.findIndex((item) => matchItem(item, detail, keyFields));

    if (index !== -1) {
      const existing: any = arr[index];
      Object.keys(detail).forEach((k) => {
        if (detail[k] !== undefined && k !== 'action') {
          existing[k] = detail[k];
        }
      });
      return true;
    } else if (autoInsert || detail.action === 'created') {
      arr.unshift({ ...detail });
      return true;
    }
    return false;
  }

  function removeItem<T = any>(listRef: Ref<T[]> | T[], id: string | number, keyField = 'id'): boolean {
    const arr: T[] = (listRef as Ref<T[]>).value || (listRef as T[]);
    if (!arr || !Array.isArray(arr)) return false;
    const index = arr.findIndex((item: any) => String(item[keyField]) === String(id));
    if (index !== -1) {
      arr.splice(index, 1);
      return true;
    }
    return false;
  }

  return {
    matchItem,
    patchItem,
    removeItem,
  };
}
