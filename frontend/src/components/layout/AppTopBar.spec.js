/** La barre du haut : ce qu'elle montre, et ce qu'elle ne doit plus reprendre. */
import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import AppTopBar from './AppTopBar.vue';
import { providePageSearch } from '@/composables/usePageSearch';

const pageSearch = (overrides = {}) => ({
  showSearch: true,
  query: '',
  placeholder: 'Rechercher un film ou une série',
  scopeLabel: 'Explorer',
  hasFilters: true,
  filtersOpen: false,
  activeCount: 0,
  onQuery: () => {},
  onSearch: () => {},
  onToggleFilters: () => {},
  ...overrides,
});

/* La recherche est un singleton de module, fourni par la page : on monte donc un hôte
   qui la déclare, comme le ferait `AppPage`, plutôt que de la simuler. */
function mountBar(props = {}, search = ref(pageSearch())) {
  // Le titre est reactif : c'est lui que la barre suivait pour se refermer, on doit
  // donc pouvoir le changer sans remonter le composant.
  const pageTitle = ref('Explorer');
  const Host = defineComponent({
    setup() {
      providePageSearch(search);
      return () => h(AppTopBar, { mode: 'compact', pageTitle: pageTitle.value, ...props });
    },
  });
  return { wrapper: mount(Host, { attachTo: document.body }), search, pageTitle };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AppTopBar en compact', () => {
  it('rend le champ visible d’emblée, sans loupe à taper d’abord', async () => {
    // Le champ se déployait derrière une loupe parce que le titre et un champ de 341px
    // ne tenaient pas ensemble. Les deux occupants de la barre ayant disparu, il n'y a
    // plus rien à déployer — et donc plus de repli possible pendant la saisie.
    const { wrapper } = mountBar();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.app-topbar__field input').exists()).toBe(true);
    expect(wrapper.find('.app-topbar__search-compact').exists()).toBe(false);
  });

  it('ne porte plus ni bouton de navigation ni titre', async () => {
    // « Plus », dans le dock, ouvre la même feuille, et le titre est repris sous la
    // barre : les deux ne servaient qu'à rogner la largeur du champ.
    const { wrapper } = mountBar();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[aria-label="Ouvrir la navigation"]').exists()).toBe(false);
    expect(wrapper.find('.app-topbar__context').exists()).toBe(false);
  });

  it('garde le même champ quand le titre de la page change', async () => {
    // Taper une lettre dans Découvrir fait passer « Accueil » à « Explorer ». La barre
    // suivait ce titre pour se refermer : le champ disparaissait sous le doigt, en
    // emportant le focus.
    const { wrapper, pageTitle } = mountBar();
    await wrapper.vm.$nextTick();
    const avant = wrapper.find('.app-topbar__field input').element;

    pageTitle.value = 'Accueil';
    await wrapper.vm.$nextTick();

    const apres = wrapper.find('.app-topbar__field input').element;
    expect(apres).toBe(avant);
  });

  it('garde le même champ quand la requête change', async () => {
    // L'objet de recherche est recréé à chaque frappe : le surveiller refermait le
    // champ dès la première lettre.
    const search = ref(pageSearch());
    const { wrapper } = mountBar({}, search);
    await wrapper.vm.$nextTick();
    const avant = wrapper.find('.app-topbar__field input').element;

    search.value = pageSearch({ query: 'b' });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.app-topbar__field input').element).toBe(avant);
  });

  it('n’expose qu’un seul bouton de filtres', async () => {
    // Le champ porte le sien ; un seul suffit depuis qu'il occupe toute la barre.
    const { wrapper } = mountBar();
    await wrapper.vm.$nextTick();

    const boutons = wrapper.findAll('button').filter((b) => /filtres/i.test(b.attributes('aria-label') || ''));
    expect(boutons).toHaveLength(1);
  });

  it('propose la recherche globale quand la page n’a pas de recherche', async () => {
    // Sans champ de page, la loupe reste le seul recours depuis un téléphone.
    const { wrapper } = mountBar({}, ref(pageSearch({ showSearch: false, hasFilters: false })));
    await wrapper.vm.$nextTick();

    const loupe = wrapper.find('.app-topbar__search-compact');
    expect(loupe.exists()).toBe(true);
    await loupe.trigger('click');
    expect(wrapper.findComponent(AppTopBar).emitted('open-palette')).toBeTruthy();
  });
});
