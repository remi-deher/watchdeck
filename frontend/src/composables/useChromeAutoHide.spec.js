import { beforeEach, describe, expect, it } from 'vitest';
import { useChromeAutoHide } from './useChromeAutoHide';

/**
 * L'etat est volontairement partage entre la barre du haut et la rangee de sections :
 * ce sont deux surfaces flottantes empilees, et les voir se decider chacune de son cote
 * produisait exactement le defaut qu'on corrige ici (la rangee restait seule a l'ecran
 * apres le depart de la barre). Ces tests verrouillent donc le partage autant que la
 * lecture du sens de defilement.
 */
function scrollTo(y) {
  window.scrollY = y;
  window.dispatchEvent(new Event('scroll'));
}

describe('useChromeAutoHide', () => {
  beforeEach(() => {
    const { reveal, setHold } = useChromeAutoHide();
    setHold('test', false);
    setHold('autre', false);
    window.scrollY = 0;
    window.dispatchEvent(new Event('scroll'));
    reveal();
  });

  it('se masque en descendant et revient en remontant', () => {
    const { hidden } = useChromeAutoHide();

    scrollTo(200);
    expect(hidden.value, 'descendre au-dela du seuil doit masquer').toBe(true);

    scrollTo(150);
    expect(hidden.value, 'remonter doit ramener les surfaces').toBe(false);
  });

  it('ne masque rien tant qu’on est en haut de page', () => {
    const { hidden } = useChromeAutoHide();

    // Au-dessus du seuil de declenchement, un geste vers le bas ne doit rien masquer :
    // la barre ne flotte encore au-dessus de rien.
    scrollTo(20);
    expect(hidden.value).toBe(false);
    scrollTo(90);
    expect(hidden.value).toBe(false);
  });

  it('deux surfaces lisent le meme etat', () => {
    const barre = useChromeAutoHide();
    const sections = useChromeAutoHide();

    scrollTo(300);
    expect(barre.hidden.value).toBe(true);
    expect(sections.hidden.value).toBe(barre.hidden.value);
  });

  it('un verrou empeche le masquage jusqu’a sa levee', () => {
    const { hidden, setHold } = useChromeAutoHide();

    // Champ de recherche au focus : la barre disparaitrait sous les doigts.
    setHold('test', true);
    scrollTo(400);
    expect(hidden.value).toBe(false);

    setHold('test', false);
    scrollTo(600);
    expect(hidden.value).toBe(true);
  });

  it('le premier verrou leve ne decide pas pour les autres', () => {
    const { hidden, setHold } = useChromeAutoHide();

    setHold('test', true);
    setHold('autre', true);
    setHold('test', false);

    scrollTo(400);
    expect(hidden.value, 'il reste un verrou actif').toBe(false);

    setHold('autre', false);
    scrollTo(600);
    expect(hidden.value).toBe(true);
  });

  it('reveal() ramene les surfaces sans attendre un geste', () => {
    const { hidden, reveal } = useChromeAutoHide();

    scrollTo(400);
    expect(hidden.value).toBe(true);

    reveal();
    expect(hidden.value).toBe(false);
  });
});
