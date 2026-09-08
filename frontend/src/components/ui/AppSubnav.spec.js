import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppSubnav from './AppSubnav.vue';

const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
};

function mountSubnav(props) {
  return mount(AppSubnav, {
    props,
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
    it('expose le pattern Tabs : tablist, aria-selected et tabindex mobile', () => {
      const wrapper = mountSubnav({ items: tabs, active: 'queue', variant: 'tabs' });

      expect(wrapper.find('[role="tablist"]').exists()).toBe(true);
      const buttons = wrapper.findAll('[role="tab"]');
      expect(buttons).toHaveLength(3);
      expect(buttons[1].attributes('aria-selected')).toBe('true');
      // Un seul onglet est tabulable : la tabulation entre puis sort de la rangee,
      // les fleches servent a circuler dedans.
      expect(buttons.map((b) => b.attributes('tabindex'))).toEqual(['-1', '0', '-1']);
    });

    it('circule avec les fleches et boucle aux extremites', async () => {
      const wrapper = mountSubnav({ items: tabs, active: 'queue', variant: 'tabs' });
      const list = wrapper.find('[role="tablist"]');

      await list.trigger('keydown', { key: 'ArrowRight' });
      expect(wrapper.emitted('update:active').at(-1)).toEqual(['clients']);

      await wrapper.setProps({ active: 'clients' });
      await list.trigger('keydown', { key: 'ArrowRight' });
      expect(wrapper.emitted('update:active').at(-1)).toEqual(['overview']);

      await wrapper.setProps({ active: 'overview' });
      await list.trigger('keydown', { key: 'ArrowLeft' });
      expect(wrapper.emitted('update:active').at(-1)).toEqual(['clients']);
    });

    it('saute aux extremites avec Origine et Fin', async () => {
      const wrapper = mountSubnav({ items: tabs, active: 'queue', variant: 'tabs' });
      const list = wrapper.find('[role="tablist"]');

      await list.trigger('keydown', { key: 'End' });
      expect(wrapper.emitted('update:active').at(-1)).toEqual(['clients']);

      await list.trigger('keydown', { key: 'Home' });
      expect(wrapper.emitted('update:active').at(-1)).toEqual(['overview']);
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
