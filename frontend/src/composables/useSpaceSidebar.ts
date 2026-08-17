import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { collapseStorageKey, spaceForPath, type SpaceConfig } from '@/spaces';

const NARROW_QUERY = '(max-width:1024px)';

function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  if (typeof window === 'undefined' || !window.matchMedia) return matches;

  const media = window.matchMedia(query);
  const update = (event?: MediaQueryListEvent): void => { matches.value = event?.matches ?? media.matches; };
  update();
  media.addEventListener?.('change', update);
  if (getCurrentScope()) onScopeDispose(() => media.removeEventListener?.('change', update));
  return matches;
}

function readStored(key: string, fallback: boolean): boolean {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : saved === 'true';
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* Préférence non persistable */
  }
}

export function useSpaceSidebar(route: { path: string } | RouteLocationNormalizedLoaded): {
  activeSpace: ComputedRef<SpaceConfig | null>;
  collapsed: ComputedRef<boolean>;
  toggle: () => void;
} {
  const collapsedByKey = ref<Record<string, boolean>>({});
  const narrow = useMediaQuery(NARROW_QUERY);

  const activeSpace = computed(() => spaceForPath(route.path));
  const activeKey = computed(() => collapseStorageKey(activeSpace.value?.slug));

  const collapsed = computed(() => {
    const key = activeKey.value;
    return key in collapsedByKey.value ? collapsedByKey.value[key] : readStored(key, narrow.value);
  });

  function toggle(): void {
    const key = activeKey.value;
    const next = !collapsed.value;
    collapsedByKey.value = { ...collapsedByKey.value, [key]: next };
    writeStored(key, next);
  }

  return { activeSpace, collapsed, toggle };
}
