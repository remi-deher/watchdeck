import { getCurrentScope, onScopeDispose } from 'vue';
import { api } from '@/api';
/** Cancels optional detail reads on target change or scope disposal; mutations continue. */
export function useScopedRequests() {
  let controller = new AbortController();
  const reset = () => { controller.abort(); controller = new AbortController(); };
  if (getCurrentScope()) onScopeDispose(() => controller.abort());
  async function read<T = any>(path: string): Promise<T> {
    const signal = controller.signal;
    const data = await api<T>(path, { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return data;
  }
  return { read, reset };
}
