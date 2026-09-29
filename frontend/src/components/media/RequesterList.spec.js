import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import RequesterList from './RequesterList.vue';

function render(row) {
  return mount(RequesterList, { props: { row, admin: false } });
}

describe('RequesterList', () => {
  it('distingue le principal des co-demandeurs et affiche chaque mail reçu ou non', () => {
    const wrapper = render({
      id: 1,
      status: 'available',
      origin_kind: 'request',
      requester_ids: ['remi', 'fred'],
      requesters: ['Rémi', 'Frédérique'],
      requester_notifications: {
        remi: { request: true, available: true },
        fred: { request: false, available: false },
      },
    });

    const lines = wrapper.findAll('.requester-line');
    expect(lines).toHaveLength(2);
    expect(lines[0].text()).toContain('Demandeur principal');
    expect(lines[0].text()).toContain('Mail dispo reçu');
    expect(lines[1].text()).toContain('Co-demandeur');
    expect(lines[1].text()).toContain('Mail dispo non envoyé');
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

    expect(wrapper.text()).not.toContain('Mail demande');
    expect(wrapper.text()).toContain('Mail dispo reçu');
  });

  it('explique l’absence de demandeur', () => {
    const wrapper = render({ id: 3, status: 'available', requester_ids: [] });
    expect(wrapper.find('.requester-empty').exists()).toBe(true);
  });
});
