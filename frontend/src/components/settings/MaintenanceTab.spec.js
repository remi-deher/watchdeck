import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MaintenanceTab from './MaintenanceTab.vue';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));
vi.mock('@/events', () => ({ useRealtime: vi.fn() }));

const ACTIONS = {
  'warm-images': { label: 'Précharger les images', description: 'Télécharge les images.', enabled: true },
  'clear-image-cache': {
    label: 'Vider le cache d’images',
    description: 'Supprime les images.',
    color: 'danger',
    confirm: 'Une affiche dont la source a expiré ne reviendra pas.',
    enabled: true,
  },
};

function mountTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(MaintenanceTab, {
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    attachTo: document.body,
  });
}

const runButton = (wrapper, label) => wrapper
  .findAll('.settings-item')
  .find((row) => row.text().includes(label))
  .get('button');

beforeEach(() => {
  api.mockReset();
  document.body.innerHTML = '';
});

describe('MaintenanceTab', () => {
  it('lance une action ordinaire sans demander confirmation', async () => {
    api.mockImplementation(async (path) => (path === '/api/maintenance/actions' ? ACTIONS : { run_id: 'r1', status: 'running', progress: 0, logs: [] }));
    const wrapper = mountTab();
    await flushPromises();

    await runButton(wrapper, 'Précharger les images').trigger('click');
    await flushPromises();

    expect(api).toHaveBeenCalledWith('/api/maintenance/run/warm-images', { method: 'POST' });
    wrapper.unmount();
  });

  it('demande confirmation avant de vider le cache, et ne lance rien sans accord', async () => {
    api.mockImplementation(async (path) => (path === '/api/maintenance/actions' ? ACTIONS : { run_id: 'r2', status: 'running', progress: 0, logs: [] }));
    const wrapper = mountTab();
    await flushPromises();

    await runButton(wrapper, 'Vider le cache').trigger('click');
    await flushPromises();

    expect(document.body.textContent).toContain('Une affiche dont la source a expiré ne reviendra pas.');
    expect(api).not.toHaveBeenCalledWith('/api/maintenance/run/clear-image-cache', expect.anything());
    wrapper.unmount();
  });

  it('montre le média en cours, avec sa pochette et son rang', async () => {
    api.mockImplementation(async (path) => {
      if (path === '/api/maintenance/actions') return ACTIONS;
      if (path.startsWith('/api/maintenance/run/warm')) return { run_id: 'r3' };
      return {
        run_id: 'r3',
        action: 'warm-images',
        status: 'running',
        progress: 40,
        logs: [],
        current: { title: 'Dune : Deuxième partie', cover_url: '/api/image-proxy/library/7?width=500&quality=82&format=webp', done: 4, total: 10 },
      };
    });
    const wrapper = mountTab();
    await flushPromises();

    await runButton(wrapper, 'Précharger les images').trigger('click');
    await flushPromises();

    const media = wrapper.get('.run-media');
    expect(media.text()).toContain('Dune : Deuxième partie');
    expect(media.text()).toContain('4 sur 10');
    expect(media.get('img').attributes('src')).toBe('/api/image-proxy/library/7?width=500&quality=82&format=webp');
    wrapper.unmount();
  });
});
