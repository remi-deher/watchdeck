import { describe, expect, it, vi } from 'vitest';
import { updateVisualViewport } from './useVisualViewport';

describe('updateVisualViewport', () => {
  it('publie le viewport visuel et détecte un clavier qui masque le bas', () => {
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('visualViewport', { height: 500, offsetTop: 0, offsetLeft: 4, scale: 1 });
    updateVisualViewport();
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-height')).toBe('500px');
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('300px');
    expect(document.documentElement.hasAttribute('data-keyboard-open')).toBe(true);
    vi.unstubAllGlobals();
  });

  it('ignore les variations causées par le zoom', () => {
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('visualViewport', { height: 500, offsetTop: 0, offsetLeft: 0, scale: 2 });
    updateVisualViewport();
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('0px');
    expect(document.documentElement.hasAttribute('data-keyboard-open')).toBe(false);
    vi.unstubAllGlobals();
  });
});
