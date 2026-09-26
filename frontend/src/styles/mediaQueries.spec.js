import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/* Les points de rupture vivent dans foundations/_breakpoints.scss et passent par les
   mixins `bp.from`, `bp.until` et `bp.between`. Un seuil ecrit en pixels ailleurs
   finit toujours par diverger : l'application en comptait dix-neuf differents, dont
   neuf absents de la liste officielle, et 640px valait tantot 640, tantot 639.98.

   Deux regles :
   - les composants partages (ui, layout) n'ont droit a aucun seuil local ;
   - ailleurs, les seuils restants sont des bornes pilotees par le contenu (une grille
     de carte qui passe sur une colonne sous 480px, un calendrier qui defile sous
     900px). Leur nombre ne peut que baisser : ceux de 900 a 1150px dependent de la
     largeur du contenu plutot que de la fenetre, et gagneraient a devenir des
     container queries. Les requetes de hauteur (paysage) ne sont pas concernees. */
const PLAFOND = 33;
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
  it('aucun seuil en pixels dans les composants partages', () => {
    const partages = seuilsParFichier().filter(([file]) => PARTAGES.some((dossier) => file.startsWith(dossier)));
    expect(partages).toEqual([]);
  });

  it(`au plus ${PLAFOND} seuils locaux en pixels hors des mixins`, () => {
    const parFichier = seuilsParFichier();
    const total = parFichier.reduce((somme, [, n]) => somme + n, 0);
    expect(total, JSON.stringify(parFichier.sort((a, b) => b[1] - a[1]).slice(0, 10))).toBeLessThanOrEqual(PLAFOND);
  });
});
