import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import {
  fermerSurfaceDuDessus,
  installerRetourDesSurfaces,
  surfacesOuvertes,
  useBackButtonClose,
} from './useBackButtonClose';

function mountSurface({ onClose = vi.fn(), isOpen = null } = {}) {
  const Comp = defineComponent({
    setup() {
      useBackButtonClose(isOpen, onClose);
      return () => h('div');
    },
  });
  const wrapper = mount(Comp, { attachTo: document.body });
  return { wrapper, onClose };
}

describe('useBackButtonClose', () => {
  it("n'ajoute aucune entree d'historique : les filtres choisis ne peuvent plus etre annules par un retour", async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const backSpy = vi.spyOn(window.history, 'back');
    const isOpen = ref(true);
    const { wrapper } = mountSurface({ isOpen });
    await nextTick();
    isOpen.value = false;
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pushSpy).not.toHaveBeenCalled();
    expect(backSpy).not.toHaveBeenCalled();
    wrapper.unmount();
    pushSpy.mockRestore();
    backSpy.mockRestore();
  });

  it('empile les surfaces et referme la plus recente en premier', async () => {
    const premiere = mountSurface();
    const seconde = mountSurface();
    await nextTick();
    expect(surfacesOuvertes()).toBe(2);

    expect(fermerSurfaceDuDessus()).toBe(true);
    expect(seconde.onClose).toHaveBeenCalledTimes(1);
    expect(premiere.onClose).not.toHaveBeenCalled();

    seconde.wrapper.unmount();
    premiere.wrapper.unmount();
    expect(surfacesOuvertes()).toBe(0);
    expect(fermerSurfaceDuDessus()).toBe(false);
  });

  it('se retire de la pile a la fermeture comme au demontage', async () => {
    const isOpen = ref(true);
    const { wrapper } = mountSurface({ isOpen });
    await nextTick();
    expect(surfacesOuvertes()).toBe(1);
    isOpen.value = false;
    await nextTick();
    expect(surfacesOuvertes()).toBe(0);
    isOpen.value = true;
    await nextTick();
    wrapper.unmount();
    expect(surfacesOuvertes()).toBe(0);
  });
});

describe('installerRetourDesSurfaces', () => {
  async function routeur() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
    });
    // Comme dans l'application : branche a la creation, avant la premiere navigation.
    installerRetourDesSurfaces(router);
    await router.push('/a');
    await router.push('/b');
    return router;
  }

  /* Un retour du routeur passe par son historique (`history.listen`), comme le geste
     retour du navigateur ; il se termine au tour suivant. */
  async function reculer(router) {
    router.back();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  it('un retour avec une surface ouverte la ferme et reste sur la page', async () => {
    const router = await routeur();
    const { wrapper, onClose } = mountSurface();
    await nextTick();

    await reculer(router);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/b');
    wrapper.unmount();
  });

  it('sans surface ouverte, le retour navigue normalement', async () => {
    const router = await routeur();
    await reculer(router);
    expect(router.currentRoute.value.path).toBe('/a');
  });

  it("une navigation qui n'est pas un retour n'est jamais bloquee par une surface", async () => {
    const router = await routeur();
    const { wrapper, onClose } = mountSurface();
    await nextTick();
    await router.push('/c');
    expect(router.currentRoute.value.path).toBe('/c');
    expect(onClose).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
