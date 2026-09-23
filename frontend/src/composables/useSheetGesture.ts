import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * Fermer une feuille en la tirant vers le bas, depuis n'importe ou dans son contenu.
 *
 * C'est le geste des feuilles d'iOS. Tant que le contenu n'est pas tout en haut, glisser
 * vers le bas le fait simplement remonter. Arrive en haut, on s'arrete : c'est un
 * NOUVEAU glissement, parti de la, qui emporte la feuille. Un lancer dont l'elan atteint
 * le haut ne la ferme donc jamais -- il n'y a pas de relais au milieu d'un geste.
 *
 * Pendant le geste, la feuille suit le doigt a l'identique, et ne resiste qu'une fois
 * bien descendue ; le voile s'eclaircit a mesure. Au relachement, elle part si on l'a
 * tiree au-dela du quart de sa hauteur ou lancee assez vite, en gardant la vitesse du
 * doigt ; sinon elle revient a sa place. Ces deux fins sont des transitions CSS : Safari
 * les confie au GPU, la ou un ressort pilote en script saccadait des que le fil
 * principal travaillait.
 *
 * Le tactile passe par `touchmove` non passif plutot que par les evenements de pointeur :
 * c'est le seul moyen, sur iOS, de reprendre au navigateur un glissement qu'il
 * considere comme un defilement. La souris, elle, ne part que de la poignee.
 */

/** Distance a parcourir avant de trancher entre defilement et geste de fermeture. */
const SEUIL_DECISION = 8;
const SEUIL_PROPORTION = 0.25;
/** px/ms : au-dela, un lancer vers le bas ferme quelle que soit la distance. */
const SEUIL_VITESSE = 0.55;
/** Part de la hauteur suivie a l'identique, avant que la feuille ne resiste. */
const PART_LIBRE = 0.6;
const RESISTANCE = 0.35;

export interface SheetGestureOptions {
  /** Ferme la feuille, une fois qu'elle a quitte l'ecran. */
  onClose: () => void;
  /** Le geste n'a lieu que si cette fonction le permet (mode compact, occupation...). */
  enabled?: () => boolean;
  /** Voile a eclaircir pendant le geste. Par defaut : le parent du panneau. */
  voile?: () => HTMLElement | null;
  /** Poignee d'ou peut partir un glissement a la souris. */
  poignee?: string;
}

interface Echantillon { t: number; y: number }

function resoudre(valeur: unknown): HTMLElement | null {
  if (!valeur) return null;
  if (valeur instanceof HTMLElement) return valeur;
  const el = (valeur as { $el?: unknown }).$el;
  return el instanceof HTMLElement ? el : null;
}

/** Position de la feuille pour un doigt descendu de `delta` pixels. */
export function positionPourDelta(delta: number, hauteur: number): number {
  if (delta <= 0) return 0;
  const libre = hauteur * PART_LIBRE;
  return delta <= libre ? delta : libre + (delta - libre) * RESISTANCE;
}

/** Decide, au relachement, si la feuille part ou revient. */
export function doitFermer(position: number, vitesse: number, hauteur: number): boolean {
  if (vitesse < -0.2) return false; // relancee vers le haut : on revient
  return position > hauteur * SEUIL_PROPORTION || (vitesse > SEUIL_VITESSE && position > 16);
}

function mouvementReduit(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function useSheetGesture(
  panelRef: Ref<unknown>,
  openRef: Ref<boolean>,
  { onClose, enabled, voile, poignee }: SheetGestureOptions,
): void {
  let departY = 0;
  let departX = 0;
  let mode: 'attente' | 'geste' | 'defilement' | null = null;
  let position = 0;
  let echantillons: Echantillon[] = [];
  let finTransition: (() => void) | null = null;
  let fermee = false;

  const panel = () => resoudre(panelRef.value);
  const leVoile = () => (voile ? voile() : panel()?.parentElement ?? null);

  function poser(y: number): void {
    const el = panel();
    if (!el) return;
    position = y;
    el.style.transform = y ? `translate3d(0, ${y}px, 0)` : '';
    // Le voile s'eclaircit a mesure : le geste doit se voir avant d'aboutir. On passe
    // par une variable plutot que par l'opacite, qui estomperait aussi la feuille posee
    // dedans, et que motion-v reprendrait a la fermeture.
    const v = leVoile();
    if (v) {
      if (y) v.style.setProperty('--sheet-progress', String(Math.min(1, y / (el.offsetHeight || 1))));
      else v.style.removeProperty('--sheet-progress');
    }
  }

  function vitesse(): number {
    const recents = echantillons.filter((e) => echantillons.at(-1)!.t - e.t < 90);
    if (recents.length < 2) return 0;
    const a = recents[0];
    const b = recents.at(-1)!;
    return (b.y - a.y) / Math.max(1, b.t - a.t);
  }

  /** Le glissement part-il d'un contenu deja en haut ? */
  function contenuEnHaut(cible: HTMLElement | null, el: HTMLElement): boolean {
    for (let n = cible; n && n !== el.parentElement; n = n.parentElement) {
      if (n.scrollTop > 0) return false;
    }
    return true;
  }

  /** Anime la feuille jusqu'a `y` par une transition CSS, puis appelle `fin`. */
  function glisserVers(y: number, duree: number, courbe: string, fin?: () => void): void {
    const el = panel();
    if (!el) { fin?.(); return; }
    const v = leVoile();
    el.style.transition = `transform ${duree}ms ${courbe}`;
    if (v) v.style.transition = `background-color ${duree}ms ${courbe}`;
    let fait = false;
    const achever = () => {
      if (fait) return;
      fait = true;
      el.removeEventListener('transitionend', achever);
      el.style.transition = '';
      if (v) v.style.transition = '';
      finTransition = null;
      fin?.();
    };
    finTransition = achever;
    el.addEventListener('transitionend', achever);
    setTimeout(achever, duree + 80); // filet : un transitionend qui ne vient jamais
    poser(y);
  }

  function commencer(x: number, y: number, t: number): void {
    // Un doigt qui reprend une feuille en mouvement l'arrete ou elle est.
    if (finTransition) {
      const el = panel();
      const courant = el ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 : 0;
      finTransition();
      poser(courant);
    }
    departX = x;
    departY = y - position; // reprendre une feuille encore en mouvement sans a-coup
    echantillons = [{ t, y: position }];
    mode = 'attente';
  }

  function suivre(x: number, y: number, t: number): boolean {
    const el = panel();
    if (!el || !mode || mode === 'defilement') return false;
    const dy = y - departY;
    if (mode === 'attente') {
      const dx = x - departX;
      if (Math.abs(dy) < SEUIL_DECISION && Math.abs(dx) < SEUIL_DECISION) return false;
      // Vers le haut ou de cote : c'est un defilement, il appartient au contenu.
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { mode = 'defilement'; return false; }
      mode = 'geste';
      departY += SEUIL_DECISION; // pas de saut : la feuille part de sous le doigt
      el.classList.add('is-dragging');
    }
    const y2 = positionPourDelta(y - departY, el.offsetHeight || window.innerHeight);
    echantillons.push({ t, y: y2 });
    if (echantillons.length > 8) echantillons.shift();
    poser(y2);
    return true;
  }

  function terminer(): void {
    const el = panel();
    const etait = mode;
    mode = null;
    if (!el || etait !== 'geste') return;
    el.classList.remove('is-dragging');
    const hauteur = el.offsetHeight || window.innerHeight;
    const v = vitesse();
    if (doitFermer(position, v, hauteur)) {
      fermee = true;
      if (mouvementReduit()) { onClose(); return; }
      // Plus le lancer est vif, plus la feuille part vite : elle garde l'allure du doigt.
      const restant = hauteur + 40 - position;
      const duree = Math.round(Math.min(280, Math.max(140, v > 0 ? restant / v : 280)));
      glisserVers(hauteur + 40, duree, 'cubic-bezier(0.2, 0.6, 0.4, 1)', onClose);
      return;
    }
    if (mouvementReduit()) { poser(0); return; }
    glisserVers(0, 260, 'cubic-bezier(0.16, 1, 0.3, 1)');
  }

  // ── Tactile ────────────────────────────────────────────────────────────────
  function onTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 1 || fermee || (enabled && !enabled())) { mode = null; return; }
    const el = panel();
    const cible = event.target as HTMLElement | null;
    if (!el || !contenuEnHaut(cible, el)) { mode = 'defilement'; return; }
    if (cible?.closest('input, textarea, select, [contenteditable="true"], .no-sheet-gesture')) { mode = null; return; }
    const t = event.touches[0];
    commencer(t.clientX, t.clientY, event.timeStamp);
  }

  function onTouchMove(event: TouchEvent): void {
    const t = event.touches[0];
    if (!t) return;
    if (suivre(t.clientX, t.clientY, event.timeStamp) && event.cancelable) event.preventDefault();
  }

  // ── Souris : depuis la poignee seulement ───────────────────────────────────
  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || event.button !== 0 || fermee || (enabled && !enabled())) return;
    if (!poignee || !(event.target as HTMLElement | null)?.closest(poignee)) return;
    commencer(event.clientX, event.clientY, event.timeStamp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }
  function onPointerMove(event: PointerEvent): void { suivre(event.clientX, event.clientY, event.timeStamp); }
  function onPointerUp(): void {
    window.removeEventListener('pointermove', onPointerMove);
    terminer();
  }

  function brancher(el: HTMLElement): void {
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', terminer);
    el.addEventListener('touchcancel', terminer);
    el.addEventListener('pointerdown', onPointerDown);
  }
  function debrancher(el: HTMLElement): void {
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', terminer);
    el.removeEventListener('touchcancel', terminer);
    el.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
  }

  let courant: HTMLElement | null = null;
  watch(
    [panelRef, openRef],
    ([, open]) => {
      const el = panel();
      if (courant && (courant !== el || !open)) { debrancher(courant); courant = null; }
      if (open && el && courant !== el) {
        fermee = false;
        position = 0;
        brancher(el);
        courant = el;
      }
    },
    { immediate: true, flush: 'post' },
  );

  onBeforeUnmount(() => {
    finTransition = null;
    if (courant) debrancher(courant);
    courant = null;
  });
}
