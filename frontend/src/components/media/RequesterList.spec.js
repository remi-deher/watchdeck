import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import RequesterList from './RequesterList.vue';

function render(row, admin = false) {
  return mount(RequesterList, { props: { row, admin } });
}

const available = {
  id: 1,
  status: 'available',
  origin_kind: 'request',
  requester_ids: ['remi', 'fred'],
  requesters: ['Rémi', 'Frédérique'],
  last_available_mail: { sent_at: '2026-09-22T00:21:00', triggered_by: 'auto', success: true },
  requester_notifications: {
    remi: { request: true, available: true },
    fred: { request: false, available: false },
  },
};

describe('RequesterList', () => {
  it('distingue le principal des co-demandeurs et affiche l’état de chaque mail', () => {
    const lines = render(available).findAll('.requester-line');
    expect(lines).toHaveLength(2);
    expect(lines[0].text()).toContain('Demandeur principal');
    expect(lines[0].findAll('.requester-mail')[1].text()).toContain('✓ Reçu');
    expect(lines[0].findAll('.requester-mail')[1].text()).toContain('auto');
    expect(lines[1].text()).toContain('Co-demandeur');
    expect(lines[1].findAll('.requester-mail')[0].text()).toContain('Sans objet');
    expect(lines[1].findAll('.requester-mail')[1].text()).toContain('En attente');
  });

  it('alerte en ambre quand un demandeur attend le mail de disponibilité', async () => {
    const wrapper = render(available, true);
    const alert = wrapper.find('.requesters-alert');
    expect(alert.text()).toContain("Frédérique n'a pas encore reçu le mail de disponibilité");
    const button = alert.findAll('button').find((b) => b.text() === 'Prévenir Frédérique');
    await button.trigger('click');
    expect(wrapper.emitted('notify-user')).toEqual([[1, 'fred', ['available']]]);
  });

  it("n'alerte pas tant que le média n'est pas disponible, ni sans bouton pour un non-admin", () => {
    expect(render({ ...available, status: 'sent_to_arr' }).find('.requesters-alert').exists()).toBe(false);
    const viewer = render(available);
    expect(viewer.find('.requesters-alert').exists()).toBe(true);
    expect(viewer.find('.requesters-alert button').exists()).toBe(false);
  });

  it('propose « Envoyer maintenant » pour un mail en attente', async () => {
    const wrapper = render(available, true);
    const send = wrapper.findAll('button').find((b) => b.text() === 'Envoyer maintenant');
    await send.trigger('click');
    expect(wrapper.emitted('notify-user')).toEqual([[1, 'fred', ['available']]]);
  });

  it("n'annonce pas de mail de demande pour un média ajouté directement dans *ARR", () => {
    const wrapper = render({
      id: 2,
      status: 'available',
      origin_kind: 'arr',
      requester_ids: ['fred'],
      requesters: ['Frédérique'],
      requester_notifications: { fred: { request: false, available: true } },
    });
    const mails = wrapper.findAll('.requester-mail');
    expect(mails[0].text()).toContain('Sans objet');
    expect(mails[0].text()).toContain('ajouté sans demande');
    expect(mails[1].text()).toContain('✓ Reçu');
  });

  it('explique l’absence de demandeur', () => {
    const wrapper = render({ id: 3, status: 'available', requester_ids: [] });
    expect(wrapper.find('.requester-empty').exists()).toBe(true);
  });
});
