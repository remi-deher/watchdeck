import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

import VfUpgradesView from './VfUpgradesView.vue';

const apiMock = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => apiMock(...args) }));

function suggestion(id, season, episode = null, overrides = {}) {
  return {
    id,
    source_type: 'library_item',
    source_id: 42,
    scope: episode == null ? 'season' : 'episode',
    season_number: season,
    episode_number: episode,
    status: 'pending',
    scanned_at: '2026-08-09T12:00:00Z',
    releases: [{ guid: `release-${id}`, title: `Serie.S${season}.MULTI` }],
    release_count: 1,
    media: { title: 'Une même série', media_type: 'show', poster_url: null },
    ...overrides,
  };
}

function mountView() {
  return mount(VfUpgradesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]],
      stubs: {
        AppPage: {
          props: ['query', 'modelValue', 'title'],
          // Le vrai AppPage rend h1, sous-navigation et retours d'etat ; ici seuls la
          // recherche et le contenu comptent, et AppPage.spec.js couvre le reste.
          template: `<div class="app-page-stub"><input type="search" :value="query || modelValue" @input="$emit('update:query', $event.target.value); $emit('update:modelValue', $event.target.value); $emit('search', $event.target.value)" /><slot name="tools" /><slot /></div>`,
        },
        FilterSidebar: {
          props: ['open', 'activeCount'],
          template: '<aside class="filter-sidebar-stub"><slot /></aside>',
        },
        FilterGroup: {
          props: ['label'],
          template: '<div class="filter-group-stub"><h3>{{ label }}</h3><slot /></div>',
        },
        UiFeedback: true,
        StatusBadge: { props: ['label'], template: '<span class="status-stub">{{ label }}</span>' },
        RouterLink: { props: ['to'], template: '<a><slot /></a>' },
        VfUpgradeButton: true,
        AlignStreamsModal: true,
      },
    },
  });
}

const button = (wrapper, text) => wrapper.findAll('button').find((entry) => entry.text().includes(text));

describe('VfUpgradesView', () => {
  beforeEach(() => {
    apiMock.mockReset();
    // Les filtres sont mémorisés : un test ne doit pas hériter de l'affichage du précédent.
    localStorage.clear();
    sessionStorage.clear();
  });

  it('range les suggestions en une ligne à traiter par média, avec leur état en clair', async () => {
    apiMock.mockResolvedValue({
      items: [suggestion(1, 1), suggestion(2, 1, 3), suggestion(3, 2, 1)],
      scan: {},
    });

    const wrapper = mountView();
    await flushPromises();

    const rows = wrapper.findAll('.handle-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('Une même série');
    expect(rows[0].text()).toContain('3 à traiter');
    expect(rows[0].text()).toContain('3 releases VF disponibles');
    expect(rows[0].text()).toContain('Voir les 3 releases');
    expect(rows[0].text()).toContain('Ignorer');
  });

  it('affiche ce qui est en cours par défaut, puis l’historique et le type de média à la demande', async () => {
    apiMock.mockResolvedValue({
      items: [
        suggestion(1, 1, null, { source_id: 42 }),
        suggestion(2, 1, 1, { source_id: 43, status: 'downloading', media: { title: 'Autre série', media_type: 'show' } }),
        suggestion(3, null, null, { source_id: 44, scope: 'movie', media: { title: 'Un film', media_type: 'movie' } }),
        suggestion(4, null, null, { source_id: 45, scope: 'movie', status: 'verified', media: { title: 'Un vieux film', media_type: 'movie' } }),
      ],
      scan: {},
    });

    const wrapper = mountView();
    await flushPromises();
    // Par défaut : ce qui reste à faire ou qui avance, sans l'archive.
    expect(wrapper.findAll('.handle-row')).toHaveLength(3);

    await button(wrapper, 'Films').trigger('click');
    expect(wrapper.findAll('.handle-row')).toHaveLength(1);

    await button(wrapper, 'Historique').trigger('click');
    expect(wrapper.findAll('.handle-row')).toHaveLength(1);
    expect(wrapper.text()).toContain('Un vieux film');

    await button(wrapper, 'Tous les types').trigger('click');
    await button(wrapper, 'Ignorés').trigger('click');
    expect(wrapper.findAll('.handle-row')).toHaveLength(0);
  });

  it('porte la maintenance par le type de problème : réouvrir les échecs', async () => {
    apiMock.mockResolvedValue({
      items: [suggestion(1, null, null, { scope: 'movie', status: 'failed', arr_message: 'Indexeur injoignable', media: { title: 'Un film', media_type: 'movie' } })],
      scan: {},
    });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain('Indexeur injoignable');

    apiMock.mockResolvedValueOnce({ updated: 1 });
    apiMock.mockResolvedValueOnce({ items: [], scan: {} });
    await button(wrapper, 'Échecs').trigger('click');
    await button(wrapper, 'Réouvrir les échecs').trigger('click');
    expect(apiMock).toHaveBeenCalledWith('/api/vf-upgrades/maintenance', expect.objectContaining({ method: 'POST' }));
  });
});
