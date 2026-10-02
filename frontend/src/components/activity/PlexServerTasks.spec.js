import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

/* Pas de vi.fn pour les échecs : l'espion garde une promesse dérivée de son résultat,
   non gérée, et fait échouer le test quand l'appel rejette alors que le composant l'a
   bien interceptée. Une simple fonction enregistre les appels sans cet effet. */
const calls = [];
let reply = async () => ({});
const api = {
  mockReset() { calls.length = 0; reply = async () => ({}); },
  mockResolvedValue(value) { reply = async () => value; },
  mockImplementation(fn) { reply = fn; },
};
vi.mock('@/api', () => ({ api: (...args) => { calls.push(args); return reply(...args); } }));
vi.mock('@/events', () => ({ useRealtime: () => {} }));

import PlexServerTasks from './PlexServerTasks.vue';

function factory() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(PlexServerTasks, { global: { plugins: [[VueQueryPlugin, { queryClient }]], stubs: { ConfirmModal: true } } });
}

describe('PlexServerTasks', () => {
  beforeEach(() => api.mockReset());

  it('liste les tâches avec leur progression, indéterminée comprise', async () => {
    api.mockResolvedValue({ activities: [
      { uuid: 'a1', title: 'Création des miniatures', subtitle: 'Dune', progress: 42, cancellable: true },
      { uuid: 'a2', title: 'Analyse', progress: null, cancellable: false },
    ] });
    const wrapper = factory();
    await flushPromises();
    const items = wrapper.findAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain('42 %');
    expect(items[1].find('.bar').classes()).toContain('indeterminate');
    expect(items[1].find('button').exists()).toBe(false);
    expect(wrapper.text()).toContain('2 en cours');
  });

  it('nomme le serveur de chaque tâche quand il y en a plusieurs', async () => {
    api.mockResolvedValue({ activities: [
      { uuid: 'same', title: 'Analyse', subtitle: 'Dune', progress: 10, cancellable: true, server_id: null, server_name: 'Serveur principal' },
      { uuid: 'same', title: 'Analyse', progress: 20, cancellable: true, server_id: 3, server_name: 'Plex 4K' },
    ] });
    const wrapper = factory();
    await flushPromises();
    const items = wrapper.findAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain('Serveur principal · Dune');
    expect(items[1].text()).toContain('Plex 4K');
  });

  it('dit quand Plex est injoignable', async () => {
    api.mockImplementation(async () => { throw new Error('Plex injoignable'); });
    const wrapper = factory();
    await flushPromises();
    expect(wrapper.get('.plex-tasks-error').text()).toContain('Plex injoignable');
  });
});
