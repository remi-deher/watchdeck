import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * Fermeture d'une feuille au doigt.
 *
 * Sur telephone, une surface ancree en bas s'attend a se tirer vers le bas pour se
 * fermer. Son absence se remarque davantage qu'une transition ratee : on tire, rien ne
 * bouge, et il faut aller chercher la croix a l'autre bout de l'ecran.
 *
 * Le suivi est direct pendant le geste et seul le relachement est anime -- c'est ce qui
 * donne a la feuille un poids. Passe le tiers de sa hauteur, ou lancee assez vite, elle
 * part ; sinon elle se recolle.
 */

const SEUIL_PROPORTION = 1 / 3;
/** Au-dela de cette vitesse (px/ms), le geste vaut fermeture quelle que soit la distance. */
const SEUIL_VITESSE = 0.5;

export interface SheetDragOptions {
  /** Ferme la feuille. Appele une seule fois, a la fin du geste. */
  onClose: () => void;
  /** Le geste n'a lieu que si cette fonction le permet (mode compact, par exemple). */
  enabled?: () => boolean;
  /**
   * Selecteur de la poignee : seule zone d'ou le geste peut partir.
   *
   * Sans elle, le doigt tombait presque toujours dans une zone qui defile -- une feuille
   * est faite pour etre parcourue -- et le navigateur prenait la main avant nous : sur
   * iOS le geste ne demarrait tout simplement jamais. Une poignee, qui ne defile pas et
   * qui refuse le defilement natif, rend le depart sans ambiguite.
   */
  poignee?: string;
}

export function useSheetDrag(
  panelRef: Ref<HTMLElement | null>,
  openRef: Ref<boolean>,
  { onClose, enabled, poignee }: SheetDragOptions
): void {
  let depart: number | null = null;
  let departAt = 0;
  let distance = 0;
  let pointerId: number | null = null;

  /* La reference peut pointer un composant plutot qu'un element : la fiche media est
     posee dans une surface animee par `motion-v`, dont le `ref` rend l'instance. On
     resout donc dans les deux cas, sans quoi le geste n'avait rien a deplacer. */
  function panel(): HTMLElement | null {
    const valeur = panelRef.value as unknown as { $el?: unknown } | HTMLElement | null;
    if (!valeur) return null;
    if (valeur instanceof HTMLElement) return valeur;
    const el = (valeur as { $el?: unknown }).$el;
    return el instanceof HTMLElement ? el : null;
  }

  function poser(valeur: number): void {
    const el = panel();
    if (!el) return;
    el.style.transform = valeur ? `translateY(${valeur}px)` : '';
    // Le voile s'eclaircit a mesure qu'on tire : le geste doit se voir avant d'aboutir,
    // sinon on ne sait pas si la feuille va partir ou revenir.
    const voile = el.parentElement;
    if (voile?.classList.contains('drawer-backdrop')) {
      const hauteur = el.offsetHeight || 1;
      voile.style.opacity = valeur ? String(Math.max(0.25, 1 - valeur / hauteur)) : '';
    }
  }

  function relacher(): void {
    const el = panel();
    if (el) {
      el.classList.remove('is-dragging');
      poser(0);
    }
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (enabled && !enabled()) return;
    const el = panel();
    if (!el) return;
    const cible = event.target as HTMLElement | null;
    if (poignee && !cible?.closest(poignee)) return;
    // Un contenu deja defile garde la priorite : tirer vers le bas doit y remonter la
    // lecture, pas emporter la feuille. On remonte depuis le point touche, car la surface
    // qui defile n'est pas toujours le panneau lui-meme -- la fiche media, par exemple,
    // defile dans un conteneur interieur.
    for (let noeud = cible; noeud && noeud !== el.parentElement; noeud = noeud.parentElement) {
      if (noeud.scrollTop > 0) return;
    }
    // Ni sur un champ, ni sur une commande : le geste leur appartient.
    if (cible?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;

    depart = event.clientY;
    departAt = event.timeStamp;
    distance = 0;
    pointerId = event.pointerId;
    el.classList.add('is-dragging');
  }

  function onPointerMove(event: PointerEvent): void {
    if (depart === null || event.pointerId !== pointerId) return;
    const el = panel();
    if (!el) return;
    const delta = event.clientY - depart;
    if (delta <= 0) {
      // Vers le haut, on ne fait rien : la feuille ne grandit pas au-dela de sa place.
      distance = 0;
      poser(0);
      return;
    }
    distance = delta;
    poser(delta);
  }

  function onPointerUp(event: PointerEvent): void {
    if (depart === null || event.pointerId !== pointerId) return;
    const el = panel();
    const hauteur = el?.offsetHeight || 1;
    const duree = Math.max(1, event.timeStamp - departAt);
    const vitesse = distance / duree;
    const ferme = distance > hauteur * SEUIL_PROPORTION || vitesse > SEUIL_VITESSE;

    depart = null;
    pointerId = null;
    if (el) el.classList.remove('is-dragging');

    if (ferme) {
      // On laisse la transition de sortie faire le reste du chemin depuis la position
      // atteinte : remettre la feuille en place avant de la fermer donnerait un retour
      // en arriere au milieu du geste.
      onClose();
      // Le voile reprend sa valeur normale pour sa propre transition de sortie.
      const voile = el?.parentElement;
      if (voile?.classList.contains('drawer-backdrop')) voile.style.opacity = '';
    } else {
      poser(0);
    }
    distance = 0;
  }

  function brancher(el: HTMLElement): void {
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
  }

  function debrancher(el: HTMLElement): void {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);
  }

  let courant: HTMLElement | null = null;

  watch(
    [panelRef, openRef],
    ([el, open]) => {
      if (courant && courant !== el) {
        debrancher(courant);
        courant = null;
      }
      if (!open || !el) {
        if (courant) {
          debrancher(courant);
          courant = null;
        }
        return;
      }
      if (courant !== el) {
        brancher(el);
        courant = el;
      }
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    if (courant) debrancher(courant);
    courant = null;
    relacher();
  });
}
