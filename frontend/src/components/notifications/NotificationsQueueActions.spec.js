import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NotificationsTable from './NotificationsTable.vue';

describe('NotificationsTable pending actions', () => {
  const row = { id: 42, event: 'available', event_label: 'Disponible', media_title: 'Film' };

  it('propose un envoi individuel dans la file', async () => {
    const wrapper = mount(NotificationsTable, { props: { rows: [row], tab: 'pending' } });
    const send = wrapper.get('button[aria-label="Envoyer Disponible"]');

    expect(send.text()).toContain('Envoyer');
    await send.trigger('click');
    expect(wrapper.emitted('send')).toEqual([[row]]);
  });

  it('expose la selection au parent pour la barre groupee commune', async () => {
    const wrapper = mount(NotificationsTable, { props: { rows: [row], tab: 'pending' } });
    await wrapper.get('tbody input[type="checkbox"]').setValue(true);

    expect(wrapper.vm.selectedIds).toEqual([42]);
    wrapper.vm.clearSelection();
    expect(wrapper.vm.selectedIds).toEqual([]);
  });
});
