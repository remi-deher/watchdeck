import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MediaNotificationsTab from './MediaNotificationsTab.vue';

describe('MediaNotificationsTab', () => {
  it('affiche un état vide quand il n’y a aucune notification', () => {
    const wrapper = mount(MediaNotificationsTab, { props: { notifications: [] } });
    expect(wrapper.text()).toContain('Aucune notification');
  });

  it('affiche la frise chronologique UiTimeline pour les notifications', () => {
    const wrapper = mount(MediaNotificationsTab, {
      props: {
        notifications: [
          {
            id: 1,
            event: 'available',
            channel: 'email',
            recipient: 'alice@example.com',
            sent_at: '2026-10-25T10:00:00Z',
            success: true,
          },
          {
            id: 2,
            event: 'failed',
            channel: 'discord',
            recipient: '#alerts',
            sent_at: '2026-10-25T10:05:00Z',
            success: false,
            error_msg: 'Webhook timeout',
          },
        ],
      },
    });

    expect(wrapper.text()).toContain('Média disponible');
    expect(wrapper.text()).toContain('alice@example.com · E-mail');
    expect(wrapper.text()).toContain('Envoyée');
    expect(wrapper.text()).toContain('Échec');
    expect(wrapper.text()).toContain('Webhook timeout');
  });
});
