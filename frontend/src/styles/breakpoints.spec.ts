import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHELL_EXPANDED, SHELL_MEDIUM, shellModeForWidth } from './breakpoints';

/**
 * Les seuils du shell existent des deux cotes : en SCSS pour la mise en forme, en
 * TypeScript parce que le shell monte un composant different par mode. C'est la seule
 * duplication assumee du systeme, et elle n'est sans danger que tant qu'un test la
 * surveille : divergentes, les deux sources produiraient une bande de largeurs ou le
 * dock est affiche par le CSS pendant que le JS a deja monte le rail.
 */
function scssBreakpoint(name: string): number {
  const source = readFileSync(
    resolve(process.cwd(), 'frontend/src/styles/foundations/_breakpoints.scss'),
    'utf8'
  );
  const line = source
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(name + ':'));
  const value = line && /([0-9]+)px/.exec(line);
  if (!value) throw new Error(`Seuil ${name} absent de _breakpoints.scss`);
  return Number(value[1]);
}

describe('seuils du shell', () => {
  it('declare les memes valeurs en SCSS et en TypeScript', () => {
    expect(scssBreakpoint('shell-medium')).toBe(SHELL_MEDIUM);
    expect(scssBreakpoint('shell-expanded')).toBe(SHELL_EXPANDED);
  });

  it('classe chaque largeur dans un seul mode', () => {
    expect(shellModeForWidth(SHELL_MEDIUM - 1)).toBe('compact');
    expect(shellModeForWidth(SHELL_MEDIUM)).toBe('medium');
    expect(shellModeForWidth(SHELL_EXPANDED - 1)).toBe('medium');
    expect(shellModeForWidth(SHELL_EXPANDED)).toBe('expanded');
  });
});
