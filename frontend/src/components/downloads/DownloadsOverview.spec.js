import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DownloadsOverview from './DownloadsOverview.vue';

const global = {
  stubs: {
    RouterLink: { props: ['to'], template: '<a><slot /></a>' },
    InstanceOverviewGrid: { template: '<div class="instance-overview-stub" />' },
    DiskSpacePanel: { template: '<div class="disk-space-stub" />' },
  },
};

describe('DownloadsOverview', () => {
  it('synthétise la file, le stockage et les activités récentes', () => {
    const wrapper = mount(DownloadsOverview, {
      props: {
        queue: [{ id: 1, title: 'Film bloqué', status: 'error', instance: 'Radarr' }, { id: 2, title: 'Actif', status: 'downloading' }],
        clientErrors: [{ message: 'Client indisponible' }],
        history: [{ id: 3, title: 'Import récent', source: 'radarr', completed_at: '2026-08-16T10:00:00Z' }],
        clientQueue: [{ hash: 'abc', title: 'Torrent récent', client_name: 'qBit', added_on: 100, progress: 50 }],
        diskSpaceVolumes: [{ total_bytes: 1000, free_bytes: 250 }],
      },
      global,
    });

    expect(wrapper.findAll('.kpi-value').map(node => node.text())).toEqual(['2', '1', '0', '75 %']);
    expect(wrapper.text()).toContain('Import récent');
    expect(wrapper.text()).toContain('Torrent récent');
    expect(wrapper.find('.disk-space-stub').exists()).toBe(true);
  });

  it('transmet le média choisi pour résolution', async () => {
    const item = { id: 1, title: 'À associer', status: 'error' };
    const wrapper = mount(DownloadsOverview, { props: { queue: [item] }, global });
    await wrapper.find('.attention-item button').trigger('click');
    expect(wrapper.emitted('resolve')).toEqual([[item]]);
  });
});
