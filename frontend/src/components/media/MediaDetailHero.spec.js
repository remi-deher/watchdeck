import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import MediaDetailHero from './MediaDetailHero.vue';

describe('MediaDetailHero', () => {
  it('priorise le chargement de l’affiche principale avec une taille responsive', () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Inception',
          media_type: 'movie',
          poster_url: '/poster.jpg',
        },
      },
    });

    const image = wrapper.get('.mdh-poster img');
    expect(image.attributes('loading')).toBe('eager');
    expect(image.attributes('fetchpriority')).toBe('high');
    expect(image.attributes('sizes')).toContain('140px');
  });

  it('affiche le bouton Demander la série quand le média n’est pas disponible ni demandé', async () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Breaking Bad',
          media_type: 'show',
          year: 2008,
          available: false,
          in_library: false,
          requested: false,
        },
      },
    });

    const btn = wrapper.find('.mdh-request-btn');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain('Demander la série');

    await btn.trigger('click');
    expect(wrapper.emitted('request')).toHaveLength(1);
  });

  it('affiche le bouton Demander ce film pour un film non suivi', async () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Inception',
          media_type: 'movie',
          year: 2010,
          available: false,
          in_library: false,
          requested: false,
        },
      },
    });

    const btn = wrapper.find('.mdh-request-btn');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain('Demander ce film');

    await btn.trigger('click');
    expect(wrapper.emitted('request')).toHaveLength(1);
  });

  it('masque le bouton Demander quand le média est déjà dans Plex ou demandé', () => {
    const wrapperInPlex = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Inception',
          media_type: 'movie',
          in_library: true,
        },
      },
    });
    expect(wrapperInPlex.find('.mdh-request-btn').exists()).toBe(false);

    const wrapperRequested = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Inception',
          media_type: 'movie',
          requested: true,
          request_id: 12,
        },
      },
    });
    expect(wrapperRequested.find('.mdh-request-btn').exists()).toBe(false);
  });

  it('affiche le bouton Rechercher pour un film en bibliothèque si admin', () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Soulm8te',
          media_type: 'movie',
          in_library: true,
          library_id: 42,
        },
        admin: true,
      },
    });

    expect(wrapper.text()).toContain('Rechercher');
  });

  it('affiche le bouton Rechercher pour une série si admin et émet open-audio au clic', async () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Severance',
          media_type: 'show',
          in_library: true,
          library_id: 99,
        },
        admin: true,
      },
    });

    const btn = wrapper.findAll('.mdh-link').find(b => b.text().includes('Rechercher'));
    expect(btn).toBeDefined();
    await btn.trigger('click');
    expect(wrapper.emitted('open-audio')).toHaveLength(1);
  });

  it('masque les boutons de recherche pour les non-admins', () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: {
          title: 'Soulm8te',
          media_type: 'movie',
          in_library: true,
          library_id: 42,
        },
        admin: false,
      },
    });

    expect(wrapper.text()).not.toContain('Rechercher');
  });
  it('sort le retour du flux, pour qu’il ne descende pas avec le titre', () => {
    // La banniere ancre son contenu en bas, comme celle d'Explorer : un bouton reste
    // dans le flux se retrouverait au fond de l'image, sous l'affiche.
    const wrapper = mount(MediaDetailHero, { props: { detail: { title: 'Inception', media_type: 'movie' } } });

    const backdrop = wrapper.get('.mdh-backdrop');
    expect(backdrop.find(':scope > .mdh-back').exists()).toBe(true);
    expect(wrapper.find('.mdh-content .mdh-back').exists()).toBe(false);
  });
});

describe('cadre partagé avec la bannière d’Explorer', () => {
  /* jsdom n'applique pas les styles scopés d'un composant : on compare donc les
     déclarations à la source. C'est moins fort qu'une mesure, mais c'est le seul moyen
     de verrouiller « les deux cadres restent identiques » — et c'est précisément ce qui
     dérive quand on retouche l'un sans penser à l'autre. Les mesures, elles, sont
     vérifiées en e2e. */
  const lire = (chemin) => readFileSync(new URL(chemin, import.meta.url), 'utf8');
  const declaration = (css, bloc, propriete) => {
    const corps = css.slice(css.indexOf(bloc) + bloc.length);
    const regle = corps.slice(0, corps.indexOf('}'));
    // Sans expression reguliere : les antislashes se perdent trop facilement, et une
    // valeur peut tenir sur plusieurs lignes (deux degrades empiles).
    const debut = regle.indexOf(`${propriete}:`);
    if (debut < 0) return null;
    const valeur = regle.slice(debut + propriete.length + 1);
    return valeur.slice(0, valeur.indexOf(';')).trim().replace(/\s+/g, ' ');
  };

  const fiche = lire('./MediaDetailHero.vue');
  const banniere = lire('./MediaHeroBanner.vue');

  it('partage hauteur, rayon et bordure', () => {
    for (const propriete of ['min-height', 'border-radius', 'border']) {
      expect(declaration(fiche, '.mdh-backdrop {', propriete), propriete).toBe(
        declaration(banniere, '.media-hero-banner {', propriete)
      );
    }
  });

  it('partage le cadrage de l’image', () => {
    // La bannière peint l'image sur une couche dédiée, la fiche sur le conteneur : le
    // cadrage doit rester le même des deux côtés.
    expect(declaration(fiche, '.mdh-backdrop {', 'background-position')).toBe(
      declaration(banniere, '.hero-backdrop {', 'background-position')
    );
  });

  it('partage le double dégradé qui détache le texte', () => {
    // Un seul dégradé assombrissait l'affiche entière sans garantir le contraste là où
    // le texte se pose.
    const degrades = (css, bloc) => (declaration(css, bloc, 'background') || '').split('linear-gradient').length - 1;
    expect(degrades(fiche, '.mdh-scrim {')).toBe(2);
    expect(degrades(banniere, '.hero-shade {')).toBe(2);
  });

  it('n’anime pas l’image de la fiche', () => {
    // Choix assumé : la bannière zoome lentement au survol, pas la fiche — sur une page
    // de consultation, on survole souvent sans intention.
    expect(declaration(fiche, '.mdh-backdrop {', 'transform')).toBeNull();
    expect(declaration(fiche, '.mdh-backdrop {', 'transition')).toBeNull();
  });

  it('ne déborde plus de la colonne', () => {
    // Les marges négatives faisaient sortir le hero des gouttières.
    const marge = declaration(fiche, '.mdh-backdrop {', 'margin') || '';
    expect(marge).not.toContain('-');
  });
});
