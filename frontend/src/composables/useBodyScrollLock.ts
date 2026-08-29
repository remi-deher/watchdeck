import { onBeforeUnmount, watch, type Ref } from 'vue';

let activeLocks = 0;

function syncBody(): void {
  if (typeof document === 'undefined') return;
  const isLocked = activeLocks > 0;
  document.body.classList.toggle('modal-open', isLocked);
  // Le contenu de #app reste un frere du dialogue une fois celui-ci teleporte vers
  // <body> : le rendre inert empeche le curseur virtuel des lecteurs d'ecran et le
  // focus clavier d'atteindre l'arriere-plan pendant qu'une modale est ouverte.
  const app = document.getElementById('app');
  if (isLocked) app?.setAttribute('inert', '');
  else app?.removeAttribute('inert');
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
