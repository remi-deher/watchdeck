import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ScanStatusPanel from './ScanStatusPanel.vue';

describe('ScanStatusPanel', () => {
  it('affiche les 4 statuts et les compteurs de répartition', () => {
    const wrapper = mount(ScanStatusPanel, {
      props: {
        plexSync: { status: 'idle', finished_at: '2026-08-15T02:10:00Z' },
        vffScan: { status: 'idle', finished_at: '2026-08-15T02:00:00Z' },
        arrSync: { status: 'idle', finished_at: '2026-08-15T01:50:00Z' },
        watchlistSync: { status: 'idle', finished_at: '2026-08-15T01:40:00Z' },
        vffCounts: { vf_available: 120, vo_pending: 15, unchecked: 3 },
      },
    });

    expect(wrapper.text()).toContain('État des scans');
    expect(wrapper.text()).toContain('Synchronisation Plex');
    expect(wrapper.text()).toContain('Analyse VF');
    expect(wrapper.text()).toContain('Vérification *arr');
    expect(wrapper.text()).toContain('Watchlists Plex');
    expect(wrapper.text()).toContain('120');
    expect(wrapper.text()).toContain('15');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.find('.panel-card').exists()).toBe(true);
  });

  it('émet les 4 événements au clic sur les boutons d’action', async () => {
    const wrapper = mount(ScanStatusPanel, {
      props: {
        plexSync: { status: 'idle' },
        vffScan: { status: 'idle' },
        arrSync: { status: 'idle' },
        watchlistSync: { status: 'idle' },
      },
    });

    const buttons = wrapper.findAll('button.btn-scan-action');
    expect(buttons.length).toBe(4);

    await buttons[0].trigger('click');
    expect(wrapper.emitted('sync-plex')).toBeTruthy();

    await buttons[1].trigger('click');
    expect(wrapper.emitted('scan-vff')).toBeTruthy();

    await buttons[2].trigger('click');
    expect(wrapper.emitted('sync-arr')).toBeTruthy();

    await buttons[3].trigger('click');
    expect(wrapper.emitted('sync-watchlist')).toBeTruthy();
  });
});
