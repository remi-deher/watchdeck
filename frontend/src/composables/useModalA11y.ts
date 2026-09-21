import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function focusableChildren(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null
  );
}

const HISTORY_MARKER = '__modalOpen';

/* Surfaces dont l'ecouteur `popstate` est actif.
 *
 * Une surface qui se ferme consomme l'entree d'historique qu'elle avait ajoutee, pour que
 * le geste « retour » la referme au lieu de quitter la page. Mais reculer declenche une
 * navigation, et la navigation emporte tout ce qui vient de s'ouvrir : annuler une demande
 * enchaine le choix du motif puis la confirmation, et cette derniere disparaissait une
 * seconde apres etre apparue -- l'action etait abandonnee sans un mot, sans que rien ne
 * soit envoye au serveur. On ne recule donc que si personne n'a pris la releve.
 *
 * La decision attend un tour complet de boucle d'evenements, et non une simple
 * micro-tache : la surface suivante n'arrive qu'au bout d'une chaine de promesses -- le
 * motif est choisi, la promesse resolue, l'action reprend, la confirmation s'ouvre au
 * rendu d'apres. Une micro-tache concluait avant tout cela, et reculait quand meme. */
let listeningSurfaces = 0;

/**
 * @param panelRef Ref sur l'élément racine de la modale (aside/div), doit porter tabindex="-1".
 * @param isOpenRef Ref booléenne si le composant reste monté avec un v-if interne ; null si le composant n'est monté que pendant l'ouverture.
 * @param onClose Appelé sur Échap.
 * @param options.initialFocus Sélecteur CSS de l'élément à focaliser à l'ouverture.
 *   Par défaut le premier élément focusable, ce qui convient aux dialogues classiques ;
 *   une palette ou un formulaire veut son champ de saisie plutôt que la croix de
 *   fermeture, et le préciser ici évite de courir après le focus depuis l'appelant.
 */
export function useModalA11y(
  panelRef: Ref<HTMLElement | null>,
  isOpenRef: Ref<boolean> | null | undefined,
  onClose: () => void,
  options: { initialFocus?: string; trapFocus?: boolean } = {}
): void {
  let previouslyFocused: HTMLElement | null = null;
  let dismissedByBackButton = false;
  let historyToken: string | null = null;
  let historyHref: string | null = null;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    // Le piege a focus n'a de sens que pour une surface modale. Une surface ancree a son
    // declencheur -- le tiroir de filtres, qui laisse la barre vivante derriere lui --
    // doit au contraire laisser la tabulation en ressortir, sinon on ne peut plus
    // atteindre le bouton qui la referme.
    if (options.trapFocus === false) return;
    if (e.key !== 'Tab' || !panelRef.value) return;
    const focusable = focusableChildren(panelRef.value);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Le bouton/geste "retour" du systeme (Android, PWA) declenche un popstate plutot
  // qu'un evenement DOM classique. Sans ce handler, "retour" quitte la page entiere
  // au lieu de simplement fermer la modale ouverte par-dessus.
  function handlePopState() {
    dismissedByBackButton = true;
    onClose();
  }

  async function activate() {
    previouslyFocused = document.activeElement as HTMLElement | null;
    dismissedByBackButton = false;
    historyToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    document.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('popstate', handlePopState);
    listeningSurfaces += 1;
    history.pushState({ ...history.state, [HISTORY_MARKER]: historyToken }, '');
    historyHref = location.href;
    await nextTick();
    const panel = panelRef.value;
    if (!panel) return;
    const preferred = options.initialFocus
      ? panel.querySelector<HTMLElement>(options.initialFocus)
      : null;
    const target = preferred || focusableChildren(panel)[0] || panel;
    target.focus({ preventScroll: true });
  }

  function deactivate() {
    document.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('popstate', handlePopState);
    if (historyToken) listeningSurfaces = Math.max(0, listeningSurfaces - 1);
    // Fermeture explicite (croix, Echap, clic hors modale) : on consomme nous-memes
    // l'entree d'historique ajoutee a l'ouverture, sinon le premier "retour" de
    // l'utilisateur ne ferait que la re-annuler sans effet visible. On ne le fait
    // que si l'entree courante est bien la notre (jeton exact), pour ne jamais
    // reculer sur une navigation qui a deja eu lieu pour une autre raison.
    // ... et seulement si l'adresse est restee celle qu'on a marquee. Une page peut
    // republier son URL pendant que la surface est ouverte -- c'est ce que fait le
    // panneau de filtres, qui porte chaque choix dans la barre d'adresse. Le routeur
    // recopie l'etat courant, le jeton voyage donc jusqu'a la nouvelle entree, et
    // reculer ne consommait plus notre marque : cela annulait le filtre qu'on venait
    // d'appliquer. On revenait a la page d'avant, tous filtres perdus.
    if (
      !dismissedByBackButton &&
      historyToken &&
      history.state?.[HISTORY_MARKER] === historyToken &&
      location.href === historyHref
    ) {
      /* On ne recule pas tout de suite : une surface peut prendre la releve dans le meme
         cycle de rendu -- annuler une demande enchaine le choix du motif puis la
         confirmation. Reculer alors provoque une navigation, et la navigation emporte la
         surface qui venait de s'ouvrir : la confirmation disparaissait une seconde apres
         etre apparue, sans que rien ne soit envoye. Une micro-tache plus tard, on sait si
         quelqu'un a pris la suite ; si oui, on laisse l'entree dans la pile. Elle porte la
         meme adresse que la precedente, donc un « retour » de trop ne se voit pas, la ou
         une action abandonnee en silence, elle, se voit tout de suite. */
      setTimeout(() => {
        if (listeningSurfaces > 0) return;
        history.back();
      }, 0);
    }
    historyToken = null;
    historyHref = null;
    /* Rendre le focus a son point de depart, sauf si l'utilisateur l'a deja pose
       ailleurs lui-meme. Toucher le champ de recherche referme le tiroir de filtres :
       lui reprendre le focus pour le rendre au bouton « Filtres » annulait le geste --
       le clavier ne s'ouvrait pas, et l'on se retrouvait sur le bouton qu'on venait de
       quitter. Un focus reste dans le panneau, ou retombe sur <body> faute de mieux,
       n'exprime aucune intention : celui-la, on le ramene. */
    const actif = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const deplaceParLUtilisateur =
      Boolean(actif) && actif !== document.body && !panelRef.value?.contains(actif as Node);
    if (!deplaceParLUtilisateur && previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus({ preventScroll: true });
    }
    previouslyFocused = null;
  }

  if (isOpenRef) {
    watch(
      isOpenRef,
      (open) => {
        if (open) activate();
        else deactivate();
      },
      { immediate: true }
    );
  } else {
    activate();
  }

  onBeforeUnmount(deactivate);
}
