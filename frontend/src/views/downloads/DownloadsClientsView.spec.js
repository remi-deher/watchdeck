import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createQueryClient } from '@/queryClient';

import { useDownloadSources } from '@/composables/useDownloadSources';
import DownloadsClientsView from './DownloadsClientsView.vue';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));
vi.mock('@/events', () => ({ useRealtime: vi.fn() }));

const TORRENTS = [
  { client_id: 7, client_name: 'Maison', hash: 'bbb', title: 'Zulu.S01', status: 'downloading', progress: 20, size: 2000, download_speed: 20, upload_speed: 2, ratio: 0.1, eta: 90, category: 'series', tags: 'watchdeck', trackers: 'https://tracker.one/announce' },
  { client_id: 7, client_name: 'Maison', hash: 'aaa', title: 'Alpha.2024', status: 'pausedDL', progress: 60, size: 1000, download_speed: 0, upload_speed: 1, ratio: 1.2, eta: 0, category: 'films', tags: '', trackers: 'https://tracker.two/announce' },
];
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });
const push = vi.spyOn(router, 'push');

async function factory(url = '/downloads?view=clients&sub=instances') {
  await router.push(url);
  push.mockClear();
  const wrapper = mount(DownloadsClientsView, {
    attachTo: document.body,
    global: { plugins: [router, [VueQueryPlugin, { queryClient: createQueryClient() }]] },
  });
  await flushPromises();
  return wrapper;
}
const calls = (fragment) => api.mock.calls.filter((call) => String(call[0]).includes(fragment));
const control = () => calls('/control').map((call) => ({ path: call[0], body: JSON.parse(call[1].body) }));
const items = () => [...document.body.querySelectorAll('.ui-menu-item')].map((node) => node.textContent.trim());
const choisir = async (label) => {
  [...document.body.querySelectorAll('.ui-menu-item')].find((node) => node.textContent.trim() === label).dispatchEvent(new Event('click', { bubbles: true }));
  await nextTick();
  await nextTick();
};

describe('DownloadsClientsView', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
    api.mockReset().mockImplementation(async (path) => {
      if ((path === '/api/downloads/clients' || path.startsWith('/api/downloads/clients/page'))) return TORRENTS;
      if (path === '/api/download-clients') return [{ id: 7, name: 'Maison', enabled: true, client_type: 'qbittorrent' }];
      if (path === '/api/arr-instances') return [];
      if (path.startsWith('/api/downloads/global-stats')) return { download_speed: 2048, upload_speed: 0, connected: 1, total: 1 };
      return { ok: true };
    });
  });

  describe('Torrents (Gérer)', () => {
    it('liste les torrents triés par nom, et se trie d’un clic sur l’en-tête', async () => {
      const wrapper = await factory();
      expect(wrapper.findAll('.torrent-title').map((node) => node.text())).toEqual(['Alpha.2024', 'Zulu.S01']);
      await wrapper.findAll('thead .ui-data-table__sort')[0].trigger('click');
      await vi.waitFor(() => expect(wrapper.findAll('.torrent-title').map((node) => node.text())).toEqual(['Zulu.S01', 'Alpha.2024']));
    });

    it('ouvre la fiche du torrent dans la feuille depuis son titre ou sa ligne', async () => {
      const wrapper = await factory();
      await wrapper.find('.torrent-title').trigger('click');
      expect(push.mock.calls.at(-1)[0].path).toBe('/downloads/torrent/7/aaa');
      push.mockClear();
      await wrapper.find('tbody tr').trigger('click');
      expect(push.mock.calls.at(-1)[0].path).toBe('/downloads/torrent/7/aaa');
    });

    it('sélectionne au Ctrl-clic sans ouvrir la fiche, et offre la barre groupée', async () => {
      const wrapper = await factory();
      await wrapper.find('tbody tr').trigger('click', { ctrlKey: true });
      expect(push).not.toHaveBeenCalled();
      expect(wrapper.find('.bulk-bar').text()).toContain('1 torrent sélectionné');
      await wrapper.findAll('.bulk-bar button').find((node) => node.text().includes('Mettre en pause')).trigger('click');
      await flushPromises();
      expect(control()).toEqual([{ path: '/api/downloads/clients/7/aaa/control', body: expect.objectContaining({ action: 'pause' }) }]);
    });

    it('regroupe maintenance et retrait en menus, et confirme avant de retirer', async () => {
      const wrapper = await factory();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
      await nextTick();
      expect(wrapper.find('.bulk-bar').text()).toContain('2 torrents sélectionnés');
      await wrapper.findAll('.bulk-bar button').find((node) => node.text().includes('Retirer')).trigger('keydown', { key: 'Enter' });
      await nextTick();
      expect(items()).toEqual(['Retirer du client', 'Supprimer avec les fichiers']);
      await choisir('Supprimer avec les fichiers');
      expect(document.body.textContent).toContain('Supprimer 2 torrent(s) et leurs fichiers ?');
      expect(control()).toEqual([]);
      [...document.body.querySelectorAll('.confirm-modal button')].find((node) => node.textContent.trim() === 'Supprimer définitivement').click();
      await vi.waitFor(() => expect(control()).toHaveLength(2));
      expect(control().every((call) => call.body.action === 'delete' && call.body.delete_files === true)).toBe(true);
    });

    it('propose Reprendre ou Pause selon l’état, dans le menu de la ligne', async () => {
      const wrapper = await factory();
      await wrapper.find('tbody tr button[aria-label="Actions sur Alpha.2024"]').trigger('keydown', { key: 'Enter' });
      await nextTick();
      expect(items()).toEqual(['Reprendre', 'Revérifier les fichiers', 'Réannoncer aux trackers', 'Catégorie & Tags…', 'Inspecter le torrent', 'Retirer du client', 'Supprimer avec les fichiers']);
      await choisir('Reprendre');
      await flushPromises();
      expect(control()[0].body.action).toBe('resume');
    });

    it('filtre avec les opérateurs de la recherche', async () => {
      const wrapper = await factory();
      // La recherche est celle de la barre du haut : on pose la requête sur la page.
      wrapper.findComponent({ name: 'PageTemplate' }).vm.$emit('update:query', 'cat:series');
      await nextTick();
      await nextTick();
      await vi.waitFor(() => expect(wrapper.findAll('.torrent-title').map((node) => node.text())).toEqual(['Zulu.S01']));
    });

    it('retient l’affichage compact et propose les modes dans la barre du tableau', async () => {
      const wrapper = await factory();
      const compact = wrapper.findAll('.control-table__global button').find((node) => node.text().includes('Compact'));
      expect(compact.attributes('aria-pressed')).toBe('false');
      await compact.trigger('click');
      await nextTick();
      expect(wrapper.find('.ui-data-table').classes()).toContain('is-compact');
      expect(localStorage.getItem('watchdeck:torrent-table-compact')).toBe('true');
    });

    it('bascule le mode de vitesse alternatif', async () => {
      const wrapper = await factory();
      await wrapper.findAll('.control-table__global button').find((node) => node.text().includes('Mode alternatif')).trigger('click');
      await flushPromises();
      expect(calls('/api/downloads/global-alt-speed')[0][1]).toMatchObject({ method: 'POST' });
    });

    it('signale un client en cache ou injoignable dans un bandeau', async () => {
      api.mockImplementation(async (path) => {
        if ((path === '/api/downloads/clients' || path.startsWith('/api/downloads/clients/page'))) return [{ ...TORRENTS[0], is_stale: true, stale_since_seconds: 42 }, { client_id: 8, client_name: 'Seedbox', client_error: 'timeout' }];
        if (path === '/api/download-clients') return [{ id: 7, name: 'Maison', enabled: true }];
        return {};
      });
      const wrapper = await factory();
      expect(wrapper.text()).toContain('Mode données en cache local');
      expect(wrapper.text()).toContain('Seedbox');
      expect(wrapper.text()).toContain('timeout');
    });
  });

  describe('Synthèse (Surveiller)', () => {
    it('montre les indicateurs, les clients et la répartition par tracker', async () => {
      const wrapper = await factory('/downloads?view=clients&sub=overview');
      const kpis = wrapper.findAll('.monitor__kpis a, .monitor__kpis .kpi').map((node) => node.text()).join(' ');
      expect(kpis).toContain('1/1');
      expect(wrapper.find('.monitor__zones').text()).toContain('Maison');
      expect(wrapper.text()).toContain('tracker.one');
    });

    it('met un client hors ligne en point d’attention', async () => {
      api.mockImplementation(async (path) => {
        if ((path === '/api/downloads/clients' || path.startsWith('/api/downloads/clients/page'))) return [{ client_id: 7, client_name: 'Maison', client_error: 'timeout' }];
        if (path === '/api/download-clients') return [{ id: 7, name: 'Maison', enabled: true }];
        return {};
      });
      const wrapper = await factory('/downloads?view=clients&sub=overview');
      expect(wrapper.find('.monitor__attention').text()).toContain('Maison est hors ligne');
    });
  });

  it('propose de configurer un client quand aucun n’existe', async () => {
    api.mockImplementation(async () => []);
    // La liste des clients est partagée par tout le module : on la vide pour ce cas.
    useDownloadSources().downloadClients.value = [];
    const wrapper = await factory();
    expect(wrapper.text()).toContain('Aucun client torrent configuré');
    expect(wrapper.text()).toContain('Ajouter un client');
  });
});
