import { describe, expect, it } from 'vitest';
import { readPageSearchHistory, rememberPageSearch } from './pageSearchHistory';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('pageSearchHistory', () => {
  it('isole, déduplique et borne les recherches de chaque contexte', () => {
    const storage = memoryStorage();
    for (const query of ['Dune', 'Alien', 'Heat', 'Arrival', 'Her', 'Dune']) {
      rememberPageSearch('Explorer', query, storage);
    }
    rememberPageSearch('Bibliothèque', 'Foundation', storage);

    expect(readPageSearchHistory('Explorer', storage)).toEqual(['Dune', 'Her', 'Arrival', 'Heat', 'Alien']);
    expect(readPageSearchHistory('Bibliothèque', storage)).toEqual(['Foundation']);
  });

  it('ignore les saisies trop courtes et les données corrompues', () => {
    const storage = memoryStorage({ 'watchdeck:page-search:explorer': '{' });
    expect(rememberPageSearch('Explorer', ' a ', storage)).toEqual([]);
  });
});
