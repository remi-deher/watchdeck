/* Les feuilles de style ne gardent pas de classes que plus aucun composant n'emploie : ni
   le compilateur ni knip ne lisent le SCSS, ce controle comble le trou. Une classe construite
   dynamiquement (`modal-size-${size}`, noms de transition) se declare dans DYNAMIQUES. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(SRC);
const styles = files.filter((file) => file.endsWith('.scss'));
const sources = files
  .filter((file) => /\.(vue|ts|js)$/.test(file) && !/\.spec\.(js|ts)$/.test(file))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

/** Classes dont le nom est assemble a l'execution ou fourni par une bibliotheque. */
const DYNAMIQUES = [
  /^modal-size-/, // ModalShell : `modal-size-${size}`
  /^save-bar-/, // <Transition name="save-bar">
  /^modal-fade-/, // <Transition name="modal-fade">
];

function classesOf(file) {
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...new Set([...text.matchAll(/(?<![\w)\]'"-])\.([a-z][\w-]*)/g)].map((match) => match[1]))];
}

describe('feuilles de style', () => {
  it('ne gardent aucune classe que le code n’emploie plus', () => {
    const inutiles = styles.flatMap((file) => classesOf(file)
      .filter((name) => !sources.includes(name) && !DYNAMIQUES.some((pattern) => pattern.test(name)))
      .map((name) => `${file.slice(SRC.length + 1)} : .${name}`));
    expect(inutiles).toEqual([]);
  });
});
