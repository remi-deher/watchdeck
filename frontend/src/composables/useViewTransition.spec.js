import { describe, expect, it, vi } from 'vitest';

import { posterElementFrom, withPosterTransition } from './useViewTransition';

function withStartViewTransition(impl) {
  const original = Object.getOwnPropertyDescriptor(document, 'startViewTransition');
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: impl, writable: true });
  return () => {
    if (original) Object.defineProperty(document, 'startViewTransition', original);
    else delete document.startViewTransition;
  };
}

describe('withPosterTransition', () => {
  it('navigue quand meme sans support du navigateur', async () => {
    // L'animation est une amelioration : sans elle, l'application doit rester utilisable.
    const naviguer = vi.fn();
    await withPosterTransition(document.createElement('div'), naviguer);
    expect(naviguer).toHaveBeenCalledTimes(1);
  });

  it('marque l’affiche pendant le passage, puis la libere', async () => {
    const affiche = document.createElement('div');
    let pendant = null;
    const restore = withStartViewTransition((cb) => {
      pendant = affiche.style.viewTransitionName;
      cb();
      return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    });
    try {
      await withPosterTransition(affiche, () => {});
      expect(pendant, 'le nom est pose avant le changement de page').toBe('media-poster');
      // Deux elements portant le meme nom au meme instant annulent la transition, et une
      // grille en contient vingt : le nom ne survit pas au passage.
      expect(affiche.style.viewTransitionName).toBe('');
    } finally {
      restore();
    }
  });

  it('libere l’affiche et le drapeau meme si la transition echoue', async () => {
    const affiche = document.createElement('div');
    const restore = withStartViewTransition((cb) => {
      cb();
      return {
        finished: Promise.reject(new Error('abandonnee')),
        ready: Promise.reject(new Error('abandonnee')),
        updateCallbackDone: Promise.resolve(),
      };
    });
    try {
      const naviguer = vi.fn();
      await withPosterTransition(affiche, naviguer);
      expect(naviguer, 'la navigation a bien eu lieu').toHaveBeenCalledTimes(1);
      expect(affiche.style.viewTransitionName).toBe('');
      expect(document.documentElement.hasAttribute('data-view-transition')).toBe(false);
    } finally {
      restore();
    }
  });

  it('vise le cadre de l’affiche, pas son image', () => {
    // Le cadre existe toujours, y compris pour un media sans affiche : marquer une image
    // qui n'a pas d'equivalent a l'arrivee la ferait disparaitre en vol.
    const shell = document.createElement('div');
    shell.className = 'poster-shell';
    const img = document.createElement('img');
    shell.appendChild(img);
    expect(posterElementFrom(img)).toBe(shell);
    expect(posterElementFrom(document.createElement('span'))).toBe(null);
  });
});
