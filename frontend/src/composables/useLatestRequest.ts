import { onUnmounted } from 'vue';

export interface LatestRequestContext {
  signal: AbortSignal;
  isCurrent: () => boolean;
}

export function useLatestRequest() {
  let controller: AbortController | null = null;
  let sequence = 0;

  function token(): () => boolean {
    const mine = ++sequence;
    return () => mine === sequence;
  }

  function begin(): LatestRequestContext {
    controller?.abort();
    controller = new AbortController();
    return { signal: controller.signal, isCurrent: token() };
  }

  function extend(): LatestRequestContext {
    controller ||= new AbortController();
    return { signal: controller.signal, isCurrent: token() };
  }

  function abort(): void {
    controller?.abort();
  }

  const isAbort = (error: any): boolean => error?.name === 'AbortError';

  onUnmounted(abort);

  return { begin, extend, abort, isAbort };
}
