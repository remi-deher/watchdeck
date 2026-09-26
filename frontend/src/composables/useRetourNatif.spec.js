import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { installerRetourNatif, retourNatif } from './useRetourNatif';

function popstate(hasUAVisualTransition) {
  const event = new PopStateEvent('popstate');
  Object.defineProperty(event, 'hasUAVisualTransition', { value: hasUAVisualTransition });
  window.dispatchEvent(event);
}

describe('useRetourNatif', () => {
  it("leve le drapeau quand Safari a deja anime le retour, puis le relache apres la navigation", async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });
    installerRetourNatif(router);
    await router.push('/a');

    popstate(true);
    expect(retourNatif.value).toBe(true);
    await router.push('/b');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(retourNatif.value).toBe(false);
  });

  it('reste baisse pour un retour que le navigateur n\'a pas anime', () => {
    popstate(false);
    expect(retourNatif.value).toBe(false);
    popstate(undefined);
    expect(retourNatif.value).toBe(false);
  });
});
