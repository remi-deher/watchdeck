import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import TorrentClientsTable from './TorrentClientsTable.vue';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));

const rows = [
  { client_id: 1, client_name: 'Maison', hash: 'bbb', title: 'Zulu', status: 'downloading', progress: 20, size: 2000, download_speed: 20, upload_speed: 2, ratio: 0.1, eta: 90, category: 'series', tags: 'watchdeck' },
  { client_id: 2, client_name: 'Seedbox', hash: 'aaa', title: 'Alpha', status: 'pausedDL', progress: 60, size: 1000, download_speed: 0, upload_speed: 1, ratio: 1.2, eta: 0, category: 'films', tags: '' },
];

function factory() {
  return mount(TorrentClientsTable, {
    props: { rows },
    global: {
      stubs: {
        DrawerShell: { template: '<aside><slot/><slot name="actions"/></aside>' },
        ModalShell: { props: ['open', 'title'], template: '<div v-if="open"><h2>{{ title }}</h2><slot/><slot name="actions"/></div>' },
        ConfirmModal: true,
      },
    },
  });
}

describe('TorrentClientsTable', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue({ ok: true });
    localStorage.clear();
  });

  it('trie les torrents en cliquant sur les colonnes', async () => {
    const wrapper = factory();
    expect(wrapper.findAll('.torrent-title').map(node => node.text())).toEqual(['Alpha', 'Zulu']);
    await wrapper.findAll('.sort-button')[0].trigger('click');
    expect(wrapper.findAll('.torrent-title').map(node => node.text())).toEqual(['Zulu', 'Alpha']);
  });

  it('applique une action à toute la sélection', async () => {
    const wrapper = factory();
    await wrapper.find('thead input[type="checkbox"]').setValue(true);
    await nextTick();
    expect(wrapper.text()).toContain('2 sélectionné(s)');
    await wrapper.find('.bulk-toolbar button').trigger('click');
    await vi.waitFor(() => {
      const controlCalls = api.mock.calls.filter(call => call[0].includes('/control'));
      expect(controlCalls).toHaveLength(2);
    });
    const controlCalls = api.mock.calls.filter(call => call[0].includes('/control'));
    // Les appels partent en parallèle (Promise.allSettled) : seul l'ensemble des cibles
    // a un sens, pas leur ordre — qui suit désormais l'ordre affiché, donc le tri.
    expect(controlCalls.map(call => call[0]).sort()).toEqual([
      '/api/downloads/clients/1/bbb/control',
      '/api/downloads/clients/2/aaa/control',
    ]);
    expect(controlCalls.every(call => JSON.parse(call[1].body).action === 'pause')).toBe(true);
  });

  it('ouvre le panneau de détails depuis le titre', async () => {
    const wrapper = factory();
    await wrapper.find('.torrent-title').trigger('click');
    expect(wrapper.find('aside').text()).toContain('Seedbox');
    expect(wrapper.find('aside').text()).toContain('aaa');
  });

  it('ouvre le détail au clic sur une ligne desktop sans la sélectionner', async () => {
    const wrapper = factory();
    await wrapper.find('tbody tr').trigger('click');
    expect(wrapper.find('aside').text()).toContain('Seedbox');
    expect(wrapper.text()).not.toContain('1 sélectionné(s)');
  });

  it('ouvre le détail au clic sur une carte mobile sans la sélectionner', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const wrapper = factory();
    await wrapper.find('tbody tr').trigger('click');
    expect(wrapper.find('aside').text()).toContain('Seedbox');
    expect(wrapper.text()).not.toContain('1 sélectionné(s)');
    window.matchMedia = originalMatchMedia;
  });

  it('ne contient pas la colonne Origine', () => {
    const wrapper = factory();
    expect(wrapper.text()).not.toContain('Origine');
  });

  it('permet la sélection multiple par Shift-clic', async () => {
    const wrapper = factory();
    const rowsNodes = wrapper.findAll('tbody tr');
    await rowsNodes[0].trigger('click');
    await rowsNodes[1].trigger('click', { shiftKey: true });
    expect(wrapper.text()).toContain('2 sélectionné(s)');
  });

  it('permet la sélection d’une ligne par Ctrl-clic', async () => {
    const wrapper = factory();
    await wrapper.find('tbody tr').trigger('click', { ctrlKey: true });
    expect(wrapper.text()).toContain('1 sélectionné(s)');
    expect(wrapper.find('aside').exists()).toBe(false);
  });

  it('sélectionne tous les torrents avec Ctrl+A', async () => {
    const wrapper = factory();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
    await nextTick();
    expect(wrapper.text()).toContain('2 sélectionné(s)');
  });

  it('ouvre le sélecteur de colonnes et la modale d actions', async () => {
    const wrapper = factory();
    wrapper.vm.openColumnPicker();
    await nextTick();
    expect(wrapper.text()).toContain('Tracker');
    await wrapper.find('.action-trigger-btn').trigger('click');
    expect(wrapper.text()).toContain('Actions sur le torrent');
  });

  it('permet de reprendre un torrent en pause depuis ses actions', async () => {
    const wrapper = factory();
    await wrapper.find('.action-trigger-btn').trigger('click');
    await wrapper.find('.action-menu-btn').trigger('click');
    await vi.waitFor(() => expect(api).toHaveBeenCalled());
    const call = api.mock.calls.find(entry => entry[0].includes('/control'));
    expect(JSON.parse(call[1].body).action).toBe('resume');
  });

  it('conserve la disposition des colonnes et permet de les réordonner par glisser-déposer', async () => {
    const wrapper = factory();
    wrapper.vm.openColumnPicker();
    await nextTick();
    const items = wrapper.findAll('.column-picker-item');
    await items[0].trigger('dragstart');
    await items[1].trigger('drop');
    await nextTick();
    expect(JSON.parse(localStorage.getItem('watchdeck:torrent-table-columns:all')).order.slice(0, 2)).toEqual(['status', 'title']);
  });

  it('supporte le drag and drop direct sur th et le redimensionnement', async () => {
    const wrapper = factory();
    const headers = wrapper.findAll('th');
    await headers[1].trigger('dragstart');
    await headers[2].trigger('drop');
    await nextTick();
    expect(JSON.parse(localStorage.getItem('watchdeck:torrent-table-columns:all')).order.slice(0, 2)).toEqual(['status', 'title']);

    const resizer = wrapper.findAll('.col-resize-handle')[1];
    resizer.element.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await nextTick();
    expect(JSON.parse(localStorage.getItem('watchdeck:torrent-table-columns:all')).widths.title).toBe(350);
  });
});
