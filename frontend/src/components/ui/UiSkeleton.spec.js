import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiSkeleton from './UiSkeleton.vue';
import PageTemplate from '@/components/templates/PageTemplate.vue';

describe('UiSkeleton', () => {
  it('annonce le chargement et dessine des lignes', () => {
    const wrapper = mount(UiSkeleton, { props: { rows: 3, label: 'Chargement des comptes…' } });
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.text()).toContain('Chargement des comptes…');
    expect(wrapper.findAll('.ui-skeleton__row')).toHaveLength(3);
  });

  it('ajoute des indicateurs en variante cartes et des affiches en variante grille', () => {
    expect(mount(UiSkeleton, { props: { variant: 'cards' } }).findAll('.ui-skeleton__block')).toHaveLength(4);
    expect(mount(UiSkeleton, { props: { variant: 'grid' } }).findAll('.ui-skeleton__poster')).toHaveLength(12);
  });
});

describe('PageTemplate en chargement', () => {
  it('pose le squelette demande a la place du contenu', () => {
    const wrapper = mount(PageTemplate, {
      props: { title: 'Comptes', state: 'loading', skeleton: 'table' },
      slots: { default: '<p class="contenu">Prêt</p>' },
      global: { stubs: { AppPage: { template: '<div><slot /></div>' } } },
    });
    expect(wrapper.find('.ui-skeleton.is-table').exists()).toBe(true);
    expect(wrapper.find('.contenu').exists()).toBe(false);
  });
});
