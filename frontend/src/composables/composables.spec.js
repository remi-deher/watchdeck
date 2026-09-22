import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLatestRequest } from './useLatestRequest';

/** Monte un composant minimal pour disposer d'un contexte de cycle de vie. */
function withSetup(composable) {
  let result;
  const wrapper = mount({
    setup() {
      result = composable();
      return () => null;
    },
  });
  return { result, wrapper };
}

describe('useLatestRequest', () => {
  it('abandonne la requête précédente à chaque nouveau begin()', () => {
    const { result } = withSetup(useLatestRequest);
    const first = result.begin();
    expect(first.signal.aborted).toBe(false);

    const second = result.begin();
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  // Le point clé : une réponse peut revenir après l'abandon, ou deux chargements
  // concurrents dans le désordre. Seul le dernier doit pouvoir écrire dans l'état.
  it('ne reconnaît comme courante que la dernière demande', () => {
    const { result } = withSetup(useLatestRequest);
    const first = result.begin();
    expect(first.isCurrent()).toBe(true);

    const second = result.begin();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it('extend() garde le signal en cours mais prend un nouveau jeton', () => {
    const { result } = withSetup(useLatestRequest);
    const page1 = result.begin();
    const page2 = result.extend();

    // La page déjà demandée ne doit pas être annulée par « charger plus ».
    expect(page1.signal.aborted).toBe(false);
    expect(page2.signal).toBe(page1.signal);
    expect(page1.isCurrent()).toBe(false);
    expect(page2.isCurrent()).toBe(true);

    // …mais un rechargement complet survenu entre-temps invalide bien la pagination.
    const reload = result.begin();
    expect(page2.isCurrent()).toBe(false);
    expect(reload.isCurrent()).toBe(true);
  });

  it('abort() annule sans repartir, et le démontage annule aussi', () => {
    const { result, wrapper } = withSetup(useLatestRequest);
    const inflight = result.begin();
    result.abort();
    expect(inflight.signal.aborted).toBe(true);

    const { result: other, wrapper: otherWrapper } = withSetup(useLatestRequest);
    const pending = other.begin();
    otherWrapper.unmount();
    expect(pending.signal.aborted).toBe(true);
    wrapper.unmount();
  });

  it('reconnaît une AbortError', () => {
    const { result } = withSetup(useLatestRequest);
    expect(result.isAbort({ name: 'AbortError' })).toBe(true);
    expect(result.isAbort(new Error('réseau'))).toBe(false);
    expect(result.isAbort(undefined)).toBe(false);
  });
});

