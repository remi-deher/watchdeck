import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* `::size="14"` compile sans erreur ni avertissement de type : Vue y lit une liaison vers
   un attribut nomme « :size », que l'icone ignore -- elle reprend alors sa taille par
   defaut. Une substitution trop large l'avait introduit dans 13 composants ; rien d'autre
   ne l'aurait signale. */
function vueFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? vueFiles(path) : path.endsWith('.vue') ? [path] : [];
  });
}

describe('gabarits', () => {
  it("aucune liaison a double deux-points (`::prop`)", () => {
    const fautifs = vueFiles(join(__dirname, '..'))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        const gabarit = source.slice(0, Math.max(0, source.indexOf('<script')) || source.length);
        return /\s::[a-z]/i.test(gabarit);
      });
    expect(fautifs).toEqual([]);
  });
});
