import { onMounted, onUnmounted } from 'vue';

const REALTIME_EVENT_TYPES = [
  'storage.updated',
  'request.updated',
  'download.updated',
  'health.updated',
  'job.updated',
  'notification.updated',
  'activity.updated',
  'library.analytics.updated',
  'vff.updated',
  'vf_upgrade.updated',
  'fileflows.updated',
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
  maxWaitMs?: number;
}

export function useRealtime(
  types: RealtimeEventType[] | string[],
  callback: (type?: string, detail?: any) => void,
  { debounceMs = 120, refreshOnVisible = true, maxWaitMs = 1000 }: UseRealtimeOptions = {}
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latestType: string | undefined;
  let latestDetail: any;
  let mixed = false;
  let firstAt = 0;
  const target = (type: string | undefined, detail: any) => JSON.stringify([type, detail?.payload?.request_id ?? detail?.request_id ?? detail?.payload?.id ?? detail?.id ?? detail?.payload?.job ?? detail?.job ?? null]);

  const dispatch = (type: string, detail: any) => {
    if (timer && (target(latestType, latestDetail) !== target(type, detail) || JSON.stringify(latestDetail) !== JSON.stringify(detail))) mixed = true;
    latestType = type;
    latestDetail = detail;
    if (!debounceMs) return callback(type, detail);
    if (timer) clearTimeout(timer);
    else firstAt = Date.now();
    timer = setTimeout(() => {
      timer = undefined;
      const reload = mixed;
      mixed = false;
      if (reload) callback(undefined, undefined);
      else callback(latestType, latestDetail);
    }, Math.max(0, Math.min(debounceMs, maxWaitMs - (Date.now() - firstAt))));
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
