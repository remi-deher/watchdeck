import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { readFileSync } from 'node:fs';

describe('palettes et apparence', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('restaure la palette et conserve le choix lors de la bascule clair/sombre', async () => {
    localStorage.setItem('watchdeck:palette', 'mint');
    localStorage.setItem('watchdeck:theme', 'dark');
    const { useTheme } = await import('./useTheme');
    const theme = useTheme();
    expect(document.documentElement.dataset.palette).toBe('mint');
    expect(document.documentElement.dataset.theme).toBe('dark');
    theme.toggle();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(theme.palette.value).toBe('mint');
    theme.palette.value = 'ocean';
    expect(document.documentElement.dataset.palette).toBe('ocean');
    await nextTick();
    expect(localStorage.getItem('watchdeck:palette')).toBe('ocean');
  });

  it('revient à Cinéma pour une palette inconnue', async () => {
    localStorage.setItem('watchdeck:palette', 'ancienne-palette');
    const { useTheme } = await import('./useTheme');
    expect(useTheme().palette.value).toBe('cinema');
    expect(document.documentElement.dataset.palette).toBe('cinema');
  });

  it('restaure la même palette avant le premier rendu', async () => {
    const { PALETTE_OPTIONS } = await import('./useTheme');
    const html = readFileSync('index.html', 'utf8');
    const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    document.head.innerHTML = '<meta name="theme-color" content="">';
    for (const palette of PALETTE_OPTIONS) {
      localStorage.setItem('watchdeck:palette', palette.value);
      localStorage.setItem('watchdeck:theme', 'dark');
      new Function(bootstrap)();
      expect(document.documentElement.dataset.palette).toBe(palette.value);
      expect(document.documentElement.dataset.theme).toBe('dark');
    }
  });
});
