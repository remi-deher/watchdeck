import { onBeforeUnmount, watch, type Ref } from 'vue';

let activeLocks = 0;

function syncBody(): void {
  if (typeof document !== 'undefined') document.body.classList.toggle('modal-open', activeLocks > 0);
}

export function useBodyScrollLock(open?: Ref<boolean> | null): void {
  let locked = false;

  function setLocked(next: boolean): void {
    if (next === locked) return;
    locked = next;
    activeLocks = Math.max(0, activeLocks + (next ? 1 : -1));
    syncBody();
  }

  if (open) watch(open, setLocked, { immediate: true });
  else setLocked(true);

  onBeforeUnmount(() => setLocked(false));
}
