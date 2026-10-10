import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createQueryClient } from '@/queryClient';

import NotificationsView from './NotificationsView.vue';

const api = vi.fn();
vi.mock('@/api', () => ({ api: (...args) => api(...args) }));
vi.mock('@/events', () => ({ useRealtime: vi.fn() }));

const PENDING = [
  { id: 11, event: 'available', event_label: 'Disponible', media_title: 'Dune', recipient: 'alice@x.fr', created_at: '2026-10-09T10:00:00Z' },
  { id: 12, event: 'request', event_label: 'Demande', media_title: 'Tenet', recipient: 'bruno@x.fr', created_at: '2026-10-09T11:00:00Z', valid: false },
];
const LOG = [
  { id: 1, event: 'available', event_label: 'Disponible', media_title: 'Dune', recipient: 'alice@x.fr', success: true, sent_at: '2026-10-09T10:00:00Z' },
  { id: 2, event: 'request', event_label: 'Demande', media_title: 'Tenet', recipient: 'bruno@x.fr', success: false, error_msg: 'SMTP refusé', sent_at: '2026-10-09T11:00:00Z' },
];

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });

async function factory(tab) {
  await router.push(tab === 'pending' ? '/notifications?tab=pending' : '/notifications');
  const wrapper = mount(NotificationsView, {
    attachTo: document.body,
    global: { plugins: [router, [VueQueryPlugin, { queryClient: createQueryClient() }]] },
  });
  await flushPromises();
  return wrapper;
}
const calls = (prefix) => api.mock.calls.filter((call) => String(call[0]).startsWith(prefix));
const items = () => [...document.body.querySelectorAll('.ui-menu-item')].map((node) => node.textContent.trim());

describe('NotificationsView', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
    api.mockReset().mockImplementation(async (path) => {
      if (path.startsWith('/api/notifications/pending?')) return { items: PENDING, total: 2 };
      if (path.startsWith('/api/notifications/log')) return { items: LOG, total: 2 };
      if (path === '/api/notifications/hold') return { enabled: false, pending_count: 2 };
      if (path.endsWith('/preview')) return { subject: 'Dune est disponible', html: '<p>Bonjour</p>', reconstructable: true };
      if (path === '/api/users') return [{ id: 2, custom_name: 'Bruno' }];
      return { ok: true };
    });
  });

  describe('journal (Comprendre)', () => {
    it('montre les envois par jour, avec leur résultat', async () => {
      const wrapper = await factory('history');
      const rows = wrapper.findAll('.understand-row').map((node) => node.text());
      expect(rows).toHaveLength(2);
      expect(rows.join(' ')).toContain('Dune');
      expect(rows.join(' ')).toContain('SMTP refusé');
      // La file n'est pas lue tant qu'on est sur le journal.
      expect(calls('/api/notifications/pending')).toHaveLength(0);
    });

    it('filtre par état, au-dessus de la liste, côté serveur', async () => {
      const wrapper = await factory('history');
      const errors = wrapper.findAll('.ui-segmented-item').find((node) => node.text().includes('Erreurs'));
      await errors.trigger('click');
      await flushPromises();
      expect(calls('/api/notifications/log').at(-1)[0]).toContain('state=error');
    });

    it('ouvre l’aperçu de l’email dans le détail, et propose de renvoyer un échec', async () => {
      const wrapper = await factory('history');
      await wrapper.findAll('.understand-row')[0].trigger('click');
      await flushPromises();
      const detail = wrapper.find('.understand-detail');
      expect(detail.find('iframe').attributes('srcdoc')).toBe('<p>Bonjour</p>');
      expect(detail.text()).toContain('SMTP refusé');
      await detail.find('.understand-detail__links button').trigger('click');
      await flushPromises();
      expect(calls('/api/notifications/2/resend')[0][1]).toMatchObject({ method: 'POST' });
    });
  });

  describe('file d’attente (Gérer)', () => {
    it('liste les notifications en attente, sans lire le journal', async () => {
      const wrapper = await factory('pending');
      expect(wrapper.findAll('tbody tr')).toHaveLength(2);
      expect(wrapper.text()).toContain('Tenet');
      expect(wrapper.text()).toContain('Invalide');
      expect(calls('/api/notifications/log')).toHaveLength(0);
    });

    it('envoie une notification depuis sa ligne', async () => {
      const wrapper = await factory('pending');
      await wrapper.find('button[aria-label="Envoyer Disponible"]').trigger('click');
      await flushPromises();
      expect(JSON.parse(calls('/api/notifications/pending/process')[0][1].body)).toEqual({ ids: [11] });
    });

    it('confirme avant de marquer comme traitée, en nommant la notification', async () => {
      const wrapper = await factory('pending');
      await wrapper.find('button[aria-label="Marquer comme traitée Disponible"]').trigger('click');
      await nextTick();
      expect(calls('/api/notifications/pending/purge')).toHaveLength(0);
      expect(document.body.textContent).toContain('« Dune » sera marquée comme traitée sans être envoyée');
      [...document.body.querySelectorAll('.confirm-modal button')].find((node) => node.textContent.trim() === 'Marquer comme traitée').click();
      await vi.waitFor(() => expect(calls('/api/notifications/pending/purge')).toHaveLength(1));
      expect(JSON.parse(calls('/api/notifications/pending/purge')[0][1].body)).toEqual({ ids: [11], mark_handled: true });
    });

    it('vide toute la file sans sélection, après confirmation', async () => {
      const wrapper = await factory('pending');
      const clear = wrapper.findAll('.control-table__global button').find((node) => node.text().includes('Vider la file'));
      await clear.trigger('keydown', { key: 'Enter' });
      await nextTick();
      expect(items()).toEqual(['Tout marquer comme traité', 'Tout supprimer']);
      [...document.body.querySelectorAll('.ui-menu-item')].find((node) => node.textContent.includes('Tout supprimer')).dispatchEvent(new Event('click', { bubbles: true }));
      await nextTick();
      expect(document.body.textContent).toContain('Toute la file notification(s) seront supprimée(s) définitivement de la file.');
      [...document.body.querySelectorAll('.confirm-modal button')].find((node) => node.textContent.trim() === 'Supprimer').click();
      await vi.waitFor(() => expect(calls('/api/notifications/pending/purge')).toHaveLength(1));
      expect(JSON.parse(calls('/api/notifications/pending/purge')[0][1].body)).toEqual({ ids: [], mark_handled: false });
    });

    it('envoie la sélection par la barre groupée commune', async () => {
      const wrapper = await factory('pending');
      await wrapper.find('thead [role="checkbox"]').trigger('click');
      await nextTick();
      expect(wrapper.find('.bulk-bar').text()).toContain('2 notifications sélectionnées');
      await wrapper.findAll('.bulk-bar button').find((node) => node.text().includes('Envoyer')).trigger('click');
      await flushPromises();
      expect(JSON.parse(calls('/api/notifications/pending/process')[0][1].body)).toEqual({ ids: [11, 12] });
    });
  });
});
