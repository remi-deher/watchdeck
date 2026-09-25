import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/* Les couleurs vivent dans foundations/_tokens.scss, par theme. Une couleur ecrite en
   dur ailleurs reste la meme en sombre et en clair -- c'est ainsi que des textes blancs
   se retrouvaient sur fond blanc. Le compte ne peut que baisser : on convertit les
   restes au fil de l'eau, et toute nouvelle couleur passe par une variable. Les voiles
   poses sur les affiches et bannieres (texte blanc sur image) sont legitimes. */
const PLAFOND = 135;
const COULEUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g;

function fichiers(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return fichiers(path);
    return /\.(vue|scss)$/.test(path) ? [path] : [];
  });
}

function styles(source, file) {
  if (file.endsWith('.scss')) return source;
  return (source.match(/<style[\s\S]*?<\/style>/g) || []).join('\n');
}

describe('couleurs du theme', () => {
  it(`au plus ${PLAFOND} couleurs en dur hors des tokens`, () => {
    const racine = join(__dirname, '..');
    const parFichier = fichiers(racine)
      .filter((file) => !file.endsWith('_tokens.scss'))
      .map((file) => [relative(racine, file), (styles(readFileSync(file, 'utf8'), file).match(COULEUR) || []).length])
      .filter(([, n]) => n > 0);
    const total = parFichier.reduce((somme, [, n]) => somme + n, 0);
    expect(total, JSON.stringify(parFichier.sort((a, b) => b[1] - a[1]).slice(0, 10))).toBeLessThanOrEqual(PLAFOND);
  });
});
