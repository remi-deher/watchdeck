import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createQueryClient } from '@/queryClient';

import UsersView from './UsersView.vue';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));

const USERS = [
  { id: 1, custom_name: 'Alice', plex_user_id: 'alice', enabled: true, role: 'admin', can_login: true, notification_email: 'a@x.fr', stats: { total: 4 } },
  { id: 2, custom_name: 'Bruno', plex_user_id: 'bruno', enabled: false, role: 'user', can_login: true, notification_email: 'b@x.fr', stats: { total: 0 } },
  { id: 3, custom_name: 'Chloé', plex_user_id: 'chloe', enabled: true, role: 'user', can_login: true, stats: { total: 2, pending_approval: 1 } },
];

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });

async function factory() {
  const wrapper = mount(UsersView, {
    attachTo: document.body,
    global: { plugins: [router, [VueQueryPlugin, { queryClient: createQueryClient() }]] },
  });
  await flushPromises();
  return wrapper;
}
const names = (wrapper) => wrapper.findAll('.user-identity__text strong').map((node) => node.text());
const calls = (path) => api.mock.calls.filter((call) => call[0] === path);

describe('UsersView', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
    api.mockReset().mockImplementation(async (path) => {
      if (path.startsWith('/api/users/page')) return USERS;
      if (path === '/api/settings') return { seer_enabled: false };
      return { ok: true };
    });
  });

  it('liste les comptes par nom, avec leurs situations à traiter', async () => {
    const wrapper = await factory();
    expect(names(wrapper)).toEqual(['Alice', 'Bruno', 'Chloé']);
    const options = wrapper.findAll('.ui-segmented-item').map((node) => node.text());
    expect(options).toEqual(['Tous3', 'Approbations1', 'Sans email1', 'Échec d’envoi0']);
  });

  it('filtre la liste par situation', async () => {
    const wrapper = await factory();
    await wrapper.findAll('.ui-segmented-item')[1].trigger('click');
    await nextTick();
    await vi.waitFor(() => expect(names(wrapper)).toEqual(['Chloé']));
  });

  it('charge la page suivante et conserve les compteurs globaux', async () => {
    api.mockImplementation(async (path) => {
      if (path.startsWith('/api/users/page')) {
        const offset = Number(new URL(path, 'http://fixture').searchParams.get('offset'));
        return { items: offset ? USERS.slice(1) : USERS.slice(0, 1), total: 3, all_total: 3, offset,
          has_more: offset === 0, sources: ['api'], situations: { pending: 1, missing_email: 1, notification_error: 0 } };
      }
      return {};
    });
    const wrapper = await factory();
    expect(names(wrapper)).toEqual(['Alice']);
    expect(wrapper.findAll('.ui-segmented-item')[0].text()).toBe('Tous3');
    wrapper.findComponent({ name: 'ManageTemplate' }).vm.$emit('load-more');
    await vi.waitFor(() => expect(names(wrapper)).toEqual(['Alice', 'Bruno', 'Chloé']));
    expect(api.mock.calls.some(([path]) => path.includes('offset=1'))).toBe(true);
  });

  it('active ou désactive un compte depuis sa ligne', async () => {
    const wrapper = await factory();
    await wrapper.find('button[aria-label="Activer Bruno"]').trigger('click');
    await flushPromises();
    expect(calls('/api/users/2/enabled')[0][1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ enabled: true }) });
  });

  it('confirme avant de bloquer la connexion de la sélection, puis l’applique', async () => {
    const wrapper = await factory();
    await wrapper.find('thead [role="checkbox"]').trigger('click');
    await nextTick();
    const access = wrapper.findAll('.bulk-bar button').find((node) => node.text().includes('Rôle & connexion'));
    await access.trigger('keydown', { key: 'Enter' });
    await nextTick();
    [...document.body.querySelectorAll('.ui-menu-item')].find((node) => node.textContent.includes('Bloquer la connexion')).dispatchEvent(new Event('click', { bubbles: true }));
    await nextTick();
    expect(calls('/api/users/bulk/permissions')).toHaveLength(0);
    expect(document.body.textContent).toContain('Bloquer la connexion de 3 comptes ?');
    [...document.body.querySelectorAll('.confirm-modal button')].find((node) => node.textContent.trim() === 'Bloquer la connexion').click();
    await vi.waitFor(() => expect(calls('/api/users/bulk/permissions')).toHaveLength(1));
    expect(JSON.parse(calls('/api/users/bulk/permissions')[0][1].body)).toEqual({ user_ids: [1, 2, 3], can_login: false });
  });

  it('ne propose pas Seer quand il est désactivé', async () => {
    const wrapper = await factory();
    expect(wrapper.text()).not.toContain('Seer');
  });
});
