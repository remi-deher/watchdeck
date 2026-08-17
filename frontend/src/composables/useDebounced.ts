import { onUnmounted } from 'vue';

export interface DebouncedFn<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: (...args: Parameters<T>) => void;
}

export function useDebounced<T extends (...args: any[]) => void>(callback: T, delayMs: number): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delayMs);
  }) as DebouncedFn<T>;

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
  };

  debounced.flush = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    callback(...args);
  };

  onUnmounted(debounced.cancel);

  return debounced;
}
