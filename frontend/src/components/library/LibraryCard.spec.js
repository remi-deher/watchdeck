import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import LibraryCard from './LibraryCard.vue';

function baseItem(overrides = {}) {
  return {
    id: 1,
    _kind: 'library',
    title: 'Fondation',
    media_type: 'show',
    year: 2023,
    poster_url: '/poster.jpg',
    vote: 8.1,
    ...overrides,
  };
}

async function mountCard(props = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  await router.push('/');
  await router.isReady();
  return mount(LibraryCard, {
    props: { item: baseItem(), ...props },
    global: { plugins: [router] },
  });
}

describe('LibraryCard - vue grille', () => {
  it('rend la carte via le shell commun avec bordure et action dediee', async () => {
    const wrapper = await mountCard();
    const card = wrapper.get('.media-card');
    expect(card.classes()).toContain('poster-card');
    expect(card.classes()).toContain('bordered');
    expect(card.classes()).toContain('has-action');
    expect(wrapper.get('.catalog-poster-link').attributes('role')).toBe('link');
    expect(wrapper.get('.poster-action').text()).toBe('Voir la fiche');
  });

  it('emet open au clic sur la carte pour un media non orphelin', async () => {
    const wrapper = await mountCard();
    const link = wrapper.get('.catalog-poster-link');
    await link.trigger('focusin');
    await link.trigger('click');
    expect(wrapper.emitted('open')).toHaveLength(1);
    expect(wrapper.emitted('open')[0][0].title).toBe('Fondation');
  });

  it('affiche le badge de langue pour un media de bibliotheque', async () => {
    const wrapper = await mountCard({ item: baseItem({ _kind: 'library', has_vf: true }) });
    expect(wrapper.find('.language-tag').exists()).toBe(true);
  });

  it('affiche la case de selection pour une demande moderable', async () => {
    const wrapper = await mountCard({
      item: baseItem({ _kind: 'request', orphan: false }),
      canModerate: true,
    });
    expect(wrapper.find('.select-tag input[type="checkbox"]').exists()).toBe(true);
  });

  it('n affiche pas de case de selection sans droit de moderation', async () => {
    const wrapper = await mountCard({
      item: baseItem({ _kind: 'request', orphan: false }),
      canModerate: false,
    });
    expect(wrapper.find('.select-tag').exists()).toBe(false);
  });

  it('emet toggle-select au clic sur la case', async () => {
    const wrapper = await mountCard({
      item: baseItem({ _kind: 'request', orphan: false, id: 42 }),
      canModerate: true,
    });
    await wrapper.get('.select-tag input').trigger('change');
    expect(wrapper.emitted('toggle-select')).toEqual([[42]]);
  });
});

describe('LibraryCard - vue liste', () => {
  it('rend un article distinct hors du shell commun', async () => {
    const wrapper = await mountCard({ view: 'list' });
    const card = wrapper.get('.media-card');
    expect(card.classes()).toContain('list');
    expect(card.classes()).not.toContain('poster-card');
    expect(wrapper.find('.card-body').exists()).toBe(true);
  });

  it('emet open au clic en vue liste aussi', async () => {
    const wrapper = await mountCard({ view: 'list' });
    await wrapper.get('.media-card').trigger('click');
    expect(wrapper.emitted('open')).toHaveLength(1);
  });
});
