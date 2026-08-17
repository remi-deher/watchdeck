import { ref, computed, type Ref } from 'vue';

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
