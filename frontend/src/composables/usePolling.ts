import { onMounted, onUnmounted } from 'vue';

export interface UsePollingOptions {
  whenVisible?: boolean;
  immediate?: boolean;
}

export function usePolling(
  callback: () => void,
  intervalMs: number,
  { whenVisible = true, immediate = false }: UsePollingOptions = {}
): { stop: () => void } {
  let timer: ReturnType<typeof setInterval> | undefined;

  function tick(): void {
    if (whenVisible && typeof document !== 'undefined' && document.hidden) return;
    callback();
  }

  onMounted(() => {
    if (immediate) tick();
    timer = setInterval(tick, intervalMs);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return {
    stop: () => {
      if (timer) clearInterval(timer);
    },
  };
}
