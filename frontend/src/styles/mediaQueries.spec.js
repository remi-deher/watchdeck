import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/* Les points de rupture vivent dans foundations/_breakpoints.scss et passent par les
   mixins `bp.from`, `bp.until` et `bp.between`. Un seuil ecrit en pixels ailleurs
   finit toujours par diverger : l'application en comptait dix-neuf differents, dont
   neuf absents de la liste officielle, et 640px valait tantot 640, tantot 639.98.

   Une borne pilotee par le contenu (une grille de carte qui passe sur une colonne) ne
   depend pas de la fenetre mais de la place du composant : elle s'ecrit en container
   query, sur l'un des trois conteneurs nommes -- `page` (.app-page), `sheet`
   (.sheet-page) ou `panel` (.modal-panel). Les requetes de hauteur (paysage) ne sont
   pas concernees. */
const PLAFOND = 0;
const SEUIL = /@media[^{]*\bwidth\b[^{]*\d+(\.\d+)?px/g;
const FONDATIONS = /foundations[\\/]_(breakpoints|motion)\.scss$/;
const PARTAGES = ['components' + sep + 'ui' + sep, 'components' + sep + 'layout' + sep];

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

function seuilsParFichier() {
  const racine = join(__dirname, '..');
  return fichiers(racine)
    .filter((file) => !FONDATIONS.test(file))
    .map((file) => [relative(racine, file), (styles(readFileSync(file, 'utf8'), file).match(SEUIL) || []).length])
    .filter(([, n]) => n > 0);
}

describe('points de rupture', () => {
  it('chaque container query nomme son conteneur', () => {
    // Sans nom, la requete vise le conteneur le plus proche : ajouter un conteneur plus
    // haut dans l'arbre en change silencieusement la cible.
    const racine = join(__dirname, '..');
    const anonymes = fichiers(racine)
      .map((file) => [relative(racine, file), (styles(readFileSync(file, 'utf8'), file).match(/@container\s*\(/g) || []).length])
      .filter(([, n]) => n > 0);
    expect(anonymes).toEqual([]);
  });

  it('aucun seuil en pixels dans les composants partages', () => {
    const partages = seuilsParFichier().filter(([file]) => PARTAGES.some((dossier) => file.startsWith(dossier)));
    expect(partages).toEqual([]);
  });

  it('aucun seuil de fenetre en pixels hors des mixins', () => {
    const parFichier = seuilsParFichier();
    const total = parFichier.reduce((somme, [, n]) => somme + n, 0);
    expect(total, JSON.stringify(parFichier.sort((a, b) => b[1] - a[1]).slice(0, 10))).toBeLessThanOrEqual(PLAFOND);
  });
});
