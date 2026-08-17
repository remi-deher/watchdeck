import { ref, type Ref } from 'vue';

export interface UseAsyncActionOptions {
  askConfirm?: ((options: any) => Promise<boolean>) | null;
  onDone?: (() => any) | null;
  busy?: Ref<boolean> | null;
  error?: Ref<string> | null;
}

export interface RunOptions {
  confirm?: any;
  reload?: boolean;
}

export interface AsyncActionResult<T = any> {
  ok: boolean;
  result?: T;
  cancelled?: boolean;
}

export function useAsyncAction({
  askConfirm = null,
  onDone = null,
  busy = null,
  error = null,
}: UseAsyncActionOptions = {}) {
  const busyRef = busy || ref(false);
  const errorRef = error || ref('');

  async function run<T = any>(
    operation: () => Promise<T>,
    { confirm = null, reload = true }: RunOptions = {}
  ): Promise<AsyncActionResult<T>> {
    if (confirm) {
      if (!askConfirm) throw new Error('useAsyncAction : `confirm` requiert `askConfirm`.');
      if (!(await askConfirm(confirm))) return { ok: false, cancelled: true };
    }
    busyRef.value = true;
    errorRef.value = '';
    try {
      const result = await operation();
      if (reload && onDone) await onDone();
      return { ok: true, result };
    } catch (e: any) {
      errorRef.value = e?.message || String(e);
      return { ok: false };
    } finally {
      busyRef.value = false;
    }
  }

  return { run, busy: busyRef, error: errorRef };
}
