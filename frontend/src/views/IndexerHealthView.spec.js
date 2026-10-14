import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { VueQueryPlugin } from '@tanstack/vue-query';

import { api } from '@/api';
import { createQueryClient } from '@/queryClient';
import IndexerHealthView from './IndexerHealthView.vue';

vi.mock('@/api', () => ({ api: vi.fn() }));
vi.mock('vue-router', async (importOriginal) => ({ ...(await importOriginal()), useRoute: () => ({ params: { instanceId: '4' } }) }));

const donnees = {
  instance: { id: 4, name: 'Prowlarr' },
  connected: true,
  days: 7,
  indexers: [
    { id: 1, name: 'YGG', state: 'failing', disabled_till: '2026-10-02T14:00:00+00:00', queries: 12, failure_rate: 50, grabs: 0, failed_grabs: 0, average_response_ms: 900 },
    { id: 2, name: 'Sharewood', state: 'ok', queries: 30, failure_rate: 0, grabs: 3, failed_grabs: 1, average_response_ms: 310.4 },
  ],
};

function monter() {
  return mount(IndexerHealthView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient: createQueryClient() }]],
      stubs: {
        AppPage: { props: ['title', 'error'], template: '<div><h1>{{ title }}</h1><p v-if="error">{{ error }}</p><slot /></div>' },
        RouterLink: { props: ['to'], template: '<a :href="String(to)"><slot /></a>' },
      },
    },
  });
}

describe('IndexerHealthView (Surveiller)', () => {
  it('met en avant les indexeurs en panne et garde la liste complete en lecture', async () => {
    api.mockResolvedValue(donnees);
    const wrapper = monter();
    await flushPromises();

    expect(api).toHaveBeenCalledWith('/api/prowlarr/4/indexer-health?days=7', expect.anything());
    expect(wrapper.find('h1').text()).toBe('Indexeurs · Prowlarr');
    // Point d'attention : seul l'indexeur en panne, avec sa cause.
    expect(wrapper.text()).toContain('YGG est en panne');
    expect(wrapper.text()).toContain('En pause jusqu');
    expect(wrapper.text()).not.toContain('Sharewood est en panne');
    // Indicateurs : 42 requetes au total.
    expect(wrapper.text()).toContain('42');
    // Liste complete, en lecture.
    expect(wrapper.text()).toContain('Sharewood');
    expect(wrapper.text()).toContain('310 ms');
    expect(wrapper.text()).toContain('(1 en échec)');
  });

  it('annonce un Prowlarr injoignable plutot qu’une liste vide', async () => {
    api.mockResolvedValue({ ...donnees, connected: false, indexers: [] });
    const wrapper = monter();
    await flushPromises();
    expect(wrapper.text()).toContain('Prowlarr ne répond pas');
  });
});
