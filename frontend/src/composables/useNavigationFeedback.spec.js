import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { installerRetourDeNavigation, navigationEnCours, prechargerRoute } from './useNavigationFeedback';

const vide = { render: () => null };

function fabrique(chargeur) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: vide },
      { path: '/lente', component: chargeur },
    ],
  });
  installerRetourDeNavigation(router);
  return router;
}

describe('useNavigationFeedback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it("n'allume la barre qu'apres un court delai, et l'eteint a l'arrivee", async () => {
    let finir;
    const router = fabrique(() => new Promise((resolve) => { finir = () => resolve(vide); }));
    await router.push('/');
    const arrivee = router.push('/lente');
    await vi.advanceTimersByTimeAsync(50);
    expect(navigationEnCours.value).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(navigationEnCours.value).toBe(true);
    finir();
    await arrivee;
    expect(navigationEnCours.value).toBe(false);
  });

  it("une navigation rapide n'allume rien", async () => {
    const router = fabrique(() => Promise.resolve(vide));
    await router.push('/');
    await router.push('/lente');
    await vi.advanceTimersByTimeAsync(300);
    expect(navigationEnCours.value).toBe(false);
  });

  it("charge la vue d'avance, une seule fois", async () => {
    const chargeur = vi.fn(() => Promise.resolve(vide));
    const router = fabrique(chargeur);
    prechargerRoute(router, '/lente');
    prechargerRoute(router, '/lente');
    await vi.advanceTimersByTimeAsync(0);
    expect(chargeur).toHaveBeenCalledTimes(1);
  });

  it("garde l'entree touchee enfoncee pendant le chargement", async () => {
    let finir;
    const router = fabrique(() => new Promise((resolve) => { finir = () => resolve(vide); }));
    await router.push('/');
    document.body.innerHTML = '<a class="app-nav-link" href="/lente">Lente</a>';
    const lien = document.querySelector('a');
    lien.addEventListener('click', (event) => { event.preventDefault(); router.push('/lente'); });
    lien.click();
    await vi.advanceTimersByTimeAsync(100);
    expect(lien.hasAttribute('data-pending')).toBe(true);
    finir();
    await vi.advanceTimersByTimeAsync(0);
    expect(lien.hasAttribute('data-pending')).toBe(false);
  });
});
