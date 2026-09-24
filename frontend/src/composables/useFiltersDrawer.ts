import { ref, computed, type InjectionKey, type Ref } from 'vue';

/** Filtre actif, affiche en puce retirable en tete du panneau de filtres. */
export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/**
 * Registre des groupes de puces poses dans le panneau de filtres.
 *
 * Chaque `UiChipGroup` rendu dans un `FilterSidebar` s'y declare et dit lui-meme ce qu'il
 * retient : le panneau en tire ses puces de filtres actifs sans que chaque page ait a
 * les decrire une seconde fois. L'ordre d'enregistrement suit celui du montage, donc
 * celui des groupes a l'ecran.
 */
export interface FilterChipRegistry {
  register: (id: symbol, chips: () => FilterChip[]) => void;
  unregister: (id: symbol) => void;
}

export const FILTER_CHIP_REGISTRY: InjectionKey<FilterChipRegistry> = Symbol('filter-chip-registry');

export interface UseFiltersDrawerOptions {
  onReset?: () => void;
  activeCountFn?: () => number;
}

export function useFiltersDrawer<T extends Record<string, Ref<any>>>(
  filters: T,
  defaults: { [K in keyof T]: T[K]['value'] },
  options?: UseFiltersDrawerOptions
) {
  const filtersOpen = ref(false);

  function isDifferentFromDefault(value: any, def: any): boolean {
    if (Array.isArray(value)) {
      if (Array.isArray(def)) {
        if (value.length !== def.length) return true;
        return value.some((item, idx) => item !== def[idx]);
      }
      return value.length > 0;
    }
    if (value === null || value === undefined || value === '') {
      return def !== null && def !== undefined && def !== '';
    }
    return value !== def;
  }

  const activeCount = computed(() => {
    if (options?.activeCountFn) {
      return options.activeCountFn();
    }
    return Object.keys(filters).filter((key) => {
      const val = filters[key].value;
      const def = defaults[key];
      return isDifferentFromDefault(val, def);
    }).length;
  });

  function toggle() {
    filtersOpen.value = !filtersOpen.value;
  }

  function close() {
    filtersOpen.value = false;
  }

  function reset() {
    for (const key of Object.keys(filters)) {
      const def = defaults[key];
      (filters[key] as Ref<any>).value = Array.isArray(def) ? [...def] : def;
    }
    if (options?.onReset) {
      options.onReset();
    }
  }

  return { filtersOpen, activeCount, toggle, close, reset };
}
