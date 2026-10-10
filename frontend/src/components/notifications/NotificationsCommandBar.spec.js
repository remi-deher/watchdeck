import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createQueryClient } from '@/queryClient';

import NotificationsCommandBar from './NotificationsCommandBar.vue';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));

let hold;
function factory(part = 'all') {
  return mount(NotificationsCommandBar, {
    attachTo: document.body,
    props: { part },
    global: { plugins: [[VueQueryPlugin, { queryClient: createQueryClient() }]] },
  });
}
const puts = () => api.mock.calls.filter((call) => call[0] === '/api/notifications/hold' && call[1]?.method === 'PUT');

describe('NotificationsCommandBar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    hold = { enabled: false, pending_count: 3 };
    api.mockReset().mockImplementation(async (path, options) => {
      if (path === '/api/notifications/hold' && options?.method === 'PUT') {
        hold = { ...hold, enabled: JSON.parse(options.body).enabled };
        return { message: '' };
      }
      if (path === '/api/notifications/hold') return hold;
      if (path === '/api/notifications/resume-preview') return { counts: { ready: 2, old: 1, obsolete: 0, cancelled: 0, sent: 0, uncertain: 0 } };
      return {};
    });
  });

  it('dit si l’envoi est actif et combien de notifications attendent', async () => {
    const wrapper = factory('state');
    await flushPromises();
    expect(wrapper.text()).toContain('Envoi actif');
    expect(wrapper.text()).toContain('3 en attente');
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('suspend les envois d’un clic', async () => {
    const wrapper = factory('hold');
    await flushPromises();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(puts()).toHaveLength(1);
    expect(JSON.parse(puts()[0][1].body)).toEqual({ enabled: true });
  });

  it('demande confirmation avant de réactiver, en disant ce qui partirait', async () => {
    hold.enabled = true;
    const wrapper = factory('hold');
    await flushPromises();
    expect(wrapper.find('button').text()).toBe('Réactiver');
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(puts()).toHaveLength(0);
    expect(document.body.textContent).toContain('2 envoi(s) pertinent(s), 1 de plus de 24 h');
    [...document.body.querySelectorAll('.confirm-modal button')].find((node) => node.textContent.trim() === 'Réactiver les nouveaux envois').click();
    await vi.waitFor(() => expect(puts()).toHaveLength(1));
    expect(JSON.parse(puts()[0][1].body)).toEqual({ enabled: false });
  });

  it('ne réactive rien si on annule', async () => {
    hold.enabled = true;
    const wrapper = factory('hold');
    await flushPromises();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    [...document.body.querySelectorAll('.confirm-modal button')].find((node) => node.textContent.trim() === 'Annuler').click();
    await flushPromises();
    expect(puts()).toHaveLength(0);
  });
});
