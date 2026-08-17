import { ref, type Ref } from 'vue';

export interface UseFetchStateOptions<T> {
  initialLoading?: boolean;
  initialError?: string;
  onError?: (err: any) => void;
}

export function useFetchState<T = any>(
  initialData?: T,
  options: UseFetchStateOptions<T> = {}
) {
  const data = ref<T | undefined>(initialData) as Ref<T>;
  const loading = ref(options.initialLoading ?? false);
  const error = ref(options.initialError ?? '');

  async function execute<R = T>(fn: () => Promise<R>): Promise<R | undefined> {
    loading.value = true;
    error.value = '';
    try {
      const result = await fn();
      if (initialData !== undefined && result !== undefined) {
        data.value = result as unknown as T;
      }
      return result;
    } catch (e: any) {
      const msg = e?.message || String(e);
      error.value = msg;
      if (options.onError) {
        options.onError(e);
      }
      return undefined;
    } finally {
      loading.value = false;
    }
  }

  function clearError() {
    error.value = '';
  }

  return {
    data,
    loading,
    error,
    execute,
    clearError,
  };
}
