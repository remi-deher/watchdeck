import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { VueQueryPlugin } from '@tanstack/vue-query';

import { api } from '@/api';
import { createQueryClient } from '@/queryClient';
import IndexerHealthView from './IndexerHealthView.vue';

vi.mock('@/api', () => ({ api: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { instanceId: '4' } }) }));

describe('IndexerHealthView', () => {
  it('liste les indexeurs avec leur etat et les compteurs', async () => {
    api.mockResolvedValue({
      instance: { id: 4, name: 'Prowlarr' },
      connected: true,
      days: 7,
      indexers: [
        { id: 1, name: 'YGG', state: 'failing', disabled_till: '2026-10-02T14:00:00+00:00', queries: 12, failure_rate: 50, grabs: 0, failed_grabs: 0, average_response_ms: 900 },
        { id: 2, name: 'Sharewood', state: 'ok', queries: 30, failure_rate: 0, grabs: 3, failed_grabs: 1, average_response_ms: 310.4 },
      ],
    });
    const wrapper = mount(IndexerHealthView, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient: createQueryClient() }]],
        stubs: { AppPage: { props: ['title'], template: '<div><h1>{{ title }}</h1><slot /></div>' } },
      },
    });
    await flushPromises();

    expect(api).toHaveBeenCalledWith('/api/prowlarr/4/indexer-health?days=7', expect.anything());
    expect(wrapper.find('h1').text()).toBe('Indexeurs · Prowlarr');
    const rows = wrapper.findAll('.indexer-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].classes()).toContain('is-failing');
    expect(rows[0].text()).toContain('En pause jusqu');
    expect(rows[1].text()).toContain('310 ms');
    expect(rows[1].text()).toContain('(1 en échec)');
    expect(wrapper.text()).toContain('42');
  });
});
