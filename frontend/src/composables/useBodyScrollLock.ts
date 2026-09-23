import { onBeforeUnmount, watch, type Ref } from 'vue';

let activeLocks = 0;
let activeInerts = 0;

function syncBody(): void {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('modal-open', activeLocks > 0);
  document.documentElement.classList.toggle('modal-open', activeLocks > 0);
  // Le contenu de #app reste un frere du dialogue une fois celui-ci teleporte vers
  // <body> : le rendre inert empeche le curseur virtuel des lecteurs d'ecran et le
  // focus clavier d'atteindre l'arriere-plan pendant qu'une modale est ouverte.
  //
  // Compte a part du verrou de defilement : une surface peut vouloir figer le fond sans
  // le neutraliser. Le tiroir de filtres est dans ce cas -- il est ancre a son bouton,
  // qui doit rester atteignable pour le refermer, et la barre de recherche avec lui.
  const app = document.getElementById('app');
  if (activeInerts > 0) app?.setAttribute('inert', '');
  else app?.removeAttribute('inert');
}

export function useBodyScrollLock(
  open?: Ref<boolean> | null,
  options: { inertBackground?: boolean } = {}
): void {
  const { inertBackground = true } = options;
  let locked = false;

  function setLocked(next: boolean): void {
    if (next === locked) return;
    locked = next;
    const delta = next ? 1 : -1;
    activeLocks = Math.max(0, activeLocks + delta);
    if (inertBackground) activeInerts = Math.max(0, activeInerts + delta);
    syncBody();
  }

  if (open) watch(open, setLocked, { immediate: true });
  else setLocked(true);

  onBeforeUnmount(() => setLocked(false));
}
