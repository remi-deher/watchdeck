import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppPage from './AppPage.vue';
import { usePageSearch } from '@/composables/usePageSearch';

const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
};

function mountPage(props = {}, slots = {}) {
  return mount(AppPage, {
    props: { title: 'Bibliothèque', ...props },
    slots,
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
}

describe('AppPage', () => {
  it('rend exactement un h1, porte par le patron et non par la vue', () => {
    const wrapper = mountPage({}, { default: '<section><h2>Films</h2></section>' });
    const headings = wrapper.findAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0].text()).toBe('Bibliothèque');
  });

  it('masque la rangee d’outils quand la page n’a ni actions ni outils', () => {
    // Une page de consultation ne doit pas payer une barre vide.
    expect(mountPage().find('.app-page__tools').exists()).toBe(false);
  });

  it('fournit sa recherche a la barre de contexte plutot que de la rendre', () => {
    const wrapper = mountPage({ placeholder: 'Rechercher un film', hasFilters: true, activeCount: 2 });

    // Le champ n'appartient plus a la page : elle en declare l'etat, la barre le rend.
    // C'est ce qui permet a une seule recherche d'exister a l'ecran.
    expect(wrapper.find('input[type="search"]').exists()).toBe(false);

    const search = usePageSearch().value;
    expect(search).not.toBeNull();
    expect(search.placeholder).toBe('Rechercher un film');
    expect(search.hasFilters).toBe(true);
    expect(search.activeCount).toBe(2);

    search.onQuery('dune');
    expect(wrapper.emitted('update:query').at(-1)).toEqual(['dune']);
    search.onToggleFilters();
    expect(wrapper.emitted('toggle-filters')).toHaveLength(1);
  });

  it('ne fournit aucune recherche quand la page n’en a pas', () => {
    mountPage({ hideSearch: true });
    expect(usePageSearch().value).toBeNull();
  });

  it('rend la sous-navigation quand la page expose des sections', () => {
    const wrapper = mountPage({
      sections: [
        { key: 'catalog', label: 'Catalogue', to: '/library' },
        { key: 'vf', label: 'Améliorations VF', to: '/vf-upgrades' },
      ],
      activeSection: 'vf',
    });
    const links = wrapper.findAll('.app-subnav__item');
    expect(links).toHaveLength(2);
    expect(links[1].attributes('aria-current')).toBe('page');
  });

  it('affiche les retours d’etat sans que la vue ait a les composer', () => {
    const wrapper = mountPage({ error: 'Service injoignable', loading: true });
    const text = wrapper.text();
    expect(text).toContain('Service injoignable');
    expect(text).toContain('Chargement');
  });

  it('garde le titre dans le document sans l’afficher', () => {
    const wrapper = mountPage();
    const heading = wrapper.find('h1');
    expect(heading.exists()).toBe(true);
    // sr-only : la barre de contexte porte le titre visible, mais la navigation par
    // en-tetes d'un lecteur d'ecran garde son point d'entree.
    expect(heading.classes()).toContain('sr-only');
  });
});
