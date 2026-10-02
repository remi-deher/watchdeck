import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppDock from './AppDock.vue';

const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
};

const discoverSections = [
  { key: 'home', label: 'Accueil', to: '/discover' },
  { key: 'shows', label: 'Séries', to: '/discover/shows' },
  { key: 'movies', label: 'Films', to: '/discover/movies' },
];

function mountDock(props = {}) {
  return mount(AppDock, {
    props: { activeKey: 'discover', isAdmin: true, canModerate: true, ...props },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
}

function activeEntry(wrapper) {
  return wrapper.get('[aria-current="page"]');
}

describe('AppDock', () => {
  it('ouvre les sections quand on retouche la destination deja active', async () => {
    const wrapper = mountDock({ sections: discoverSections, activeSectionKey: 'home' });
    const entry = activeEntry(wrapper);

    // Un lien vers la page ou l'on se trouve deja ne ferait rien de ce geste : l'entree
    // active devient donc un bouton qui decouvre ses sections.
    expect(entry.element.tagName).toBe('BUTTON');
    expect(entry.attributes('aria-haspopup')).toBe('dialog');

    await entry.trigger('click');
    expect(wrapper.emitted('open-sections')).toHaveLength(1);
  });

  it('laisse un simple lien a une destination qui n’a qu’une section', () => {
    const wrapper = mountDock({ sections: [{ key: 'tracking', label: 'Suivi', to: '/discover/requests' }] });
    const entry = activeEntry(wrapper);

    expect(entry.element.tagName).toBe('A');
    expect(wrapper.find('.app-dock__caret').exists()).toBe(false);
  });

  it('affiche la section courante, sauf sur la section d’arrivee', () => {
    // Sur la premiere section, montrer son nom donnait deux « Accueil » dans le dock :
    // celui du Tableau de bord et celui d'Explorer.
    const surPremiere = mountDock({ sections: discoverSections, activeSectionKey: 'home' });
    expect(activeEntry(surPremiere).text()).toContain('Explorer');
    expect(activeEntry(surPremiere).text()).not.toContain('Accueil');

    const surAutre = mountDock({ sections: discoverSections, activeSectionKey: 'movies' });
    expect(activeEntry(surAutre).text()).toContain('Films');
  });

  it('n’offre pas les sections d’une destination absente du dock', () => {
    // Activite et les pages d'administration ne sont pas dans le dock : aucune entree
    // active n'y existe, et c'est la feuille de navigation qui prend le relais. Le dock
    // ne doit surtout pas laisser croire qu'il les porte.
    const wrapper = mountDock({ activeKey: 'activity', sections: discoverSections, activeSectionKey: 'shows' });

    expect(wrapper.find('[aria-current="page"]').exists()).toBe(false);
    expect(wrapper.find('.app-dock__caret').exists()).toBe(false);
    expect(wrapper.get('.is-elsewhere').text()).toContain('Plus');
  });

  it('signale par un chevron que la destination active cache des sections', () => {
    const avec = mountDock({ sections: discoverSections, activeSectionKey: 'home' });
    expect(avec.find('.app-dock__caret').exists()).toBe(true);

    const sans = mountDock({ sections: [] });
    expect(sans.find('.app-dock__caret').exists()).toBe(false);
  });
});
