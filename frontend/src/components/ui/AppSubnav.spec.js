import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import AppSubnav from './AppSubnav.vue';

const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
};

function mountSubnav(props, options = {}) {
  return mount(AppSubnav, {
    props,
    ...options,
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
}

describe('AppSubnav', () => {
  const tabs = [
    { key: 'overview', label: 'Vue d’ensemble' },
    { key: 'queue', label: 'File d’attente', count: 3 },
    { key: 'clients', label: 'Clients' },
  ];

  describe('variante links', () => {
    it('rend une navigation et marque la section courante avec aria-current', () => {
      const wrapper = mountSubnav({
        items: [
          { key: 'a', label: 'Catalogue', to: '/library' },
          { key: 'b', label: 'VF', to: '/vf-upgrades' },
        ],
        active: 'b',
        variant: 'links',
      });

      expect(wrapper.find('nav').exists()).toBe(true);
      // Des liens qui changent d'URL ne sont pas des onglets : leur donner role="tab"
      // promettrait un panneau revele sur place, ce qui n'arrive pas.
      expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
      const links = wrapper.findAll('a');
      expect(links[1].attributes('aria-current')).toBe('page');
      expect(links[0].attributes('aria-current')).toBeUndefined();
    });
  });

  describe('variante tabs', () => {
    it('expose le pattern Tabs : tablist et aria-selected', () => {
      const wrapper = mountSubnav({ items: tabs, active: 'queue', variant: 'tabs' });

      expect(wrapper.find('[role="tablist"]').exists()).toBe(true);
      const buttons = wrapper.findAll('[role="tab"]');
      expect(buttons).toHaveLength(3);
      expect(buttons[1].attributes('aria-selected')).toBe('true');
      // Un seul arret de tabulation pour toute la rangee (focus itinerant de Reka) : la
      // tabulation entre puis sort, les fleches servent a circuler dedans.
      expect(buttons.filter((b) => b.attributes('tabindex') === '0').length).toBeLessThanOrEqual(1);
    });

    // Les fleches, Origine et Fin sont gerees par le focus itinerant de Reka, qui ignore
    // les elements sans mise en page : jsdom n'en calcule aucune. Ce comportement est
    // verifie en vrai navigateur (e2e : « la sous-navigation d'une page repond aux fleches »).
    it("active l'onglet appuye", async () => {
      const wrapper = mountSubnav({ items: tabs, active: 'queue', variant: 'tabs' });
      await wrapper.findAll('[role="tab"]')[2].trigger('mousedown', { button: 0 });
      expect(wrapper.emitted('update:active').at(-1)).toEqual(['clients']);
    });

    it('laisse passer les autres touches', async () => {
      const wrapper = mountSubnav({ items: tabs, active: 'queue', variant: 'tabs' });
      await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowDown' });
      expect(wrapper.emitted('update:active')).toBeUndefined();
    });

    it('affiche le compteur seulement la ou il y en a un', () => {
      const wrapper = mountSubnav({ items: tabs, active: 'overview', variant: 'tabs' });
      const counters = wrapper.findAll('.app-subnav__item small');
      expect(counters).toHaveLength(1);
      expect(counters[0].text()).toBe('3');
    });
  });

  it('n’intercepte pas les fleches en variante links', async () => {
    const wrapper = mountSubnav({
      items: [
        { key: 'a', label: 'A', to: '/a' },
        { key: 'b', label: 'B', to: '/b' },
      ],
      active: 'a',
      variant: 'links',
    });
    await wrapper.find('nav').trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:active')).toBeUndefined();
  });
});
