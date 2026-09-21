// jsdom ne calcule jamais de layout : `el.offsetParent` reste toujours `null`, ce que
// useModalA11y utilise pour ignorer les elements caches. On le simule explicitement sur
// les elements qu'on veut traiter comme visibles, sans quoi focusableChildren() renverrait
// systematiquement un tableau vide et le piege de focus semblerait ne jamais fonctionner.
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { useModalA11y } from './useModalA11y';

function markVisible(el) {
  Object.defineProperty(el, 'offsetParent', { get: () => document.body, configurable: true });
  return el;
}

function mountModal({ onClose = vi.fn(), isOpen = null } = {}) {
  const isOpenRef = isOpen;
  const Comp = defineComponent({
    setup() {
      const panelRef = ref(null);
      useModalA11y(panelRef, isOpenRef, onClose);
      return () =>
        h('div', { ref: panelRef, tabindex: '-1' }, [
          h('button', { id: 'first' }, 'Annuler'),
          h('button', { id: 'last' }, 'Confirmer'),
        ]);
    },
  });
  const wrapper = mount(Comp, { attachTo: document.body });
  const first = wrapper.find('#first').element;
  const last = wrapper.find('#last').element;
  markVisible(wrapper.element);
  markVisible(first);
  markVisible(last);
  return { wrapper, onClose, first, last };
}

function pressKey(key, opts = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  document.dispatchEvent(event);
  return event;
}

describe('useModalA11y', () => {
  it('appelle onClose sur Echap', async () => {
    const { wrapper, onClose } = mountModal();
    await nextTick();

    pressKey('Escape');

    expect(onClose).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('stoppe la propagation d\'Echap (ne doit pas remonter a un handler global de la page)', async () => {
    const { wrapper } = mountModal();
    await nextTick();

    const outerHandler = vi.fn();
    window.addEventListener('keydown', outerHandler);
    pressKey('Escape');
    window.removeEventListener('keydown', outerHandler);

    expect(outerHandler).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('boucle Tab du dernier element vers le premier', async () => {
    const { wrapper, last, first } = mountModal();
    await nextTick();
    last.focus();
    expect(document.activeElement).toBe(last);

    const event = pressKey('Tab');

    expect(document.activeElement).toBe(first);
    expect(event.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('boucle Shift+Tab du premier element vers le dernier', async () => {
    const { wrapper, last, first } = mountModal();
    await nextTick();
    first.focus();
    expect(document.activeElement).toBe(first);

    const event = pressKey('Tab', { shiftKey: true });

    expect(document.activeElement).toBe(last);
    expect(event.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('restaure le focus precedent a la fermeture (isOpenRef -> false)', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const isOpenRef = ref(true);
    const { wrapper } = mountModal({ isOpen: isOpenRef });
    await nextTick();
    expect(document.activeElement).not.toBe(trigger);

    isOpenRef.value = false;
    await nextTick();

    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
    trigger.remove();
  });

  it('focus automatiquement le premier element interactif a l\'ouverture', async () => {
    const { wrapper, first } = mountModal();
    await nextTick();

    expect(document.activeElement).toBe(first);
    wrapper.unmount();
  });

  // Ces deux tests espionnent l'API History plutot que de s'appuyer sur une vraie
  // navigation jsdom : history.back() n'y declenche popstate que de facon
  // asynchrone/non fiable d'un test a l'autre, ce qui rendait l'etat observe
  // dependant de l'ordre d'execution des tests precedents.
  it('ferme sur le bouton/geste retour du systeme (popstate) sans re-naviguer', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { wrapper, onClose } = mountModal();
    await nextTick();

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy.mock.calls[0][0]).toHaveProperty('__modalOpen');

    window.dispatchEvent(new PopStateEvent('popstate'));

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

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    w1.unmount();
    w2.unmount();
    backSpy.mockRestore();
  });
});
