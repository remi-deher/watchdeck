import { onMounted, onUnmounted } from 'vue';

export const REALTIME_EVENT_TYPES = [
  'request.updated',
  'download.updated',
  'health.updated',
  'job.updated',
  'notification.updated',
  'activity.updated',
  'library.analytics.updated',
  'vff.updated',
  'migration.completed',
  'vf_upgrade.updated',
] as const;

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

let source: EventSource | undefined;

export function connectRealtime(): EventSource | undefined {
  if (source || typeof EventSource === 'undefined') return source;
  source = new EventSource('/api/events');
  for (const type of REALTIME_EVENT_TYPES) {
    source.addEventListener(type, (message: MessageEvent) => {
      let detail = {};
      try {
        detail = JSON.parse(message.data);
      } catch {
        /* Ignore malformed events. */
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(`watchdeck:${type}`, { detail }));
      }
    });
  }
  return source;
}

const visibilityCallbacks = new Set<() => void>();
let visibilityListenerInstalled = false;

function ensureVisibilityListener(): void {
  if (visibilityListenerInstalled || typeof document === 'undefined') return;
  visibilityListenerInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (source && source.readyState === EventSource.CLOSED) {
      source = undefined;
      connectRealtime();
    }
    visibilityCallbacks.forEach((callback) => callback());
  });
}

export interface UseRealtimeOptions {
  debounceMs?: number;
  refreshOnVisible?: boolean;
}

export function useRealtime(
  types: RealtimeEventType[] | string[],
  callback: (type?: string, detail?: any) => void,
  { debounceMs = 120, refreshOnVisible = true }: UseRealtimeOptions = {}
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latestType: string | undefined;
  let latestDetail: any;

  const dispatch = (type: string, detail: any) => {
    latestType = type;
    latestDetail = detail;
    if (!debounceMs) return callback(type, detail);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      callback(latestType, latestDetail);
    }, debounceMs);
  };

  const listeners: [string, EventListener][] = types.map((type) => [
    `watchdeck:${type}`,
    ((event: CustomEvent) => dispatch(type, event.detail)) as EventListener,
  ]);

  const onVisible = () => callback(undefined, undefined);

  onMounted(() => {
    connectRealtime();
    ensureVisibilityListener();
    if (typeof window !== 'undefined') {
      listeners.forEach(([name, listener]) => window.addEventListener(name, listener));
    }
    if (refreshOnVisible) visibilityCallbacks.add(onVisible);
  });

  onUnmounted(() => {
    if (timer) clearTimeout(timer);
    if (typeof window !== 'undefined') {
      listeners.forEach(([name, listener]) => window.removeEventListener(name, listener));
    }
    if (refreshOnVisible) visibilityCallbacks.delete(onVisible);
  });
}
