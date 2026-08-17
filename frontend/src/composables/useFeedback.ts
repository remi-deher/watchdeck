import { computed, onBeforeUnmount, ref } from 'vue';

export type FeedbackType = 'success' | 'error' | 'warning' | 'info';

export interface FeedbackOptions {
  initialMessage?: string;
  initialType?: FeedbackType;
  timeoutMs?: number;
}

export function useFeedback(options: FeedbackOptions = {}) {
  const message = ref(options.initialMessage || '');
  const type = ref<FeedbackType>(options.initialType || 'success');
  const visible = computed(() => Boolean(message.value));
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function show(nextMessage: unknown, nextType: FeedbackType = 'success'): void {
    message.value = nextMessage instanceof Error ? nextMessage.message : String(nextMessage || '');
    type.value = nextType;
    if (timeout) clearTimeout(timeout);
    if (options.timeoutMs && message.value) timeout = setTimeout(clear, options.timeoutMs);
  }

  function clear(): void {
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
    message.value = '';
  }
  function success(nextMessage: unknown): void { show(nextMessage, 'success'); }
  function error(nextMessage: unknown): void { show(nextMessage, 'error'); }
  function warning(nextMessage: unknown): void { show(nextMessage, 'warning'); }
  function info(nextMessage: unknown): void { show(nextMessage, 'info'); }

  onBeforeUnmount(clear);

  return { message, type, visible, show, clear, success, error, warning, info };
}
