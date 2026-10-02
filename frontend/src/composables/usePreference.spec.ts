import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { readPreference, usePreference } from './usePreference';

describe('usePreference', () => {
  beforeEach(() => localStorage.clear());

  it('fournit une valeur par défaut puis la persiste sous le préfixe commun', async () => {
    const value = usePreference('layout.mode', 'grid');
    expect(value.value).toBe('grid');
    value.value = 'list';
    await nextTick();
    expect(localStorage.getItem('watchdeck:layout.mode')).toBe('list');
  });

  it('migre puis supprime une ancienne clé', () => {
    localStorage.setItem('legacy.mode', 'list');
    expect(readPreference('layout.mode', 'grid', { legacyKeys: ['legacy.mode'] })).toBe('list');
    expect(localStorage.getItem('watchdeck:layout.mode')).toBe('list');
    expect(localStorage.getItem('legacy.mode')).toBeNull();
  });

  it('retombe sur le défaut si le JSON est invalide', () => {
    localStorage.setItem('watchdeck:columns', '{cassé');
    expect(readPreference('columns', { visible: [] })).toEqual({ visible: [] });
  });
});
