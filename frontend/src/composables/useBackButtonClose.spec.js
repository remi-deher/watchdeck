import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBackButtonClose } from './useBackButtonClose';

/* Tests repris de l'ancien `useModalA11y` : le focus est desormais l'affaire de Reka UI,
   mais le retour systeme, lui, reste a nous. */
function mountModal({ onClose = vi.fn(), isOpen = null } = {}) {
  const Comp = defineComponent({
    setup() {
      useBackButtonClose(isOpen, onClose);
      return () => h('div');
    },
  });
  const wrapper = mount(Comp, { attachTo: document.body });
  return { wrapper, onClose };
}

// La consommation de l'entree d'historique est differee d'un tour de boucle (le temps de
// savoir si une autre surface prend la releve). Sans ce drainage, le recul d'un test
// retombait dans le suivant et s'y faisait compter.
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe('useBackButtonClose', () => {
  it('ferme sur le bouton/geste retour du systeme (popstate) sans re-naviguer', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { wrapper, onClose } = mountModal();
    await nextTick();

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy.mock.calls[0][0]).toHaveProperty('__modalOpen');

    window.dispatchEvent(new PopStateEvent('popstate'));
    await Promise.resolve();

    expect(onClose).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    // Le retour a deja fait le travail de navigation : rappeler back() nous-memes
    // consommerait une entree d'historique en trop.
    expect(backSpy).not.toHaveBeenCalled();
    pushSpy.mockRestore();
    backSpy.mockRestore();
  });

  it('consomme sa propre entree d\'historique a la fermeture explicite (pas de retour fantome)', async () => {
    const backSpy = vi
      .spyOn(window.history, 'back')
      .mockImplementation(() => window.dispatchEvent(new PopStateEvent('popstate')));
    const isOpenRef = ref(true);
    const { wrapper } = mountModal({ isOpen: isOpenRef });
    await nextTick();

    isOpenRef.value = false;
    await nextTick();
    // Le recul attend un tour de boucle : une surface peut encore prendre la releve.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(backSpy).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    backSpy.mockRestore();
  });

  it("ne recule pas quand la page a republie son adresse pendant l'ouverture", async () => {
    // Le panneau de filtres porte chaque choix dans la barre d'adresse. Le routeur
    // recopie l'etat courant, donc notre jeton voyage jusqu'a la nouvelle entree :
    // reculer a la fermeture annulait le filtre qu'on venait d'appliquer et
    // ramenait a la page d'avant.
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const isOpenRef = ref(true);
    const { wrapper } = mountModal({ isOpen: isOpenRef });
    await nextTick();

    history.replaceState({ ...history.state }, '', '/discover/explore?availability=available');

    isOpenRef.value = false;
    await nextTick();

    expect(backSpy).not.toHaveBeenCalled();
    wrapper.unmount();
    backSpy.mockRestore();
  });

  it("ne referme pas une surface ouverte a la place de celle qui vient de se fermer", async () => {
    // Annuler une demande enchaine deux surfaces : le choix du motif, puis la
    // confirmation. La premiere consomme son entree d'historique en se fermant, et le
    // `popstate` qui en resulte tombait sur la seconde, qui le lisait comme un appui
    // sur « retour ». Elle repondait alors « non » a sa propre question : l'annulation
    // etait abandonnee sans un mot et plus aucun clic n'avait d'effet.
    // Le vrai `back()` est asynchrone : c'est ce decalage qui fait tomber l'evenement
    // sur la surface suivante, une fois celle-ci ouverte.
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      setTimeout(() => window.dispatchEvent(new PopStateEvent('popstate')), 0);
    });

    const premiere = ref(true);
    const { wrapper: w1 } = mountModal({ isOpen: premiere });
    await nextTick();

    const onClose = vi.fn();
    const seconde = ref(false);
    const { wrapper: w2 } = mountModal({ isOpen: seconde, onClose });

    // La premiere se ferme, la seconde s'ouvre dans la foulee -- l'ordre observe en
    // production : choisir le motif, puis confirmer.
    premiere.value = false;
    seconde.value = true;
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // La premiere renonce a reculer : la seconde a pris la releve, et la navigation
    // l'aurait emportee.
    expect(backSpy).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    w1.unmount();
    w2.unmount();
    backSpy.mockRestore();
  });
});
