import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import DownloadsNavigation from './DownloadsNavigation.vue';

vi.mock('@/composables/useDownloadSources', () => ({
  useDownloadSources: () => ({
    arrInstances: ref([
    { id: 2, name: 'Radarr 4K', arr_type: 'radarr', enabled: true },
    { id: 3, name: 'Radarr HD', arr_type: 'radarr', enabled: true },
    { id: 4, name: 'Sonarr principal', arr_type: 'sonarr', enabled: true },
    ]),
    downloadClients: ref([
    { id: 7, name: 'qBittorrent principal', enabled: true },
    { id: 8, name: 'Client désactivé', enabled: false },
    ]),
    load: vi.fn(() => Promise.resolve()),
  }),
}));

async function render(path = '/downloads') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/downloads', component: { template: '<div />' } }, { path: '/profile', component: { template: '<div />' } }, { path: '/dashboard', component: { template: '<div />' } }, { path: '/settings', component: { template: '<div />' } }],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(DownloadsNavigation, { props: { collapsed: false }, global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

describe('DownloadsNavigation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ouvre sur la vue d’ensemble et regroupe Radarr et Sonarr sous ARR', async () => {
    const { wrapper } = await render();
    expect(wrapper.get('a[href="/downloads?view=overview"]').classes()).toContain('active');
    expect(wrapper.text()).toContain('File d’attente');
    expect(wrapper.text()).toContain('ARR');
    expect(wrapper.text()).toContain('Clients torrent');
    await wrapper.get('.source-parent-button').trigger('click');
    expect(wrapper.text()).toContain('Radarr');
    expect(wrapper.text()).toContain('Sonarr');
  });

  it('affiche uniquement les clients torrent actifs', async () => {
    const { wrapper } = await render('/downloads?view=clients&sub=instances&client=7');
    expect(wrapper.text()).not.toContain('Client désactivé');
    const clientLink = wrapper.findAll('a').find(link => link.attributes('href').includes('client=7'));
    expect(clientLink.classes()).toContain('active');
  });

  it('rend un groupe multi-instance escamotable et une instance unique directement accessible', async () => {
    const { wrapper } = await render('/downloads?view=radarr');
    expect(wrapper.findAll('.arr-kind .source-toggle')).toHaveLength(1);
    const sonarrLink = wrapper.findAll('.source-parent>a:first-child').find(link => link.attributes('href').includes('instance=4'));
    expect(sonarrLink.text()).toContain('Sonarr');
    // Les noms d'instances apparaissent aussi dans la sous-nav mobile (rangee de
    // pilules) : on n'observe donc que l'arbre de la sidebar de bureau, seul
    // concerne par le pliage.
    const desktopTree = () => wrapper.get('.space-sidebar').text();
    expect(desktopTree()).toContain('Radarr 4K');
    expect(desktopTree()).toContain('Radarr HD');
    await wrapper.get('.arr-kind .source-toggle').trigger('click');
    expect(desktopTree()).not.toContain('Radarr 4K');
  });
});
