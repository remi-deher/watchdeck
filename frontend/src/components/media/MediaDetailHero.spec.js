import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import MediaDetailHero from './MediaDetailHero.vue';
import UiHeroBackdrop from '@/components/ui/UiHeroBackdrop.vue';
import VfUpgradeButton from '@/components/media/VfUpgradeButton.vue';

/* Les actions secondaires vivent dans un menu teleporte dans <body> : on l'ouvre au clavier. */
async function ouvrirMenu(wrapper) {
  await wrapper.get('button[aria-label="Plus d’actions"]').trigger('keydown', { key: 'Enter' });
  await nextTick();
  return [...document.body.querySelectorAll('.ui-menu-item')];
}
const libelles = (items) => items.map((item) => item.textContent.trim());
afterEach(() => { document.body.innerHTML = ''; });

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

  it('range Rechercher dans le menu pour un film en bibliothèque si admin', async () => {
    const wrapper = mount(MediaDetailHero, {
      props: { detail: { title: 'Soulm8te', media_type: 'movie', in_library: true, library_id: 42 }, admin: true },
      attachTo: document.body,
    });

    expect(wrapper.text()).not.toContain('Rechercher');
    expect(wrapper.findComponent(VfUpgradeButton).exists()).toBe(true);
    expect(libelles(await ouvrirMenu(wrapper))).toContain('Rechercher une version');
    wrapper.unmount();
  });

  it('range Rechercher dans le menu pour une série si admin et émet open-audio', async () => {
    const wrapper = mount(MediaDetailHero, {
      props: { detail: { title: 'Severance', media_type: 'show', in_library: true, library_id: 99 }, admin: true },
      attachTo: document.body,
    });

    const items = await ouvrirMenu(wrapper);
    const search = items.find((item) => item.textContent.includes('Rechercher'));
    expect(search).toBeDefined();
    search.dispatchEvent(new Event('click', { bubbles: true }));
    await nextTick();
    expect(wrapper.emitted('open-audio')).toHaveLength(1);
    wrapper.unmount();
  });

  it('masque la recherche de release pour les non-admins', async () => {
    const wrapper = mount(MediaDetailHero, {
      props: { detail: { title: 'Soulm8te', media_type: 'movie', in_library: true, library_id: 42 }, admin: false },
      attachTo: document.body,
    });

    expect(wrapper.findComponent(VfUpgradeButton).exists()).toBe(false);
    expect(libelles(await ouvrirMenu(wrapper)).join(' ')).not.toContain('Rechercher');
    wrapper.unmount();
  });

  it('range analyse, liens externes et signalement dans le menu', async () => {
    const wrapper = mount(MediaDetailHero, {
      props: {
        detail: { title: 'Inception', media_type: 'movie', in_library: true, imdb_id: 'tt1375666', tmdb_id: 27205, arr_url: 'http://radarr/movie/1' },
        admin: true,
      },
      attachTo: document.body,
    });

    expect(wrapper.find('.mdh-link').exists()).toBe(false);
    const items = await ouvrirMenu(wrapper);
    expect(libelles(items)).toEqual(['Analyser', 'IMDb', 'TMDB', 'Radarr', 'Signaler un problème']);
    items.at(-1).dispatchEvent(new Event('click', { bubbles: true }));
    await nextTick();
    expect(wrapper.emitted('report-issue')).toHaveLength(1);
    wrapper.unmount();
  });

  it('n’offre pas de menu pour la musique', () => {
    const wrapper = mount(MediaDetailHero, { props: { detail: { title: 'Discovery', media_type: 'album', plex_guid: 'plex://album/1' } } });
    expect(wrapper.find('button[aria-label="Plus d’actions"]').exists()).toBe(false);
  });

  it('résume année, note et genres en une phrase, sans pastilles', () => {
    const wrapper = mount(MediaDetailHero, {
      props: { detail: { title: 'Dune', media_type: 'movie', year: 2024, vote: 8.3, genres: ['Science-fiction', 'Aventure'] } },
    });

    expect(wrapper.get('.mdh-facts').text()).toBe('2024 · ★ 8.3 · Science-fiction, Aventure');
    expect(wrapper.findAll('.mdh-badges .badge')).toHaveLength(0);
    expect(wrapper.find('.tag-row').exists()).toBe(false);
  });

  it('place la langue d’un film dans la rangée de badges, à côté du statut', () => {
    const wrapper = mount(MediaDetailHero, {
      props: { detail: { title: 'Dune', media_type: 'movie', in_library: true, has_vf: true }, statusLabel: 'Disponible', statusClass: 'available' },
    });

    expect(wrapper.findAll('.mdh-badges .badge').map((badge) => badge.text())).toHaveLength(2);
    expect(wrapper.find('.mdh-language-summary').exists()).toBe(false);
  });

  it('sort le retour du flux, pour qu’il ne descende pas avec le titre', () => {
    // La banniere ancre son contenu en bas, comme celle d'Explorer : un bouton reste
    // dans le flux se retrouverait au fond de l'image, sous l'affiche.
    const wrapper = mount(MediaDetailHero, { props: { detail: { title: 'Inception', media_type: 'movie' } } });

    const backdrop = wrapper.getComponent(UiHeroBackdrop);
    expect(backdrop.get('.ui-hero-backdrop__overlay .mdh-back').exists()).toBe(true);
    expect(wrapper.find('.mdh-content .mdh-back').exists()).toBe(false);
  });

  it('rend le fond hero partage en mode carte ou feuille', async () => {
    const wrapper = mount(MediaDetailHero, {
      props: { detail: { title: 'Inception', media_type: 'movie', backdrop_url: '/hero.jpg' } },
    });

    expect(wrapper.getComponent(UiHeroBackdrop).props()).toMatchObject({ variant: 'card', zoomOnHover: false });
    await wrapper.setProps({ variant: 'sheet' });
    expect(wrapper.getComponent(UiHeroBackdrop).props()).toMatchObject({ variant: 'sheet', position: 'center 18%' });
  });

  it('laisse l’origine à l’onglet Demandes', () => {
    const wrapper = mount(MediaDetailHero, { props: { detail: { title: 'X', media_type: 'movie', origin_kind: 'request', origin_label: 'Demande via Seerr' } } });
    expect(wrapper.text()).not.toContain('Demande via Seerr');
  });
});

it('le contrat de disponibilité prime sur un ancien libellé opérationnel', () => {
  const wrapper = mount(MediaDetailHero, { props: {
    statusLabel: 'Disponible dans Plex',
    detail: { title: 'Importé', media_type: 'movie', operational_status: 'completed', availability: { plex: 'absent', episodes: { state: 'unknown' } } },
  } });
  expect(wrapper.get('.mdh-badges').text()).toBe('À confirmer dans Plex');
});
