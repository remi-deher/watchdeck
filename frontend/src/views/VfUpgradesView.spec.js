import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      },
    },
  });
}

describe('VfUpgradesView', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it('affiche une carte par série avec ses saisons et épisodes alignés', async () => {
    apiMock.mockResolvedValue({
      items: [suggestion(1, 1), suggestion(2, 1, 3), suggestion(3, 2, 1)],
      scan: {},
    });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.findAll('.upgrade-card')).toHaveLength(1);
    expect(wrapper.findAll('.season-group')).toHaveLength(2);
    expect(wrapper.findAll('.target-row')).toHaveLength(3);
    expect(wrapper.text()).toContain('Saison entière');
    expect(wrapper.text()).toContain('Épisode 03');
  });

  it('permet de basculer entre les filtres de statut et de type via la FilterSidebar', async () => {
    apiMock.mockResolvedValue({
      items: [
        suggestion(1, 1, null), // pending show
        suggestion(2, 1, 1, { status: 'downloading' }), // downloading show
        suggestion(3, null, null, { scope: 'movie', media: { title: 'Un film', media_type: 'movie' } }), // pending movie
      ],
      scan: {},
    });

    const wrapper = mountView();
    await flushPromises();

    // Default status is 'pending' -> suggestion(1) and suggestion(3) -> 2 target rows
    expect(wrapper.findAll('.target-row')).toHaveLength(2);

    // Filter by 'movie'
    const filterBadges = wrapper.findAll('.filter-badge');
    const movieBadge = filterBadges.find(b => b.text().includes('Films'));
    expect(movieBadge).toBeDefined();
    await movieBadge.trigger('click');
    expect(wrapper.findAll('.target-row')).toHaveLength(1);

    // Switch to status 'En cours'
    const inProgressBadge = filterBadges.find(b => b.text().includes('En cours'));
    expect(inProgressBadge).toBeDefined();
    await inProgressBadge.trigger('click');
    // In progress movie is 0
    expect(wrapper.findAll('.target-row')).toHaveLength(0);

    // Switch to 'Tous les types'
    const allTypesBadge = filterBadges.find(b => b.text().includes('Tous les types'));
    await allTypesBadge.trigger('click');
    // In progress show is 1
    expect(wrapper.findAll('.target-row')).toHaveLength(1);
  });

  it('déclenche les actions de maintenance au clic', async () => {
    apiMock.mockResolvedValue({ items: [], scan: {} });
    const wrapper = mountView();
    await flushPromises();

    apiMock.mockResolvedValueOnce({ updated: 2 });
    apiMock.mockResolvedValueOnce({ items: [], scan: {} });
    const recomputeBtn = wrapper.findAll('.filter-maintenance-buttons button').find(b => b.text().includes('Réouvrir'));
    await recomputeBtn.trigger('click');
    expect(apiMock).toHaveBeenCalledWith('/api/vf-upgrades/maintenance', expect.objectContaining({ method: 'POST' }));
  });
});
